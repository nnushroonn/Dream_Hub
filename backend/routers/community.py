"""꿈 커뮤니티: 무의식 광장.

[🔮 무의식 피드] 탭은 실제로 공개(PUBLIC) 저장된 DreamEntry를 그대로 보여준다 - 더미 게시글이
아니라 꿈 기록소에서 실제로 공개 체크를 한 유저의 진짜 꿈이다.

[💬 자유 광장] 탭은 꿈과 무관한 자유 게시글로, 이 라우터가 새로 관리하는 CommunityPost가
데이터 원본이다. 두 탭 모두 로그인 없이 조회는 가능하지만(get_current_user_optional), 글 작성과
투표는 로그인이 필요하다.

👍/👎 좋아요·싫어요 투표: 유저는 게시물(꿈 기록/자유 광장 글) 하나당 상호 배타적인 투표 하나만
가질 수 있다 - 좋아요를 누른 상태에서 싫어요를 누르면 좋아요가 취소되고 싫어요로 바뀌며, 같은
버튼을 다시 누르면 투표가 취소된다. 꿈 기록은 기존 Interaction(LIKE/DISLIKE) 모델을, 자유 광장
글은 CommunityPostReaction.is_upvote를 그대로 재사용한다.

아이덴티티 선택 시스템: 글쓴이가 is_anonymous를 고르며, false일 때만 author_display_name을
내려준다(회원가입 때 정한 꿈 페르소나 닉네임, User.nickname) - 실제 이메일이나 user_id는
응답 어디에도 담지 않는다.
"""

from datetime import datetime, timedelta, timezone
from typing import Literal

import redis
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from database import get_db, get_redis
from models import (
    CommunityComment,
    CommunityPost,
    CommunityPostReaction,
    DreamComment,
    DreamEntry,
    DreamStatus,
    Interaction,
    InteractionType,
    NotificationTargetType,
    NotificationType,
    User,
)
from routers.ai_interpretation import DreamSurveyInput
from routers.auth import get_current_user, get_current_user_optional
from routers.notifications import create_notification
from storage import upload_community_image
from view_tracking import should_count_view

# 글쓰기에서 한 게시글에 첨부할 수 있는 이미지 최대 장수 - 프론트(MAX_COMPOSE_IMAGES)와 동일하게 맞춘다.
MAX_POST_IMAGES = 3

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


def _viewer_identity(request: Request, current_user: User | None) -> str:
    """조회수 중복 방지용 방문자 식별자 - 로그인 유저는 user_id, 비로그인은 IP로 대신한다."""
    if current_user is not None:
        return f"user:{current_user.id}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


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
    upvote_count: int
    downvote_count: int
    my_vote: Literal["up", "down"] | None = None
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
    view_count: int
    # 내가 쓴 꿈인지 - 자유 광장과 동일하게 수정/삭제 버튼 노출 여부를 프론트가 이걸로 판단한다.
    # 실제 권한 체크는 PUT/DELETE /api/dreams/{id}가 서버에서 다시 하므로, 이 값은 UI 표시용이다.
    is_mine: bool = False


class VoteInput(BaseModel):
    vote_type: Literal["up", "down"]


class VoteResponse(BaseModel):
    my_vote: Literal["up", "down"] | None
    upvote_count: int
    downvote_count: int


def _dream_vote_counts(db: Session, dream_id: int) -> tuple[int, int]:
    up = (
        db.query(Interaction)
        .filter(Interaction.dream_entry_id == dream_id, Interaction.type == InteractionType.LIKE)
        .count()
    )
    down = (
        db.query(Interaction)
        .filter(Interaction.dream_entry_id == dream_id, Interaction.type == InteractionType.DISLIKE)
        .count()
    )
    return up, down


def _dream_comment_count(db: Session, dream_id: int) -> int:
    return db.query(DreamComment).filter(DreamComment.dream_entry_id == dream_id).count()


def _my_dream_votes(db: Session, user: User, entries: list[DreamEntry]) -> dict[int, str]:
    if not entries:
        return {}
    rows = (
        db.query(Interaction.dream_entry_id, Interaction.type)
        .filter(
            Interaction.user_id == user.id,
            Interaction.type.in_([InteractionType.LIKE, InteractionType.DISLIKE]),
            Interaction.dream_entry_id.in_([entry.id for entry in entries]),
        )
        .all()
    )
    return {dream_id: ("up" if vote_type == InteractionType.LIKE else "down") for dream_id, vote_type in rows}


