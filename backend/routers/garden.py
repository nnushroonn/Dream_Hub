"""무의식의 정원: 유저가 개화시킨 씨앗(식물)을 모아 전시하는 소셜 페이지.

GET    /api/garden/me           - 내 정원 (항상 나에게는 공개 여부와 무관하게 보인다)
GET    /api/garden/{nickname}   - 타인의 정원 (is_galaxy_public이 꺼져 있으면 소유자 본인 외 접근 차단)
POST   /api/garden/{nickname}/dew - 하루 한 번, 타인의 정원에 이슬을 준다
POST   /api/garden/pin/{seed_id} - 정원 대표 꽃으로 고정
DELETE /api/garden/pin           - 대표 꽃 고정 해제
GET    /api/garden/compendium    - 내 도감(일반 39종 + 전설 6종, 미발견은 실루엣)
"""

from typing import Literal

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from flower_taxonomy import ARCHETYPES, LEGENDARY_INFO, LEGENDARY_PRIORITY, NEW_GENUS_SPECIES, NEW_SPECIES_COUNT
from leveling import AuthorBadge, XpCategory, author_badge_for, award_xp, today_kst
from models import (
    DreamEntry,
    DreamRecallStatus,
    DreamSeed,
    DreamStatus,
    EmotionCategory,
    GardenDew,
    NotificationTargetType,
    NotificationType,
    SeedStatus,
    Specimen,
    User,
)
from routers.auth import get_current_user, get_current_user_optional
from routers.notifications import create_notification

router = APIRouter(prefix="/api/garden", tags=["garden"])

GENERAL_SPECIES_COUNT = sum(len(archetype.species) for archetype in ARCHETYPES) + NEW_SPECIES_COUNT  # 24 + 15 = 39
LEGENDARY_COUNT = len(LEGENDARY_PRIORITY)  # 6


class GardenBloomEntry(BaseModel):
    id: int
    seed_type: EmotionCategory
    bloomed_at: str
    dream_entry_id: int | None
    dream_title: str | None
    # 그날 꿈 일기의 감정 기록 - 프론트가 이 값으로 꽃 색상을 정한다. 아직 개화 전(seed 단계)이면 없다.
    emotion: str | None = None
    # "seed"(심었지만 아직 개화 전 - 새싹) / "bloom"(개화 완료 - 만개) / "forgotten"("꿈이
    # 기억나지 않아요"를 명시적으로 선택 - 정식 꽃 대신 새싹 표본) 세 단계를 정원에 그린다.
    # 꿈으로 이어지지 못하고 시든 씨앗(RESTING, 명시적 선택 없이 그냥 지나간 경우)은 보여줄
    # 실체가 없어 애초에 제외한다.
    stage: Literal["seed", "bloom", "forgotten"]
    # AI가 붙인 원본 태그(예: "#전연인") - 상세 관찰 모달의 태그/희귀도 산정에 쓴다.
    # 아직 개화 전이거나 AI 해몽 없이 저장된 기록이면 빈 리스트.
    tags: list[str] = []
    # --- 꽃 도감 분류(flower_taxonomy.py) - 개화(bloom) 단계에서만 채워진다. ---
    genus: str | None = None
    archetype: str | None = None
    species_name: str | None = None
    flower_name: str | None = None
    is_legendary: bool = False
    legendary_key: str | None = None
    # 전체 유저 기준 이 종의 발생 빈도로 매긴 희귀도(1~3성) - 전설의 꽃은 항상 3.
    rarity: int | None = None
    # 이 유저의 도감에서 이 종을 처음 피운 개체인지.
    is_first_discovery: bool = False
    # "성장의 반짝임" 배지 - 마음 기록장(깊이 모드)에서 부정 감정으로 시작해 긍정 감정으로
    # 마무리한 날에만 True. 종(species_name)/희귀도(rarity)와는 완전히 무관한 별도 표시라,
    # 이 값이 True/False라고 해서 위 두 필드가 달라지지 않는다.
    growth_badge: bool = False


