"""꿈 기록소 CRUD: 로그인한 유저 소유의 꿈 일기를 실제 DB에 생성/조회/수정/삭제한다.

AI 해몽(POST /api/dream-interpretation)은 별도로 비로그인 상태에서도 미리보기를 계산할 수 있게
그대로 두고, 여기서는 그 결과를 "저장"하는 단계부터 로그인을 요구한다. 프론트엔드는
해몽 결과와 6단계 위저드 응답 원본을 함께 보내고, 서버는 그 값을 그대로 저장했다가
수정 모드 프리필과 상세 보기에 재사용한다.
"""

from datetime import date as PyDate, datetime
from typing import Literal

import redis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from database import get_db, get_redis
from models import DreamEntry, DreamStatus, Interaction, InteractionType, User
from routers.ai_interpretation import CounselingReportInput, DreamSurveyInput
from routers.auth import get_current_user, get_current_user_optional
from view_tracking import should_count_view

router = APIRouter(prefix="/api/dreams", tags=["dreams"])

# 글쓰기 화면에서 유저가 직접 입력할 수 있는 꿈 상징 해시태그 최대 개수.
MAX_DREAM_TAGS = 5


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
    emotion: str
    summary: str
    is_public: bool
    is_anonymous: bool
    share_with_ai_analysis: bool
    share_caption: str | None
    is_lucid: bool
    survey: DreamSurveyInput
    interpretation: AiInterpretationPayload | None = None
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime
    # 익명이면 None(프론트가 "익명의 탐험가"로 표시) - 실제 user_id/이메일은 담기지 않는다.
    author_display_name: str | None = None
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


def _to_response(
    entry: DreamEntry,
    upvote_count: int = 0,
    downvote_count: int = 0,
    my_vote: Literal["up", "down"] | None = None,
    is_mine: bool = True,
) -> DreamEntryResponse:
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
        tags=entry.tags,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        author_display_name=_display_name(entry.user, entry.is_anonymous),
        upvote_count=upvote_count,
        downvote_count=downvote_count,
        my_vote=my_vote,
        view_count=entry.view_count,
        is_mine=is_mine,
    )


def _apply_input(entry: DreamEntry, payload: DreamEntryInput) -> None:
    entry.dream_date = payload.dream_date
    entry.title = payload.title
    entry.emotion = payload.emotion
    entry.summary = payload.summary
    entry.is_anonymous = payload.is_anonymous
    # AI 해몽이 아예 없으면 "AI 해몽 결과도 공개"라는 선택 자체가 성립하지 않는다 - 프론트가
    # 실수로 true를 보내도 여기서 강제로 무효화한다.
    entry.share_with_ai_analysis = payload.share_with_ai_analysis if payload.interpretation is not None else False
    entry.share_caption = (payload.share_caption or "").strip() or None
    entry.survey = payload.survey.model_dump()
    entry.interpretation = payload.interpretation.model_dump() if payload.interpretation is not None else None
    entry.tags = payload.tags
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
    return _to_response(entry, upvote_count, downvote_count, my_vote, is_mine)


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
