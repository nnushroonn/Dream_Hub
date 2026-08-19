"""꿈 기록소 CRUD: 로그인한 유저 소유의 꿈 일기를 실제 DB에 생성/조회/수정/삭제한다.

AI 해몽(POST /api/dream-interpretation)은 별도로 비로그인 상태에서도 미리보기를 계산할 수 있게
그대로 두고, 여기서는 그 결과를 "저장"하는 단계부터 로그인을 요구한다. 프론트엔드는
해몽 결과와 6단계 위저드 응답 원본을 함께 보내고, 서버는 그 값을 그대로 저장했다가
수정 모드 프리필과 상세 보기에 재사용한다.
"""

from datetime import date as PyDate, datetime, timedelta, timezone
from typing import Literal

import redis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db, get_redis
from emotion_wordbook import emotion_category_for_emoji
from flower_taxonomy import classify_flower
from leveling import AuthorBadge, XpCategory, author_badge_for, award_xp
from models import (
    DreamEntry,
    DreamRecallStatus,
    DreamSeed,
    DreamStatus,
    EmotionCategory,
    EntryType,
    Interaction,
    InteractionType,
    SeedStatus,
    Specimen,
    User,
)
from routers.ai_interpretation import (
    CounselingReportInput,
    DreamSurveyInput,
    build_quick_system_prompt,
    request_interpretation,
)
from routers.auth import get_current_user, get_current_user_optional
from routers.garden import _compute_rarity_tiers
from view_tracking import should_count_view

router = APIRouter(prefix="/api/dreams", tags=["dreams"])

# 글쓰기 화면에서 유저가 직접 입력할 수 있는 꿈 상징 해시태그 최대 개수.
MAX_DREAM_TAGS = 5

# 자유 게시판(POST_EDIT_WINDOW, routers/community.py)과 동일하게, 무의식 피드에 공개된 채로
# "내용"을 고치는 것만 게시 후 10분까지만 허용한다. 비공개로 되돌리는 것(retract)은 자유
# 게시판의 "삭제"에 대응하는 안전장치라 시간과 무관하게 항상 허용하고, 아직 비공개인 개인
# 일기장 수정(/diary, /journal)도 이 제한과 무관하다 - 아래 update_dream에서 "현재도
# 공개 상태이고 공개를 유지하는" 요청일 때만 이 창을 적용한다.
DREAM_POST_EDIT_WINDOW = timedelta(minutes=10)


class AiInterpretationPayload(BaseModel):
    tags: list[str]
    description: str
    selected_expert: str
    expert_badge: str
    expert_insight: str
    lucky_item: str
    lucky_item_reason: str
    lucky_number: int
    lucky_number_reason: str
    # 이 필드가 없으면 Pydantic이 조용히 잘라내 버려, 프론트가 보낸 counseling_report가
    # DB에 아예 저장되지 않는다 - 실제로 발생했던 버그라 Optional로 두어 레거시 데이터
    # 재저장 시에도 에러 없이 통과시키되, 있으면 반드시 그대로 보존한다.
    counseling_report: CounselingReportInput | None = None


class AttachedFlowerPayload(BaseModel):
    seed_id: int
    species_name: str
    flower_name: str
    genus: str | None = None
    # 파라메트릭 SVG 아이콘(FlowerIcon)이 원형(모양) 결정에 쓴다 - 없으면(이 필드 도입 전
    # 스냅샷) 프론트가 기본 실루엣으로 대체한다.
    archetype: str | None = None
    is_legendary: bool
    legendary_key: str | None = None
    rarity: int
    dex_number: int


