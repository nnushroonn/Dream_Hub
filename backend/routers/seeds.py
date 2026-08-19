"""무의식 씨앗: '밤에 심기 -> 아침에 상태 확인'의 2단계 라이프사이클.

상태(PLANTED/BLOOMING/RESTING)는 스케줄러 없이 조회 시점마다 지연 계산(lazy sync)한다 -
"다음 날이 지나도록 꿈을 기록하지 않았다"는 사실은 시간이 흐르기만 하면 자동으로 성립하므로,
매번 읽을 때 오늘 날짜와 비교해 필요하면 그 자리에서 RESTING으로 갱신하고 커밋한다.

개화(BLOOMING) 전환은 이 라우터가 아니라 routers.dreams.create_dream이 담당한다 - AI 해몽이
완료된 실제 꿈 기록이 생성되는 그 순간에만 씨앗이 꽃을 피울 수 있기 때문이다.
"""

from datetime import date as PyDate, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from leveling import XpCategory, award_xp
from models import DreamRecallStatus, DreamSeed, EmotionCategory, SeedStatus, User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/seeds", tags=["seeds"])

KST = timezone(timedelta(hours=9))


def _today_kst() -> PyDate:
    return datetime.now(KST).date()


def _sync_status(seed: DreamSeed, today: PyDate) -> None:
    """개화하지 않은 채로 심은 다음 날(planted_at + 1일)이 지나면 휴식 상태로 넘긴다. 다만
    "꿈이 기억나지 않아요"를 명시적으로 선택한 씨앗(dream_recall_status == FORGOTTEN)은
    이 자동 전환에서 제외한다 - 나중에 다시 방문해 꿈일기를 쓰면 언제든(기간 제한 없이)
    정상적으로 개화할 수 있도록 PLANTED 상태를 계속 유지해야 하기 때문이다(routers.dreams.
    _bloom_pending_seed가 PLANTED 상태만 개화 대상으로 찾는다)."""
    if (
        seed.status == SeedStatus.PLANTED
        and seed.dream_recall_status != DreamRecallStatus.FORGOTTEN
        and today > seed.planted_at + timedelta(days=1)
    ):
        seed.status = SeedStatus.RESTING


class DreamSeedResponse(BaseModel):
    id: int
    seed_type: EmotionCategory
    status: SeedStatus
    dream_recall_status: DreamRecallStatus
    planted_at: PyDate
    bloomed_dream_entry_id: int | None = None


class PlantSeedInput(BaseModel):
    seed_type: EmotionCategory


class MarkDreamForgottenInput(BaseModel):
    # 저널 페이지(특정 날짜 카드)와 아침 웰컴 모달(이미 조회해 둔 pending 씨앗) 양쪽 다 이미
    # "어느 날짜"를 다루고 있는지 알고 있으므로, 서버가 "가장 최근 것" 등을 추측하지 않고
    # 명시적으로 받는다.
    planted_at: PyDate


def _to_response(seed: DreamSeed) -> DreamSeedResponse:
    return DreamSeedResponse(
        id=seed.id,
        seed_type=seed.seed_type,
        status=seed.status,
        dream_recall_status=seed.dream_recall_status,
        planted_at=seed.planted_at,
        bloomed_dream_entry_id=seed.bloomed_dream_entry_id,
    )


