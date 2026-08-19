"""무의식 우주 티어 레벨 시스템 - '우주의 크기 팽창'을 모티브로 한 9단계 티어.

레벨(숫자)은 XP가 쌓일 때마다 촘촘하게 오르는 세밀한 진행도이고, 티어(1~9)는 그 레벨을
LEVELS_PER_TIER개씩 묶은 굵은 단계다 - LoL의 "디비전(숫자) vs 티어(브론즈~챌린저)" 구조와
같다. 레벨/티어 모두 저장하지 않고 User.total_xp 하나만 저장한 뒤 항상 이 값에서 파생한다.
"""

import enum
from dataclasses import dataclass
from datetime import date as PyDate, datetime, timedelta, timezone

from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

KST = timezone(timedelta(hours=9))

# 레벨 하나를 올리는 데 필요한 누적 XP - 50xp마다 1레벨.
LEVEL_XP_STEP = 50
# 티어 하나가 몇 레벨로 구성되는지 - 10레벨(1~10)이 1티어.
LEVELS_PER_TIER = 10
TIER_COUNT = 9

TIER_TITLES = ["별먼지", "혜성", "달", "행성", "성운", "초신성", "성단", "은하", "우주"]

# LoL 티어 컬러 참고 - 1(브론즈)~9(챌린저).
TIER_COLORS = [
    "#A97142",  # 1 별먼지 - 브론즈(구리)
    "#9CA3AF",  # 2 혜성 - 실버
    "#D4AF37",  # 3 달 - 골드
    "#5FD0C6",  # 4 행성 - 플래티넘(청록빛 화이트)
    "#34D399",  # 5 성운 - 에메랄드
    "#4FC3F7",  # 6 초신성 - 다이아몬드(라이트 블루)
    "#A855F7",  # 7 성단 - 마스터(퍼플)
    "#EF4444",  # 8 은하 - 그랜드마스터(레드)
    "#FFD700",  # 9 우주 - 챌린저(골드, 프론트에서 블루와 함께 특수 글로우 처리)
]


@dataclass
class LevelInfo:
    total_xp: int
    level: int
    tier_index: int  # 1~9
    tier_title: str
    tier_color: str
    xp_into_level: int
    xp_for_next_level: int


