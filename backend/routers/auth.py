import logging
import random
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db, get_settings
from models import User
from schemas import (
    LoginRequest,
    MessageResponse,
    NicknameAvailability,
    TokenResponse,
    UserCreate,
    UserResponse,
    VerifyEmailRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

mail_config = ConnectionConfig(
    MAIL_USERNAME=settings.smtp_username,
    MAIL_PASSWORD=settings.smtp_password,
    MAIL_FROM=settings.smtp_from,
    MAIL_FROM_NAME=settings.smtp_from_name,
    MAIL_PORT=settings.smtp_port,
    MAIL_SERVER=settings.smtp_host,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=bool(settings.smtp_username),
    VALIDATE_CERTS=True,
)

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def create_access_token(user_id: int, email: str, nickname: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    # 구글 로그인은 리다이렉트로 토큰만 전달하므로, 프론트엔드가 별도 조회 없이
    # 화면 표시용 이메일/닉네임을 바로 읽을 수 있도록 payload에 포함시켜 둔다.
    payload = {"sub": str(user_id), "email": email, "nickname": nickname, "type": "access", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


# 꿈 페르소나 닉네임 자동 생성기. 회원가입 폼의 🎲 버튼과 같은 컨셉의 조합을 서버에서도
# 재사용해, 구글 로그인처럼 유저가 직접 닉네임을 고르지 않는 가입 경로에서 fallback으로 쓴다.
_PERSONA_ADJECTIVES = ["보랏빛", "자각몽을 꾸는", "달빛 아래", "새벽녘의"]
_PERSONA_NOUNS = ["탐험가", "몽상가", "추적자", "나비"]


def _generate_persona_nickname() -> str:
    return f"{random.choice(_PERSONA_ADJECTIVES)} {random.choice(_PERSONA_NOUNS)}"


def _unique_persona_nickname(db: Session) -> str:
    for _ in range(20):
        candidate = _generate_persona_nickname()
        if db.query(User).filter(User.nickname == candidate).first() is None:
            return candidate
    # 극히 드문 연속 충돌 시에는 짧은 랜덤 접미사를 붙여 확정적으로 유니크하게 만든다.
    return f"{_generate_persona_nickname()}-{secrets.token_hex(2)}"


def create_email_verification_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.email_verification_token_expire_minutes)
    payload = {"sub": str(user_id), "type": "email_verification", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Authorization: Bearer <access_token> 헤더를 검증해 현재 로그인한 유저를 반환한다.

    꿈 기록소 CRUD처럼 유저 소유 데이터를 다루는 라우터가 이 의존성을 걸어 두면,
    본인 소유가 아닌 데이터에는 접근할 수 없다.
    """
    try:
        decoded = jwt.decode(credentials.credentials, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 토큰입니다.",
        )

    if decoded.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰입니다.")

    user = db.query(User).filter(User.id == int(decoded["sub"])).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")

    return user


optional_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """토큰이 없거나 유효하지 않으면 401 대신 None을 반환한다.

    누구나 볼 수 있지만 로그인했다면 '내가 이미 공감했는지' 같은 개인화 정보를 함께
    내려주고 싶은 공개 피드/게시글 목록 엔드포인트에 쓴다.
    """
    if credentials is None:
        return None
    try:
        decoded = jwt.decode(credentials.credentials, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if decoded.get("type") != "access":
        return None
    return db.query(User).filter(User.id == int(decoded["sub"])).first()


async def send_verification_email(email: str, token: str) -> None:
    verify_url = f"{settings.frontend_origin}/verify?token={token}"
    message = MessageSchema(
        subject="[Dream Hub] 이메일 인증을 완료해 주세요",
        recipients=[email],
        body=(
            "Dream Hub 회원가입을 환영합니다.\n\n"
            f"아래 링크를 클릭해 이메일 인증을 완료해 주세요:\n{verify_url}\n\n"
            f"이 링크는 {settings.email_verification_token_expire_minutes // 60}시간 동안 유효합니다."
        ),
        subtype=MessageType.plain,
    )
    fm = FastMail(mail_config)
    await fm.send_message(message)


@router.get("/check-nickname", response_model=NicknameAvailability)
def check_nickname(nickname: str, db: Session = Depends(get_db)):
    """회원가입 폼이 입력 중 실시간으로 호출하는 중복 체크. 길이 제약은 프론트/스키마가
    이미 따로 검증하므로 여기서는 순수하게 사용 가능 여부만 본다."""
    trimmed = nickname.strip()
    if not trimmed:
        return NicknameAvailability(available=False)
    exists = db.query(User).filter(User.nickname == trimmed).first() is not None
    return NicknameAvailability(available=not exists)


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 가입된 이메일입니다.",
        )

    existing_nickname = db.query(User).filter(User.nickname == payload.nickname).first()
    if existing_nickname is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 사용 중인 닉네임입니다.",
        )

    user = User(
        email=payload.email,
        nickname=payload.nickname,
        hashed_password=pwd_context.hash(payload.password),
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    verification_token = create_email_verification_token(user.id)
    try:
        await send_verification_email(user.email, verification_token)
    except Exception:
        # 메일 발송 실패가 회원가입 자체를 막지는 않는다 (SMTP 설정 누락/일시 장애 대비).
        logger.warning("failed to send verification email to %s", user.email, exc_info=True)

    return MessageResponse(message="인증 이메일이 발송되었습니다. 메일함을 확인해 주세요.")


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not pwd_context.verify(payload.password, user.hashed_password):
        # 이메일 존재 여부를 노출하지 않기 위해 두 실패 케이스 모두 동일한 메시지를 사용한다.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 일치하지 않습니다.",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이메일 인증이 필요합니다. 메일함을 확인해 주세요.",
        )

    token = create_access_token(user.id, user.email, user.nickname)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    try:
        decoded = jwt.decode(payload.token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않거나 만료된 인증 링크입니다.",
        )

    if decoded.get("type") != "email_verification":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않은 토큰입니다.")

    user = db.query(User).filter(User.id == int(decoded["sub"])).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    if not user.is_verified:
        user.is_verified = True
        db.commit()

    return MessageResponse(message="이메일 인증이 완료되었습니다.")


@router.get("/login/google")
async def login_google(request: Request):
    return await oauth.google.authorize_redirect(request, settings.google_redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:
        logger.warning("google oauth callback failed", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="구글 로그인에 실패했습니다.")

    userinfo = token.get("userinfo")
    if not userinfo or not userinfo.get("email"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="구글 계정 정보를 가져올 수 없습니다.")

    email = userinfo["email"]
    user = db.query(User).filter(User.email == email).first()

    if user is None:
        # 구글 로그인은 회원가입 폼의 닉네임 입력 단계를 거치지 않으므로, 같은 페르소나
        # 생성기로 즉석에서 유니크한 닉네임을 하나 배정한다 (나중에 원하면 바꿀 수 있다).
        # 구글 로그인 전용 계정은 사용할 수 없는 임의의 비밀번호 해시를 넣어둔다 (직접 로그인 불가).
        user = User(
            email=email,
            nickname=_unique_persona_nickname(db),
            hashed_password=pwd_context.hash(secrets.token_urlsafe(32)),
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.is_verified:
        # 구글이 이미 이메일 소유권을 검증했으므로 기존 미인증 계정도 함께 인증 처리한다.
        user.is_verified = True
        db.commit()

    access_token = create_access_token(user.id, user.email, user.nickname)
    return RedirectResponse(url=f"{settings.frontend_origin}/?token={access_token}")
