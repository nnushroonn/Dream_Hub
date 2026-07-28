"""자유 광장 이미지 첨부용 오브젝트 스토리지 (Cloudflare R2, S3 호환 API).

R2는 boto3의 표준 S3 클라이언트를 그대로 쓸 수 있다 - endpoint_url만
계정 전용 R2 엔드포인트로 바꿔주면 된다.
"""

import uuid

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from database import get_settings

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB


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