def compute_level(total_xp: int) -> LevelInfo:
    total_xp = max(total_xp, 0)
    level = total_xp // LEVEL_XP_STEP + 1
    tier_index = min(TIER_COUNT, (level - 1) // LEVELS_PER_TIER + 1)
    return LevelInfo(
        total_xp=total_xp,
        level=level,
        tier_index=tier_index,
        tier_title=TIER_TITLES[tier_index - 1],
        tier_color=TIER_COLORS[tier_index - 1],
        xp_into_level=total_xp % LEVEL_XP_STEP,
        xp_for_next_level=LEVEL_XP_STEP,
    )


class AuthorBadge(BaseModel):
    """커뮤니티 목록/댓글에서 닉네임 옆에 붙는 미니 뱃지 - 신원 정보(user_id/닉네임)는 절대
    담지 않고 레벨/티어 표시에 필요한 값만 담는다. 익명 글이면 항상 None이어야 한다(호출부 책임)."""

    level: int
    tier_index: int
    tier_title: str
    tier_color: str


def author_badge_for(total_xp: int) -> AuthorBadge:
    info = compute_level(total_xp)
    return AuthorBadge(level=info.level, tier_index=info.tier_index, tier_title=info.tier_title, tier_color=info.tier_color)


def batch_author_badges(db: Session, user_ids: list[int]) -> dict[int, AuthorBadge]:
    """레벨 뱃지를 목록/댓글 한 줄마다 따로 조회하면 글쓴이 수만큼 쿼리가 늘어난다(N+1) -
    현재 페이지에 실제로 등장하는 유저 id만 모아 total_xp를 단 한 번의 IN 쿼리로 가져온다.
    익명 글쓴이의 user_id는 애초에 이 함수에 넘기지 않는 것이 호출부의 책임이다."""
    from models import User

    unique_ids = list(set(user_ids))
    if not unique_ids:
        return {}
    rows = db.query(User.id, User.total_xp).filter(User.id.in_(unique_ids)).all()
    return {user_id: author_badge_for(total_xp) for user_id, total_xp in rows}


class XpCategory(str, enum.Enum):
    POST_CREATED = "POST_CREATED"  # 커뮤니티 게시글 작성(타인 반응 없이 작성 그 자체)
    COMMENT_CREATED = "COMMENT_CREATED"  # 타인 글에 댓글 작성
    LIKE_RECEIVED = "LIKE_RECEIVED"  # 내 글/댓글이 좋아요를 받음
    COMMENT_RECEIVED = "COMMENT_RECEIVED"  # 내 글에 댓글이 달림
    DIARY_WRITTEN = "DIARY_WRITTEN"  # 밤의 루틴: 일반 일기 작성
    DREAM_DIARY_WRITTEN = "DREAM_DIARY_WRITTEN"  # 아침의 루틴: 꿈 일기 작성
    SEED_PLANTED = "SEED_PLANTED"  # 무의식 씨앗 심기
    SEED_BLOOMED = "SEED_BLOOMED"  # 씨앗 개화(AI 해몽 완료)
    DEW_GIVEN = "DEW_GIVEN"  # 무의식의 정원 - 타인에게 이슬 주기
    DEW_RECEIVED = "DEW_RECEIVED"  # 무의식의 정원 - 내 정원이 이슬을 받음


XP_AMOUNTS: dict[XpCategory, int] = {
    XpCategory.POST_CREATED: 5,
    XpCategory.COMMENT_CREATED: 10,
    XpCategory.LIKE_RECEIVED: 10,
    XpCategory.COMMENT_RECEIVED: 15,
    XpCategory.DIARY_WRITTEN: 10,
    XpCategory.DREAM_DIARY_WRITTEN: 10,
    XpCategory.SEED_PLANTED: 20,
    XpCategory.SEED_BLOOMED: 20,
    XpCategory.DEW_GIVEN: 5,
    XpCategory.DEW_RECEIVED: 5,
}

# 콘텐츠 "양"으로 도배할 수 있는 자기 행동 XP(글/댓글 작성)만 하루 합산 상한을 둔다.
DAILY_CAPPED_CATEGORIES = {XpCategory.POST_CREATED, XpCategory.COMMENT_CREATED}
DAILY_XP_CAP = 50

# 타인의 순수한 반응(좋아요/댓글 받음, 이슬 주고받기)은 상한이 없다 - 이슬은 (giver, recipient,
# 날짜) DB 유니크 제약으로 이미 "하루 한 명당 한 번"이 보장되므로 XP 쪽에서 따로 제한할 필요가 없다.
UNCAPPED_CATEGORIES = {
    XpCategory.LIKE_RECEIVED,
    XpCategory.COMMENT_RECEIVED,
    XpCategory.DEW_GIVEN,
    XpCategory.DEW_RECEIVED,
}

# 개인 루틴(일기/씨앗)은 "하루 1회"만 지급 - 총량 상한이 아니라 카테고리별 존재 여부 체크다.
DAILY_DEDUP_CATEGORIES = {
    XpCategory.DIARY_WRITTEN,
    XpCategory.DREAM_DIARY_WRITTEN,
    XpCategory.SEED_PLANTED,
    XpCategory.SEED_BLOOMED,
}


def today_start_utc() -> datetime:
    """KST 자정을 UTC로 환산한 시각 - "오늘" 경계 판정의 단일 기준선."""
    now_kst = datetime.now(KST)
    start_kst = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_kst.astimezone(timezone.utc)


def today_kst() -> PyDate:
    return datetime.now(KST).date()


def award_xp(db: Session, user_id: int, category: XpCategory) -> int:
    """카테고리별 규칙(하루 합산 상한 / 하루 1회 / 무제한)을 적용해 XP를 지급하고,
    실제로 지급된 양(0일 수 있다)을 반환한다. 지급이 일어나면 XpAward 원장에 기록하고
    User.total_xp를 함께 갱신한다 - 항상 이 함수를 통해서만 total_xp가 바뀌어야 한다.
    User/XpAward 임포트는 함수 안에서 한다 - models.py는 leveling.py를 몰라도 되지만
    leveling.py는 라우터들과 함께 models.py에 의존하므로, 모듈 최상단 임포트로 두면
    두 모듈을 어떤 순서로 먼저 로드하느냐에 따라 순환 임포트가 생길 수 있다."""
    from models import User, XpAward

    base_amount = XP_AMOUNTS[category]
    day_start = today_start_utc()

    if category in DAILY_DEDUP_CATEGORIES:
        already_awarded_today = (
            db.query(XpAward)
            .filter(XpAward.user_id == user_id, XpAward.category == category.value, XpAward.created_at >= day_start)
            .first()
            is not None
        )
        if already_awarded_today:
            return 0
        amount = base_amount
    elif category in DAILY_CAPPED_CATEGORIES:
        today_capped_total = (
            db.query(func.coalesce(func.sum(XpAward.amount), 0))
            .filter(
                XpAward.user_id == user_id,
                XpAward.category.in_([c.value for c in DAILY_CAPPED_CATEGORIES]),
                XpAward.created_at >= day_start,
            )
            .scalar()
        )
        amount = max(min(base_amount, DAILY_XP_CAP - today_capped_total), 0)
        if amount == 0:
            return 0
    else:
        amount = base_amount

    db.add(XpAward(user_id=user_id, category=category.value, amount=amount))
    db.query(User).filter(User.id == user_id).update({User.total_xp: User.total_xp + amount})
    db.commit()
    return amount