def _build_dream_feed_entries(
    db: Session, entries: list[DreamEntry], my_votes: dict[int, str], current_user_id: int | None = None
) -> list[dict]:
    result = []
    for entry in entries:
        interpretation = entry.interpretation if isinstance(entry.interpretation, dict) else {}
        up, down = _dream_vote_counts(db, entry.id)
        result.append(
            {
                "id": entry.id,
                "title": entry.title,
                "emotion": entry.emotion,
                "summary": entry.summary,
                # 예전엔 AI 해몽(interpretation.tags)이 자동으로 채웠지만, 이제는 글쓰기에서
                # 유저가 직접 입력한 태그(DreamEntry.tags)만 노출/필터링에 쓴다.
                "tags": entry.tags,
                "dream_date": entry.dream_date.isoformat(),
                "upvote_count": up,
                "downvote_count": down,
                "my_vote": my_votes.get(entry.id),
                "is_anonymous": entry.is_anonymous,
                "author_display_name": _display_name(entry.user, entry.is_anonymous),
                "share_with_ai_analysis": entry.share_with_ai_analysis,
                "share_caption": entry.share_caption,
                "survey": entry.survey,
                "comment_count": _dream_comment_count(db, entry.id),
                "view_count": entry.view_count,
                "is_mine": current_user_id is not None and entry.user_id == current_user_id,
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
    my_votes = _my_dream_votes(db, current_user, entries) if current_user else {}
    return _build_dream_feed_entries(db, entries, my_votes, current_user.id if current_user else None)


@router.get("/my-liked-dreams", response_model=list[DreamFeedEntry])
def list_my_liked_dreams(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    """마이페이지 '❤️ 공감한 꿈' 탭 - 내가 👍 좋아요 누른, 지금도 공개 상태인 실제 꿈 기록."""
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
    my_votes = _my_dream_votes(db, current_user, entries)
    return _build_dream_feed_entries(db, entries, my_votes, current_user.id)


@router.post("/dream-feed/{dream_id}/vote", response_model=VoteResponse)
def vote_on_dream(
    dream_id: int,
    payload: VoteInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    entry = (
        db.query(DreamEntry).filter(DreamEntry.id == dream_id, DreamEntry.status == DreamStatus.PUBLIC).first()
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공개된 꿈 기록을 찾을 수 없습니다.")
    if entry.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="자신의 글에는 공감할 수 없습니다.")

    requested_type = InteractionType.LIKE if payload.vote_type == "up" else InteractionType.DISLIKE
    existing = (
        db.query(Interaction)
        .filter(
            Interaction.user_id == current_user.id,
            Interaction.dream_entry_id == dream_id,
            Interaction.type.in_([InteractionType.LIKE, InteractionType.DISLIKE]),
        )
        .first()
    )
    if existing is not None and existing.type == requested_type:
        # 같은 버튼을 다시 누르면 투표 취소.
        db.delete(existing)
        db.commit()
        my_vote = None
    elif existing is not None:
        # 반대 버튼을 누르면 새 행을 만들지 않고 방향만 바꾼다 (상호 배타성 보장).
        existing.type = requested_type
        db.commit()
        my_vote = payload.vote_type
    else:
        db.add(Interaction(user_id=current_user.id, dream_entry_id=dream_id, type=requested_type))
        db.commit()
        my_vote = payload.vote_type

    if my_vote == "up":
        create_notification(
            db,
            user_id=entry.user_id,
            actor_id=current_user.id,
            actor_is_anonymous=True,  # 투표엔 익명 선택지가 없어 항상 이름을 감춘다.
            type_=NotificationType.LIKE,
            target_type=NotificationTargetType.DREAM,
            target_id=dream_id,
            preview_text=entry.title,
        )

    up, down = _dream_vote_counts(db, dream_id)
    return {"my_vote": my_vote, "upvote_count": up, "downvote_count": down}


# --- 💬 자유 광장: 꿈과 무관한 자유 게시글 -----------------------------------

# 커뮤니티 헤더 "주파수 필터"가 사용하는 슬러그 - 일기장 꿈 씨앗(DREAM_SEEDS)과 1:1로 대응한다.
# 필터/정렬은 이 컬럼(공개 게시글에 스스로 붙인 태그)만 조회한다 - 다른 유저의 비공개 일지를
# 서버가 집계해서 정렬하는 방식은 쓰지 않는다.
PUBLIC_TAG_OPTIONS = {"rest", "growth", "healing", "adventure"}
MAX_PUBLIC_TAGS = 3


class CommunityPostInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=1000)
    is_anonymous: bool = False
    # /api/community/images로 미리 업로드해 받은 R2 공개 URL 목록 - 게시 시점에 함께 저장한다.
    image_urls: list[str] = Field(default_factory=list)
    # ?template=galaxy 글쓰기에서 고른 주파수 태그 - 일반 자유 글은 빈 배열로 둬도 된다.
    public_tags: list[str] = Field(default_factory=list)

    @field_validator("public_tags")
    @classmethod
    def _validate_public_tags(cls, value: list[str]) -> list[str]:
        if len(value) > MAX_PUBLIC_TAGS:
            raise ValueError(f"주파수 태그는 최대 {MAX_PUBLIC_TAGS}개까지 선택할 수 있습니다.")
        invalid = set(value) - PUBLIC_TAG_OPTIONS
        if invalid:
            raise ValueError(f"허용되지 않은 주파수 태그입니다: {sorted(invalid)}")
        return value

    @field_validator("image_urls")
    @classmethod
    def _limit_image_count(cls, value: list[str]) -> list[str]:
        if len(value) > MAX_POST_IMAGES:
            raise ValueError(f"이미지는 최대 {MAX_POST_IMAGES}장까지 첨부할 수 있습니다.")
        return value


class CommunityPostResponse(BaseModel):
    id: int
    title: str
    content: str
    upvote_count: int
    downvote_count: int
    my_vote: Literal["up", "down"] | None = None
    is_anonymous: bool
    author_display_name: str | None = None
    comment_count: int
    created_at: str
    image_urls: list[str] = []
    public_tags: list[str] = []
    # 상세 조회(get_community_post)에서만 어뷰징 방지 로직을 거쳐 증가한다 - 목록/생성/수정
    # 응답은 그 시점의 현재 값을 그대로 내려줄 뿐 증가시키지 않는다.
    view_count: int = 0
    # 내가 쓴 글인지 - 수정/삭제 버튼 노출 여부를 프론트가 이걸로 판단한다. 실제 권한 체크는
    # PUT/DELETE 엔드포인트가 서버에서 다시 하므로, 이 값은 순전히 UI 표시용이다.
    is_mine: bool = False


def _post_vote_counts(db: Session, post_id: int) -> tuple[int, int]:
    up = (
        db.query(CommunityPostReaction)
        .filter(CommunityPostReaction.post_id == post_id, CommunityPostReaction.is_upvote.is_(True))
        .count()
    )
    down = (
        db.query(CommunityPostReaction)
        .filter(CommunityPostReaction.post_id == post_id, CommunityPostReaction.is_upvote.is_(False))
        .count()
    )
    return up, down


def _post_comment_count(db: Session, post_id: int) -> int:
    return db.query(CommunityComment).filter(CommunityComment.post_id == post_id).count()


def _my_post_votes(db: Session, user: User, posts: list[CommunityPost]) -> dict[int, str]:
    if not posts:
        return {}
    rows = (
        db.query(CommunityPostReaction.post_id, CommunityPostReaction.is_upvote)
        .filter(
            CommunityPostReaction.user_id == user.id,
            CommunityPostReaction.post_id.in_([post.id for post in posts]),
        )
        .all()
    )
    return {post_id: ("up" if is_upvote else "down") for post_id, is_upvote in rows}


def _build_post_entries(
    db: Session, posts: list[CommunityPost], my_votes: dict[int, str], current_user_id: int | None = None
) -> list[dict]:
    result = []
    for post in posts:
        up, down = _post_vote_counts(db, post.id)
        result.append(
            {
                "id": post.id,
                "title": post.title,
                "content": post.content,
                "upvote_count": up,
                "downvote_count": down,
                "my_vote": my_votes.get(post.id),
                "is_anonymous": post.is_anonymous,
                "author_display_name": _display_name(post.user, post.is_anonymous),
                "comment_count": _post_comment_count(db, post.id),
                "created_at": post.created_at.isoformat(),
                "image_urls": post.image_urls or [],
                "public_tags": post.public_tags or [],
                "view_count": post.view_count,
                "is_mine": current_user_id is not None and post.user_id == current_user_id,
            }
        )
    return result


@router.get("/posts", response_model=list[CommunityPostResponse])
def list_community_posts(
    tag: str | None = None,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[dict]:
    """자유 광장 목록 - ?tag=healing처럼 넘기면 그 주파수 태그를 스스로 붙인 공개 글만 남긴다.
    다른 유저의 비공개 일지를 집계해 정렬하지 않고, 오직 CommunityPost.public_tags만 본다."""
    query = db.query(CommunityPost)
    if tag:
        if tag not in PUBLIC_TAG_OPTIONS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="알 수 없는 주파수 태그입니다.")
        query = query.filter(CommunityPost.public_tags.any(tag))
    posts = query.order_by(CommunityPost.created_at.desc()).limit(POST_FEED_LIMIT).all()
    my_votes = _my_post_votes(db, current_user, posts) if current_user else {}
    return _build_post_entries(db, posts, my_votes, current_user.id if current_user else None)


@router.get("/posts/{post_id}", response_model=CommunityPostResponse)
def get_community_post(
    post_id: int,
    request: Request,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
) -> dict:
    """리스트에서 제목을 눌러 들어오는 자유 광장 게시글 상세 - 로그인 없이도 조회 가능."""
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    if should_count_view(redis_client, "post", post_id, _viewer_identity(request, current_user)):
        post.view_count += 1
        db.commit()
        db.refresh(post)

    my_votes = _my_post_votes(db, current_user, [post]) if current_user else {}
    return _build_post_entries(db, [post], my_votes, current_user.id if current_user else None)[0]


@router.get("/my-posts", response_model=list[CommunityPostResponse])
def list_my_posts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    """마이페이지 '💬 내가 쓴 자유글' 탭 - 로그인한 본인이 작성한 자유 광장 글 전체."""
    posts = (
        db.query(CommunityPost)
        .filter(CommunityPost.user_id == current_user.id)
        .order_by(CommunityPost.created_at.desc())
        .all()
    )
    my_votes = _my_post_votes(db, current_user, posts)
    return _build_post_entries(db, posts, my_votes, current_user.id)


@router.post("/images", status_code=status.HTTP_201_CREATED)
async def upload_community_post_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict:
    """글쓰기 화면에서 이미지를 고르는 즉시 호출 - 반환된 url을 모아뒀다가 게시 시점에
    CommunityPostInput.image_urls로 함께 보낸다."""
    content = await file.read()
    url = upload_community_image(content, file.content_type or "")
    return {"url": url}


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

    post = CommunityPost(
        user_id=current_user.id,
        title=title,
        content=content,
        is_anonymous=payload.is_anonymous,
        image_urls=payload.image_urls,
        public_tags=payload.public_tags,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "upvote_count": 0,
        "downvote_count": 0,
        "my_vote": None,
        "is_anonymous": post.is_anonymous,
        "author_display_name": _display_name(current_user, post.is_anonymous),
        "comment_count": 0,
        "created_at": post.created_at.isoformat(),
        "image_urls": post.image_urls or [],
        "public_tags": post.public_tags or [],
        "view_count": 0,
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
    post.public_tags = payload.public_tags
    db.commit()
    db.refresh(post)
    up, down = _post_vote_counts(db, post.id)
    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "upvote_count": up,
        "downvote_count": down,
        "my_vote": _my_post_votes(db, current_user, [post]).get(post.id),
        "is_anonymous": post.is_anonymous,
        "author_display_name": _display_name(current_user, post.is_anonymous),
        "comment_count": _post_comment_count(db, post.id),
        "created_at": post.created_at.isoformat(),
        "image_urls": post.image_urls or [],
        "public_tags": post.public_tags or [],
        "view_count": post.view_count,
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


# --- 🌌 무의식 은하 프로필: 커뮤니티 닉네임 호버 카드 -------------------------
# 유저가 마이페이지에서 직접 공개(is_galaxy_public=True)로 켜야만 값이 채워진다. 원문
# 텍스트(일기 본문, AI 해몽 설명 등)는 절대 포함하지 않고, 씨앗 비율 숫자와 뱃지 코드만 낸다.

DREAM_SEED_TAGS = [
    "🌿 비워내기 (차분한 휴식)",
    "🔥 성장하기 (자신감과 용기)",
    "💜 치유하기 (위로와 평온)",
    "✨ 모험하기 (새로운 영감)",
]


class SeedRatio(BaseModel):
    seed: str
    ratio: float


class GalaxyProfileResponse(BaseModel):
    is_public: bool
    seed_ratios: list[SeedRatio] | None = None
    badge_ids: list[str] | None = None


def _compute_badge_ids(user_id: int, db: Session) -> list[str]:
    """/api/user/stats의 뱃지 판정 기준을 그대로 재사용하되, 코드만 뽑는 경량 버전."""
    dream_count = db.query(DreamEntry).filter(DreamEntry.user_id == user_id).count()
    lucid_count = db.query(DreamEntry).filter(DreamEntry.user_id == user_id, DreamEntry.is_lucid.is_(True)).count()
    post_count = db.query(CommunityPost).filter(CommunityPost.user_id == user_id).count()
    comment_count = db.query(CommunityComment).filter(CommunityComment.user_id == user_id).count()

    my_dream_ids = [row[0] for row in db.query(DreamEntry.id).filter(DreamEntry.user_id == user_id).all()]
    empathy_on_dreams = (
        db.query(Interaction)
        .filter(Interaction.dream_entry_id.in_(my_dream_ids), Interaction.type == InteractionType.LIKE)
        .count()
        if my_dream_ids
        else 0
    )
    my_post_ids = [row[0] for row in db.query(CommunityPost.id).filter(CommunityPost.user_id == user_id).all()]
    empathy_on_posts = (
        db.query(CommunityPostReaction)
        .filter(CommunityPostReaction.post_id.in_(my_post_ids), CommunityPostReaction.is_upvote.is_(True))
        .count()
        if my_post_ids
        else 0
    )
    empathy_received = empathy_on_dreams + empathy_on_posts

    codes: list[str] = []
    if lucid_count >= 1:
        codes.append("FIRST_LUCID")
    if dream_count >= 10:
        codes.append("DREAM_MASTER")
    if (post_count + comment_count) >= 5 or empathy_received >= 10:
        codes.append("COMMUNITY_STAR")
    return codes


@router.get("/profiles/{nickname}/galaxy", response_model=GalaxyProfileResponse)
def get_galaxy_profile(nickname: str, db: Session = Depends(get_db)) -> dict:
    """호버 카드 전용 조회 - user_id가 아니라 이미 공개돼 있는 닉네임으로만 찾는다. 이 라우터의
    다른 응답들과 마찬가지로 user_id는 절대 노출하지 않는다는 원칙을 그대로 지킨다."""
    user = db.query(User).filter(User.nickname == nickname).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="유저를 찾을 수 없습니다.")
    if not user.is_galaxy_public:
        return {"is_public": False}

    diary_entries = (
        db.query(DreamEntry).filter(DreamEntry.user_id == user.id, DreamEntry.interpretation.is_(None)).all()
    )
    total = len(diary_entries)
    counts = {seed: 0 for seed in DREAM_SEED_TAGS}
    for entry in diary_entries:
        for tag in entry.tags or []:
            if tag in counts:
                counts[tag] += 1
                break

    seed_ratios = [
        {"seed": seed, "ratio": round(count / total, 4) if total else 0.0} for seed, count in counts.items()
    ]
    return {"is_public": True, "seed_ratios": seed_ratios, "badge_ids": _compute_badge_ids(user.id, db)}


@router.post("/posts/{post_id}/vote", response_model=VoteResponse)
def vote_on_post(
    post_id: int,
    payload: VoteInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")
    if post.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="자신의 글에는 공감할 수 없습니다.")

    requested_is_upvote = payload.vote_type == "up"
    existing = (
        db.query(CommunityPostReaction)
        .filter(CommunityPostReaction.user_id == current_user.id, CommunityPostReaction.post_id == post_id)
        .first()
    )
    if existing is not None and existing.is_upvote == requested_is_upvote:
        # 같은 버튼을 다시 누르면 투표 취소.
        db.delete(existing)
        db.commit()
        my_vote = None
    elif existing is not None:
        # 반대 버튼을 누르면 새 행을 만들지 않고 방향만 바꾼다 (상호 배타성 보장).
        existing.is_upvote = requested_is_upvote
        db.commit()
        my_vote = payload.vote_type
    else:
        db.add(CommunityPostReaction(user_id=current_user.id, post_id=post_id, is_upvote=requested_is_upvote))
        db.commit()
        my_vote = payload.vote_type

    if my_vote == "up":
        create_notification(
            db,
            user_id=post.user_id,
            actor_id=current_user.id,
            actor_is_anonymous=True,  # 투표엔 익명 선택지가 없어 항상 이름을 감춘다.
            type_=NotificationType.LIKE,
            target_type=NotificationTargetType.POST,
            target_id=post_id,
            preview_text=post.title,
        )

    up, down = _post_vote_counts(db, post_id)
    return {"my_vote": my_vote, "upvote_count": up, "downvote_count": down}


# --- 💬 댓글: 자유 광장 게시글에 달리는 댓글 ----------------------------------
# 티키타카(빠른 대화)를 위해 원댓글-답글 1-Depth까지만 허용한다. 답글의 답글은 항상 거절해
# 트리가 무한정 깊어지는 걸 막는다 - 프론트도 '답글 달기' 버튼을 원댓글에만 노출해 이를 반영한다.


class CommunityCommentInput(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    is_anonymous: bool = False
    # 답글이면 원댓글의 id. 원댓글이면 None.
    parent_id: int | None = None


class CommunityCommentResponse(BaseModel):
    id: int
    content: str
    is_anonymous: bool
    author_display_name: str | None = None
    created_at: str
    # 내가 쓴 댓글인지 - 수정/삭제 버튼 노출 여부 판단용. 실제 권한 체크는 서버가 다시 한다.
    is_mine: bool = False
    parent_id: int | None = None
    # 게시물(자유 광장 글/꿈 기록) 작성자 본인이 남긴 댓글인지 - "글쓴이" 뱃지 노출용. 실제
    # user_id는 응답에 담기지 않으므로 이 불리언만으로는 신원이 드러나지 않는다.
    is_post_author: bool = False
    # 익명 댓글이면 이 게시물 안에서 몇 번째로 등장한 익명 유저인지(1부터) - "익명2"처럼 표시해
    # 같은 유저의 여러 댓글/답글을 구분할 수 있게 한다. 글쓴이 본인의 익명 댓글은 항상 "글쓴이"로만
    # 표시되므로 번호를 매기지 않는다(None). 실명 댓글도 None.
    anonymous_index: int | None = None


def _build_anonymous_index_map(comments: list, owner_user_id: int) -> dict[int, int]:
    """댓글을 작성 시각 오름차순으로 훑으며, 글쓴이 본인이 아닌 익명 댓글에 한해 유저별로
    처음 등장한 순서대로 1부터 번호를 매긴다 - 같은 유저면 답글을 몇 개 달든 항상 같은 번호를 받는다."""
    mapping: dict[int, int] = {}
    for comment in comments:
        if comment.is_anonymous and comment.user_id != owner_user_id and comment.user_id not in mapping:
            mapping[comment.user_id] = len(mapping) + 1
    return mapping


def _comment_to_response(
    comment: CommunityComment | DreamComment,
    current_user_id: int | None,
    owner_user_id: int,
    anonymous_index_map: dict[int, int],
) -> dict:
    anonymous_index = None
    if comment.is_anonymous and comment.user_id != owner_user_id:
        anonymous_index = anonymous_index_map.get(comment.user_id)
    return {
        "id": comment.id,
        "content": comment.content,
        "is_anonymous": comment.is_anonymous,
        "author_display_name": _display_name(comment.user, comment.is_anonymous),
        "created_at": comment.created_at.isoformat(),
        "is_mine": current_user_id is not None and comment.user_id == current_user_id,
        "parent_id": comment.parent_id,
        "is_post_author": comment.user_id == owner_user_id,
        "anonymous_index": anonymous_index,
    }


def _all_post_comments(db: Session, post_id: int) -> list[CommunityComment]:
    return (
        db.query(CommunityComment)
        .filter(CommunityComment.post_id == post_id)
        .order_by(CommunityComment.created_at.asc())
        .all()
    )


@router.get("/posts/{post_id}/comments", response_model=list[CommunityCommentResponse])
def list_post_comments(
    post_id: int,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[dict]:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    comments = _all_post_comments(db, post_id)
    current_user_id = current_user.id if current_user else None
    anon_map = _build_anonymous_index_map(comments, post.user_id)
    return [_comment_to_response(comment, current_user_id, post.user_id, anon_map) for comment in comments]


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

    parent_id = payload.parent_id
    if parent_id is not None:
        parent = (
            db.query(CommunityComment)
            .filter(CommunityComment.id == parent_id, CommunityComment.post_id == post_id)
            .first()
        )
        if parent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="답글을 달 댓글을 찾을 수 없습니다.")
        if parent.parent_id is not None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="답글에는 답글을 달 수 없어요.")

    comment = CommunityComment(
        post_id=post_id, user_id=current_user.id, content=content, is_anonymous=payload.is_anonymous, parent_id=parent_id
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    create_notification(
        db,
        user_id=post.user_id,
        actor_id=current_user.id,
        actor_is_anonymous=comment.is_anonymous,
        type_=NotificationType.COMMENT,
        target_type=NotificationTargetType.POST,
        target_id=post_id,
        comment_id=comment.id,
        preview_text=comment.content,
    )

    anon_map = _build_anonymous_index_map(_all_post_comments(db, post_id), post.user_id)
    return _comment_to_response(comment, current_user.id, post.user_id, anon_map)


@router.put("/posts/{post_id}/comments/{comment_id}", response_model=CommunityCommentResponse)
def update_post_comment(
    post_id: int,
    comment_id: int,
    payload: CommunityCommentInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")
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
    anon_map = _build_anonymous_index_map(_all_post_comments(db, post_id), post.user_id)
    return _comment_to_response(comment, current_user.id, post.user_id, anon_map)


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
    # 답글이면 원댓글의 id. 원댓글이면 None.
    parent_id: int | None = None


def _all_dream_comments(db: Session, dream_id: int) -> list[DreamComment]:
    return (
        db.query(DreamComment)
        .filter(DreamComment.dream_entry_id == dream_id)
        .order_by(DreamComment.created_at.asc())
        .all()
    )


@router.get("/dream-feed/{dream_id}/comments", response_model=list[CommunityCommentResponse])
def list_dream_comments(
    dream_id: int,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[dict]:
    entry = db.query(DreamEntry).filter(DreamEntry.id == dream_id, DreamEntry.status == DreamStatus.PUBLIC).first()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공개된 꿈 기록을 찾을 수 없습니다.")

    comments = _all_dream_comments(db, dream_id)
    current_user_id = current_user.id if current_user else None
    anon_map = _build_anonymous_index_map(comments, entry.user_id)
    return [_comment_to_response(comment, current_user_id, entry.user_id, anon_map) for comment in comments]


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

    parent_id = payload.parent_id
    if parent_id is not None:
        parent = (
            db.query(DreamComment)
            .filter(DreamComment.id == parent_id, DreamComment.dream_entry_id == dream_id)
            .first()
        )
        if parent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="답글을 달 댓글을 찾을 수 없습니다.")
        if parent.parent_id is not None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="답글에는 답글을 달 수 없어요.")

    comment = DreamComment(
        dream_entry_id=dream_id,
        user_id=current_user.id,
        content=content,
        is_anonymous=payload.is_anonymous,
        parent_id=parent_id,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    create_notification(
        db,
        user_id=entry.user_id,
        actor_id=current_user.id,
        actor_is_anonymous=comment.is_anonymous,
        type_=NotificationType.COMMENT,
        target_type=NotificationTargetType.DREAM,
        target_id=dream_id,
        comment_id=comment.id,
        preview_text=comment.content,
    )

    anon_map = _build_anonymous_index_map(_all_dream_comments(db, dream_id), entry.user_id)
    return _comment_to_response(comment, current_user.id, entry.user_id, anon_map)


@router.put("/dream-feed/{dream_id}/comments/{comment_id}", response_model=CommunityCommentResponse)
def update_dream_comment(
    dream_id: int,
    comment_id: int,
    payload: DreamCommentInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    entry = db.query(DreamEntry).filter(DreamEntry.id == dream_id).first()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공개된 꿈 기록을 찾을 수 없습니다.")
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
    anon_map = _build_anonymous_index_map(_all_dream_comments(db, dream_id), entry.user_id)
    return _comment_to_response(comment, current_user.id, entry.user_id, anon_map)


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
