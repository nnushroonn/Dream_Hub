"""꿈 기록소 CRUD: 로그인한 유저 소유의 꿈 일기를 실제 DB에 생성/조회/수정/삭제한다.

AI 해몽(POST /api/dream-interpretation)은 별도로 비로그인 상태에서도 미리보기를 계산할 수 있게
그대로 두고, 여기서는 그 결과를 "저장"하는 단계부터 로그인을 요구한다. 프론트엔드는
해몽 결과와 6단계 위저드 응답 원본을 함께 보내고, 서버는 그 값을 그대로 저장했다가
수정 모드 프리필과 상세 보기에 재사용한다.
"""

from datetime import date as PyDate, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import DreamEntry, DreamStatus, User
from routers.ai_interpretation import CounselingReportInput, DreamSurveyInput
from routers.auth import get_current_user

router = APIRouter(prefix="/api/dreams", tags=["dreams"])


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


class DreamEntryInput(BaseModel):
    dream_date: PyDate
    title: str
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
    survey: DreamSurveyInput
    interpretation: AiInterpretationPayload


class DreamEntryResponse(BaseModel):
    id: int
    dream_date: PyDate
    title: str
    emotion: str
    summary: str
    is_public: bool
    is_anonymous: bool
    share_with_ai_analysis: bool
    share_caption: str | None
    is_lucid: bool
    survey: DreamSurveyInput
    interpretation: AiInterpretationPayload
    created_at: datetime
    updated_at: datetime


def _to_response(entry: DreamEntry) -> DreamEntryResponse:
    return DreamEntryResponse(
        id=entry.id,
        dream_date=entry.dream_date,
        title=entry.title,
        emotion=entry.emotion,
        summary=entry.summary,
        is_public=entry.status == DreamStatus.PUBLIC,
        is_anonymous=entry.is_anonymous,
        share_with_ai_analysis=entry.share_with_ai_analysis,
        share_caption=entry.share_caption,
        is_lucid=entry.is_lucid,
        survey=entry.survey,
        interpretation=entry.interpretation,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def _apply_input(entry: DreamEntry, payload: DreamEntryInput) -> None:
    entry.dream_date = payload.dream_date
    entry.title = payload.title
    entry.emotion = payload.emotion
    entry.summary = payload.summary
    entry.is_anonymous = payload.is_anonymous
    entry.share_with_ai_analysis = payload.share_with_ai_analysis
    entry.share_caption = (payload.share_caption or "").strip() or None
    entry.survey = payload.survey.model_dump()
    entry.interpretation = payload.interpretation.model_dump()
    entry.is_lucid = payload.survey.is_lucid
    entry.status = DreamStatus.PUBLIC if payload.is_public else DreamStatus.PRIVATE


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
def get_public_dream(dream_id: int, db: Session = Depends(get_db)):
    """커뮤니티 상세 페이지용 익명 공개 조회 - 로그인 불필요. 소유자 정보는 응답에 담기지
    않으므로(_to_response에 user_id가 없음) 그대로 반환해도 '익명의 탐험가' 컨셉이 유지된다.
    PUBLIC 상태가 아닌 글은 존재 자체를 노출하지 않기 위해 404로 통일한다."""
    entry = (
        db.query(DreamEntry)
        .filter(DreamEntry.id == dream_id, DreamEntry.status == DreamStatus.PUBLIC)
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공개된 꿈 기록을 찾을 수 없습니다.")
    entry.view_count += 1
    db.commit()
    db.refresh(entry)
    return _to_response(entry)


@router.post("", response_model=DreamEntryResponse, status_code=status.HTTP_201_CREATED)
def create_dream(
    payload: DreamEntryInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 하루에 여러 개의 꿈을 기록할 수 있으므로, 같은 날짜라도 항상 새 레코드를 만든다.
    entry = DreamEntry(user_id=current_user.id)
    _apply_input(entry, payload)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _to_response(entry)


@router.put("/{dream_id}", response_model=DreamEntryResponse)
def update_dream(
    dream_id: int,
    payload: DreamEntryInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _get_owned_entry(dream_id, current_user, db)
    _apply_input(entry, payload)
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
