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
from routers.ai_interpretation import DreamSurveyInput
from routers.auth import get_current_user

router = APIRouter(prefix="/api/dreams", tags=["dreams"])


class AiInterpretationPayload(BaseModel):
    tags: list[str]
    description: str
    lucky_item: str
    lucky_item_reason: str
    lucky_number: int
    lucky_number_reason: str


class DreamEntryInput(BaseModel):
    dream_date: PyDate
    title: str
    emotion: str
    is_public: bool = False
    survey: DreamSurveyInput
    interpretation: AiInterpretationPayload


class DreamEntryResponse(BaseModel):
    id: int
    dream_date: PyDate
    title: str
    emotion: str
    is_public: bool
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
        is_public=entry.status == DreamStatus.PUBLIC,
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
        .order_by(DreamEntry.dream_date.desc())
        .all()
    )
    return [_to_response(entry) for entry in entries]


@router.post("", response_model=DreamEntryResponse, status_code=status.HTTP_201_CREATED)
def create_dream(
    payload: DreamEntryInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 같은 날짜에 이미 기록이 있으면(uq_dream_entry_user_date) 최신 기록으로 대체한다.
    existing = (
        db.query(DreamEntry)
        .filter(DreamEntry.user_id == current_user.id, DreamEntry.dream_date == payload.dream_date)
        .first()
    )
    entry = existing or DreamEntry(user_id=current_user.id)
    _apply_input(entry, payload)
    if existing is None:
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

    conflict = (
        db.query(DreamEntry)
        .filter(
            DreamEntry.user_id == current_user.id,
            DreamEntry.dream_date == payload.dream_date,
            DreamEntry.id != dream_id,
        )
        .first()
    )
    if conflict is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="해당 날짜에 이미 다른 꿈 기록이 있어요.",
        )

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
