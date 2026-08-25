import logging
from functools import lru_cache

import redis
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger(__name__)

# jwt_secret_key/session_secret_key의 기본값 - .env 설정을 깜빡해도 서버가 "그냥" 뜨는 걸
# 막기 위한 감시 대상. 이 문자열 자체를 실제 시크릿으로 쓰는 배포가 있으면 HS256 서명을
# 아는 사람 누구나 어떤 유저로도 위조된 로그인 토큰을 만들 수 있다 - _validate_secrets가
# get_settings() 최초 호출(=앱 기동) 시점에 이 값 그대로인지 검사한다.
_PLACEHOLDER_SECRETS = {
    "jwt_secret_key": "change-this-to-a-long-random-secret",
    "session_secret_key": "change-this-session-secret",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # "production"일 때만 시크릿 placeholder 검사가 기동을 막는다(fail-fast) - 로컬 개발/CI
    # 환경까지 막으면 최초 세팅 경험이 나빠지므로, 그런 환경은 경고 로그만 남기고 넘어간다.
    environment: str = "development"

    database_url: str = "postgresql+psycopg2://dream_hub:dream_hub_password@localhost:5433/dream_hub_db"
    redis_url: str = "redis://localhost:6380/0"
    jwt_secret_key: str = "change-this-to-a-long-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    frontend_origin: str = "http://localhost:3000"

    # 세션 미들웨어(구글 OAuth state/nonce 저장용) 서명 키
    session_secret_key: str = "change-this-session-secret"

    # --- 인증 쿠키(httpOnly) 설정 - localStorage 저장 방식에서 전환하며 도입 ---
    # 액세스 토큰(httpOnly, JS가 못 읽음)과 CSRF 토큰(JS가 읽어서 헤더로 되돌려 보내야 하므로
    # httpOnly 아님) 두 쿠키의 이름. 프론트(frontend/src/api/axios.ts)가 CSRF 쿠키 이름/헤더
    # 이름을 문자열로 직접 알고 있어야 하므로 그쪽 상수와 반드시 같은 값을 유지해야 한다.
    access_token_cookie_name: str = "access_token"
    csrf_cookie_name: str = "csrf_token"
    csrf_header_name: str = "X-CSRF-Token"

    # 이메일 인증
    email_verification_token_expire_minutes: int = 60 * 24
    # 비밀번호 재설정 - 이메일 인증보다 짧게 잡는다(계정 탈취로 바로 이어질 수 있는 링크라
    # 유효 기간을 더 보수적으로 둔다).
    password_reset_token_expire_minutes: int = 60
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@dreamhub.dev"
    smtp_from_name: str = "Dream Hub"

    # 구글 OAuth 2.0
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    # AI 꿈 해몽 (Anthropic)
    anthropic_api_key: str = ""

    # 자유 광장 이미지 첨부 - Cloudflare R2(S3 호환) 오브젝트 스토리지
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    # 버킷의 공개 접근 URL(Public Development URL 또는 커스텀 도메인) - 끝에 슬래시 없이.
    r2_public_base_url: str = ""


def _validate_secrets(settings: Settings) -> None:
    is_production = settings.environment.strip().lower() == "production"
    for field_name, placeholder in _PLACEHOLDER_SECRETS.items():
        if getattr(settings, field_name) != placeholder:
            continue
        message = (
            f"{field_name}가 기본 placeholder 값 그대로입니다 - .env에서 실제 랜덤 값으로 "
            "반드시 교체하세요(예: python -c \"import secrets; print(secrets.token_urlsafe(32))\")."
        )
        if is_production:
            # 경고로 그치면 이 상태로도 서버가 계속 떠 있을 수 있다 - 이 시크릿을 아는 사람은
            # 누구나 임의 유저로 로그인 토큰을 위조할 수 있으므로, 프로덕션에서는 아예
            # 기동 자체를 막는다.
            raise RuntimeError(message)
        logger.warning(message)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _validate_secrets(settings)
    return settings


settings = get_settings()

# --- PostgreSQL (SQLAlchemy) ---
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Redis ---
redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> redis.Redis:
    return redis_client