class DreamEntryInput(BaseModel):
    # "꿈 날짜 = 취침일" 규칙(models.DreamEntry.dream_date 주석 참고) - 아침에 기록해도 그 꿈을
    # 꾸기 위해 잠들었던 전날 밤 날짜를 그대로 보내야 한다. 프론트의 날짜 확인 UI(DreamDateConfirm)
    # 가 기본값을 이 규칙대로 계산해 준다.
    dream_date: PyDate
    title: str
    # 감정일기/꿈일기 실제 타입 - AI 해몽(interpretation) 유무로 유추하지 않는다. 꿈해몽 사전
    # 연계 저장처럼 진짜 꿈일기인데도 해몽 없이 저장되는 경우가 있어, 이 화면(일기장/꿈 기록
    # 모달/커뮤니티 글쓰기)이 항상 명시적으로 어떤 타입인지 정해 보내야 한다.
    entry_type: EntryType
    # "quick_interpret"이면 감정일기->수면->꿈일기(4단계 정식 루틴) 없이 상단 "AI 해몽" 버튼으로
    # 곧장 받은 결과라는 뜻이다 - 이 경우 정원의 꽃(30종 분류) 대신 "표본"으로 남긴다
    # (_create_specimen). 일기장의 꿈 기록 모달(빠른/정밀 모드 모두)은 정식 루틴에 속하므로
    # 기본값 그대로 "normal"을 보낸다.
    origin: Literal["normal", "quick_interpret"] = "normal"
    # 무의식 광장 "꽃" 탭 전용 - 공유할 내 정원 꽃(DreamSeed.id)을 고르면 채워진다. 나머지
    # 콘텐츠 타입(감정일기/꿈일기/꿈해몽분석)은 항상 비워 둔다.
    attached_flower_seed_id: int | None = None
    # 커뮤니티(무의식 광장) 전용 제목 - 공유 화면/공개 글 수정에서만 보내고, 나만의 일기장의
    # 일반 수정 화면은 이 필드 자체를 아예 보내지 않는다(model_fields_set으로 구분한다) -
    # 그래야 일기장에서 평범하게 수정 저장을 눌러도 이미 설정된 공개 제목이 조용히 사라지지 않는다.
    public_title: str | None = None
    emotion: str
    # 목록 화면용 한 줄 요약. 프론트가 Step 1~4 칩 텍스트를 조합해 만들어 보낸다 (AI 재호출 없음).
    summary: str = ""
    is_public: bool = False
    # 아래 셋은 is_public=False면 의미 없지만, 나중에 공개로 전환할 때를 대비해 항상 받아 저장한다.
    is_anonymous: bool = True
    share_with_ai_analysis: bool = False
    # 꿈 내용 자체와는 별개로, 공유하면서 덧붙이는 한마디(질문/자랑거리 등) - 무의식 피드
    # 카드 상단에 노출된다. 300자 제한은 DB 컬럼(String(300))과 맞춘다.
    share_caption: str | None = None
    # 현실 일기 전용 사진 첨부 - 별도 업로드 서버 없이 프론트가 base64 data URL을 그대로 보낸다.
    photo_url: str | None = None
    survey: DreamSurveyInput
    # 무의식 광장 "직접 쓰기" 모드에서 AI 해몽을 건너뛰고 게시할 수 있어 Optional이다.
    interpretation: AiInterpretationPayload | None = None
    # 유저가 글쓰기 화면에서 직접 입력한 태그 - AI가 interpretation 안에 자동으로 붙여주던
    # 태그를 대신해, 커뮤니티 노출/필터링은 이제 이 필드만 쓴다.
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def _limit_tag_count(cls, value: list[str]) -> list[str]:
        if len(value) > MAX_DREAM_TAGS:
            raise ValueError(f"태그는 최대 {MAX_DREAM_TAGS}개까지 등록할 수 있습니다.")
        return value


def _display_name(user: User, is_anonymous: bool) -> str | None:
    """is_anonymous면 None(프론트가 '익명의 탐험가'로 표시). 아니면 회원가입 때 정한
    꿈 페르소나 닉네임을 그대로 쓴다. community.py의 동명 헬퍼와 동일한 규칙."""
    return None if is_anonymous else user.nickname


