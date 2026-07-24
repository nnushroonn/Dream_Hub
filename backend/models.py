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
    LIKE = "LIKE"  # 공감 ("저도 이런 꿈 꾼 적 있어요")
    SCRAP = "SCRAP"  # 스크랩북 저장


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 마이페이지 뱃지 시스템 - 획득한 뱃지 코드 목록 (예: ["FIRST_DREAM", "LUCID_MASTER"])
    badges: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    # 리얼리티 체크 푸시 알림 스케줄링에 사용하는 수면 주기 설정
    bedtime: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    wake_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
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
    # AI 해몽 결과 원본 (tags/description/lucky_* 등) - 상세 보기에 그대로 재사용
    interpretation: Mapped[dict[str, Any]] = mapped_column(JSONB().with_variant(JSON(), "sqlite"), nullable=False)
    status: Mapped[DreamStatus] = mapped_column(
        SAEnum(DreamStatus, name="dream_status"), nullable=False, default=DreamStatus.PRIVATE
    )
    # 공개(PUBLIC) 상태일 때만 의미 있음: 무의식 피드에 카드가 뜰 때 익명 실루엣으로 낼지,
    # 유저의 (이메일 기반) 닉네임으로 낼지. 기본값은 프라이버시를 보수적으로 잡아 익명.
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")
    # 공개(PUBLIC) 상태일 때만 의미 있음: 체크하면 무의식 피드 카드에 AI 해몽 리포트 아코디언이
    # 함께 노출된다. 기본값은 보수적으로 비공개(false) - 명시적으로 동의한 경우에만 공유.
    share_with_ai_analysis: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    is_lucid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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
    """꿈 게시물 단위의 유저 반응 - 공감(LIKE)과 스크랩북 저장(SCRAP)."""

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
    content: Mapped[str] = mapped_column(String(1000), nullable=False)
    # 기본값은 자유 광장의 기본 모드(닉네임 공개)에 맞춰 false.
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship()


class CommunityPostReaction(Base):
    """자유 광장 게시글의 '✨ 공감' 토글. (user_id, post_id) 유니크로 중복 공감을 막는다."""

    __tablename__ = "community_post_reactions"
    __table_args__ = (
        UniqueConstraint("user_id", "post_id", name="uq_community_post_reaction"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CommunityComment(Base):
    """자유 광장 게시글의 댓글. 게시글과 동일한 아이덴티티 선택 시스템(is_anonymous)을 그대로 쓴다."""

    __tablename__ = "community_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship()
