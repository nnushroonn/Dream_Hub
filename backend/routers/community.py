"""꿈 커뮤니티: 무의식 광장.

[🔮 무의식 피드] 탭은 실제로 공개(PUBLIC) 저장된 DreamEntry를 그대로 보여준다 - 더미 게시글이
아니라 꿈 기록소에서 실제로 공개 체크를 한 유저의 진짜 꿈이다. 공감(❤️)은 Interaction(type=LIKE)을
그대로 재사용해 토글한다.

[💬 자유 광장] 탭은 꿈과 무관한 자유 게시글로, 이 라우터가 새로 관리하는 CommunityPost가
데이터 원본이다. 두 탭 모두 로그인 없이 조회는 가능하지만(get_current_user_optional), 글 작성과
공감은 로그인이 필요하다.

아이덴티티 선택 시스템: 글쓴이가 is_anonymous를 고르며, false일 때만 author_display_name을
내려준다(회원가입 때 정한 꿈 페르소나 닉네임, User.nickname) - 실제 이메일이나 user_id는
응답 어디에도 담지 않는다.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CommunityComment,
    CommunityPost,
    CommunityPostReaction,
    DreamComment,
    DreamEntry,
    DreamStatus,
    Interaction,
    InteractionType,
    User,
)
from routers.ai_interpretation import DreamSurveyInput
from routers.auth import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/community", tags=["community"])

DREAM_FEED_LIMIT = 30
# 자유 광장 게시글 수정 가능 시간 - 게시 후 이 시간이 지나면 삭제만 가능하다.
POST_EDIT_WINDOW = timedelta(minutes=10)
POST_FEED_LIMIT = 50


def _display_name(user: User, is_anonymous: bool) -> str | None:
    """is_anonymous면 None(프론트가 '익명의 탐험가'로 표시). 아니면 회원가입 때 정한
    꿈 페르소나 닉네임을 그대로 쓴다."""
    if is_anonymous:
        return None
    return user.nickname


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
    # 꿈 내용과는 별개로 공유하면서 덧붙인 한마디(질문/자랑거리 등) - 있으면 카드 상단에 노출한다.
    share_caption: str | None = None
    # summary는 목록용 90자 한 줄 요약이라 90자에서 "…"로 잘린다 - 피드 카드에서 꿈 원문을
    # 끝까지(펼치기로) 보여주려면 survey 원본이 필요해 함께 내려준다.
    survey: DreamSurveyInput
    ai_report: DreamFeedAiReport | None = None
    comment_count: int


class EmpathyResponse(BaseModel):
    is_liked_by_me: bool
    empathy_count: int


def _dream_empathy_count(db: Session, dream_id: int) -> int:
    return (
        db.query(Interaction)
        .filter(Interaction.dream_entry_id == dream_id, Interaction.type == InteractionType.LIKE)
        .count()
    )


def _dream_comment_count(db: Session, dream_id: int) -> int:
    return db.query(DreamComment).filter(DreamComment.dream_entry_id == dream_id).count()


def _liked_dream_ids(db: Session, user: User, entries: list[DreamEntry]) -> set[int]:
    if not entries:
        return set()
    rows = (
        db.query(Interaction.dream_entry_id)
        .filter(
            Interaction.user_id == user.id,
            Interaction.type == InteractionType.LIKE,
            Interaction.dream_entry_id.in_([entry.id for entry in entries]),
        )
        .all()
    )
    return {row[0] for row in rows}


def _build_dream_feed_entries(db: Session, entries: list[DreamEntry], liked_ids: set[int]) -> list[dict]:
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
                "share_caption": entry.share_caption,
                "survey": entry.survey,
                "comment_count": _dream_comment_count(db, entry.id),
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
    liked_ids = _liked_dream_ids(db, current_user, entries) if current_user else set()
    return _build_dream_feed_entries(db, entries, liked_ids)


@router.get("/my-liked-dreams", response_model=list[DreamFeedEntry])
def list_my_liked_dreams(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    """마이페이지 '❤️ 공감한 꿈' 탭 - 내가 공감 누른, 지금도 공개 상태인 실제 꿈 기록."""
    liked_rows = (
        db.query(Interaction.dream_entry_id)
        .filter(Interaction.user_id == current_user.id, Interaction.type == InteractionType.LIKE)
        .all()
    )
    liked_dream_ids = [row[0] for row in liked_rows]
    if not liked_dream_ids:
        return []

    entries = (
        db.query(DreamEntry)
        .filter(DreamEntry.id.in_(liked_dream_ids), DreamEntry.status == DreamStatus.PUBLIC)
        .order_by(DreamEntry.created_at.desc())
        .all()
    )
    return _build_dream_feed_entries(db, entries, set(liked_dream_ids))


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
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=1000)
    is_anonymous: bool = False


class CommunityPostResponse(BaseModel):
    id: int
    title: str
    content: str
    empathy_count: int
    is_liked_by_me: bool
    is_anonymous: bool
    author_display_name: str | None = None
    comment_count: int
    created_at: str
    # 내가 쓴 글인지 - 수정/삭제 버튼 노출 여부를 프론트가 이걸로 판단한다. 실제 권한 체크는
    # PUT/DELETE 엔드포인트가 서버에서 다시 하므로, 이 값은 순전히 UI 표시용이다.
    is_mine: bool = False


def _post_empathy_count(db: Session, post_id: int) -> int:
    return db.query(CommunityPostReaction).filter(CommunityPostReaction.post_id == post_id).count()


def _post_comment_count(db: Session, post_id: int) -> int:
    return db.query(CommunityComment).filter(CommunityComment.post_id == post_id).count()


def _liked_post_ids(db: Session, user: User, posts: list[CommunityPost]) -> set[int]:
    if not posts:
        return set()
    rows = (
        db.query(CommunityPostReaction.post_id)
        .filter(
            CommunityPostReaction.user_id == user.id,
            CommunityPostReaction.post_id.in_([post.id for post in posts]),
        )
        .all()
    )
    return {row[0] for row in rows}


def _build_post_entries(
    db: Session, posts: list[CommunityPost], liked_ids: set[int], current_user_id: int | None = None
) -> list[dict]:
    return [
        {
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "empathy_count": _post_empathy_count(db, post.id),
            "is_liked_by_me": post.id in liked_ids,
            "is_anonymous": post.is_anonymous,
            "author_display_name": _display_name(post.user, post.is_anonymous),
            "comment_count": _post_comment_count(db, post.id),
            "created_at": post.created_at.isoformat(),
            "is_mine": current_user_id is not None and post.user_id == current_user_id,
        }
        for post in posts
    ]


@router.get("/posts", response_model=list[CommunityPostResponse])
def list_community_posts(
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[dict]:
    posts = db.query(CommunityPost).order_by(CommunityPost.created_at.desc()).limit(POST_FEED_LIMIT).all()
    liked_ids = _liked_post_ids(db, current_user, posts) if current_user else set()
    return _build_post_entries(db, posts, liked_ids, current_user.id if current_user else None)


@router.get("/posts/{post_id}", response_model=CommunityPostResponse)
def get_community_post(
    post_id: int,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> dict:
    """리스트에서 제목을 눌러 들어오는 자유 광장 게시글 상세 - 로그인 없이도 조회 가능."""
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")
    liked_ids = _liked_post_ids(db, current_user, [post]) if current_user else set()
    return _build_post_entries(db, [post], liked_ids, current_user.id if current_user else None)[0]


@router.get("/my-posts", response_model=list[CommunityPostResponse])
def list_my_posts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    """마이페이지 '💬 내가 쓴 자유글' 탭 - 로그인한 본인이 작성한 자유 광장 글 전체."""
    posts = (
        db.query(CommunityPost)
        .filter(CommunityPost.user_id == current_user.id)
        .order_by(CommunityPost.created_at.desc())
        .all()
    )
    liked_ids = _liked_post_ids(db, current_user, posts)
    return _build_post_entries(db, posts, liked_ids, current_user.id)


@router.post("/posts", response_model=CommunityPostResponse, status_code=status.HTTP_201_CREATED)
def create_community_post(
    payload: CommunityPostInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    title = payload.title.strip()
    content = payload.content.strip()
    if not title or not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="제목과 내용을 모두 입력해 주세요.")

    post = CommunityPost(user_id=current_user.id, title=title, content=content, is_anonymous=payload.is_anonymous)
    db.add(post)
    db.commit()
    db.refresh(post)
    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "empathy_count": 0,
        "is_liked_by_me": False,
        "is_anonymous": post.is_anonymous,
        "author_display_name": _display_name(current_user, post.is_anonymous),
        "comment_count": 0,
        "created_at": post.created_at.isoformat(),
        "is_mine": True,
    }


@router.put("/posts/{post_id}", response_model=CommunityPostResponse)
def update_community_post(
    post_id: int,
    payload: CommunityPostInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")
    if post.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="본인이 작성한 글만 수정할 수 있습니다.")

    if datetime.now(timezone.utc) - post.created_at > POST_EDIT_WINDOW:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="게시 후 10분이 지나 더 이상 수정할 수 없습니다.")

    title = payload.title.strip()
    content = payload.content.strip()
    if not title or not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="제목과 내용을 모두 입력해 주세요.")

    post.title = title
    post.content = content
    post.is_anonymous = payload.is_anonymous
    db.commit()
    db.refresh(post)
    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "empathy_count": _post_empathy_count(db, post.id),
        "is_liked_by_me": post.id in _liked_post_ids(db, current_user, [post]),
        "is_anonymous": post.is_anonymous,
        "author_display_name": _display_name(current_user, post.is_anonymous),
        "comment_count": _post_comment_count(db, post.id),
        "created_at": post.created_at.isoformat(),
        "is_mine": True,
    }


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_community_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")
    if post.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="본인이 작성한 글만 삭제할 수 있습니다.")

    db.delete(post)
    db.commit()


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
    # 내가 쓴 댓글인지 - 수정/삭제 버튼 노출 여부 판단용. 실제 권한 체크는 서버가 다시 한다.
    is_mine: bool = False


@router.get("/posts/{post_id}/comments", response_model=list[CommunityCommentResponse])
def list_post_comments(
    post_id: int,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[dict]:
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
            "is_mine": current_user is not None and comment.user_id == current_user.id,
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
        "is_mine": True,
    }


@router.put("/posts/{post_id}/comments/{comment_id}", response_model=CommunityCommentResponse)
def update_post_comment(
    post_id: int,
    comment_id: int,
    payload: CommunityCommentInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    comment = (
        db.query(CommunityComment)
        .filter(CommunityComment.id == comment_id, CommunityComment.post_id == post_id)
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="댓글을 찾을 수 없습니다.")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="본인이 작성한 댓글만 수정할 수 있습니다.")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="내용을 입력해 주세요.")

    comment.content = content
    comment.is_anonymous = payload.is_anonymous
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "content": comment.content,
        "is_anonymous": comment.is_anonymous,
        "author_display_name": _display_name(current_user, comment.is_anonymous),
        "created_at": comment.created_at.isoformat(),
        "is_mine": True,
    }


@router.delete("/posts/{post_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post_comment(
    post_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    comment = (
        db.query(CommunityComment)
        .filter(CommunityComment.id == comment_id, CommunityComment.post_id == post_id)
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="댓글을 찾을 수 없습니다.")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="본인이 작성한 댓글만 삭제할 수 있습니다.")

    db.delete(comment)
    db.commit()


# --- 💬 댓글: 🔮 무의식 피드에 공개된 꿈 기록에 다는 댓글 ------------------------
# 단순 공감(❤️)만으로는 부족한 "이용자끼리 실제로 이야기를 나누는" 자리 - 공개된 꿈이라면
# 누구나(작성자 본인 포함) 댓글을 남길 수 있다. 응답 구조는 자유 광장 댓글과 동일해 그대로 재사용한다.


class DreamCommentInput(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    # 무의식 피드 자체의 기본 익명 관례를 따라 True (자유 광장 댓글은 False).
    is_anonymous: bool = True


@router.get("/dream-feed/{dream_id}/comments", response_model=list[CommunityCommentResponse])
def list_dream_comments(
    dream_id: int,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[dict]:
    entry = db.query(DreamEntry).filter(DreamEntry.id == dream_id, DreamEntry.status == DreamStatus.PUBLIC).first()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공개된 꿈 기록을 찾을 수 없습니다.")

    comments = (
        db.query(DreamComment)
        .filter(DreamComment.dream_entry_id == dream_id)
        .order_by(DreamComment.created_at.asc())
        .all()
    )
    return [
        {
            "id": comment.id,
            "content": comment.content,
            "is_anonymous": comment.is_anonymous,
            "author_display_name": _display_name(comment.user, comment.is_anonymous),
            "created_at": comment.created_at.isoformat(),
            "is_mine": current_user is not None and comment.user_id == current_user.id,
        }
        for comment in comments
    ]


@router.post(
    "/dream-feed/{dream_id}/comments", response_model=CommunityCommentResponse, status_code=status.HTTP_201_CREATED
)
def create_dream_comment(
    dream_id: int,
    payload: DreamCommentInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    entry = db.query(DreamEntry).filter(DreamEntry.id == dream_id, DreamEntry.status == DreamStatus.PUBLIC).first()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공개된 꿈 기록을 찾을 수 없습니다.")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="내용을 입력해 주세요.")

    comment = DreamComment(
        dream_entry_id=dream_id, user_id=current_user.id, content=content, is_anonymous=payload.is_anonymous
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
        "is_mine": True,
    }


@router.put("/dream-feed/{dream_id}/comments/{comment_id}", response_model=CommunityCommentResponse)
def update_dream_comment(
    dream_id: int,
    comment_id: int,
    payload: DreamCommentInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    comment = (
        db.query(DreamComment)
        .filter(DreamComment.id == comment_id, DreamComment.dream_entry_id == dream_id)
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="댓글을 찾을 수 없습니다.")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="본인이 작성한 댓글만 수정할 수 있습니다.")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="내용을 입력해 주세요.")

    comment.content = content
    comment.is_anonymous = payload.is_anonymous
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "content": comment.content,
        "is_anonymous": comment.is_anonymous,
        "author_display_name": _display_name(current_user, comment.is_anonymous),
        "created_at": comment.created_at.isoformat(),
        "is_mine": True,
    }


@router.delete("/dream-feed/{dream_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dream_comment(
    dream_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    comment = (
        db.query(DreamComment)
        .filter(DreamComment.id == comment_id, DreamComment.dream_entry_id == dream_id)
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="댓글을 찾을 수 없습니다.")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="본인이 작성한 댓글만 삭제할 수 있습니다.")

    db.delete(comment)
    db.commit()
