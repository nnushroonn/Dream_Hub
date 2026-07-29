import enum
from datetime import date as PyDate, datetime, time
from typing import Any, Optional

from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, ForeignKey, Integer, JSON, String, Time, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class DreamStatus(str, enum.Enum):
    PRIVATE = "PRIVATE"
    PUBLIC = "PUBLIC"


class InteractionType(str, enum.Enum):
    LIKE = "LIKE"  # 👍 좋아요(Upvote)
    DISLIKE = "DISLIKE"  # 👎 싫어요(Downvote)
    SCRAP = "SCRAP"  # 스크랩북 저장


class NotificationType(str, enum.Enum):
    COMMENT = "COMMENT"
    LIKE = "LIKE"
    BEST = "BEST"  # 베스트 피드 진입 - 현재 자동 트리거는 없고 타입만 정의되어 있다(스케줄러 부재).


class NotificationTargetType(str, enum.Enum):
    POST = "POST"  # 자유 광장 글
    DREAM = "DREAM"  # 무의식 피드 꿈 기록


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # 꿈 페르소나 닉네임. 커뮤니티/댓글의 author_display_name이 이 값을 그대로 쓴다.
    nickname: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 마이페이지 뱃지 시스템 - 획득한 뱃지 코드 목록 (예: ["FIRST_DREAM", "LUCID_MASTER"])
    badges: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    # 리얼리티 체크 푸시 알림 스케줄링에 사용하는 수면 주기 설정
    bedtime: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    wake_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    # 마이페이지 아바타 오라 커스텀 - "good"(길몽 위주)/"lucid"(자각몽 위주)/"calm"(평온 위주).
    # 유저가 직접 고르는 값이라 기본은 미선택(None) - 프론트가 그때는 중립 톤으로 보여준다.
    aura_preference: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    dream_entries: Mapped[list["DreamEntry"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # user_id가 채워진(개인 사전) DictionaryAlias만 해당. 공용 사전(user_id=NULL)은 이 관계에 걸리지 않음.
    dictionary_aliases: Mapped[list["DictionaryAlias"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    interactions: Mapped[list["Interaction"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class StandardKeyword(Base):
    """해몽/트렌드의 기준이 되는 대표 키워드. 꿈해몽 사전 검색 시 조회수를 여기에 누적해
    실제 인기 검색어 랭킹(트렌드 대시보드)의 근거로 쓴다."""

    __tablename__ = "standard_keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    # 큐레이션된 카테고리에 속하지 않는 자유 검색어도 들어올 수 있어 nullable.
    category: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    search_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    aliases: Mapped[list["DictionaryAlias"]] = relationship(
        back_populates="standard",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    keyword_maps: Mapped[list["DreamKeywordMap"]] = relationship(
        back_populates="standard",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DictionaryAlias(Base):
    """유저가 입력한 은어/오타 등을 표준 키워드로 매핑.

    user_id가 NULL이면 전체 공용 사전, 값이 있으면 해당 유저 전용(개인) 사전으로 동작한다.
    """

    __tablename__ = "dictionary_aliases"
    __table_args__ = (
        UniqueConstraint("user_id", "alias_word", name="uq_dictionary_alias_user_word"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    standard_id: Mapped[int] = mapped_column(
        ForeignKey("standard_keywords.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias_word: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    # Nullable: NULL = 공용 사전, 값 있음 = 해당 유저의 개인 사전
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    standard: Mapped["StandardKeyword"] = relationship(back_populates="aliases")
    user: Mapped[Optional["User"]] = relationship(back_populates="dictionary_aliases")


class DreamDictionaryCache(Base):
    """꿈해몽 사전 AI 응답(검색/시나리오 목록/시나리오 심층 해몽) 캐시.

    cache_key는 호출 종류+정규화된 입력값으로 만든 결정적 문자열(예: "search:뱀")이라 완전히
    같은 요청이 재입력되면 Claude를 다시 호출하지 않고 payload를 그대로 재사용한다 - 토큰 비용 절감용.
    """

    __tablename__ = "dream_dictionary_caches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cache_key: Mapped[str] = mapped_column(String(300), unique=True, index=True, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB().with_variant(JSON(), "sqlite"), nullable=False)
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DreamEntry(Base):
    """꿈 기록소의 꿈 일기 한 건. 6단계 위저드 응답 원본과 AI 해몽 결과를 함께 저장해,
    수정 시 폼 프리필과 상세 보기 화면에 그대로 재사용할 수 있게 한다.

    하루에 여러 개의 꿈을 기록할 수 있어(1:N), (user_id, dream_date) 조합은 유니크하지 않다."""

    __tablename__ = "dream_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dream_date: Mapped[PyDate] = mapped_column(Date, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # 유저가 고른 감정 이모지 (예: "😨", "😊")
    emotion: Mapped[str] = mapped_column(String(8), nullable=False)
    # 목록 화면용 한 줄 요약. AI를 다시 부르지 않고 프론트가 Step 1~4 칩 텍스트를 조합해 만들어 그대로 저장한다.
    summary: Mapped[str] = mapped_column(String(300), nullable=False, default="", server_default="")
    # 6단계 위저드 응답 원본 (DreamSurveyInput과 동일한 형태) - 수정 모드 프리필에 사용
    survey: Mapped[dict[str, Any]] = mapped_column(JSONB().with_variant(JSON(), "sqlite"), nullable=False)
    # AI 해몽 결과 원본 (description/lucky_* 등) - 상세 보기에 그대로 재사용.
    # 무의식 광장 "직접 쓰기" 모드에서 AI 해몽을 건너뛰고 게시한 경우 None일 수 있다.
    interpretation: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"), nullable=True
    )
    # 유저가 글쓰기 화면에서 직접 입력한 꿈 상징 해시태그(최대 5개) - AI가 interpretation 안에
    # 자동으로 붙여주던 태그를 대신해, 커뮤니티 노출/필터링은 이제 이 필드만 쓴다.
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False, server_default="{}")
    status: Mapped[DreamStatus] = mapped_column(
        SAEnum(DreamStatus, name="dream_status"), nullable=False, default=DreamStatus.PRIVATE
    )
    # 공개(PUBLIC) 상태일 때만 의미 있음: 무의식 피드에 카드가 뜰 때 익명 실루엣으로 낼지,
    # 유저의 (이메일 기반) 닉네임으로 낼지. 기본값은 프라이버시를 보수적으로 잡아 익명.
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")
    # 공개(PUBLIC) 상태일 때만 의미 있음: 체크하면 무의식 피드 카드에 AI 해몽 리포트 아코디언이
    # 함께 노출된다. 기본값은 보수적으로 비공개(false) - 명시적으로 동의한 경우에만 공유.
    share_with_ai_analysis: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    # 공개(PUBLIC) 상태일 때만 의미 있음: 꿈 내용 자체와는 별개로, 공유하면서 덧붙이는 한마디
    # (질문/자랑거리 등). 무의식 피드 카드 상단에 말풍선처럼 노출된다.
    share_caption: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_lucid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 공개 상세 조회(GET /api/dreams/public/{id})가 호출될 때마다 1씩 증가 - 베스트 피드
    # 랭킹에서 좋아요 수가 동점일 때 2차 정렬 기준(조회수)으로 쓰인다.
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="dream_entries")
    keyword_maps: Mapped[list["DreamKeywordMap"]] = relationship(
        back_populates="dream_entry",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    interactions: Mapped[list["Interaction"]] = relationship(
        back_populates="dream_entry",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DreamKeywordMap(Base):
    """꿈(DreamEntry)과 추출된 표준 키워드의 다대다 연결. is_liked로 트렌드 '관심' 상태를 관리."""

    __tablename__ = "dream_keyword_maps"
    __table_args__ = (
        UniqueConstraint("dream_id", "standard_id", name="uq_dream_keyword_map"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dream_id: Mapped[int] = mapped_column(
        ForeignKey("dream_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    standard_id: Mapped[int] = mapped_column(
        ForeignKey("standard_keywords.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_liked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    dream_entry: Mapped["DreamEntry"] = relationship(back_populates="keyword_maps")
    standard: Mapped["StandardKeyword"] = relationship(back_populates="keyword_maps")


class Interaction(Base):
    """꿈 게시물 단위의 유저 반응 - 좋아요/싫어요(LIKE/DISLIKE 투표)와 스크랩북 저장(SCRAP).

    유니크 제약이 (user_id, dream_entry_id, type)이라 DB 레벨에서는 한 유저가 같은 꿈에
    LIKE와 DISLIKE 행을 동시에 가질 수 있지만, 라우터가 투표 시 항상 기존 LIKE/DISLIKE 행을
    먼저 정리하고 하나만 남겨 상호 배타성을 애플리케이션 레벨에서 보장한다."""

    __tablename__ = "interactions"
    __table_args__ = (
        UniqueConstraint("user_id", "dream_entry_id", "type", name="uq_interaction_user_dream_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dream_entry_id: Mapped[int] = mapped_column(
        ForeignKey("dream_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[InteractionType] = mapped_column(SAEnum(InteractionType, name="interaction_type"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="interactions")
    dream_entry: Mapped["DreamEntry"] = relationship(back_populates="interactions")


class CommunityPost(Base):
    """무의식 광장의 '자유 광장' 탭 - 꿈과 무관한 자유 게시글.

    아이덴티티 선택 시스템: is_anonymous가 false면 응답에 이메일 앞부분으로 만든 표시용
    닉네임(author_display_name)을 함께 내려준다 - 아직 별도 프로필/닉네임 설정 기능이 없어
    이메일에서 파생시킨 값이며, 실제 이메일 전체는 절대 노출하지 않는다."""

    __tablename__ = "community_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # 리스트형 게시판으로 전환하며 추가된 필드 - 기존 행은 마이그레이션 시 빈 문자열로 채워진다.
    title: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    content: Mapped[str] = mapped_column(String(1000), nullable=False)
    # 기본값은 자유 광장의 기본 모드(닉네임 공개)에 맞춰 false.
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    # 글쓰기에서 첨부한 이미지들의 R2 공개 URL 목록(최대 3장) - 순서가 곧 노출 순서.
    image_urls: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False, server_default="{}")
    # 상세 조회(GET /api/community/posts/{id})가 호출될 때마다 증가 - 어뷰징 방지는
    # view_tracking.should_count_view()가 Redis로 24시간 중복을 걸러준 뒤에만 커밋한다.
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship()


class CommunityPostReaction(Base):
    """자유 광장 게시글의 👍/👎 투표. (user_id, post_id) 유니크라 한 유저는 게시글당 하나의
    투표만 가지며, 방향을 바꾸면 새 행을 만들지 않고 is_upvote만 갱신한다."""

    __tablename__ = "community_post_reactions"
    __table_args__ = (
        UniqueConstraint("user_id", "post_id", name="uq_community_post_reaction"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # True면 👍 좋아요(Upvote), False면 👎 싫어요(Downvote). 좋아요/싫어요 도입 이전의 기존 행은
    # 전부 '공감'이었으므로 마이그레이션 시 True로 채운다.
    is_upvote: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CommunityComment(Base):
    """자유 광장 게시글의 댓글. 게시글과 동일한 아이덴티티 선택 시스템(is_anonymous)을 그대로 쓴다.

    parent_id가 있으면 답글(대댓글) - 라우터가 답글의 답글은 막아 항상 1-Depth를 유지한다.
    부모 댓글이 삭제되면 그 답글들도 함께 지워지도록 ondelete="CASCADE"로 걸어둔다."""

    __tablename__ = "community_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("community_comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship()


class DreamComment(Base):
    """🔮 무의식 피드에 공개된 꿈 기록에 다는 댓글 - 단순 공감(❤️)을 넘어 유저끼리 실제로
    이야기를 나눌 수 있도록 CommunityComment와 동일한 구조로 별도 테이블을 둔다.
    기본값은 무의식 피드 자체의 기본 익명 관례를 따라 True (자유 광장 댓글은 False).

    parent_id가 있으면 답글(대댓글) - 라우터가 답글의 답글은 막아 항상 1-Depth를 유지한다."""

    __tablename__ = "dream_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dream_entry_id: Mapped[int] = mapped_column(
        ForeignKey("dream_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("dream_comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship()


class Notification(Base):
    """GNB 종 아이콘 알림 - 내 글/꿈에 달린 댓글과 좋아요를 알려준다.

    target_id는 target_type(POST/DREAM)에 따라 community_posts.id 또는 dream_entries.id를
    가리키는 다형적 참조라 실제 FK 제약은 걸지 않는다(두 테이블을 동시에 걸 수 없음).
    comment_id도 마찬가지로 target_type에 따라 community_comments/dream_comments 중 하나를
    가리키는 느슨한 참조다. 대상 글/댓글이 나중에 지워져도 알림 행 자체는 남고, 클릭하면
    상세 페이지의 기존 404/댓글-없음 처리로 자연스럽게 흡수된다."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # 알림을 받는 사람(내 글/꿈의 주인). 이 유저가 탈퇴하면 알림도 함께 지운다.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # 알림을 발생시킨 사람(댓글 작성자/투표한 사람). 탈퇴해도 알림 자체는 남기고 이 값만 비운다.
    actor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # LIKE(좋아요)는 투표 자체에 익명 선택지가 없어 항상 True로 저장해 행위자 이름을 감춘다.
    # COMMENT는 그 댓글을 쓸 때 고른 is_anonymous 값을 그대로 스냅샷한다.
    actor_is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    type: Mapped[NotificationType] = mapped_column(SAEnum(NotificationType, name="notification_type"), nullable=False)
    target_type: Mapped[NotificationTargetType] = mapped_column(
        SAEnum(NotificationTargetType, name="notification_target_type"), nullable=False
    )
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    comment_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # 알림 문구에 쓸 스냅샷 텍스트(글 제목 또는 댓글 내용 일부) - 대상이 나중에 수정/삭제돼도
    # 알림 문구는 발생 당시 그대로 남는다.
    preview_text: Mapped[str] = mapped_column(String(300), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    actor: Mapped[Optional["User"]] = relationship(foreign_keys=[actor_id])
