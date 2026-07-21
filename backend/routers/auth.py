import logging
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db, get_settings
from models import User
from schemas import LoginRequest, MessageResponse, TokenResponse, UserCreate, UserResponse, VerifyEmailRequest

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


def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    # 구글 로그인은 리다이렉트로 토큰만 전달하므로, 프론트엔드가 별도 조회 없이
    # 화면 표시용 이메일을 바로 읽을 수 있도록 payload에 포함시켜 둔다.
    payload = {"sub": str(user_id), "email": email, "type": "access", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_email_verification_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.email_verification_token_expire_minutes)
    payload = {"sub": str(user_id), "type": "email_verification", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


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


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 가입된 이메일입니다.",
        )

    user = User(email=payload.email, hashed_password=pwd_context.hash(payload.password), is_verified=False)
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

    token = create_access_token(user.id, user.email)
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
        # 구글 로그인 전용 계정은 사용할 수 없는 임의의 비밀번호 해시를 넣어둔다 (직접 로그인 불가).
        user = User(
            email=email,
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

    access_token = create_access_token(user.id, user.email)
    return RedirectResponse(url=f"{settings.frontend_origin}/?token={access_token}")
