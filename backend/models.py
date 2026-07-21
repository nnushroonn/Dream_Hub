import enum
from datetime import datetime, time
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, Time, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY
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
    """해몽/트렌드의 기준이 되는 대표 키워드."""

    __tablename__ = "standard_keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(100), index=True, nullable=False)

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


class DreamEntry(Base):
    """꿈 기록소의 꿈 일기 한 건. AI 해몽 결과와 자각몽 여부를 함께 저장한다."""

    __tablename__ = "dream_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # 감정 이모지 (예: "😨", "😊")
    emotion: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    # AI 해몽 결과 (의미/상징/행운요소 등을 담은 텍스트. 구조화가 필요해지면 JSON 컬럼으로 전환 고려)
    ai_interpretation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[DreamStatus] = mapped_column(
        SAEnum(DreamStatus, name="dream_status"), nullable=False, default=DreamStatus.PRIVATE
    )
    is_lucid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

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
