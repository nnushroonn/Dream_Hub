"""꿈 커뮤니티: 무의식 광장.

[🔮 무의식 피드] 탭은 실제로 공개(PUBLIC) 저장된 DreamEntry를 그대로 보여준다 - 더미 게시글이
아니라 꿈 기록소에서 실제로 공개 체크를 한 유저의 진짜 꿈이다. 공감(❤️)은 Interaction(type=LIKE)을
그대로 재사용해 토글한다.

[💬 자유 광장] 탭은 꿈과 무관한 자유 게시글로, 이 라우터가 새로 관리하는 CommunityPost가
데이터 원본이다. 두 탭 모두 로그인 없이 조회는 가능하지만(get_current_user_optional), 글 작성과
공감은 로그인이 필요하다.

아이덴티티 선택 시스템: 글쓴이가 is_anonymous를 고르며, false일 때만 author_display_name을
내려준다. 아직 별도 닉네임 설정 기능이 없어 이메일 앞부분(@ 이전)을 표시용 닉네임으로 쓴다 -
실제 이메일 전체나 user_id는 응답 어디에도 담지 않는다.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CommunityComment,
    CommunityPost,
    CommunityPostReaction,
    DreamEntry,
    DreamStatus,
    Interaction,
    InteractionType,
    User,
)
from routers.auth import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/community", tags=["community"])

DREAM_FEED_LIMIT = 30
POST_FEED_LIMIT = 50


def _display_name(user: User, is_anonymous: bool) -> str | None:
    """is_anonymous면 None(프론트가 '익명의 탐험가'로 표시). 아니면 이메일 앞부분을 임시
    닉네임으로 파생시킨다 - 진짜 닉네임 설정 기능이 생기기 전까지의 실데이터 기반 대체값."""
    if is_anonymous:
        return None
    return user.email.split("@")[0]


# --- 🔮 무의식 피드: 공개된 실제 꿈 기록 -------------------------------------


class DreamFeedAiReport(BaseModel):
    description: str
    selected_expert: str
    expert_badge: str
    expert_insight: str


class DreamFeedEntry(BaseModel):
    id: int
    title: str
    emotion: str
    summary: str
    tags: list[str]
    dream_date: str
    empathy_count: int
    is_liked_by_me: bool
    is_anonymous: bool
    author_display_name: str | None = None
    share_with_ai_analysis: bool
    ai_report: DreamFeedAiReport | None = None


class EmpathyResponse(BaseModel):
    is_liked_by_me: bool
    empathy_count: int


def _dream_empathy_count(db: Session, dream_id: int) -> int:
    return (
        db.query(Interaction)
        .filter(Interaction.dream_entry_id == dream_id, Interaction.type == InteractionType.LIKE)
        .count()
    )


@router.get("/dream-feed", response_model=list[DreamFeedEntry])
def get_dream_feed(
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[dict]:
    entries = (
        db.query(DreamEntry)
        .filter(DreamEntry.status == DreamStatus.PUBLIC)
        .order_by(DreamEntry.created_at.desc())
        .limit(DREAM_FEED_LIMIT)
        .all()
    )

    liked_ids: set[int] = set()
    if current_user and entries:
        liked_rows = (
            db.query(Interaction.dream_entry_id)
            .filter(
                Interaction.user_id == current_user.id,
                Interaction.type == InteractionType.LIKE,
                Interaction.dream_entry_id.in_([entry.id for entry in entries]),
            )
            .all()
        )
        liked_ids = {row[0] for row in liked_rows}

    result = []
    for entry in entries:
        interpretation = entry.interpretation if isinstance(entry.interpretation, dict) else {}
        result.append(
            {
                "id": entry.id,
                "title": entry.title,
                "emotion": entry.emotion,
                "summary": entry.summary,
                "tags": interpretation.get("tags", []),
                "dream_date": entry.dream_date.isoformat(),
                "empathy_count": _dream_empathy_count(db, entry.id),
                "is_liked_by_me": entry.id in liked_ids,
                "is_anonymous": entry.is_anonymous,
                "author_display_name": _display_name(entry.user, entry.is_anonymous),
                "share_with_ai_analysis": entry.share_with_ai_analysis,
                "ai_report": (
                    {
                        "description": interpretation.get("description", ""),
                        "selected_expert": interpretation.get("selected_expert", ""),
                        "expert_badge": interpretation.get("expert_badge", ""),
                        "expert_insight": interpretation.get("expert_insight", ""),
                    }
                    if entry.share_with_ai_analysis
                    else None
                ),
            }
        )
    return result


@router.post("/dream-feed/{dream_id}/empathy", response_model=EmpathyResponse)
def toggle_dream_empathy(
    dream_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    entry = (
        db.query(DreamEntry).filter(DreamEntry.id == dream_id, DreamEntry.status == DreamStatus.PUBLIC).first()
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공개된 꿈 기록을 찾을 수 없습니다.")

    existing = (
        db.query(Interaction)
        .filter(
            Interaction.user_id == current_user.id,
            Interaction.dream_entry_id == dream_id,
            Interaction.type == InteractionType.LIKE,
        )
        .first()
    )
    if existing is not None:
        db.delete(existing)
        db.commit()
        is_liked = False
    else:
        db.add(Interaction(user_id=current_user.id, dream_entry_id=dream_id, type=InteractionType.LIKE))
        db.commit()
        is_liked = True

    return {"is_liked_by_me": is_liked, "empathy_count": _dream_empathy_count(db, dream_id)}


# --- 💬 자유 광장: 꿈과 무관한 자유 게시글 -----------------------------------


class CommunityPostInput(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    is_anonymous: bool = False


class CommunityPostResponse(BaseModel):
    id: int
    content: str
    empathy_count: int
    is_liked_by_me: bool
    is_anonymous: bool
    author_display_name: str | None = None
    comment_count: int
    created_at: str


def _post_empathy_count(db: Session, post_id: int) -> int:
    return db.query(CommunityPostReaction).filter(CommunityPostReaction.post_id == post_id).count()


def _post_comment_count(db: Session, post_id: int) -> int:
    return db.query(CommunityComment).filter(CommunityComment.post_id == post_id).count()


@router.get("/posts", response_model=list[CommunityPostResponse])
def list_community_posts(
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[dict]:
    posts = db.query(CommunityPost).order_by(CommunityPost.created_at.desc()).limit(POST_FEED_LIMIT).all()

    liked_ids: set[int] = set()
    if current_user and posts:
        liked_rows = (
            db.query(CommunityPostReaction.post_id)
            .filter(
                CommunityPostReaction.user_id == current_user.id,
                CommunityPostReaction.post_id.in_([post.id for post in posts]),
            )
            .all()
        )
        liked_ids = {row[0] for row in liked_rows}

    return [
        {
            "id": post.id,
            "content": post.content,
            "empathy_count": _post_empathy_count(db, post.id),
            "is_liked_by_me": post.id in liked_ids,
            "is_anonymous": post.is_anonymous,
            "author_display_name": _display_name(post.user, post.is_anonymous),
            "comment_count": _post_comment_count(db, post.id),
            "created_at": post.created_at.isoformat(),
        }
        for post in posts
    ]


@router.post("/posts", response_model=CommunityPostResponse, status_code=status.HTTP_201_CREATED)
def create_community_post(
    payload: CommunityPostInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="내용을 입력해 주세요.")

    post = CommunityPost(user_id=current_user.id, content=content, is_anonymous=payload.is_anonymous)
    db.add(post)
    db.commit()
    db.refresh(post)
    return {
        "id": post.id,
        "content": post.content,
        "empathy_count": 0,
        "is_liked_by_me": False,
        "is_anonymous": post.is_anonymous,
        "author_display_name": _display_name(current_user, post.is_anonymous),
        "comment_count": 0,
        "created_at": post.created_at.isoformat(),
    }


@router.post("/posts/{post_id}/empathy", response_model=EmpathyResponse)
def toggle_post_empathy(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    existing = (
        db.query(CommunityPostReaction)
        .filter(CommunityPostReaction.user_id == current_user.id, CommunityPostReaction.post_id == post_id)
        .first()
    )
    if existing is not None:
        db.delete(existing)
        db.commit()
        is_liked = False
    else:
        db.add(CommunityPostReaction(user_id=current_user.id, post_id=post_id))
        db.commit()
        is_liked = True

    return {"is_liked_by_me": is_liked, "empathy_count": _post_empathy_count(db, post_id)}


# --- 💬 댓글: 자유 광장 게시글에 달리는 댓글 ----------------------------------


class CommunityCommentInput(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    is_anonymous: bool = False


class CommunityCommentResponse(BaseModel):
    id: int
    content: str
    is_anonymous: bool
    author_display_name: str | None = None
    created_at: str


@router.get("/posts/{post_id}/comments", response_model=list[CommunityCommentResponse])
def list_post_comments(post_id: int, db: Session = Depends(get_db)) -> list[dict]:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    comments = (
        db.query(CommunityComment)
        .filter(CommunityComment.post_id == post_id)
        .order_by(CommunityComment.created_at.asc())
        .all()
    )
    return [
        {
            "id": comment.id,
            "content": comment.content,
            "is_anonymous": comment.is_anonymous,
            "author_display_name": _display_name(comment.user, comment.is_anonymous),
            "created_at": comment.created_at.isoformat(),
        }
        for comment in comments
    ]


@router.post("/posts/{post_id}/comments", response_model=CommunityCommentResponse, status_code=status.HTTP_201_CREATED)
def create_post_comment(
    post_id: int,
    payload: CommunityCommentInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="내용을 입력해 주세요.")

    comment = CommunityComment(
        post_id=post_id, user_id=current_user.id, content=content, is_anonymous=payload.is_anonymous
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "content": comment.content,
        "is_anonymous": comment.is_anonymous,
        "author_display_name": _display_name(current_user, comment.is_anonymous),
        "created_at": comment.created_at.isoformat(),
    }
