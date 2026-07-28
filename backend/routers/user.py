"""로그인한 유저 자신의 프로필(꿈 페르소나 닉네임/아바타 오라)과 활동 통계·업적 뱃지."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import CommunityComment, CommunityPost, CommunityPostReaction, DreamEntry, DreamStatus, Interaction, InteractionType, User
from routers.auth import get_current_user
from schemas import AuraUpdateInput, ProfileUpdateInput, UserResponse, UserStatsResponse

router = APIRouter(prefix="/api/user", tags=["user"])


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


# --- 레벨/업적 뱃지: 전부 실제 활동 데이터에서 매 요청마다 다시 계산한다 (저장된 값이 아님) ---

# (누적 포인트 하한, 레벨 타이틀) - 오름차순. 포인트가 해당 하한을 넘긴 가장 높은 단계가 현재 레벨.
_LEVEL_TIERS: list[tuple[int, str]] = [
    (0, "무의식 탐험 초심자"),
    (20, "꿈결 산책자"),
    (50, "루시드 러너"),
    (100, "심연의 항해사"),
    (200, "무의식의 현자"),
]


def _compute_level(points: int) -> tuple[int, str]:
    level, title = 1, _LEVEL_TIERS[0][1]
    for index, (threshold, name) in enumerate(_LEVEL_TIERS):
        if points >= threshold:
            level, title = index + 1, name
    return level, title


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

    points = dream_count * 10 + public_dream_count * 5 + empathy_received * 3 + post_count * 5 + comment_count * 2
    level, level_title = _compute_level(points)

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
        "badges": badges,
    }
