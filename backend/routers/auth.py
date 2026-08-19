import logging
import random
import secrets
from datetime import datetime, timedelta, timezone

import jwt
import redis as redis_lib
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db, get_redis, get_settings
from models import User
from schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    NicknameAvailability,
    ResetPasswordRequest,
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


def create_access_token(user_id: int) -> str:
    # httpOnly 쿠키로 전환하기 전에는 email/nickname도 payload에 실어, 프론트가 (JS로 읽을 수
    # 있던 시절의) 토큰을 직접 디코딩해 화면 표시용 정보를 바로 꺼내 썼다. 이제 토큰은 JS가
    # 아예 못 읽는 httpOnly 쿠키라 그 용도가 사라졌고 - get_current_user도 항상 sub(유저
    # id)로 DB를 다시 조회해 최신 User를 가져오므로 email/nickname을 굳이 여기 넣어 둘
    # 이유가 없다. 최소한의 클레임만 남겨 토큰 자체의 정보 노출 범위도 줄인다.
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "type": "access", "exp": expire}
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


def create_password_reset_token(user_id: int) -> tuple[str, str]:
    """(토큰, jti) 튜플을 돌려준다. jti(JWT ID)는 "이 토큰을 이미 썼는지" Redis에 표시할
    자리 - JWT 자체는 상태를 안 가지므로(같은 토큰으로 몇 번이든 다시 검증에 성공한다),
    1회용으로 만들려면 검증에 성공한 "직후" jti 하나를 어딘가에 소모 표시해야 한다."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_token_expire_minutes)
    jti = secrets.token_urlsafe(16)
    payload = {"sub": str(user_id), "type": "password_reset", "jti": jti, "exp": expire}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, jti


# --- 인증 쿠키 발급/삭제 - localStorage+Authorization 헤더 방식에서 httpOnly 쿠키로 전환 ---
# secure는 production에서만 True로 강제한다 - 로컬 개발은 http://localhost라 Secure 쿠키를
# 브라우저가 아예 저장하지 않아, 개발 중에는 항상 False여야 로그인 자체가 된다.
def _cookie_secure() -> bool:
    return settings.environment.strip().lower() == "production"


def _set_auth_cookies(response: Response, token: str) -> str:
    """액세스 토큰(httpOnly - JS가 못 읽음) + CSRF 토큰(httpOnly 아님 - 프론트 JS가 읽어서
    변경 요청마다 헤더로 그대로 되돌려 보내는 더블 서브밋 쿠키 패턴) 두 개를 함께 심는다.
    CSRF 토큰 값 자체를 반환해 두면, 같은 응답의 바디에도 굳이 다시 실을 필요 없이
    호출부가 로그로 남기거나 테스트에서 바로 쓸 수 있다."""
    secure = _cookie_secure()
    max_age = settings.access_token_expire_minutes * 60
    response.set_cookie(
        key=settings.access_token_cookie_name,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite=settings.cookie_samesite,
        path="/",
    )
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite=settings.cookie_samesite,
        path="/",
    )
    return csrf_token


def _clear_auth_cookies(response: Response) -> None:
    # delete_cookie에 넘기는 속성(path/secure/samesite)이 심을 때와 어긋나면 브라우저가
    # "다른 쿠키"로 취급해 실제로는 안 지워진다 - _set_auth_cookies와 반드시 같은 값을 쓴다.
    secure = _cookie_secure()
    for name in (settings.access_token_cookie_name, settings.csrf_cookie_name):
        response.delete_cookie(key=name, path="/", secure=secure, samesite=settings.cookie_samesite)


# --- 요청 빈도 제한(rate limiting) - 이미 앱 전역에서 쓰는 Redis를 그대로 활용한다 ---
# INCR로 실패/시도 횟수를 세고, 그 키의 첫 증가(count == 1)에만 TTL을 걸어 "최근 N초" 슬라이딩
# 윈도우를 흉내낸다(고정 윈도우 근사 - 정교한 sliding log까지는 이 위협 모델에 과하다).
def _rate_limit_exceeded(redis_client: redis_lib.Redis, key: str, limit: int) -> bool:
    current = redis_client.get(key)
    return current is not None and int(current) >= limit


def _record_rate_limit_attempt(redis_client: redis_lib.Redis, key: str, window_seconds: int) -> None:
    count = redis_client.incr(key)
    if count == 1:
        redis_client.expire(key, window_seconds)


def _too_many_requests() -> HTTPException:
    # 차단 상태에서도 "몇 번 남았는지"/"언제 풀리는지" 같은 추가 정보는 주지 않는다 - 그 정보
    # 자체가 공격자에게 재시도 타이밍을 최적화해주는 신호가 된다.
    return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="잠시 후 다시 시도해 주세요.")


# 로그인 브루트포스 방어 - IP가 아니라 "시도 대상 이메일" 기준으로 잠근다. 같은 사무실/학교
# 등 공용 IP 뒤 여러 사용자가 있어도 서로에게 영향을 주지 않고, 무엇보다 "이 계정을 노리는
# 공격"을 직접 차단한다는 목적에 정확히 들어맞는다(IP 기준은 봇넷 앞에서는 쉽게 우회되고,
# 반대로 공유 IP의 무고한 사용자를 잠글 위험도 있다).
LOGIN_FAILURE_LIMIT = 5
LOGIN_FAILURE_WINDOW_SECONDS = 600  # 10분


def _login_failure_key(email: str) -> str:
    return f"auth:login_fail:{email.strip().lower()}"


# 회원가입 이메일 열거(enumeration) 완화 - IP 기준으로 짧은 시간에 너무 많은 가입 시도를
# 막는다. 이메일 기준으로 하면 공격자가 후보 이메일마다 최대 허용치까지만 시도하며 목록을
# 훑을 수 있어(각 이메일은 처음 몇 번뿐이라 절대 안 막힘), 여기서는 "한 출처가 얼마나
# 자주 두드리는가" 자체를 제한하는 IP 기준이 더 적절하다.
REGISTER_ATTEMPT_LIMIT = 10
REGISTER_ATTEMPT_WINDOW_SECONDS = 600  # 10분


def _register_attempt_key(client_ip: str) -> str:
    return f"auth:register_attempt:{client_ip}"


# 비밀번호 재설정 요청 남용 방지 - 이메일 기준으로 잠근다(같은 계정 메일함에 재설정 메일을
# 반복 발송해 스팸으로 괴롭히는 것을 직접 막는 게 목적이라 IP보다 이메일이 맞다). 로그인
# 잠금보다 더 빡빡하게 잡는다 - 여긴 매번 이메일 발송 비용이 든다.
FORGOT_PASSWORD_LIMIT = 3
FORGOT_PASSWORD_WINDOW_SECONDS = 600  # 10분


def _forgot_password_key(email: str) -> str:
    return f"auth:forgot_pw:{email.strip().lower()}"


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """httpOnly 액세스 토큰 쿠키를 검증해 현재 로그인한 유저를 반환한다.

    예전엔 Authorization: Bearer 헤더(HTTPBearer)에서 읽었는데, localStorage 대신 httpOnly
    쿠키로 전환하며 이제는 브라우저가 요청마다 자동으로 실어 보내는 쿠키를 읽는다 - 이
    함수를 Depends()로 쓰는 다른 라우터들은 반환 타입(User)이 그대로라 전혀 손댈 필요가
    없다(FastAPI 의존성 주입은 구현을 이렇게 통째로 갈아끼워도 호출부에 투명하다).

    꿈 기록소 CRUD처럼 유저 소유 데이터를 다루는 라우터가 이 의존성을 걸어 두면,
    본인 소유가 아닌 데이터에는 접근할 수 없다.
    """
    token = request.cookies.get(settings.access_token_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")

    try:
        decoded = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
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


def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> User | None:
    """쿠키가 없거나 유효하지 않으면 401 대신 None을 반환한다.

    누구나 볼 수 있지만 로그인했다면 '내가 이미 공감했는지' 같은 개인화 정보를 함께
    내려주고 싶은 공개 피드/게시글 목록 엔드포인트에 쓴다.
    """
    token = request.cookies.get(settings.access_token_cookie_name)
    if not token:
        return None
    try:
        decoded = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
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


async def send_password_reset_email(email: str, token: str) -> None:
    reset_url = f"{settings.frontend_origin}/reset-password?token={token}"
    message = MessageSchema(
        subject="[Dream Hub] 비밀번호 재설정 안내",
        recipients=[email],
        body=(
            "비밀번호 재설정을 요청하셨습니다.\n\n"
            f"아래 링크를 클릭해 새 비밀번호를 설정해 주세요:\n{reset_url}\n\n"
            f"이 링크는 {settings.password_reset_token_expire_minutes}분 동안, 한 번만 사용할 수 있습니다.\n"
            "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다 - 비밀번호는 변경되지 않습니다."
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
async def register(payload: UserCreate, request: Request, db: Session = Depends(get_db), redis_client: redis_lib.Redis = Depends(get_redis)):
    # "이미 가입된 이메일입니다" 메시지 자체는 UX상 남겨둔다(가입 여부를 알아야 유저가 바로
    # 로그인으로 전환할 수 있다) - 대신 이 한 출처(IP)가 짧은 시간에 반복 호출하며 이메일
    # 목록을 훑는 걸 막는다.
    client_ip = request.client.host if request.client else "unknown"
    register_key = _register_attempt_key(client_ip)
    if _rate_limit_exceeded(redis_client, register_key, REGISTER_ATTEMPT_LIMIT):
        raise _too_many_requests()
    _record_rate_limit_attempt(redis_client, register_key, REGISTER_ATTEMPT_WINDOW_SECONDS)

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


@router.post("/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    failure_key = _login_failure_key(payload.email)
    # 잠금 여부를 비밀번호 검증(bcrypt, 의도적으로 느림)보다 먼저 확인한다 - 잠긴 계정에도
    # 매번 bcrypt를 돌리면 그 자체가 서버 자원을 태우는 또 다른 공격 표면이 된다.
    if _rate_limit_exceeded(redis_client, failure_key, LOGIN_FAILURE_LIMIT):
        raise _too_many_requests()

    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not pwd_context.verify(payload.password, user.hashed_password):
        # 이메일 존재 여부를 노출하지 않기 위해 두 실패 케이스 모두 동일한 메시지를 사용한다.
        _record_rate_limit_attempt(redis_client, failure_key, LOGIN_FAILURE_WINDOW_SECONDS)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 일치하지 않습니다.",
        )

    # 비밀번호가 맞았다는 건 이 시도가 브루트포스가 아니라는 뜻이다 - 이후 인증 여부 체크는
    # 별개의 정상 흐름이니 실패 카운트를 여기서 바로 초기화한다.
    redis_client.delete(failure_key)

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이메일 인증이 필요합니다. 메일함을 확인해 주세요.",
        )

    token = create_access_token(user.id)
    _set_auth_cookies(response, token)
    return UserResponse.model_validate(user)


@router.post("/logout", response_model=MessageResponse)
def logout(response: Response):
    # 인증을 요구하지 않는다(Depends(get_current_user) 없음) - 이미 만료/무효인 쿠키를 들고
    # "로그아웃"을 눌러도 그냥 조용히 성공해야 한다(멱등). httpOnly 쿠키는 JS가 직접 지울 수
    # 없으므로, 서버가 Set-Cookie로 만료된 값을 내려줘야 브라우저에서 실제로 삭제된다.
    _clear_auth_cookies(response)
    return MessageResponse(message="로그아웃되었습니다.")


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """프론트가 로그인 상태를 확인하는 유일한 방법 - httpOnly 쿠키는 JS가 못 읽으므로,
    예전처럼 JWT를 클라이언트에서 직접 디코딩해 만료 여부를 판단할 수 없다. 앱이 로드될
    때마다(새로고침 포함) 이 엔드포인트를 호출해 실제로 유효한 세션인지 서버에 확인한다.
    인증이 안 돼 있으면 get_current_user가 이미 401을 던진다."""
    return UserResponse.model_validate(current_user)


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


# 가입 여부와 무관하게 항상 이 메시지 하나만 돌려준다 - "가입된 이메일이면 발송, 아니면
# 조용히 무시"를 겉에서는 구분할 수 없게 해, 이 엔드포인트로 이메일 가입 여부를 훑을 수
# 없게 한다(register와 반대되는 설계 - register는 UX를 위해 노출을 감수했지만, 여긴
# 굳이 노출할 UX상 이유가 없다).
_FORGOT_PASSWORD_GENERIC_MESSAGE = "가입된 이메일이라면 비밀번호 재설정 메일이 발송됩니다. 메일함을 확인해 주세요."


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    limit_key = _forgot_password_key(payload.email)
    # 존재하지 않는 이메일이어도 카운트는 똑같이 올린다 - 그래야 "몇 번째부터 429가 뜨는지"로
    # 가입 여부를 추측할 수 있는 부가 채널이 생기지 않는다.
    if _rate_limit_exceeded(redis_client, limit_key, FORGOT_PASSWORD_LIMIT):
        raise _too_many_requests()
    _record_rate_limit_attempt(redis_client, limit_key, FORGOT_PASSWORD_WINDOW_SECONDS)

    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None:
        token, _jti = create_password_reset_token(user.id)
        try:
            await send_password_reset_email(user.email, token)
        except Exception:
            logger.warning("failed to send password reset email to %s", user.email, exc_info=True)

    return MessageResponse(message=_FORGOT_PASSWORD_GENERIC_MESSAGE)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    try:
        decoded = jwt.decode(payload.token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않거나 만료된 링크입니다.")

    if decoded.get("type") != "password_reset":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않은 토큰입니다.")

    jti = decoded.get("jti")
    if not jti:
        # jti 없는 토큰(이 기능 도입 이전에 발급된 것은 애초에 존재할 수 없지만, 방어적으로)은
        # 1회성을 보장할 수 없으므로 거부한다.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않은 토큰입니다.")

    # SET NX(이미 있으면 실패) + EX(토큰 자체의 남은 만료 시간과 맞춤)로 "이 토큰을 이미
    # 썼는지 확인"과 "썼다고 표시"를 원자적으로 한 번에 한다 - 별도 SELECT 후 SET이었다면
    # 동시에 두 번 요청이 들어왔을 때(레이스) 둘 다 통과해버릴 수 있다.
    used_key = f"auth:pwreset_used:{jti}"
    remaining_seconds = max(1, int(decoded["exp"] - datetime.now(timezone.utc).timestamp()))
    if not redis_client.set(used_key, "1", nx=True, ex=remaining_seconds):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용되었거나 유효하지 않은 링크입니다.")

    user = db.query(User).filter(User.id == int(decoded["sub"])).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    user.hashed_password = pwd_context.hash(payload.new_password)
    db.commit()

    # 로그인 브루트포스 잠금이 걸려 있었다면(자기 계정을 스스로 못 열던 상태) 새 비밀번호로
    # 다시 시작할 수 있게 함께 풀어준다.
    redis_client.delete(_login_failure_key(user.email))

    return MessageResponse(message="비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.")


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

    access_token = create_access_token(user.id)
    # 예전엔 ?token=...을 URL에 실어 프론트가 그 값을 읽어 localStorage에 저장했다 - 이제는
    # 리다이렉트 응답 자체에 httpOnly 쿠키를 심고 URL은 깨끗하게 "/"만 남긴다(토큰이 브라우저
    # 히스토리/리퍼러에 남지 않는다는 장점도 있다). RedirectResponse도 Response의 서브클래스라
    # 다른 엔드포인트와 똑같이 set_cookie를 그대로 쓸 수 있다.
    redirect = RedirectResponse(url=f"{settings.frontend_origin}/")
    _set_auth_cookies(redirect, access_token)
    return redirect