class DreamEntryResponse(BaseModel):
    id: int
    dream_date: PyDate
    title: str
    entry_type: EntryType
    public_title: str | None = None
    emotion: str
    summary: str
    is_public: bool
    is_anonymous: bool
    share_with_ai_analysis: bool
    share_caption: str | None
    photo_url: str | None = None
    is_lucid: bool
    lucid_level: str
    control_level: str | None = None
    survey: DreamSurveyInput
    interpretation: AiInterpretationPayload | None = None
    attached_flower: AttachedFlowerPayload | None = None
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime
    # 익명이면 None(프론트가 "익명의 탐험가"로 표시) - 실제 user_id/이메일은 담기지 않는다.
    author_display_name: str | None = None
    author_badge: AuthorBadge | None = None
    # 공개 상세 조회(get_public_dream)에서만 실제 값이 채워진다 - 소유자 전용 CRUD 응답(목록/생성/
    # 수정)에서는 굳이 계산하지 않고 기본값(0/None)을 그대로 둔다.
    upvote_count: int = 0
    downvote_count: int = 0
    my_vote: Literal["up", "down"] | None = None
    # 공개 상세 조회(get_public_dream)에서만 실제 값이 채워진다 - 목록/생성/수정 응답은 0.
    view_count: int = 0
    # 내가 쓴 꿈인지 - 공개 상세 조회(get_public_dream)에서만 실제로 계산한다. 소유자 전용
    # CRUD 응답(목록/생성/수정)은 애초에 항상 내 것이므로 True를 그대로 둔다.
    is_mine: bool = True
    # 이 기록의 생성으로 어젯밤 심어둔 씨앗이 개화했다면 그 씨앗 종류. create_dream에서만
    # 실제로 계산되고, 그 외 응답(수정/조회)에서는 항상 None이다.
    bloomed_seed_type: EmotionCategory | None = None


# "마음 기록장"(감정일기 깊이 모드) 전용 필드 - DreamSurveyInput 주석 참고. 꿈일기(entry_type
# =dream)는 이 필드들을 절대 채우지 않으므로 정상적으로 공개 공유되는 꿈에는 원래 전부 비어
# 있지만, 감정일기가 실수로(또는 API를 직접 호출해) is_public=True로 저장되는 경우까지
# 방어하기 위해 공개/익명 응답에서는 명시적으로 걷어낸다. 공개 꿈 상세(AttachedDreamViewer.
# buildDreamOriginalContent, frontend/src/api/dream.ts)가 실제로 읽는 필드(space_detail/
# target_detail/action_detail/reality_detail/final_memo/title)와는 전혀 겹치지 않으므로,
# 이 필드들을 걷어내도 정상적인 "공개된 꿈 원문 보기" 기능에는 아무 영향이 없다.
GUIDED_DIARY_ONLY_SURVEY_FIELDS = (
    "initial_emotion",
    "initial_emotion_category",
    "trigger_event",
    "desire",
    "message_to_other",
    "desired_message",
    "self_compassion",
    "closing_emotion",
    "closing_emotion_category",
)


def redact_survey_for_public(survey: dict) -> dict:
    redacted = dict(survey)
    for field in GUIDED_DIARY_ONLY_SURVEY_FIELDS:
        redacted[field] = None
    return redacted


