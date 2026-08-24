import enum
from datetime import date as PyDate, datetime, time
from typing import Any, Optional

from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, JSON, String, Text, Time, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class DreamStatus(str, enum.Enum):
    PRIVATE = "PRIVATE"
    PUBLIC = "PUBLIC"


class EntryType(str, enum.Enum):
    """이 기록이 감정일기인지 꿈일기인지를 나타내는 실제 타입 필드 - 예전엔 이걸 interpretation
    유무로 유추했지만(꿈해몽 사전을 거쳐 저장하는 경우처럼, AI 해몽 없이 저장되는 진짜 꿈일기가
    있어) 부정확했다. 기록을 만드는 화면(일기장 작성/꿈 기록 모달/커뮤니티 글쓰기)이 항상
    명시적으로 이 값을 정해 보낸다."""

    EMOTION = "emotion"  # 감정일기 - 나만의 일기장 작성 폼, 커뮤니티 "감정일기"/"자유" 탭, 꽃 공유 글.
    DREAM = "dream"  # 꿈일기 - 꿈 기록 모달(정밀/빠른 기록/사전 연계), 커뮤니티 "꿈일기" 탭.


class InteractionType(str, enum.Enum):
    LIKE = "LIKE"  # 👍 좋아요(Upvote)
    DISLIKE = "DISLIKE"  # 👎 싫어요(Downvote)
    SCRAP = "SCRAP"  # 스크랩북 저장


class NotificationType(str, enum.Enum):
    COMMENT = "COMMENT"
    LIKE = "LIKE"
    BEST = "BEST"  # 베스트 피드 진입 - 현재 자동 트리거는 없고 타입만 정의되어 있다(스케줄러 부재).
    DEW = "DEW"  # 무의식의 정원 - 누군가 내 정원에 이슬을 주고 감


class NotificationTargetType(str, enum.Enum):
    POST = "POST"  # 자유 광장 글
    DREAM = "DREAM"  # 무의식 피드 꿈 기록
    GARDEN = "GARDEN"  # 무의식의 정원 - target_id는 이슬을 준 사람(actor)의 user_id


class ReportTargetType(str, enum.Enum):
    POST = "POST"  # 자유 광장 글(CommunityPost)
    DREAM = "DREAM"  # 무의식 피드 꿈 기록(DreamEntry)


class ReportStatus(str, enum.Enum):
    PENDING = "PENDING"  # 관리자 미검토
    RESOLVED = "RESOLVED"  # 검토 완료 - 콘텐츠를 삭제하는 등 조치함
    DISMISSED = "DISMISSED"  # 검토 완료 - 조치 없이 기각(오신고 등)


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
    # 커뮤니티 닉네임 호버 카드(무의식 은하 프로필)에 씨앗 비율/뱃지 스냅샷을 공개할지 여부.
    # 기본은 비공개 - 유저가 마이페이지에서 직접 켜야만 다른 유저에게 집계 데이터가 보인다.
    is_galaxy_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 관리자 모드 - 이 값이 true인 계정만 /admin 화면과 그 아래 관리자 전용 API에 접근할 수
    # 있다. 가입 폼/일반 API로는 절대 켤 수 없고, DB에서 직접 켜야 한다(routers/auth.py의
    # get_current_admin_user 참고).
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    # 관리자가 정지시킨 계정 - true면 로그인 자체가 거부되고(is_verified 검사와 같은 자리),
    # 이미 로그인해 있던 세션도 다음 요청부터 get_current_user에서 즉시 막힌다.
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    # 9단계 우주 티어 레벨 시스템(leveling.py)의 누적 경험치 - 레벨/티어는 이 값 하나에서
    # 항상 파생 계산하고 별도로 저장하지 않는다. 실제 증감은 leveling.award_xp()를 통해서만
    # 일어난다(XpAward 원장과 함께 트랜잭션으로 갱신).
    total_xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    # 무의식의 정원 "대표 꽃" - 유저가 자기 정원에서 직접 고른 개화(BLOOMING) 씨앗 하나.
    # 정원 상단에 항상 이 꽃만 먼저 보여준다. 고른 적 없으면 NULL(대표 꽃 영역 자체를 숨긴다).
    pinned_seed_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dream_seeds.id", ondelete="SET NULL"), nullable=True
    )
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


