"""로그인한 유저 자신의 프로필(꿈 페르소나 닉네임/아바타 오라)과 활동 통계·업적 뱃지."""

from datetime import date as PyDate, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from leveling import (
    DAILY_CAPPED_CATEGORIES,
    DAILY_XP_CAP,
    compute_level,
    today_start_utc,
)
from models import (
    CommunityComment,
    CommunityPost,
    CommunityPostReaction,
    DreamEntry,
    DreamStatus,
    Interaction,
    InteractionType,
    User,
    XpAward,
)
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


# --- 레벨/업적 뱃지 --- 레벨/티어는 User.total_xp(leveling.py)에서 항상 파생 계산하고,
# XP 자체는 award_xp()가 액션이 일어난 그 순간 이미 적립해 둔 값이라 여기서는 조회만 한다.
# 업적 뱃지는 여전히 매 요청마다 실제 활동 데이터에서 다시 계산한다(저장된 값이 아님).


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

    # --- 레벨/티어: User.total_xp(award_xp가 액션 시점에 이미 적립해 둔 값)에서 그대로 파생한다 ---
    level_info = compute_level(current_user.total_xp)

    # --- Daily XP Cap 표시용: 오늘(KST 자정 이후) "작성" 카테고리(글/댓글)로 이미 지급된 XP 합계.
    # 상한 자체는 award_xp가 지급 시점에 이미 적용해 total_xp에 더 이상 새지 않으니, 여기서는
    # "오늘 얼마나 썼는지" 안내용으로만 다시 조회한다. ---
    day_start = today_start_utc()
    daily_capped_xp_earned = (
        db.query(func.coalesce(func.sum(XpAward.amount), 0))
        .filter(
            XpAward.user_id == current_user.id,
            XpAward.category.in_([c.value for c in DAILY_CAPPED_CATEGORIES]),
            XpAward.created_at >= day_start,
        )
        .scalar()
    )
    daily_cap_reached = daily_capped_xp_earned >= DAILY_XP_CAP

    diary_dates = [
        row[0]
        for row in db.query(DreamEntry.dream_date)
        .filter(DreamEntry.user_id == current_user.id, DreamEntry.interpretation.is_(None))
        .all()
    ]
    diary_streak = _compute_diary_streak(diary_dates)

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
        "level": level_info.level,
        "tier_index": level_info.tier_index,
        "tier_title": level_info.tier_title,
        "tier_color": level_info.tier_color,
        "total_xp": level_info.total_xp,
        "xp_into_level": level_info.xp_into_level,
        "xp_for_next_level": level_info.xp_for_next_level,
        "badges": badges,
        "daily_xp_cap": DAILY_XP_CAP,
        "daily_capped_xp_earned": daily_capped_xp_earned,
        "daily_cap_reached": daily_cap_reached,
        "diary_streak": diary_streak,
    }
