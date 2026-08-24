"""관리자 전용 라우터 - 프론트 /admin 화면이 쓰는 API 전부가 여기 모여 있다.

모든 엔드포인트가 get_current_admin_user에 의존한다: 로그인 자체가 안 됐으면 401, 로그인은
됐지만 is_admin이 아니면 403을 돌려준다. is_admin은 오직 DB에서 직접 켜야 하며(가입 폼/일반
API로는 절대 켤 수 없다), 이 라우터 자신도 그 플래그를 바꾸는 엔드포인트를 제공하지 않는다 -
관리자 스스로 다른 관리자를 임명/해임하는 기능은 의도적으로 만들지 않았다(첫 관리자 지정과
동일하게, 그 정도로 민감한 권한 변경은 항상 DB에 직접 접근할 수 있는 사람만 하게 한다).
"""

from datetime import datetime, timedelta, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CommunityComment,
    CommunityPost,
    DreamComment,
    DreamEntry,
    DreamStatus,
    MagazineArticle,
    Report,
    ReportStatus,
    ReportTargetType,
    User,
)
from routers.auth import get_current_admin_user
from routers.magazine import (
    MagazineArticleDetail,
    MagazineListResponse,
    _to_summary as _magazine_to_summary,
)
from schemas import MessageResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_LIST_DEFAULT_LIMIT = 20
ADMIN_LIST_MAX_LIMIT = 100


# --- 📊 통계 대시보드 ---------------------------------------------------------


class DailySignupCount(BaseModel):
    date: str
    count: int


class AdminStatsResponse(BaseModel):
    total_users: int
    total_community_posts: int
    total_public_dreams: int
    total_comments: int
    total_ai_interpretations: int
    pending_reports: int
    signups_last_7_days: list[DailySignupCount]


@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin_user)) -> dict:
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_community_posts = db.query(func.count(CommunityPost.id)).scalar() or 0
    total_public_dreams = (
        db.query(func.count(DreamEntry.id)).filter(DreamEntry.status == DreamStatus.PUBLIC).scalar() or 0
    )
    total_comments = (db.query(func.count(CommunityComment.id)).scalar() or 0) + (
        db.query(func.count(DreamComment.id)).scalar() or 0
    )
    total_ai_interpretations = (
        db.query(func.count(DreamEntry.id)).filter(DreamEntry.interpretation.isnot(None)).scalar() or 0
    )
    pending_reports = db.query(func.count(Report.id)).filter(Report.status == ReportStatus.PENDING).scalar() or 0

    # 최근 7일 가입자 추이 - 파이썬에서 날짜별로 직접 센다(커뮤니티 태그 집계와 같은 이유:
    # 볼륨이 크지 않은 초기 서비스라 DB 집계 함수 없이도 충분하고, 다이얼렉트 중립적이다).
    since = datetime.now(timezone.utc) - timedelta(days=6)
    recent_users = db.query(User.created_at).filter(User.created_at >= since).all()
    counts_by_date: dict[str, int] = {}
    for (created_at,) in recent_users:
        key = created_at.date().isoformat()
        counts_by_date[key] = counts_by_date.get(key, 0) + 1
    signups_last_7_days = []
    for offset in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=offset)).date().isoformat()
        signups_last_7_days.append({"date": day, "count": counts_by_date.get(day, 0)})

    return {
        "total_users": total_users,
        "total_community_posts": total_community_posts,
        "total_public_dreams": total_public_dreams,
        "total_comments": total_comments,
        "total_ai_interpretations": total_ai_interpretations,
        "pending_reports": pending_reports,
        "signups_last_7_days": signups_last_7_days,
    }


# --- 🚨 신고 큐 ---------------------------------------------------------------


class ReportItem(BaseModel):
    id: int
    target_type: str
    target_id: int
    reporter_nickname: str | None
    reason: str | None
    status: str
    created_at: str
    # 대상 미리보기 - 신고 시점 이후 수정/삭제됐을 수 있어 항상 "지금" 다시 조회한다.
    # 이미 지워진 대상이면 target_deleted=True, title/preview는 둘 다 None.
    target_title: str | None
    target_preview: str | None
    target_deleted: bool


class ReportListResponse(BaseModel):
    items: list[ReportItem]
    total_count: int
    total_pages: int
    page: int