def _to_response(
    entry: DreamEntry,
    upvote_count: int = 0,
    downvote_count: int = 0,
    my_vote: Literal["up", "down"] | None = None,
    is_mine: bool = True,
    bloomed_seed_type: EmotionCategory | None = None,
    author_badge: AuthorBadge | None = None,
    redact_for_public: bool = False,
) -> DreamEntryResponse:
    """redact_for_public=True는 익명/공개 조회 경로(get_public_dream) 전용이다 - 로그인한
    소유자가 자기 글을 보는 경로(list/create/update/analyze/delete)는 항상 기본값 False로
    호출해 원본 그대로 돌려준다. True면 세 가지를 가린다:
    (1) title을 비공개 원본이 아니라 공개용 제목(public_title or title)으로 바꿔치기한다
        (community.py의 무의식 피드가 이미 쓰는 것과 같은 규칙) - 원본 title 값 자체는
        공개 응답 어디에도 담기지 않는다.
    (2) share_with_ai_analysis가 꺼져 있으면 interpretation(counseling_report 포함)을
        아예 뺀다 - "AI 분석 공유"에 동의하지 않았는데도 상세 조회 엔드포인트로 직접
        접근하면 전체 해몽이 새 나가던 문제를 막는다.
    (3) survey에서 "마음 기록장"(감정일기 깊이 모드) 전용 필드만 걷어낸다
        (GUIDED_DIARY_ONLY_SURVEY_FIELDS) - 꿈일기는 원래 이 필드들을 채우지 않으므로
        정상적인 공개 공유에는 영향이 없고, 감정일기가 실수로 공개 처리된 경우만 막는다."""
    return DreamEntryResponse(
        id=entry.id,
        dream_date=entry.dream_date,
        title=(entry.public_title or entry.title) if redact_for_public else entry.title,
        entry_type=entry.entry_type,
        public_title=entry.public_title,
        emotion=entry.emotion,
        summary=entry.summary,
        is_public=entry.status == DreamStatus.PUBLIC,
        is_anonymous=entry.is_anonymous,
        share_with_ai_analysis=entry.share_with_ai_analysis,
        share_caption=entry.share_caption,
        photo_url=entry.photo_url,
        is_lucid=entry.is_lucid,
        lucid_level=entry.lucid_level,
        control_level=entry.control_level,
        survey=redact_survey_for_public(entry.survey) if redact_for_public else entry.survey,
        interpretation=(
            (entry.interpretation if entry.share_with_ai_analysis else None) if redact_for_public else entry.interpretation
        ),
        attached_flower=entry.attached_flower,
        tags=entry.tags,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        author_display_name=_display_name(entry.user, entry.is_anonymous),
        author_badge=author_badge,
        upvote_count=upvote_count,
        downvote_count=downvote_count,
        my_vote=my_vote,
        view_count=entry.view_count,
        bloomed_seed_type=bloomed_seed_type,
        is_mine=is_mine,
    )


def _apply_input(entry: DreamEntry, payload: DreamEntryInput) -> None:
    entry.dream_date = payload.dream_date
    entry.title = payload.title
    entry.entry_type = payload.entry_type
    # public_title은 요청에 실제로 그 키가 있을 때만 건드린다(model_fields_set) - 나만의
    # 일기장의 평범한 수정 저장은 이 필드를 아예 안 보내므로, 그때는 기존 공개 제목을
    # 그대로 둔다. 공유 화면/공개 글 수정 화면만 명시적으로 이 값을 보낸다.
    if "public_title" in payload.model_fields_set:
        entry.public_title = (payload.public_title or "").strip() or None
    entry.emotion = payload.emotion
    entry.summary = payload.summary
    entry.is_anonymous = payload.is_anonymous
    # AI 해몽이 아예 없으면 "AI 해몽 결과도 공개"라는 선택 자체가 성립하지 않는다 - 프론트가
    # 실수로 true를 보내도 여기서 강제로 무효화한다.
    entry.share_with_ai_analysis = payload.share_with_ai_analysis if payload.interpretation is not None else False
    entry.share_caption = (payload.share_caption or "").strip() or None
    entry.photo_url = payload.photo_url
    entry.survey = payload.survey.model_dump()
    entry.interpretation = payload.interpretation.model_dump() if payload.interpretation is not None else None
    entry.tags = payload.tags
    entry.is_lucid = payload.survey.lucid_level != "none"
    entry.lucid_level = payload.survey.lucid_level
    entry.control_level = payload.survey.control_level
    entry.status = DreamStatus.PUBLIC if payload.is_public else DreamStatus.PRIVATE