class SpecimenSummary(BaseModel):
    id: int
    sequence_number: int
    # "표본 No.3"처럼 완성된 이름을 서버가 내려준다 - 프론트가 순번으로 직접 조합하지 않는다.
    name: str
    # 유저가 고르거나 AI가 추론한 감정 - 부가 정보로만 보여준다(이름/분류에는 미반영).
    emotion: str | None = None
    tags: list[str] = []
    dream_entry_id: int | None = None
    dream_title: str | None = None
    created_at: str


class GardenProfileResponse(BaseModel):
    is_public: bool
    nickname: str | None = None
    badge: AuthorBadge | None = None
    total_bloom_count: int = 0
    blooms: list[GardenBloomEntry] = []
    is_owner: bool = False
    already_gave_dew_today: bool = False
    # 이 정원 주인이 대표로 고정해 둔 꽃(DreamSeed.id) - blooms 안의 한 항목을 가리킨다.
    # 고정한 적 없으면 None(프론트는 이때 대표 꽃 영역을 아예 숨긴다).
    pinned_seed_id: int | None = None
    # "떠돌이 표본" - AI 해몽 빠른 진입(정식 루틴 미완료)의 산출물. 꽃 그리드/도감 완성률
    # 집계와는 완전히 분리된 별도 컬렉션이라, 소유자 본인에게만 내려준다(타인 정원 조회 시 빈 배열).
    specimens: list[SpecimenSummary] = []
    specimen_count: int = 0


def _compute_rarity_tiers(db: Session) -> dict[str, int]:
    """전체 유저 기준 종(species_name)별 개화 빈도로 희귀도(1~3성)를 매긴다 - 배치 작업 없이
    조회 시점에 그때그때 계산한다. 전설의 꽃은 항상 3성 고정이라 이 집계에서 뺀다."""
    rows = (
        db.query(DreamSeed.species_name, func.count(DreamSeed.id))
        .filter(
            DreamSeed.status == SeedStatus.BLOOMING,
            DreamSeed.is_legendary.is_(False),
            DreamSeed.species_name.isnot(None),
        )
        .group_by(DreamSeed.species_name)
        .all()
    )
    total = sum(count for _, count in rows)
    tiers: dict[str, int] = {}
    for species_name, count in rows:
        share = (count / total) if total else 0
        tiers[species_name] = 3 if share < 0.15 else 2 if share < 0.4 else 1
    return tiers


def _compute_first_discovery_ids(db: Session, user_id: int) -> set[int]:
    """이 유저의 도감에서 각 종(species_name, 전설이면 legendary_key)별로 가장 먼저 핀
    개체의 DreamSeed.id 집합 - "첫 발견" 배지에 쓴다."""
    rows = (
        db.query(DreamSeed.id, DreamSeed.species_name, DreamSeed.legendary_key)
        .filter(DreamSeed.user_id == user_id, DreamSeed.status == SeedStatus.BLOOMING, DreamSeed.species_name.isnot(None))
        .order_by(DreamSeed.planted_at.asc(), DreamSeed.id.asc())
        .all()
    )
    seen: set[str] = set()
    first_ids: set[int] = set()
    for seed_id, species_name, legendary_key in rows:
        dedup_key = legendary_key or species_name
        if dedup_key not in seen:
            seen.add(dedup_key)
            first_ids.add(seed_id)
    return first_ids


