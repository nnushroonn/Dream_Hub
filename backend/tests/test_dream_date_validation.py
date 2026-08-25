"""꿈 기록 저장(POST/PUT /api/dreams)의 dream_date 검증 순수 로직 테스트 - 미래 날짜는
프론트 캘린더 UI뿐 아니라 API 자체에서도 거부돼야 한다(프론트를 우회해 직접 두드려도
막히도록). DreamEntryInput은 DB 세션 없이도 그대로 생성해 검증을 돌릴 수 있는 순수
Pydantic 모델이라, 이 프로젝트의 다른 파일들처럼 DB 픽스처 없이 여기서 직접 확인한다."""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from pydantic import ValidationError

from leveling import today_kst
from routers.ai_interpretation import DreamSurveyInput
from routers.dreams import DreamEntryInput


def _survey() -> DreamSurveyInput:
    return DreamSurveyInput(
        title="테스트 꿈",
        brightness="밝음",
        space_depth="넓음",
        space_detail="",
        identity_factor="",
        target_detail="",
        action_physics="",
        action_detail="검증용 더미 내용",
        reality_link="",
        reality_detail="",
        vividness=50,
        final_memo="",
    )


def _entry_input(dream_date: date) -> DreamEntryInput:
    return DreamEntryInput(
        dream_date=dream_date,
        title="테스트 꿈",
        entry_type="dream",
        emotion="😌",
        survey=_survey(),
    )


def test_future_dream_date_is_rejected():
    tomorrow = today_kst() + timedelta(days=1)
    with pytest.raises(ValidationError):
        _entry_input(tomorrow)


def test_far_future_dream_date_is_rejected():
    next_year = today_kst() + timedelta(days=365)
    with pytest.raises(ValidationError):
        _entry_input(next_year)


def test_today_dream_date_is_allowed():
    entry = _entry_input(today_kst())
    assert entry.dream_date == today_kst()


def test_past_dream_date_is_allowed():
    # "꿈 날짜 = 취침일" 규칙상 어제 이전 날짜로 저장하는 게 정상 흐름이다(아침에 기록해도
    # 전날 밤 날짜를 그대로 보낸다) - 미래 날짜 거부가 이 정상 흐름까지 막으면 안 된다.
    yesterday = today_kst() - timedelta(days=1)
    entry = _entry_input(yesterday)
    assert entry.dream_date == yesterday