def _build_attached_flower_snapshot(db: Session, current_user: User, seed_id: int) -> dict:
    """공유 시점에 정원 꽃의 이름/희귀도/도감 번호를 스냅샷으로 굳힌다 - garden.py의
    희귀도 계산(_compute_rarity_tiers)과 정원 페이지의 도감 번호 매기기(개화 순번) 규칙을
    그대로 재사용해, 정원에서 보던 값과 공유 글의 카드가 서로 다르지 않게 한다."""
    seed = (
        db.query(DreamSeed)
        .filter(
            DreamSeed.id == seed_id,
            DreamSeed.user_id == current_user.id,
            DreamSeed.status == SeedStatus.BLOOMING,
        )
        .first()
    )
    if seed is None or not seed.species_name or not seed.flower_name:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공유할 수 있는 꽃을 찾을 수 없습니다.")

    rarity = 3 if seed.is_legendary else _compute_rarity_tiers(db).get(seed.species_name, 1)

    own_bloom_ids = (
        db.query(DreamSeed.id)
        .filter(
            DreamSeed.user_id == current_user.id,
            DreamSeed.status == SeedStatus.BLOOMING,
            DreamSeed.species_name.isnot(None),
        )
        .order_by(DreamSeed.planted_at.asc(), DreamSeed.id.asc())
        .all()
    )
    dex_number = next((index + 1 for index, (row_id,) in enumerate(own_bloom_ids) if row_id == seed.id), 1)

    return {
        "seed_id": seed.id,
        "species_name": seed.species_name,
        "flower_name": seed.flower_name,
        "genus": seed.genus,
        # 파라메트릭 SVG 아이콘 시스템(FlowerIcon)이 원형(모양) 결정에 쓴다 - 예전엔 이모지
        # 문자열 하나면 충분해서 스냅샷에 없었지만, 이제 "속(색) x 원형(모양)"을 코드가
        # 조합해 그리므로 archetype이 없으면 공유 카드가 기본 실루엣으로만 나온다.
        "archetype": seed.archetype,
        "is_legendary": seed.is_legendary,
        "legendary_key": seed.legendary_key,
        "rarity": rarity,
        "dex_number": dex_number,
    }


def _get_owned_entry(dream_id: int, current_user: User, db: Session) -> DreamEntry:
    entry = (
        db.query(DreamEntry)
        .filter(DreamEntry.id == dream_id, DreamEntry.user_id == current_user.id)
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="꿈 기록을 찾을 수 없습니다.")
    return entry


