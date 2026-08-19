import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.middleware.sessions import SessionMiddleware

import models  # noqa: F401 - Base.metadata에 테이블 정의를 등록하기 위해 임포트만으로 충분
from csrf import CsrfProtectionMiddleware
from database import Base, SessionLocal, engine, get_settings, redis_client
from routers import (
    ai_interpretation,
    auth,
    community,
    diary,
    dictionary,
    dreams,
    garden,
    home,
    lucid,
    magazine,
    mypage,
    notifications,
    seeds,
    trends,
    user,
)
from routers.trends import run_search_trend_refresh_loop
from security_headers import SecurityHeadersMiddleware

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 인기 검색어 일간(최근 24시간)/주간(최근 7일) 롤링 랭킹을 주기적으로 배치 집계하는
    # 백그라운드 루프.
    batch_task = asyncio.create_task(run_search_trend_refresh_loop(SessionLocal, redis_client))
    yield
    batch_task.cancel()


app = FastAPI(
    title="Dream Hub API",
    description="꿈 일기 및 해몽 커뮤니티 플랫폼 API",
    version="0.1.0",
    lifespan=lifespan,
)

# 아직 Alembic 마이그레이션이 구성되지 않아, 없는 테이블만 추가로 생성하는 최소한의
# 임시 조치로 시작 시 스키마를 동기화한다. 기존 테이블은 건드리지 않는다.
Base.metadata.create_all(bind=engine)

_is_production = settings.environment.strip().lower() == "production"

# FRONTEND_ORIGIN 하나만 허용하면, 로컬 개발 중 localhost:3000과 LAN IP(같은 와이파이의
# 다른 기기 공유용, 예: 192.168.0.164:3000)를 번갈아 쓸 때마다 .env를 고치고 서버를
# 재시작해야 한다 - 둘 다 항상 같이 허용해 그 왕복을 없앤다. FRONTEND_ORIGIN이 이미
# localhost:3000이면 중복 없이 하나만 남는다. 프로덕션에서는 이 개발 편의용 origin을 넣을
# 이유가 없으므로(신뢰할 필요 없는 출처를 credentials 포함 요청에 열어주게 된다) 뺀다.
_allowed_origins = (
    [settings.frontend_origin]
    if _is_production
    else list(dict.fromkeys([settings.frontend_origin, "http://localhost:3000"]))
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 구글 OAuth state/nonce 저장에 필요 (Authlib starlette client) - 이 쿠키는 로그인
# 왕복(수 초~수 분) 동안만 의미가 있으므로, access_token/csrf_token과 같은 기준으로
# 프로덕션에서만 Secure를 강제하고, 기본 14일 만료 대신 왕복에 충분한 짧은 유효기간만 준다.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret_key,
    https_only=_is_production,
    max_age=15 * 60,
    same_site="lax",
)
# 로그인 쿠키(access_token)가 실린 상태 변경 요청(POST/PUT/PATCH/DELETE)마다 CSRF 쿠키/헤더
# 쌍이 일치하는지 검사한다 - 전 라우터에 공통 적용되므로 라우터 하나하나에 의존성을 추가로
# 걸 필요가 없다(더블 서브밋 쿠키 패턴을 고른 이유는 csrf.py 모듈 docstring 참고).
app.add_middleware(
    CsrfProtectionMiddleware,
    access_token_cookie_name=settings.access_token_cookie_name,
    csrf_cookie_name=settings.csrf_cookie_name,
    csrf_header_name=settings.csrf_header_name,
)
# 가장 마지막에 등록해 가장 바깥쪽 레이어가 되게 한다(스타레트는 나중에 등록한 미들웨어가
# 요청 처리 순서상 가장 먼저 실행된다) - HTTPS 강제 리다이렉트가 CORS/세션/CSRF 처리보다
# 먼저 일어나야 하고, 보안 헤더도 다른 미들웨어가 손댄 이후의 최종 응답에 붙어야 한다.
app.add_middleware(SecurityHeadersMiddleware, force_https=_is_production)

app.include_router(auth.router)
app.include_router(home.router)
app.include_router(diary.router)
app.include_router(community.router)
app.include_router(mypage.router)
app.include_router(lucid.router)
app.include_router(ai_interpretation.router)
app.include_router(dreams.router)
app.include_router(dictionary.router)
app.include_router(magazine.router)
app.include_router(seeds.router)
app.include_router(trends.router)
app.include_router(user.router)
app.include_router(notifications.router)
app.include_router(garden.router)


@app.get("/")
def read_root():
    return {"message": "Dream Hub API is running"}


@app.get("/health")
def health_check():
    status = {"api": "ok", "postgres": "unknown", "redis": "unknown"}

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        status["postgres"] = "ok"
    except Exception:
        # 원본 예외 메시지(호스트명/포트/인증 실패 사유 등 인프라 정보를 담고 있을 수 있다)는
        # 비로그인 공개 엔드포인트인 이 응답에는 내보내지 않고 서버 로그에만 남긴다.
        logger.warning("헬스체크: Postgres 연결 실패", exc_info=True)
        status["postgres"] = "down"

    try:
        redis_client.ping()
        status["redis"] = "ok"
    except Exception:
        logger.warning("헬스체크: Redis 연결 실패", exc_info=True)
        status["redis"] = "down"

    return status
