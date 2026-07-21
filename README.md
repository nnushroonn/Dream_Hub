# Dream Hub

꿈 일기 및 해몽 커뮤니티 플랫폼 — Next.js + FastAPI + PostgreSQL 모노레포.

## 기술 스택

**프론트엔드**
- Next.js (App Router) + TypeScript
- Tailwind CSS
- Zustand (전역 상태 관리)
- Axios

**백엔드**
- Python 3.10+ / FastAPI
- SQLAlchemy (ORM) + PostgreSQL
- Pydantic (스키마 검증)
- Passlib(Bcrypt) — 비밀번호 해싱
- PyJWT — 인증 토큰
- Authlib — 구글 OAuth 2.0
- FastAPI-Mail — 이메일 인증 발송
- Redis — 캐시

**인프라**
- Docker Compose (PostgreSQL + Redis 로컬 실행)

## 폴더 구조

```
.
├── docker-compose.yml       # PostgreSQL + Redis
├── backend/
│   ├── main.py               # FastAPI 앱 진입점, CORS/세션 미들웨어
│   ├── database.py           # 설정(.env), DB/Redis 연결
│   ├── models.py             # SQLAlchemy 모델 (User, Dream, StandardKeyword ...)
│   ├── schemas.py            # Pydantic 요청/응답 스키마
│   ├── routers/
│   │   └── auth.py           # 회원가입/로그인/이메일 인증/구글 OAuth
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/app/               # App Router 페이지 (로그인/회원가입, 이메일 인증)
    ├── src/api/                # axios 인스턴스, 인증 API 함수
    ├── src/store/              # Zustand 스토어 (인증 상태)
    └── .env.local.example
```

## 시작하기

### 1. DB / Redis 실행 (Docker)

```bash
docker compose up -d
```

### 2. 백엔드

```bash
cd backend
python -m venv venv
./venv/Scripts/activate   # Windows
pip install -r requirements.txt
cp .env.example .env      # 값 채워넣기 (아래 "환경 변수" 참고)
uvicorn main:app --reload
```

기본 주소: http://localhost:8000 (API 문서: `/docs`)

### 3. 프론트엔드

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

기본 주소: http://localhost:3000

> VSCode로 프로젝트 루트를 열면 `.vscode/tasks.json` 설정에 따라 백엔드/프론트엔드가 자동으로 실행됩니다.

## 환경 변수 (`backend/.env`)

| 변수 | 설명 |
|---|---|
| `DATABASE_URL`, `REDIS_URL` | `docker-compose.yml`의 포트 매핑과 일치해야 함 |
| `JWT_SECRET_KEY`, `SESSION_SECRET_KEY` | 각각 랜덤한 값으로 교체 (기본값 그대로 쓰지 말 것) |
| `SMTP_*` | 이메일 인증 발송용 SMTP 계정 (Gmail 사용 시 앱 비밀번호 필요) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console에서 발급, 리디렉션 URI를 `GOOGLE_REDIRECT_URI`와 동일하게 등록 |

## 구현된 기능

- 이메일/비밀번호 회원가입 + 로그인 (비밀번호 확인 검증 포함)
- 이메일 소유권 인증 (인증 메일 발송 → 인증 전 로그인 차단)
- 구글 OAuth 2.0 로그인
- JWT 기반 인증, Zustand로 클라이언트 인증 상태 관리