@router.get("", response_model=list[DreamEntryResponse])
def list_dreams(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entries = (
        db.query(DreamEntry)
        .filter(DreamEntry.user_id == current_user.id)
        # 같은 날짜에 여러 건이 있을 수 있어, 날짜 내림차순 + 작성 순서(오름차순)로 정렬해
        # 프론트엔드가 탭 순서를 다시 계산할 필요 없이 그대로 쓸 수 있게 한다.
        .order_by(DreamEntry.dream_date.desc(), DreamEntry.created_at.asc())
        .all()
    )
    return [_to_response(entry) for entry in entries]


@router.get("/public/{dream_id}", response_model=DreamEntryResponse)
def get_public_dream(
    dream_id: int,
    request: Request,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
):
    """커뮤니티 상세 페이지용 익명 공개 조회 - 로그인 불필요. 소유자 정보는 응답에 담기지
    않으므로(_to_response에 user_id가 없음) 그대로 반환해도 '익명의 탐험가' 컨셉이 유지된다.
    PUBLIC 상태가 아닌 글은 존재 자체를 노출하지 않기 위해 404로 통일한다.

    무의식 피드가 리스트형으로 바뀌면서 좋아요/싫어요 투표 UI가 이 상세 페이지로만 옮겨왔기
    때문에, 여기서도 community.py의 dream-feed 목록과 동일하게 투표 집계를 계산해 내려준다."""
    entry = (
        db.query(DreamEntry)
        .filter(DreamEntry.id == dream_id, DreamEntry.status == DreamStatus.PUBLIC)
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공개된 꿈 기록을 찾을 수 없습니다.")

    identity = f"user:{current_user.id}" if current_user else f"ip:{request.client.host if request.client else 'unknown'}"
    if should_count_view(redis_client, "dream", dream_id, identity):
        entry.view_count += 1
        db.commit()
        db.refresh(entry)

    upvote_count = (
        db.query(Interaction)
        .filter(Interaction.dream_entry_id == dream_id, Interaction.type == InteractionType.LIKE)
        .count()
    )
    downvote_count = (
        db.query(Interaction)
        .filter(Interaction.dream_entry_id == dream_id, Interaction.type == InteractionType.DISLIKE)
        .count()
    )
    my_vote: Literal["up", "down"] | None = None
    if current_user is not None:
        my_interaction = (
            db.query(Interaction)
            .filter(
                Interaction.dream_entry_id == dream_id,
                Interaction.user_id == current_user.id,
                Interaction.type.in_([InteractionType.LIKE, InteractionType.DISLIKE]),
            )
            .first()
        )
        if my_interaction is not None:
            my_vote = "up" if my_interaction.type == InteractionType.LIKE else "down"

    is_mine = current_user is not None and entry.user_id == current_user.id
    author_badge = None if entry.is_anonymous else author_badge_for(entry.user.total_xp)
    # 이 엔드포인트로 조회하는 사람이 실제로 이 글의 주인이면(로그인해서 자기 글을 다시 보는
    # 경우) 가릴 이유가 없다 - is_mine=False인 진짜 방문자에게만 redact_for_public을 켠다.
    return _to_response(
        entry, upvote_count, downvote_count, my_vote, is_mine, author_badge=author_badge, redact_for_public=not is_mine
    )


def _bloom_pending_seed(entry: DreamEntry, current_user: User, db: Session) -> EmotionCategory | None:
    """AI 해몽이 포함된 꿈 기록이 막 생성됐다 - 그 꿈이 귀속되는 밤(entry.dream_date, "꿈
    날짜 = 취침일" 규칙)에 정확히 심어둔 PLANTED 씨앗이 있으면 이 기록에 연결하며 개화시킨다.

    예전엔 entry.dream_date를 아예 안 보고 "가장 최근 PLANTED 씨앗"을 무조건 골랐다 -
    "오늘 씨앗 심고 오늘 바로 꿈을 기록하는" 흔한 흐름(이때는 planted_at도 dream_date도
    똑같이 오늘이라 문제가 없었다)을 위한 것이었는데, "꿈이 기억나지 않아요"(FORGOTTEN)
    기능이 생기면서 그 가정이 깨졌다 - FORGOTTEN 씨앗은 routers.seeds._sync_status가
    RESTING 전환을 건너뛰어 PLANTED로 기약 없이 남아있을 수 있어, 여러 날짜의 FORGOTTEN
    씨앗이 동시에 존재하는 상태에서 "가장 최근" 하나만 고르면 뒤늦게 기억난 며칠 전 꿈이
    엉뚱하게 더 최근 날짜의(여전히 기억 안 나는) 씨앗에 붙어버리는 문제가 있었다. 그래서
    지금은 entry.dream_date와 planted_at이 정확히 일치하는 씨앗만 찾는다 - 사용자가 이미
    날짜 확인 UI(defaultDreamDateInputValue 등)에서 "이 꿈이 어느 밤의 것인지" 직접
    확정해서 보내주므로, 그 값을 그대로 신뢰하면 된다.

    정확히 그 날짜의 PLANTED 씨앗이 없으면(심어둔 씨앗이 아예 없는 '야생화' 케이스, 또는
    그 날짜의 화분이 이미 BLOOMING/RESTING으로 확정된 경우 등) 빈 정원 카드를 남기지 않도록
    그 자리에서 즉시 씨앗을 entry.dream_date에 만들어 곧바로 개화시킨다 - 이 씨앗은 PLANTED
    단계를 거치지 않으므로 SEED_PLANTED XP는 지급하지 않는다. seed_type은 별도의 8번째
    "바람이 물어온 씨앗" 값이 아니라, flower_taxonomy.classify_flower가 genus를 결정할 때
    쓰는 것과 같은 폴백(감정일기가 없으면 꿈 자체의 무드 이모지로 대체)을 그대로 따라
    emotion_category_for_emoji(entry.emotion)로 7개 대분류 중 하나로 채운다.

    하루(user_id, planted_at)당 화분은 정확히 하나만 존재해야 한다는 불변식을 DB 유니크
    제약으로 강제해 뒀다 - 그래서 그 날짜에 PLANTED 씨앗이 없다고 해서 무조건 새로 만들면
    안 된다. 그 날짜의 화분이 이미 다른 꿈 기록으로 개화된 뒤, 같은 날짜로 두 번째 꿈
    일기를 쓰는 경우(화분이 이미 BLOOMING/RESTING으로 존재)라면 새 화분을 만들지 않고
    그냥 씨앗 없이 넘어간다 - 그 날의 화분은 이미 하나로 확정됐기 때문이다."""
    if entry.interpretation is None:
        return None
    seed = (
        db.query(DreamSeed)
        .filter(
            DreamSeed.user_id == current_user.id,
            DreamSeed.status == SeedStatus.PLANTED,
            DreamSeed.planted_at == entry.dream_date,
        )
        .first()
    )
    if seed is None:
        already_has_pot_for_date = (
            db.query(DreamSeed)
            .filter(DreamSeed.user_id == current_user.id, DreamSeed.planted_at == entry.dream_date)
            .first()
            is not None
        )
        if already_has_pot_for_date:
            return None
        seed = DreamSeed(
            user_id=current_user.id,
            seed_type=EmotionCategory(emotion_category_for_emoji(entry.emotion)),
            status=SeedStatus.PLANTED,
            planted_at=entry.dream_date,
        )
        db.add(seed)
    seed.status = SeedStatus.BLOOMING
    # 이 씨앗이 전에 "꿈이 기억나지 않아요"로 표시돼 있었더라도(FORGOTTEN), 지금 실제로 꿈일기가
    # 들어왔다는 건 결국 기억해냈다는 뜻이다 - REMEMBERED로 되돌려 새싹 표본 대신 정식 꽃으로
    # 정상 개화한다(status==PLANTED 조건은 위 쿼리에서 이미 걸려 있어 FORGOTTEN 씨앗도 항상
    # 여기서 찾아진다 - routers.seeds._sync_status가 FORGOTTEN인 동안 RESTING 전환을 건너뛰기
    # 때문).
    seed.dream_recall_status = DreamRecallStatus.REMEMBERED
    seed.bloomed_dream_entry_id = entry.id
    # flower_taxonomy가 seed.id를 의사난수 시드로 쓰므로, 새로 만든 행이면 먼저 flush해
    # id를 확정해 둔다(신규 WIND 폴백이 아니면 이미 존재하던 행이라 flush 없이도 id가 있다).
    db.flush()
    classify_flower(db, current_user, seed, entry)
    db.commit()
    award_xp(db, current_user.id, XpCategory.SEED_BLOOMED)
    return seed.seed_type


def _create_specimen(entry: DreamEntry, current_user: User, db: Session) -> None:
    """AI 해몽 빠른 진입(origin="quick_interpret") 결과 - 정식 루틴을 거치지 않았으므로
    DreamSeed/flower_taxonomy는 전혀 건드리지 않고, 유저별 순번만 매긴 "표본"으로 남긴다.
    감정일기가 없어 해몽 자체가 없는 저장(순수 다이어리)은 표본으로 남길 산출물이 없으므로
    _bloom_pending_seed와 동일하게 건너뛴다."""
    if entry.interpretation is None:
        return
    next_sequence = (
        db.query(func.coalesce(func.max(Specimen.sequence_number), 0))
        .filter(Specimen.user_id == current_user.id)
        .scalar()
        or 0
    ) + 1
    db.add(
        Specimen(
            user_id=current_user.id,
            dream_entry_id=entry.id,
            sequence_number=next_sequence,
            # 유저가 직접 고르거나 AI가 추론한 감정 - 이름/분류에는 절대 반영하지 않고 부가
            # 정보로만 저장한다.
            emotion=entry.emotion or None,
            tags=entry.interpretation.get("tags", []),
        )
    )
    db.commit()


@router.post("", response_model=DreamEntryResponse, status_code=status.HTTP_201_CREATED)
def create_dream(
    payload: DreamEntryInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 하루에 여러 개의 꿈을 기록할 수 있으므로, 같은 날짜라도 항상 새 레코드를 만든다.
    entry = DreamEntry(user_id=current_user.id)
    _apply_input(entry, payload)
    if payload.attached_flower_seed_id is not None:
        entry.attached_flower = _build_attached_flower_snapshot(db, current_user, payload.attached_flower_seed_id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    if entry.attached_flower is None:
        # 꽃 공유 글은 일기/꿈 기록이 아니라 이미 개화한 꽃을 다시 게시하는 것뿐이라 - 이미
        # 그 꽃이 필 때 SEED_BLOOMED XP를 받았으므로 여기서 또 DIARY류 XP를 주지 않는다.
        # 밤의 루틴(일반 일기)과 아침의 루틴(꿈일기)은 같은 엔드포인트를 쓰지만 entry_type으로
        # 갈라 서로 다른 XP 카테고리를 지급한다 - AI 해몽 유무로 유추하지 않는다(해몽 없이
        # 저장되는 진짜 꿈일기도 있다). 하루 1회 제한은 award_xp 내부에서 카테고리별로 처리된다.
        diary_category = (
            XpCategory.DREAM_DIARY_WRITTEN if entry.entry_type == EntryType.DREAM else XpCategory.DIARY_WRITTEN
        )
        award_xp(db, current_user.id, diary_category)
    # 빠른 진입(origin="quick_interpret")은 정식 루틴(씨앗 심기->발아->개화)을 거치지 않았으므로
    # 정원의 꽃 대신 표본으로 남긴다 - DreamSeed 체계는 전혀 건드리지 않는다.
    if payload.origin == "quick_interpret":
        _create_specimen(entry, current_user, db)
        bloomed_seed_type = None
    else:
        bloomed_seed_type = _bloom_pending_seed(entry, current_user, db)
    return _to_response(entry, bloomed_seed_type=bloomed_seed_type)


@router.put("/{dream_id}", response_model=DreamEntryResponse)
def update_dream(
    dream_id: int,
    payload: DreamEntryInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _get_owned_entry(dream_id, current_user, db)
    if (
        entry.status == DreamStatus.PUBLIC
        and payload.is_public
        and datetime.now(timezone.utc) - entry.created_at > DREAM_POST_EDIT_WINDOW
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="게시 후 10분이 지나 더 이상 수정할 수 없습니다.")
    _apply_input(entry, payload)
    db.commit()
    db.refresh(entry)
    return _to_response(entry)


@router.post("/{dream_id}/interpretation", response_model=DreamEntryResponse)
def analyze_existing_dream(
    dream_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """해몽 없이 저장된 기록(나만의 일기장 등)에 사후적으로 AI 해몽을 붙인다. 이미 해몽이
    있는 기록은 재해몽 대상이 아니므로 막는다 - 이 기능은 "없던 걸 채우는" 용도다."""
    entry = _get_owned_entry(dream_id, current_user, db)
    if entry.interpretation is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 AI 해몽이 있는 기록이에요.")

    static_block, data_block = build_quick_system_prompt(entry.title, entry.survey.get("action_detail", ""))
    result = request_interpretation(static_block, data_block)
    entry.interpretation = AiInterpretationPayload(**result).model_dump()
    db.commit()
    db.refresh(entry)
    return _to_response(entry)


@router.delete("/{dream_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dream(
    dream_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _get_owned_entry(dream_id, current_user, db)
    db.delete(entry)
    db.commit()