@router.post("", response_model=DreamSeedResponse, status_code=201)
def plant_seed(
    payload: PlantSeedInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DreamSeedResponse:
    """오늘 밤 씨앗을 심는다. 같은 밤에 마음이 바뀌면(아직 다음 날이 되지 않았다면) 새로
    만들지 않고 종류만 갈아끼운다 - 하룻밤에 씨앗은 하나만 존재한다.

    단, 오늘 화분이 이미 개화(BLOOMING)했거나 휴면(RESTING)에 들어간 뒤라면 seed_type을
    더 이상 바꾸지 않는다 - 그 시점부터는 "마음이 바뀐 것"이 아니라 이미 확정되어 genus/
    species까지 계산이 끝난 씨앗이므로, 종류를 갈아끼우면 화분에 저장된 seed_type과 실제로
    핀 꽃의 분류가 서로 어긋나는 데이터 불일치가 생긴다."""
    today = _today_kst()
    existing = (
        db.query(DreamSeed)
        .filter(DreamSeed.user_id == current_user.id, DreamSeed.planted_at == today)
        .first()
    )
    if existing is not None:
        if existing.status == SeedStatus.PLANTED:
            existing.seed_type = payload.seed_type
            db.commit()
            db.refresh(existing)
            award_xp(db, current_user.id, XpCategory.SEED_PLANTED)  # 이미 오늘 지급됐다면 award_xp가 알아서 0을 돌려준다
        return _to_response(existing)

    seed = DreamSeed(user_id=current_user.id, seed_type=payload.seed_type, status=SeedStatus.PLANTED, planted_at=today)
    db.add(seed)
    db.commit()
    db.refresh(seed)
    award_xp(db, current_user.id, XpCategory.SEED_PLANTED)
    return _to_response(seed)


@router.get("", response_model=list[DreamSeedResponse])
def list_my_seeds(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DreamSeedResponse]:
    """마이페이지 은하계 대시보드가 씨앗 통계(종류별 개수)를 직접 집계할 때 쓰는 원본 목록 -
    /api/community/profiles/{nickname}/galaxy와 달리 공개 여부와 무관하게 항상 내 전체 이력을 본다."""
    today = _today_kst()
    seeds = db.query(DreamSeed).filter(DreamSeed.user_id == current_user.id).order_by(DreamSeed.planted_at.desc()).all()
    changed = False
    for seed in seeds:
        before = seed.status
        _sync_status(seed, today)
        changed = changed or seed.status != before
    if changed:
        db.commit()
    return [_to_response(seed) for seed in seeds]


@router.get("/today", response_model=DreamSeedResponse | None)
def get_tonight_seed(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DreamSeedResponse | None:
    """오늘 밤 이미 심어둔 씨앗이 있으면 그대로 돌려준다 - 저널 화면이 "이미 심음" 상태를 보여줄 때 쓴다."""
    today = _today_kst()
    seed = (
        db.query(DreamSeed)
        .filter(DreamSeed.user_id == current_user.id, DreamSeed.planted_at == today)
        .first()
    )
    return _to_response(seed) if seed else None


@router.get("/pending-check", response_model=DreamSeedResponse | None)
def get_pending_seed_check(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DreamSeedResponse | None:
    """아직 확인하지 않은 "어젯밤 심은 씨앗"이 있으면 돌려준다 - 아침 웰컴 모달 트리거 및
    AI 해몽 결과 화면의 개화 미리보기가 함께 쓰는 단일 소스다. planted_at < today(즉 최소
    하루가 지난) 씨앗만 대상이라, 심은 당일 밤에는 뜨지 않는다. "꿈이 기억나지 않아요"를
    이미 선택한 씨앗(FORGOTTEN)도 제외한다 - 이미 명시적으로 포기 의사를 밝힌 날까지
    아침마다 계속 재촉하지 않기 위해서다(단, PLANTED 상태 자체는 유지되므로 이후 다시
    /journal에서 직접 꿈일기를 쓰는 문은 여전히 열려 있다)."""
    today = _today_kst()
    seeds = (
        db.query(DreamSeed)
        .filter(
            DreamSeed.user_id == current_user.id,
            DreamSeed.status == SeedStatus.PLANTED,
            DreamSeed.dream_recall_status != DreamRecallStatus.FORGOTTEN,
            DreamSeed.planted_at < today,
        )
        .order_by(DreamSeed.planted_at.desc())
        .all()
    )
    if not seeds:
        return None

    latest = seeds[0]
    _sync_status(latest, today)
    db.commit()
    return _to_response(latest) if latest.status == SeedStatus.PLANTED else None


@router.post("/mark-dream-forgotten", response_model=DreamSeedResponse)
def mark_dream_forgotten(
    payload: MarkDreamForgottenInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DreamSeedResponse:
    """다음날 꿈이 전혀 기억나지 않는 것도 실패가 아니라 흔한 결과 중 하나라, "포기"가 아니라
    명시적으로 선택할 수 있게 한다. status는 그대로 PLANTED로 남긴다 - 정식 개화(BLOOMING)
    전환은 여전히 실제로 꿈일기를 쓸 때만 일어나고, 이 엔드포인트는 dream_recall_status만
    FORGOTTEN으로 바꾼다. 그 결과: (1) _sync_status가 더 이상 이 씨앗을 RESTING으로
    자동 전환하지 않아 재작성 기한이 없고, (2) get_pending_seed_check/이 값을 보는 프론트
    "다음 할 일" 안내가 더는 이 날을 재촉하지 않으며, (3) 정원 그리드(routers.garden)에는
    정식 꽃 대신 "새싹 표본"으로 표시된다(species_name이 끝내 채워지지 않으므로 도감 집계
    에서도 자연히 제외된다)."""
    seed = (
        db.query(DreamSeed)
        .filter(DreamSeed.user_id == current_user.id, DreamSeed.planted_at == payload.planted_at)
        .first()
    )
    if seed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="해당 날짜에 심어둔 씨앗이 없습니다.")
    if seed.status != SeedStatus.PLANTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 개화했거나 쉬는 중인 씨앗은 이 처리를 할 수 없습니다.",
        )
    seed.dream_recall_status = DreamRecallStatus.FORGOTTEN
    db.commit()
    db.refresh(seed)
    return _to_response(seed)
