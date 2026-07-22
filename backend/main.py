from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.middleware.sessions import SessionMiddleware

from database import engine, get_settings, redis_client
from routers import ai_interpretation, auth, community, diary, home, lucid, mypage

settings = get_settings()

app = FastAPI(
    title="Dream Hub API",
    description="꿈 일기 및 해몽 커뮤니티 플랫폼 API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 구글 OAuth state/nonce 저장에 필요 (Authlib starlette client)
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret_key)

app.include_router(auth.router)
app.include_router(home.router)
app.include_router(diary.router)
app.include_router(community.router)
app.include_router(mypage.router)
app.include_router(lucid.router)
app.include_router(ai_interpretation.router)


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
    except Exception as exc:
        status["postgres"] = f"error: {exc}"

    try:
        redis_client.ping()
        status["redis"] = "ok"
    except Exception as exc:
        status["redis"] = f"error: {exc}"

    return status