def _report_target_preview(db: Session, target_type: ReportTargetType, target_id: int) -> tuple[str | None, str | None, bool]:
    if target_type == ReportTargetType.POST:
        post = db.query(CommunityPost).filter(CommunityPost.id == target_id).first()
        if post is None:
            return None, None, True
        return (post.title or "(제목 없음)"), post.content[:120], False

    entry = db.query(DreamEntry).filter(DreamEntry.id == target_id).first()
    if entry is None:
        return None, None, True
    return (entry.public_title or entry.title), entry.summary[:120], False


@router.get("/reports", response_model=ReportListResponse)
def list_reports(
    status_filter: str = Query("PENDING", alias="status", pattern="^(PENDING|RESOLVED|DISMISSED|ALL)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(ADMIN_LIST_DEFAULT_LIMIT, ge=1, le=ADMIN_LIST_MAX_LIMIT),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> dict:
    query = db.query(Report)
    if status_filter != "ALL":
        query = query.filter(Report.status == ReportStatus(status_filter))
    query = query.order_by(Report.created_at.desc())

    total_count = query.count()
    total_pages = max(ceil(total_count / limit), 1)
    reports = query.offset((page - 1) * limit).limit(limit).all()

    items = []
    for r in reports:
        title, preview, deleted = _report_target_preview(db, r.target_type, r.target_id)
        items.append(
            {
                "id": r.id,
                "target_type": r.target_type.value,
                "target_id": r.target_id,
                "reporter_nickname": r.reporter.nickname if r.reporter else None,
                "reason": r.reason,
                "status": r.status.value,
                "created_at": r.created_at.isoformat(),
                "target_title": title,
                "target_preview": preview,
                "target_deleted": deleted,
            }
        )
    return {"items": items, "total_count": total_count, "total_pages": total_pages, "page": page}


class ReportResolveInput(BaseModel):
    # "dismiss" = 조치 없이 기각(오신고 등). "delete_content" = 대상을 실제로 내린다.
    action: str = Field(pattern="^(dismiss|delete_content)$")


@router.post("/reports/{report_id}/resolve", response_model=MessageResponse)
def resolve_report(
    report_id: int,
    payload: ReportResolveInput,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> dict:
    report = db.query(Report).filter(Report.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="신고를 찾을 수 없습니다.")
    if report.status != ReportStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 처리된 신고입니다.")

    if payload.action == "delete_content":
        if report.target_type == ReportTargetType.POST:
            db.query(CommunityPost).filter(CommunityPost.id == report.target_id).delete()
        else:
            # DreamEntry는 유저의 "나만의 일기장/정원" 원본과 같은 행이다(공개 여부만 다르다) -
            # 완전 삭제 대신 비공개로 되돌려 무의식 피드에서만 내린다. 개인 기록 자체는
            # 관리자 조치와 무관하게 보존한다.
            entry = db.query(DreamEntry).filter(DreamEntry.id == report.target_id).first()
            if entry is not None:
                entry.status = DreamStatus.PRIVATE
        report.status = ReportStatus.RESOLVED
    else:
        report.status = ReportStatus.DISMISSED

    report.resolved_at = datetime.now(timezone.utc)
    report.resolved_by_id = admin.id
    db.commit()
    return {"message": "처리했습니다."}


# --- 👤 유저 관리 --------------------------------------------------------------


class AdminUserItem(BaseModel):
    id: int
    email: str
    nickname: str
    is_verified: bool
    is_admin: bool
    is_suspended: bool
    created_at: str


class AdminUserListResponse(BaseModel):
    items: list[AdminUserItem]
    total_count: int
    total_pages: int
    page: int


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    search: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    limit: int = Query(ADMIN_LIST_DEFAULT_LIMIT, ge=1, le=ADMIN_LIST_MAX_LIMIT),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> dict:
    query = db.query(User)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(User.email.ilike(like), User.nickname.ilike(like)))
    query = query.order_by(User.created_at.desc())

    total_count = query.count()
    total_pages = max(ceil(total_count / limit), 1)
    users = query.offset((page - 1) * limit).limit(limit).all()
    return {
        "items": [
            {
                "id": u.id,
                "email": u.email,
                "nickname": u.nickname,
                "is_verified": u.is_verified,
                "is_admin": u.is_admin,
                "is_suspended": u.is_suspended,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
        "total_count": total_count,
        "total_pages": total_pages,
        "page": page,
    }


@router.post("/users/{user_id}/suspend", response_model=MessageResponse)
def toggle_suspend_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> dict:
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자기 자신은 정지할 수 없습니다.")
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="유저를 찾을 수 없습니다.")
    if target.is_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="다른 관리자는 정지할 수 없습니다.")
    target.is_suspended = not target.is_suspended
    db.commit()
    return {"message": "정지했습니다." if target.is_suspended else "정지를 해제했습니다."}


class AdminNicknameInput(BaseModel):
    nickname: str = Field(min_length=2, max_length=20)


@router.patch("/users/{user_id}/nickname", response_model=MessageResponse)
def force_change_nickname(
    user_id: int,
    payload: AdminNicknameInput,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> dict:
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="유저를 찾을 수 없습니다.")
    trimmed = payload.nickname.strip()
    existing = db.query(User).filter(User.nickname == trimmed, User.id != user_id).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 닉네임입니다.")
    target.nickname = trimmed
    db.commit()
    return {"message": "닉네임을 변경했습니다."}


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> dict:
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자기 자신은 삭제할 수 없습니다.")
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="유저를 찾을 수 없습니다.")
    if target.is_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="다른 관리자는 삭제할 수 없습니다.")
    db.delete(target)
    db.commit()
    return {"message": "계정을 삭제했습니다."}