def _build_blooms(db: Session, user_id: int, *, owner_view: bool = True) -> list[GardenBloomEntry]:
    """정원에 뿌릴 식물 목록 - 개화까지 끝난 씨앗(BLOOMING)은 만개한 꽃으로, 아직 심어만
    두고 개화하지 않은 씨앗(PLANTED)은 새싹으로 함께 보여준다. planted_at 최신순.

    owner_view=False(방문자 시점, get_public_garden에서만 씀)면 dream_title/emotion/tags를
    실제로 status==PUBLIC인 꿈에서만 채운다 - is_galaxy_public은 "은하계 프로필(집계 비율)을
    보여줄지"만 결정하는 계정 단위 토글이라, 그걸로 개별적으로 비공개 처리한 꿈의 제목/감정/
    AI 태그까지 새 나가면 안 된다. 매칭이 안 되는 dream_entry_id는 기존 삭제된 꿈과 똑같이
    None/[]로 조용히 빠진다(BloomTile이 이미 그 경우를 빈 값으로 처리). 방문자 시점에는
    제목도 원본(title)이 아니라 공개용(public_title or title)으로 바꿔치기한다 - dreams.py
    _to_response의 redact_for_public과 같은 규칙: 공개 처리된 꿈이라도 유저가 원본과 다른
    공개용 제목을 따로 지어뒀다면(예: 원본에 실명이 들어있어 공개용으로 다시 지은 경우) 그
    의도를 정원 페이지에서도 지켜야 한다."""
    seeds = (
        db.query(DreamSeed)
        .filter(DreamSeed.user_id == user_id, DreamSeed.status.in_([SeedStatus.BLOOMING, SeedStatus.PLANTED]))
        .order_by(DreamSeed.planted_at.desc())
        .all()
    )
    dream_ids = [seed.bloomed_dream_entry_id for seed in seeds if seed.bloomed_dream_entry_id is not None]
    dream_rows: dict[int, tuple[str, str, dict | None]] = {}
    if dream_ids:
        query = db.query(
            DreamEntry.id, DreamEntry.title, DreamEntry.public_title, DreamEntry.emotion, DreamEntry.interpretation
        ).filter(DreamEntry.id.in_(dream_ids))
        if not owner_view:
            query = query.filter(DreamEntry.status == DreamStatus.PUBLIC)
        dream_rows = {
            row[0]: ((row[2] or row[1]) if not owner_view else row[1], row[3], row[4]) for row in query.all()
        }

    def _tags_for(dream_entry_id: int | None) -> list[str]:
        if dream_entry_id is None or dream_entry_id not in dream_rows:
            return []
        interpretation = dream_rows[dream_entry_id][2]
        if not interpretation:
            return []
        return interpretation.get("tags", [])

    rarity_tiers = _compute_rarity_tiers(db)
    first_discovery_ids = _compute_first_discovery_ids(db, user_id)

    return [
        GardenBloomEntry(
            id=seed.id,
            seed_type=seed.seed_type,
            bloomed_at=seed.planted_at.isoformat(),
            dream_entry_id=seed.bloomed_dream_entry_id,
            dream_title=dream_rows[seed.bloomed_dream_entry_id][0] if seed.bloomed_dream_entry_id in dream_rows else None,
            emotion=dream_rows[seed.bloomed_dream_entry_id][1] if seed.bloomed_dream_entry_id in dream_rows else None,
            stage=(
                "bloom"
                if seed.status == SeedStatus.BLOOMING
                else "forgotten" if seed.dream_recall_status == DreamRecallStatus.FORGOTTEN else "seed"
            ),
            tags=_tags_for(seed.bloomed_dream_entry_id),
            genus=seed.genus,
            archetype=seed.archetype,
            species_name=seed.species_name,
            flower_name=seed.flower_name,
            is_legendary=seed.is_legendary,
            legendary_key=seed.legendary_key,
            rarity=3 if seed.is_legendary else rarity_tiers.get(seed.species_name) if seed.species_name else None,
            is_first_discovery=seed.id in first_discovery_ids,
            growth_badge=seed.growth_badge,
        )
        for seed in seeds
    ]


