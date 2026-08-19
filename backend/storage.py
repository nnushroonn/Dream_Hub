"""자유 광장 이미지 첨부용 오브젝트 스토리지 (Cloudflare R2, S3 호환 API).

R2는 boto3의 표준 S3 클라이언트를 그대로 쓸 수 있다 - endpoint_url만
계정 전용 R2 엔드포인트로 바꿔주면 된다.
"""

import uuid

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status

from database import get_settings

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
_READ_CHUNK_SIZE = 1024 * 1024  # 1MB


async def read_upload_within_limit(file: UploadFile, max_bytes: int = MAX_IMAGE_SIZE_BYTES) -> bytes:
    """업로드 파일을 청크 단위로 읽으며 매 청크마다 누적 크기를 검사한다. Content-Length
    헤더는 클라이언트가 보내는 값이라 누락되거나 실제 바이트 수와 다를 수 있어 신뢰하지
    않는다 - 실제로 읽은 바이트 수 기준으로 한도를 넘는 즉시 중단하므로, 클라이언트가 아무리
    큰 파일(또는 헤더를 속인 요청)을 보내도 서버 메모리에는 max_bytes + 청크 하나만큼만
    올라간다(기존에는 file.read()로 전체를 다 읽은 뒤에야 크기를 검사했다)."""
    total = 0
    chunks: list[bytes] = []
    while True:
        chunk = await file.read(_READ_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="이미지는 5MB 이하만 업로드할 수 있어요.")
        chunks.append(chunk)
    return b"".join(chunks)


def is_valid_community_image_url(url: str) -> bool:
    """게시글의 image_urls로 클라이언트가 직접 보낸 URL이 실제로 이 앱이 /api/community/images로
    발급해준 R2 객체를 가리키는지 검증한다 - 업로드 엔드포인트를 거치지 않고 임의 URL을 게시글에
    끼워넣을 수 있으면(익명 서비스에서 추적 픽셀을 심어 열람자 IP를 수집하는 등) 문제가 되므로,
    게시글 저장 시점에 서버에서 다시 확인한다. 전체 URL 문자열의 접두사를 그대로 비교하므로
    도메인 뒤에 하위 문자열을 붙이는 서브도메인 혼동 공격(예: r2.dev.attacker.com)이
    통하지 않는다 - '/' 바로 다음이 오지 않으면 startswith 자체가 실패한다."""
    settings = get_settings()
    base = settings.r2_public_base_url
    if not base:
        return False
    return url.startswith(f"{base}/community/")


def _r2_client():
    settings = get_settings()
    if not (settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key and settings.r2_bucket_name):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="이미지 업로드가 아직 설정되지 않았어요. 서버 관리자에게 문의해 주세요.",
        )
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def upload_community_image(content: bytes, content_type: str) -> str:
    """검증된 이미지 바이트를 R2에 올리고, 프론트가 <img src=...>로 바로 쓸 공개 URL을 돌려준다."""
    settings = get_settings()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="jpg, png, gif 이미지만 업로드할 수 있어요."
        )
    if len(content) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="이미지는 5MB 이하만 업로드할 수 있어요.")
    if not settings.r2_public_base_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="이미지 업로드가 아직 설정되지 않았어요. 서버 관리자에게 문의해 주세요.",
        )

    extension = ALLOWED_CONTENT_TYPES[content_type]
    key = f"community/{uuid.uuid4().hex}.{extension}"

    try:
        client = _r2_client()
        client.put_object(Bucket=settings.r2_bucket_name, Key=key, Body=content, ContentType=content_type)
    except (BotoCoreError, ClientError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="이미지 업로드에 실패했어요. 잠시 후 다시 시도해 주세요."
        ) from error

    return f"{settings.r2_public_base_url}/{key}"
