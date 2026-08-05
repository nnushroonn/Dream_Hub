"""로그인한 유저 자신의 프로필(꿈 페르소나 닉네임/아바타 오라)과 활동 통계·업적 뱃지."""

from datetime import date as PyDate, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import CommunityComment, CommunityPost, CommunityPostReaction, DreamEntry, DreamStatus, Interaction, InteractionType, User
from routers.auth import get_current_user
from schemas import AuraUpdateInput, GalaxyVisibilityUpdateInput, ProfileUpdateInput, UserResponse, UserStatsResponse

router = APIRouter(prefix="/api/user", tags=["user"])

KST = timezone(timedelta(hours=9))


@router.patch("/profile", response_model=UserResponse)
def update_profile(
    payload: ProfileUpdateInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    # 자기 자신의 현재 닉네임을 그대로 다시 제출하는 경우(무변경 저장)는 중복으로 치지 않는다.
    existing = (
        db.query(User)
        .filter(User.nickname == payload.nickname, User.id != current_user.id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 닉네임입니다.")

    current_user.nickname = payload.nickname
    db.commit()
    db.refresh(current_user)
    return current_user


@router.patch("/aura", response_model=UserResponse)
def update_aura(
    payload: AuraUpdateInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """마이페이지 아바타 오라 커스텀 - 유저가 직접 고르는 시각적 정체성 토글."""
    current_user.aura_preference = payload.aura_preference
    db.commit()
    db.refresh(current_user)
    return current_user


@router.patch("/galaxy-visibility", response_model=UserResponse)
def update_galaxy_visibility(
    payload: GalaxyVisibilityUpdateInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """커뮤니티 닉네임 호버 카드(무의식 은하 프로필) 공개 여부 - 기본은 비공개다.
    켜는 순간부터만 GET /api/community/profiles/{nickname}/galaxy가 이 유저의 씨앗
    비율·뱃지 집계를 다른 사람에게 보여준다."""
    current_user.is_galaxy_public = payload.is_galaxy_public
    db.commit()
    db.refresh(current_user)
    return current_user


# --- 레벨/업적 뱃지: 전부 실제 활동 데이터에서 매 요청마다 다시 계산한다 (저장된 값이 아님) ---

# (누적 포인트 하한, 레벨 타이틀) - 오름차순. 포인트가 해당 하한을 넘긴 가장 높은 단계가 현재 레벨.
_LEVEL_TIERS: list[tuple[int, str]] = [
    (0, "무의식 탐험 초심자"),
    (20, "꿈결 산책자"),
    (50, "루시드 러너"),
    (100, "심연의 항해사"),
    (200, "무의식의 현자"),
]


# 하루 동안 활동으로 얻을 수 있는 XP 상한 - points는 매 요청마다 실제 활동 데이터에서 다시
# 계산되는 값이라(저장된 컬럼에 더하는 구조가 아니다) "DB에 XP를 가산하지 않는" 것과 실질적으로
# 같은 효과는, 오늘 KST 자정 이후 활동이 만들어낸 포인트 기여분을 총점 계산에서 이 값으로
# 잘라내는 방식으로 구현한다 - 그 이상 활동해도 포인트/레벨에는 더 이상 반영되지 않는다.
DAILY_XP_CAP = 50

# 특정 레벨 구간은 포인트만으로 승급하지 못하게 막는 허들 - {_LEVEL_TIERS 인덱스: (요구 연속
# 일기 작성 일수, 안내 문구)}. 이 앱은 레벨 상한이 5단계뿐이라(Lv 10 없음), 기획 의도(중간 티어 +
# 최고 티어에 허들)를 실제 존재하는 Lv 3(루시드 러너)과 Lv 5(무의식의 현자)에 맞춰 적용한다.
_MILESTONE_REQUIREMENTS: dict[int, tuple[int, str]] = {
    2: (7, "7일 연속 일기 작성 시 승급"),
    4: (7, "7일 연속 일기 작성 시 승급"),
}


def _compute_diary_streak(dream_dates: list[PyDate]) -> int:
    """마이페이지 "연속 일기 작성" 카드와 동일한 정의 - 오늘/어제부터 하루도 빠짐없이 이어진
    구간의 길이. 프론트(mypage/page.tsx의 computeDiaryStreak)와 계산 규칙이 반드시 일치해야 한다."""
    unique_dates = sorted(set(dream_dates), reverse=True)
    if not unique_dates:
        return 0

    today_kst = datetime.now(timezone.utc).astimezone(KST).date()
    if (today_kst - unique_dates[0]).days > 1:
        return 0

    streak = 1
    for prev_date, curr_date in zip(unique_dates, unique_dates[1:]):
        if (prev_date - curr_date).days == 1:
            streak += 1
        else:
            break
    return streak


def _compute_level(
    points: int, diary_streak: int
) -> tuple[int, str, int | None, bool, str | None, int | None]:
    """포인트만으로 도달 가능한 최고 티어를 찾되, _MILESTONE_REQUIREMENTS가 걸린 구간은 조건을
    채우지 못하면 그 앞 단계에서 멈춘다. next_threshold는 잠긴 다음 단계 문턱값을 그대로 남겨
    진행률 바가 100%에서 멈춰 보이게 하고, next_level_locked/requirement로 프론트가 "승급 미션"
    배너를 띄울 수 있게 한다. next_level_streak_goal은 프론트가 문구를 파싱하지 않고도
    "n/7일" 진행률을 그릴 수 있도록 숫자 그대로 함께 내려준다."""
    level, title = 1, _LEVEL_TIERS[0][1]
    next_threshold: int | None = _LEVEL_TIERS[1][0] if len(_LEVEL_TIERS) > 1 else None
    next_level_locked = False
    next_level_requirement: str | None = None
    next_level_streak_goal: int | None = None

    for index, (threshold, name) in enumerate(_LEVEL_TIERS):
        if points < threshold:
            continue
        requirement = _MILESTONE_REQUIREMENTS.get(index)
        if requirement is not None and diary_streak < requirement[0]:
            next_level_locked = True
            next_level_streak_goal, next_level_requirement = requirement
            break
        level, title = index + 1, name
        next_threshold = _LEVEL_TIERS[index + 1][0] if index + 1 < len(_LEVEL_TIERS) else None

    return level, title, next_threshold, next_level_locked, next_level_requirement, next_level_streak_goal


@router.get("/stats", response_model=UserStatsResponse)
def get_user_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    dream_count = db.query(DreamEntry).filter(DreamEntry.user_id == current_user.id).count()
    public_dream_count = (
        db.query(DreamEntry)
        .filter(DreamEntry.user_id == current_user.id, DreamEntry.status == DreamStatus.PUBLIC)
        .count()
    )
    lucid_count = (
        db.query(DreamEntry).filter(DreamEntry.user_id == current_user.id, DreamEntry.is_lucid.is_(True)).count()
    )
    post_count = db.query(CommunityPost).filter(CommunityPost.user_id == current_user.id).count()
    comment_count = db.query(CommunityComment).filter(CommunityComment.user_id == current_user.id).count()

    my_dream_ids = [row[0] for row in db.query(DreamEntry.id).filter(DreamEntry.user_id == current_user.id).all()]
    empathy_on_dreams = (
        db.query(Interaction)
        .filter(Interaction.dream_entry_id.in_(my_dream_ids), Interaction.type == InteractionType.LIKE)
        .count()
        if my_dream_ids
        else 0
    )
    my_post_ids = [row[0] for row in db.query(CommunityPost.id).filter(CommunityPost.user_id == current_user.id).all()]
    empathy_on_posts = (
        db.query(CommunityPostReaction)
        .filter(CommunityPostReaction.post_id.in_(my_post_ids), CommunityPostReaction.is_upvote.is_(True))
        .count()
        if my_post_ids
        else 0
    )
    empathy_received = empathy_on_dreams + empathy_on_posts

    lifetime_points = (
        dream_count * 10 + public_dream_count * 5 + empathy_received * 3 + post_count * 5 + comment_count * 2
    )

    # --- Daily XP Cap: 오늘(KST 자정 이후) 활동만 따로 세어, 그 활동에서 나온 포인트 기여분을
    # DAILY_XP_CAP으로 잘라낸다. 활동 자체를 막지는 않지만 그 이상은 총점에 반영되지 않는다. ---
    today_kst = datetime.now(timezone.utc).astimezone(KST).date()
    midnight_kst = datetime.combine(today_kst, time(0, 0), tzinfo=KST)

    dream_count_today = (
        db.query(DreamEntry)
        .filter(DreamEntry.user_id == current_user.id, DreamEntry.created_at >= midnight_kst)
        .count()
    )
    public_dream_count_today = (
        db.query(DreamEntry)
        .filter(
            DreamEntry.user_id == current_user.id,
            DreamEntry.status == DreamStatus.PUBLIC,
            DreamEntry.created_at >= midnight_kst,
        )
        .count()
    )
    post_count_today = (
        db.query(CommunityPost)
        .filter(CommunityPost.user_id == current_user.id, CommunityPost.created_at >= midnight_kst)
        .count()
    )
    comment_count_today = (
        db.query(CommunityComment)
        .filter(CommunityComment.user_id == current_user.id, CommunityComment.created_at >= midnight_kst)
        .count()
    )
    empathy_on_dreams_today = (
        db.query(Interaction)
        .filter(
            Interaction.dream_entry_id.in_(my_dream_ids),
            Interaction.type == InteractionType.LIKE,
            Interaction.created_at >= midnight_kst,
        )
        .count()
        if my_dream_ids
        else 0
    )
    empathy_on_posts_today = (
        db.query(CommunityPostReaction)
        .filter(
            CommunityPostReaction.post_id.in_(my_post_ids),
            CommunityPostReaction.is_upvote.is_(True),
            CommunityPostReaction.created_at >= midnight_kst,
        )
        .count()
        if my_post_ids
        else 0
    )
    empathy_received_today = empathy_on_dreams_today + empathy_on_posts_today

    points_earned_today = (
        dream_count_today * 10
        + public_dream_count_today * 5
        + empathy_received_today * 3
        + post_count_today * 5
        + comment_count_today * 2
    )
    daily_cap_reached = points_earned_today >= DAILY_XP_CAP
    points = lifetime_points - points_earned_today + min(points_earned_today, DAILY_XP_CAP)

    # --- Milestone Lock: 특정 티어는 포인트 문턱을 넘어도 연속 일기 작성일이 부족하면 승급을 막는다 ---
    diary_dates = [
        row[0]
        for row in db.query(DreamEntry.dream_date)
        .filter(DreamEntry.user_id == current_user.id, DreamEntry.interpretation.is_(None))
        .all()
    ]
    diary_streak = _compute_diary_streak(diary_dates)
    (
        level,
        level_title,
        next_level_threshold,
        next_level_locked,
        next_level_requirement,
        next_level_streak_goal,
    ) = _compute_level(points, diary_streak)

    badges = [
        {"code": "FIRST_LUCID", "label": "첫 자각몽 성공", "emoji": "🌌", "earned": lucid_count >= 1},
        {"code": "DREAM_MASTER", "label": "해몽 마스터", "emoji": "🔮", "earned": dream_count >= 10},
        {
            "code": "COMMUNITY_STAR",
            "label": "커뮤니티 소통왕",
            "emoji": "💬",
            "earned": (post_count + comment_count) >= 5 or empathy_received >= 10,
        },
    ]

    return {
        "dream_count": dream_count,
        "public_dream_count": public_dream_count,
        "lucid_count": lucid_count,
        "post_count": post_count,
        "comment_count": comment_count,
        "empathy_received": empathy_received,
        "level": level,
        "level_title": level_title,
        "points": points,
        "next_level_threshold": next_level_threshold,
        "badges": badges,
        "daily_xp_cap": DAILY_XP_CAP,
        "daily_points_earned": points_earned_today,
        "daily_cap_reached": daily_cap_reached,
        "next_level_locked": next_level_locked,
        "next_level_requirement": next_level_requirement,
        "next_level_streak_goal": next_level_streak_goal,
        "diary_streak": diary_streak,
    }