def _build_specimens(db: Session, user_id: int) -> list[SpecimenSummary]:
    """"떠돌이 표본" 목록 - 최신 순번부터. DreamSeed/도감 체계와는 완전히 분리된 컬렉션이라
    별도 쿼리로 조회한다."""
    rows = db.query(Specimen).filter(Specimen.user_id == user_id).order_by(Specimen.sequence_number.desc()).all()
    dream_ids = [row.dream_entry_id for row in rows if row.dream_entry_id is not None]
    titles: dict[int, str] = {}
    if dream_ids:
        titles = dict(db.query(DreamEntry.id, DreamEntry.title).filter(DreamEntry.id.in_(dream_ids)).all())
    return [
        SpecimenSummary(
            id=row.id,
            sequence_number=row.sequence_number,
            name=f"표본 No.{row.sequence_number}",
            emotion=row.emotion,
            tags=row.tags,
            dream_entry_id=row.dream_entry_id,
            dream_title=titles.get(row.dream_entry_id) if row.dream_entry_id is not None else None,
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]


@router.get("/me", response_model=GardenProfileResponse)
def get_my_garden(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GardenProfileResponse:
    blooms = _build_blooms(db, current_user.id)
    specimens = _build_specimens(db, current_user.id)
    return GardenProfileResponse(
        is_public=True,
        nickname=current_user.nickname,
        badge=author_badge_for(current_user.total_xp),
        # blooms에는 아직 개화 전인 새싹(seed 단계)도 섞여 있어, "총 개화한 식물"이라는 문구와
        # 맞도록 실제로 만개(bloom)한 것만 센다.
        total_bloom_count=sum(1 for entry in blooms if entry.stage == "bloom"),
        blooms=blooms,
        is_owner=True,
        pinned_seed_id=current_user.pinned_seed_id,
        specimens=specimens,
        specimen_count=len(specimens),
    )


class CompendiumEntry(BaseModel):
    # "general_2_1"처럼 발견 여부와 무관하게 항상 안정적인 슬롯 식별자 - 실제 종 이름은
    # 여기 절대 담지 않는다(미발견 항목에서 이 값만으로 정체를 유추할 수 없어야 한다).
    slot_id: str
    category: Literal["general", "legendary"]
    # 일반 항목은 미발견이어도 어떤 원형(관계/재회형 등)인지는 보여준다 - 숨기는 건 정확한
    # 종 이름/이미지뿐이다("실루엣 처리"). 전설은 미발견이면 이 필드도 비워 완전한 "???"로 만든다.
    archetype: str | None = None
    discovered: bool
    # 아래는 discovered=True일 때만 채워진다(미발견 실루엣은 전부 None).
    species_name: str | None = None
    example_name: str | None = None
    # 파라메트릭 SVG 아이콘(FlowerIcon)의 색상 결정에 쓴다 - 대표 개체(가장 먼저 발견한 것)의
    # 속을 그대로 노출한다(이미 다른 필드들도 대표 개체 기준이라 같은 규칙).
    genus: str | None = None
    rarity: int | None = None
    first_bloomed_at: str | None = None
    count: int = 0
    # 대표 개체(가장 먼저 발견한 것)가 개화할 때 연결된 실제 꿈 기록의 감정 - 프론트가 이
    # 값으로 길몽/보통/흉몽 아우라 색을 정한다(moodBucketForEmoji). 연결된 꿈 기록이 없으면
    # (예: 관리자가 직접 심어준 기록 등) None - 프론트는 이때 "보통" 톤으로 대체한다.
    emotion: str | None = None
    # 전설 미발견 항목에서만 채워지는 은유적 힌트 - 정확한 조건은 절대 노출하지 않는다.
    hint: str | None = None


class CompendiumResponse(BaseModel):
    general_discovered: int
    general_total: int
    legendary_discovered: int
    legendary_total: int
    entries: list[CompendiumEntry]


@router.get("/compendium", response_model=CompendiumResponse)
def get_my_compendium(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> CompendiumResponse:
    """일반 39종(기존 24종[8원형 x 3종] + 신규 15종[환희/냉담/동경 x 5종]) + 전설 6종 =
    45종 전체 도감. 미발견 종은 실루엣용으로
    discovered=false만 내려주고(이름/이미지 비공개), 전설 미발견은 은유적 힌트만 준다."""
    my_blooms = (
        db.query(DreamSeed)
        .filter(DreamSeed.user_id == current_user.id, DreamSeed.status == SeedStatus.BLOOMING, DreamSeed.species_name.isnot(None))
        .order_by(DreamSeed.planted_at.asc())
        .all()
    )
    by_species: dict[str, list[DreamSeed]] = {}
    for seed in my_blooms:
        by_species.setdefault(seed.species_name, []).append(seed)

    # 아우라 색 판정에 쓸 감정 - garden.py의 _build_blooms와 동일하게 bloomed_dream_entry_id로
    # 한 번에 배치 조회한다(종마다 매번 쿼리하지 않는다).
    dream_ids = [seed.bloomed_dream_entry_id for seed in my_blooms if seed.bloomed_dream_entry_id is not None]
    emotion_by_dream_id: dict[int, str] = {}
    if dream_ids:
        emotion_by_dream_id = dict(db.query(DreamEntry.id, DreamEntry.emotion).filter(DreamEntry.id.in_(dream_ids)).all())

    rarity_tiers = _compute_rarity_tiers(db)
    entries: list[CompendiumEntry] = []

    for archetype_index, archetype in enumerate(ARCHETYPES):
        for species_index, species_name in enumerate(archetype.species):
            slot_id = f"general_{archetype_index}_{species_index}"
            owned = by_species.get(species_name, [])
            if owned:
                first = owned[0]
                entries.append(
                    CompendiumEntry(
                        slot_id=slot_id,
                        category="general",
                        archetype=archetype.key,
                        discovered=True,
                        species_name=species_name,
                        example_name=first.flower_name,
                        genus=first.genus,
                        rarity=rarity_tiers.get(species_name, 1),
                        first_bloomed_at=first.planted_at.isoformat(),
                        count=len(owned),
                        emotion=emotion_by_dream_id.get(first.bloomed_dream_entry_id),
                    )
                )
            else:
                entries.append(
                    CompendiumEntry(slot_id=slot_id, category="general", archetype=archetype.key, discovered=False)
                )

    # 신규 3속(환희/냉담/동경) 전용 종 15개 - ARCHETYPES.species 풀에는 없고 NEW_GENUS_SPECIES에
    # 따로 있어(genus 5->8 확장 시 그렇게 설계했다), 위 루프가 못 잡는다. 슬롯 id는 원형 인덱스
    # 대신 (속, 원형 키)로 안정적으로 만든다 - 발견 여부와 무관하게 항상 같은 slot_id를 내야
    # 하는 규칙은 위와 동일하다.
    for genus_name, archetype_species in NEW_GENUS_SPECIES.items():
        for archetype_key, species_name in archetype_species.items():
            slot_id = f"general_new_{genus_name}_{archetype_key}"
            owned = by_species.get(species_name, [])
            if owned:
                first = owned[0]
                entries.append(
                    CompendiumEntry(
                        slot_id=slot_id,
                        category="general",
                        archetype=archetype_key,
                        discovered=True,
                        species_name=species_name,
                        example_name=first.flower_name,
                        genus=first.genus,
                        rarity=rarity_tiers.get(species_name, 1),
                        first_bloomed_at=first.planted_at.isoformat(),
                        count=len(owned),
                        emotion=emotion_by_dream_id.get(first.bloomed_dream_entry_id),
                    )
                )
            else:
                entries.append(CompendiumEntry(slot_id=slot_id, category="general", archetype=archetype_key, discovered=False))

    for legendary_index, legendary_key in enumerate(LEGENDARY_PRIORITY):
        slot_id = f"legendary_{legendary_index}"
        owned = by_species.get(legendary_key, [])
        if owned:
            first = owned[0]
            entries.append(
                CompendiumEntry(
                    slot_id=slot_id,
                    category="legendary",
                    discovered=True,
                    species_name=legendary_key,
                    example_name=first.flower_name,
                    genus=first.genus,
                    rarity=3,
                    first_bloomed_at=first.planted_at.isoformat(),
                    count=len(owned),
                    emotion=emotion_by_dream_id.get(first.bloomed_dream_entry_id),
                )
            )
        else:
            entries.append(
                CompendiumEntry(
                    slot_id=slot_id, category="legendary", discovered=False, hint=LEGENDARY_INFO[legendary_key]["hint"]
                )
            )

    return CompendiumResponse(
        general_discovered=sum(1 for e in entries if e.category == "general" and e.discovered),
        general_total=GENERAL_SPECIES_COUNT,
        legendary_discovered=sum(1 for e in entries if e.category == "legendary" and e.discovered),
        legendary_total=LEGENDARY_COUNT,
        entries=entries,
    )


@router.get("/{nickname}", response_model=GardenProfileResponse)
def get_public_garden(
    nickname: str,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> GardenProfileResponse:
    owner = db.query(User).filter(User.nickname == nickname).first()
    if owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="유저를 찾을 수 없습니다.")

    is_owner = current_user is not None and current_user.id == owner.id
    if not owner.is_galaxy_public and not is_owner:
        return GardenProfileResponse(is_public=False)

    blooms = _build_blooms(db, owner.id, owner_view=is_owner)
    # "떠돌이 표본"은 소유자 본인에게만 보여준다 - 정식 루틴을 완료하지 못한 빠른 진입
    # 결과물이라, 남의 정원을 구경하는 방문자에게까지 노출할 전시물은 아니다.
    specimens = _build_specimens(db, owner.id) if is_owner else []
    already_gave = False
    if current_user is not None and not is_owner:
        already_gave = (
            db.query(GardenDew)
            .filter(
                GardenDew.giver_id == current_user.id,
                GardenDew.recipient_id == owner.id,
                GardenDew.given_date == today_kst(),
            )
            .first()
            is not None
        )

    return GardenProfileResponse(
        is_public=True,
        nickname=owner.nickname,
        badge=author_badge_for(owner.total_xp),
        total_bloom_count=sum(1 for entry in blooms if entry.stage == "bloom"),
        blooms=blooms,
        is_owner=is_owner,
        already_gave_dew_today=already_gave,
        pinned_seed_id=owner.pinned_seed_id,
        specimens=specimens,
        specimen_count=len(specimens),
    )


@router.post("/{nickname}/dew", status_code=status.HTTP_201_CREATED)
def give_dew(
    nickname: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    recipient = db.query(User).filter(User.nickname == nickname).first()
    if recipient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="유저를 찾을 수 없습니다.")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="자신의 정원에는 이슬을 줄 수 없습니다.")
    if not recipient.is_galaxy_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="비공개된 무의식 은하입니다.")

    db.add(GardenDew(giver_id=current_user.id, recipient_id=recipient.id, given_date=today_kst()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="오늘은 이미 이슬을 주셨어요.")

    create_notification(
        db,
        user_id=recipient.id,
        actor_id=current_user.id,
        actor_is_anonymous=False,
        type_=NotificationType.DEW,
        target_type=NotificationTargetType.GARDEN,
        target_id=current_user.id,
        preview_text=f"{current_user.nickname}님이 당신의 정원에 이슬을 주고 갔어요 \U0001f4a7",
    )
    award_xp(db, current_user.id, XpCategory.DEW_GIVEN)
    award_xp(db, recipient.id, XpCategory.DEW_RECEIVED)
    return {"success": True}


@router.post("/pin/{seed_id}", response_model=GardenProfileResponse)
def pin_flower(
    seed_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GardenProfileResponse:
    """정원 대표 꽃으로 고정한다 - 내 소유의 이미 개화(BLOOMING)한 씨앗만 고를 수 있다."""
    seed = (
        db.query(DreamSeed)
        .filter(DreamSeed.id == seed_id, DreamSeed.user_id == current_user.id, DreamSeed.status == SeedStatus.BLOOMING)
        .first()
    )
    if seed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="이미 개화한 내 꽃 중에서만 고정할 수 있어요.")

    current_user.pinned_seed_id = seed.id
    db.commit()

    blooms = _build_blooms(db, current_user.id)
    specimens = _build_specimens(db, current_user.id)
    return GardenProfileResponse(
        is_public=True,
        nickname=current_user.nickname,
        badge=author_badge_for(current_user.total_xp),
        total_bloom_count=sum(1 for entry in blooms if entry.stage == "bloom"),
        blooms=blooms,
        is_owner=True,
        pinned_seed_id=current_user.pinned_seed_id,
        specimens=specimens,
        specimen_count=len(specimens),
    )


@router.delete("/pin", response_model=GardenProfileResponse)
def unpin_flower(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GardenProfileResponse:
    """대표 꽃 고정을 해제한다."""
    current_user.pinned_seed_id = None
    db.commit()

    blooms = _build_blooms(db, current_user.id)
    specimens = _build_specimens(db, current_user.id)
    return GardenProfileResponse(
        is_public=True,
        nickname=current_user.nickname,
        badge=author_badge_for(current_user.total_xp),
        total_bloom_count=sum(1 for entry in blooms if entry.stage == "bloom"),
        blooms=blooms,
        is_owner=True,
        pinned_seed_id=None,
        specimens=specimens,
        specimen_count=len(specimens),
    )