class DailyKeyword(Base):
    """인기 검색어 랭킹(daily=최근 24시간 롤링, weekly=최근 7일 롤링). 요청마다 실시간 집계하지
    않고, routers.trends.run_search_trend_batch가 SEARCH_TREND_REFRESH_INTERVAL_SECONDS(기본
    15분)마다 Redis에 쌓인 검색 로그를 그 시점 기준 롤링 윈도우로 집계해 순위·변동폭까지 계산한
    뒤 한 번에 적재한다 - 조회는 이 테이블에서 가장 최근 generated_at 한 장만 읽으면 끝난다."""

    __tablename__ = "daily_keywords"
    __table_args__ = (
        Index("ix_daily_keywords_period_generated_at", "period", "generated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period: Mapped[str] = mapped_column(String(10), nullable=False)  # "daily" | "weekly"
    # 이 배치가 집계된 시각(끝점) - 같은 배치의 행들은 모두 동일한 값을 공유해 그룹 키 역할을 한다.
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    keyword: Mapped[str] = mapped_column(String(100), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    change: Mapped[str] = mapped_column(String(10), nullable=False, default="new")  # "up" | "down" | "new" | "same"
    rank_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class EmotionCategory(str, enum.Enum):
    """씨앗의 유일한 축 - 감정일기 대분류 7종(emotion_wordbook.EMOTION_CATEGORIES와 동일).
    이전엔 유저가 밤에 별도로 고르는 SeedType(SLEEP/CONFIDENCE 등, 감정과 무관한 목적
    카테고리)이었으나, writing 단계에서 이미 고른 감정이 곧 그날 심는 씨앗이 되도록
    바뀌면서 폐기됐다 - 이제 씨앗을 심는 별도 선택 화면 자체가 없다. 멤버 이름과 값을
    둘 다 이 한국어 문자열 그대로 써서 emotion_wordbook.EMOTION_CATEGORY_TO_GENUS의
    키와 별도 매핑 없이 바로 대응시킨다."""

    즐거움 = "즐거움"
    바램 = "바램"
    슬픔 = "슬픔"
    분노 = "분노"
    기쁨 = "기쁨"
    사랑 = "사랑"
    미움 = "미움"


class SeedStatus(str, enum.Enum):
    PLANTED = "PLANTED"  # 심은 당일 밤 ~ 다음 날 결과 확인 전
    BLOOMING = "BLOOMING"  # 다음 날 AI 해몽을 완료해 개화함
    RESTING = "RESTING"  # 다음 날이 지나도록 꿈을 기록하지 않아 쉬는 중


class DreamRecallStatus(str, enum.Enum):
    """개화(꿈일기 작성) 여부와는 별개로, "꿈이 기억나는지"를 유저가 명시적으로 선택했는지
    추적한다. status(SeedStatus)만으로는 "아직 안 씀"과 "기억 안 나서 명시적으로 포기함"을
    구분할 수 없어 - 후자인데도 '다음 할 일' 안내/아침 웰컴 모달이 계속 재촉하는 문제가 있었다."""

    PENDING = "PENDING"  # 기본값 - 아직 결정 안 함(정상적으로 꿈일기를 쓸 수도, 기억 안 남을 선택할 수도 있다)
    REMEMBERED = "REMEMBERED"  # 꿈일기를 정상적으로 작성해 개화까지 마쳤다
    FORGOTTEN = "FORGOTTEN"  # "꿈이 기억나지 않아요"를 명시적으로 선택했다 - 정식 꽃 대신 새싹 표본으로 남는다


class DreamSeed(Base):
    """무의식 씨앗 - '밤에 심기 -> 아침에 상태 확인'의 독립적인 2단계 리추얼.
    특정 DreamEntry에 종속되지 않는 별도 레코드다: 심을 때는 아직 어떤 꿈과도 연결되지 않고,
    다음 날 AI 해몽이 완료된 DreamEntry가 생기는 순간 그 레코드에 연결되며 개화한다."""

    __tablename__ = "dream_seeds"
    # 하루(user_id, planted_at) 당 화분은 정확히 하나 - 성장 단계가 씨앗->새싹->개화로
    # 진행될 때마다 이 행 하나의 status/seed_type/bloomed_dream_entry_id만 갱신되고,
    # 새 행이 추가로 생기지 않는다. plant_seed()가 이미 이 규칙대로 upsert하고 있었지만,
    # 과거 _bloom_pending_seed()의 날짜 판정 버그로 같은 날짜에 두 번째 행(숨은 WIND 씨앗)이
    # 생겨 정원에 화분이 중복 표시된 적이 있어 - DB 레벨에서도 이 불변식을 강제한다.
    __table_args__ = (UniqueConstraint("user_id", "planted_at", name="uq_dream_seeds_user_planted_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    seed_type: Mapped[EmotionCategory] = mapped_column(SAEnum(EmotionCategory, name="emotion_category"), nullable=False)
    status: Mapped[SeedStatus] = mapped_column(
        SAEnum(SeedStatus, name="seed_status"), nullable=False, default=SeedStatus.PLANTED
    )
    # "꿈이 기억나지 않아요"를 명시적으로 선택했는지 - DreamRecallStatus 주석 참고. FORGOTTEN인
    # 동안은 routers/seeds._sync_status가 PLANTED -> RESTING 자동 전환을 건너뛰어, 나중에
    # 다시 방문해 꿈일기를 써도(기간 제한 없이) 언제든 정상적으로 개화할 수 있는 문이 열려
    # 있다(routers/dreams._bloom_pending_seed가 그 순간 REMEMBERED로 되돌린다).
    dream_recall_status: Mapped[DreamRecallStatus] = mapped_column(
        SAEnum(DreamRecallStatus, name="dream_recall_status"),
        nullable=False,
        default=DreamRecallStatus.PENDING,
        server_default="PENDING",
    )
    # 심은 "밤"의 날짜(KST 기준) - 개화/휴식 판정의 기준선. "꿈 날짜 = 취침일" 규칙(DreamEntry.
    # dream_date 주석 참고)과 정확히 같은 축이다: 아침에 개화(꿈일기 작성)해도 이 값은 바뀌지
    # 않고 전날 밤 그대로 남는다.
    planted_at: Mapped[PyDate] = mapped_column(Date, nullable=False, index=True)
    # 개화(BLOOMING)로 전환된 순간 연결된 실제 꿈 기록. 심겨만 있거나 쉬는 중이면 NULL.
    bloomed_dream_entry_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dream_entries.id", ondelete="SET NULL"), nullable=True
    )

    # --- 꽃 도감 분류(flower_taxonomy.py) - 개화 순간에만 채워진다. seed_type(EmotionCategory,
    # 7종)은 씨앗을 심은 시점(writing 단계)에 즉시 기록되는 반면, 이 아래 필드들은 "어떤
    # 이름/색의 꽃이 피는가"를 위해 개화 시점에 그날 감정일기를 다시 조회해 계산한다 - 보통은
    # 둘 다 같은 감정일기에서 나와 값이 일치하지만(EMOTION_CATEGORY_TO_GENUS로 seed_type ->
    # genus 변환 가능), 씨앗 없이 꿈만 쓴 경우(WIND 폴백)처럼 seed_type이 사후에 대체값으로
    # 채워지는 경우도 있어 genus 쪽을 항상 최종 권위로 삼는다. 씨앗 상태(PLANTED)일 때는
    # 이 아래 필드들이 전부 NULL이다. ---
    # 속(Genus) - 그 밤 감정일기 감정의 5계열(온기/격동/몽환/여운/생동).
    genus: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # 종(Archetype) - 꿈 AI 해시태그의 8원형 키(예: "관계/재회형"), 전설의 꽃이면 "LEGENDARY".
    archetype: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # 도감에 등록되는 순수 종 명사(예: "들꽃") - 전설의 꽃이면 그 고유 이름 자체.
    species_name: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # 실제로 정원에 표시되는 최종 이름(형용사+종, 예: "자유로운 들꽃") - 전설의 꽃이면 species_name과 동일.
    flower_name: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    is_legendary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # 전설의 꽃 언락 조건 키(예: "여명초") - 전설이 아니면 NULL.
    legendary_key: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # --- 속(genus) 판정 근거 추적 - "왜 이 꽃이 이 속으로 피었는지" 나중에 디버깅할 수
    # 있도록 남긴다(테스트 계정 합성 데이터 때문에 겪은 혼선 재발 방지). "simple"이면
    # genus_source_value가 그때 쓰인 이모지, "guided"면 마음 기록장 1단계에서 고른 단어
    # 원문이다. 과거(이 필드 도입 전) 생성된 행은 둘 다 NULL로 남는다 - 재계산하지 않는다. ---
    genus_source_mode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    genus_source_value: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # 마음 기록장(깊이 모드)에서 초기 감정(부정: 격동/여운)이 종료 감정(긍정: 온기/생동)으로
    # 바뀐 날에만 True - "성장의 반짝임" 배지. 종/희귀도(archetype/species_name/rarity)
    # 계산과는 완전히 독립적이라 어떤 종이 나올지, 몇 성급일지에는 전혀 영향을 주지 않는다.
    growth_badge: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Specimen(Base):
    """AI 해몽 빠른 진입(감정일기/수면 단계 없이 상단 "AI 해몽" 버튼으로 곧장 받은 결과)의
    산출물 - 씨앗 심기->발아->개화의 정식 루틴을 거치지 않았으므로 DreamSeed의 45종 꽃 분류
    (39 regular + 6 legendary, 속x종x변종)를 따르지 않는다. 유저별로 1부터 증가하는 순번만
    매겨 "표본 No.{순번}"으로
    남기고, 도감 완성률 집계에도 포함되지 않는다 - 정원에서도 꽃 그리드와 분리된 별도
    섹션("떠돌이 표본")에 전시된다."""

    __tablename__ = "specimens"
    # 유저별 표본 번호는 절대 재사용되지 않고 항상 1씩 증가해야 "표본 No.X"가 안정적인
    # 이름으로 남는다.
    __table_args__ = (UniqueConstraint("user_id", "sequence_number", name="uq_specimens_user_sequence"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dream_entry_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dream_entries.id", ondelete="SET NULL"), nullable=True
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # 빠른 진입 모달에서 유저가 직접 고르거나 AI가 추론한 감정 - 이름/분류에는 절대 반영하지
    # 않고 부가 정보로만 보여준다.
    emotion: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # AI 해몽이 붙인 상징 태그 원본(예: "#그림자") - 부가 정보로만 보여준다.
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class XpAward(Base):
    """XP 지급 원장 - User.total_xp 증감은 항상 이 테이블에 행을 하나 남기며 함께 일어난다.
    단순 합산 컬럼이 아니라 원장을 따로 두는 이유는, 카테고리별로 규칙이 다르기 때문이다:
    자기 행동(글/댓글 작성)은 하루 합산 상한이 있고, 개인 루틴(일기/씨앗)은 하루 1회만
    지급돼야 한다 - 두 판정 모두 "오늘 이미 무엇을 지급했는가"를 조회해야 하므로 원장이 필요하다.
    좋아요/댓글 "받음" 카테고리는 상한이 없어 매 이벤트마다 새 행이 쌓인다."""

    __tablename__ = "xp_awards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class GardenDew(Base):
    """무의식의 정원 '이슬 주기' - 하루에 같은 유저의 정원에는 한 번만 줄 수 있다. (giver_id,
    recipient_id, given_date) 유니크 제약으로 동시 요청이 몰려도 DB 레벨에서 중복을 막는다."""

    __tablename__ = "garden_dews"
    __table_args__ = (UniqueConstraint("giver_id", "recipient_id", "given_date", name="uq_garden_dew_daily"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    giver_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    given_date: Mapped[PyDate] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MagazineArticle(Base):
    """드림허브 매거진 - 꿈 심리학/상징 해설을 다루는 자체 에디토리얼 롱폼 콘텐츠.

    커뮤니티 게시글(유저 UGC)과는 출처가 다른 1st-party 콘텐츠라 별도 테이블로 분리했다 -
    author는 항상 "Dream Hub 에디터" 고정이며, 익명 유저 글처럼 보이지 않도록 명시적으로
    편집팀 저작물임을 드러낸다."""

    __tablename__ = "magazine_articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # 목록 카드에 쓰는 짧은 한 줄 요약.
    excerpt: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="꿈 심리학")
    author: Mapped[str] = mapped_column(String(50), nullable=False, default="Dream Hub 에디터")
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


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
    # "꿈 날짜 = 취침일(잠든 밤)" 규칙 - 앱 전체가 이 축을 따른다. 아침에 지난밤 꿈을
    # 기록하더라도 dream_date는 "오늘"이 아니라 "그 꿈을 꾸기 위해 잠들었던 전날 밤" 날짜로
    # 저장한다. DreamSeed.planted_at(씨앗을 심은 밤)과 같은 축이라, 감정일기를 쓴 밤과 다음날
    # 아침 작성한 꿈일기가 성장 타임라인에서 같은 날짜로 묶여 보이는 것도 이 규칙 덕분이다.
    # 통계/정원 생성 등 새 기능을 추가할 때도 반드시 이 축(취침일)을 그대로 따라야 한다 -
    # "기록한 시각(created_at)"과 혼동하지 말 것.
    dream_date: Mapped[PyDate] = mapped_column(Date, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # 공개(PUBLIC) 상태일 때만 의미 있음: 커뮤니티(무의식 광장)에만 노출되는 별도 제목.
    # 공유 시점/공개 글 수정 화면에서 제목을 고치면 여기에만 저장되고 title(나만의 일기장/
    # 정원이 보는 원본 제목)은 절대 건드리지 않는다 - 예전엔 같은 title 컬럼을 공유 화면에서도
    # 그대로 덮어써서, 커뮤니티 글 제목을 고치면 일기장 원본까지 조용히 바뀌는 버그가 있었다.
    # 비어 있으면(None) 커뮤니티 화면도 title을 그대로 보여준다.
    public_title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # 감정일기/꿈일기 실제 타입 - interpretation 유무로 유추하지 않는다(꿈해몽 사전 연계 저장처럼
    # AI 해몽 없이 저장되는 진짜 꿈일기가 있다). 커뮤니티 탭 필터링/꿈 통계 집계 모두 이 필드만 본다.
    # values_callable 필수: EntryType 멤버 이름("DREAM")과 값("dream")이 달라(DreamStatus 등
    # 다른 enum과 달리 소문자 값을 쓴다), SAEnum 기본 동작(멤버 이름 저장)을 쓰면 DB의
    # dream_entry_type(소문자 값)과 어긋나 INSERT가 실패한다 - 반드시 .value로 저장해야 한다.
    entry_type: Mapped[EntryType] = mapped_column(
        SAEnum(EntryType, name="dream_entry_type", values_callable=lambda enum_cls: [member.value for member in enum_cls]),
        nullable=False,
        default=EntryType.EMOTION,
    )
    # 유저가 고른 감정 이모지 (예: "😨", "😊")
    emotion: Mapped[str] = mapped_column(String(8), nullable=False)
    # 목록 화면용 한 줄 요약. AI를 다시 부르지 않고 프론트가 Step 1~4 칩 텍스트를 조합해 만들어 그대로 저장한다.
    summary: Mapped[str] = mapped_column(String(300), nullable=False, default="", server_default="")
    # 6단계 위저드 응답 원본 (DreamSurveyInput과 동일한 형태) - 수정 모드 프리필에 사용
    survey: Mapped[dict[str, Any]] = mapped_column(JSONB().with_variant(JSON(), "sqlite"), nullable=False)
    # AI 해몽 결과 원본 (description/lucky_* 등) - 상세 보기에 그대로 재사용.
    # 무의식 광장 "직접 쓰기" 모드에서 AI 해몽을 건너뛰고 게시한 경우 None일 수 있다.
    # none_as_null=True 필수: 기본값(False)이면 파이썬 None이 SQL NULL이 아니라 JSON 리터럴
    # null(jsonb 'null')로 저장돼, flower_taxonomy.py/user.py의 interpretation.is_(None) 필터가
    # 실제로는 단 한 행도 못 찾는 채로 조용히 항상 빈 결과를 돌려주는 버그가 있었다.
    interpretation: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB(none_as_null=True).with_variant(JSON(none_as_null=True), "sqlite"), nullable=True
    )
    # 무의식 광장 "꽃" 콘텐츠 타입 - 정원에서 이미 개화한 내 꽃(DreamSeed) 한 송이를 공유 글에
    # 스냅샷으로 붙인다. 실시간으로 DreamSeed를 조인하지 않고 공유 시점의 이름/희귀도/도감
    # 번호를 그대로 굳혀 두는 이유는, rarity가 이후 다른 유저들의 개화 빈도에 따라 계속
    # 바뀌는 값이라 - 옛날에 공유한 글의 카드가 뒤늦게 등급이 달라 보이면 안 되기 때문이다.
    # 이 필드가 있으면(not null) 이 행은 실제 꿈 기록이 아니라 꽃 공유 글이다 - survey/emotion
    # 등 나머지 컬럼은 스키마상 NOT NULL을 만족시키기 위한 최소 더미 값을 채운다.
    attached_flower: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB(none_as_null=True).with_variant(JSON(none_as_null=True), "sqlite"), nullable=True
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
    # 현실 일기 전용 사진 첨부 - 별도 업로드/스토리지 서버 없이, 클라이언트가 FileReader로 만든
    # base64 data URL을 그대로 저장한다(DreamWizard의 스케치 미리보기와 동일한 방식). 길이 제한이
    # 없는 Text로 둔다 - String(N)으로는 이미지 데이터를 담을 수 없다.
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 자각몽 여부 - lucid_level이 "none"이 아니면 True. FIRST_LUCID 뱃지/통계 쿼리가 계속
    # 이 불리언 컬럼을 쓰므로, JSON인 survey를 매번 풀어보지 않도록 남겨둔 파생 컬럼이다.
    is_lucid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 자각의 정도(none/momentary/full)와, 자각했을 때의 꿈 통제력(director/observer/lost_control) -
    # 향후 마이페이지 통계에서 바로 집계할 수 있도록 survey JSON과 별개로 컬럼을 둔다.
    lucid_level: Mapped[str] = mapped_column(String(20), nullable=False, default="none", server_default="none")
    control_level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
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
    # 무의식 은하 공유(?template=galaxy) 글쓰기에서 고른 주파수 태그(healing/growth/rest/adventure).
    # 커뮤니티 헤더의 주파수 필터(?tag=)는 오직 이 컬럼만 조회한다 - 다른 유저의 비공개 일지를
    # 집계해서 정렬하지 않는다.
    public_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False, server_default="{}")
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


class Report(Base):
    """커뮤니티 "🚨 신고하기" 버튼이 만드는 신고 - Notification과 같은 방식으로 target_type +
    target_id만으로 대상 글을 느슨하게 가리킨다(POST -> CommunityPost.id, DREAM ->
    DreamEntry.id). 실제 하드 FK를 안 거는 이유도 동일(두 테이블을 동시에 걸 수 없음).
    관리자 화면(/admin/reports)이 이 테이블을 검토 큐로 쓴다."""

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_type: Mapped[ReportTargetType] = mapped_column(SAEnum(ReportTargetType, name="report_target_type"), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # 신고자 - 탈퇴해도 신고 기록 자체(내용 검토 이력)는 남기고 이 값만 비운다.
    reporter_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # 신고 사유 - 지금 프론트는 자유 입력 없이 버튼 하나로 바로 접수하므로 대부분 NULL이다.
    # 나중에 사유 선택/직접입력 UI가 붙을 걸 대비해 필드만 미리 열어둔다.
    reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    status: Mapped[ReportStatus] = mapped_column(
        SAEnum(ReportStatus, name="report_status"), nullable=False, default=ReportStatus.PENDING, server_default=ReportStatus.PENDING.value
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    reporter: Mapped[Optional["User"]] = relationship(foreign_keys=[reporter_id])
    resolved_by: Mapped[Optional["User"]] = relationship(foreign_keys=[resolved_by_id])