# --- 📰 매거진 관리 ------------------------------------------------------------
# 목록/상세 응답 모양은 공개 엔드포인트(routers/magazine.py)와 완전히 같아 그 스키마와
# _to_summary 변환을 그대로 재사용한다 - 여기서 새로 정의하는 건 쓰기(생성/수정) 입력뿐이다.


class MagazineWriteInput(BaseModel):
    # 글 URL(/magazine/post?slug=...)에 그대로 쓰이므로 영문/숫자/하이픈만 허용한다.
    slug: str = Field(min_length=1, max_length=200, pattern=r"^[a-z0-9-]+$")
    title: str = Field(min_length=1, max_length=200)
    excerpt: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1)
    category: str = Field(default="꿈 심리학", max_length=50)


@router.get("/magazine", response_model=MagazineListResponse)
def admin_list_magazine(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> dict:
    query = db.query(MagazineArticle).order_by(MagazineArticle.created_at.desc())
    total_count = query.count()
    total_pages = max(ceil(total_count / limit), 1)
    articles = query.offset((page - 1) * limit).limit(limit).all()
    return {
        "items": [_magazine_to_summary(a) for a in articles],
        "total_count": total_count,
        "total_pages": total_pages,
        "page": page,
    }


@router.get("/magazine/{article_id}", response_model=MagazineArticleDetail)
def admin_get_magazine(
    article_id: int, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin_user)
) -> dict:
    article = db.query(MagazineArticle).filter(MagazineArticle.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="글을 찾을 수 없습니다.")
    # 공개 상세 조회(GET /api/magazine/{slug})와 달리 view_count를 올리지 않는다 - 관리자가
    # 미리보기/수정하러 열어보는 것까지 조회수로 잡히면 안 된다.
    return {**_magazine_to_summary(article), "content": article.content}


@router.post("/magazine", response_model=MagazineArticleDetail, status_code=status.HTTP_201_CREATED)
def admin_create_magazine(
    payload: MagazineWriteInput, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin_user)
) -> dict:
    if db.query(MagazineArticle).filter(MagazineArticle.slug == payload.slug).first() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 slug입니다.")
    article = MagazineArticle(
        slug=payload.slug,
        title=payload.title,
        excerpt=payload.excerpt,
        content=payload.content,
        category=payload.category,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return {**_magazine_to_summary(article), "content": article.content}


@router.patch("/magazine/{article_id}", response_model=MagazineArticleDetail)
def admin_update_magazine(
    article_id: int,
    payload: MagazineWriteInput,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> dict:
    article = db.query(MagazineArticle).filter(MagazineArticle.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="글을 찾을 수 없습니다.")
    if payload.slug != article.slug:
        clash = db.query(MagazineArticle).filter(
            MagazineArticle.slug == payload.slug, MagazineArticle.id != article_id
        ).first()
        if clash is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 slug입니다.")
    article.slug = payload.slug
    article.title = payload.title
    article.excerpt = payload.excerpt
    article.content = payload.content
    article.category = payload.category
    db.commit()
    db.refresh(article)
    return {**_magazine_to_summary(article), "content": article.content}


@router.delete("/magazine/{article_id}", response_model=MessageResponse)
def admin_delete_magazine(
    article_id: int, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin_user)
) -> dict:
    article = db.query(MagazineArticle).filter(MagazineArticle.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="글을 찾을 수 없습니다.")
    db.delete(article)
    db.commit()
    return {"message": "삭제했습니다."}
