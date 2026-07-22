"""꿈 기록소: 꿈 작성 폼 / AI 해몽 / 별자리 캘린더 / 출석 스트릭 (더미 데이터)."""

import calendar as calendar_module
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/diary", tags=["diary"])

KST = timezone(timedelta(hours=9))


class DreamEntryInput(BaseModel):
    date: str | None = None
    emotion: str | None = None
    content: str | None = None
    is_public: bool | None = None


@router.get("/streak")
def get_streak():
    """출석 스트릭: 연속 기록 일수와 오늘 출석 여부(더미 데이터)."""
    return {"streak_days": 7, "checked_in_today": True}


# 꿈 별자리 캘린더용 더미 기록 (day -> (기분 버킷, 꿈 제목 한 줄 요약)).
_CALENDAR_ENTRIES: dict[int, tuple[str, str]] = {
    2: ("neutral", "낯선 도시에서 길을 헤매던 꿈"),
    5: ("nightmare", "어두운 계단을 한없이 내려가던 꿈"),
    8: ("good", "그리운 사람과 다시 만난 꿈"),
    11: ("good", "새처럼 하늘을 날아다닌 꿈"),
    14: ("neutral", "시험지를 앞에 두고 멍하니 있던 꿈"),
    17: ("nightmare", "누군가에게 쫓기던 꿈"),
    20: ("good", "바다 위를 걷던 꿈"),
    22: ("neutral", "오래된 집을 서성이던 꿈"),
}


@router.get("/calendar")
def get_calendar():
    """꿈 별자리 캘린더: 이번 달 날짜별 기록(더미 데이터). 기록이 없는 날짜는 목록에서 생략한다."""
    today = datetime.now(KST).date()
    year, month = today.year, today.month
    days_in_month = calendar_module.monthrange(year, month)[1]

    days = [
        {"date": date(year, month, day).isoformat(), "mood": mood, "title": title}
        for day, (mood, title) in _CALENDAR_ENTRIES.items()
        if day <= days_in_month
    ]

    return {
        "month": f"{year:04d}-{month:02d}",
        "days_in_month": days_in_month,
        "days": days,
    }


@router.post("/interpret")
def interpret_dream(payload: DreamEntryInput):
    # TODO: 실제 구현 시 payload.content를 프롬프트로 사용한 LLM 호출 결과로 대체
    return {
        "keywords": ["추락", "통제", "긴장"],
        "meaning": (
            "이 꿈은 현재 삶에서 느끼는 통제력 상실에 대한 무의식의 신호일 수 있어요. "
            "높은 곳에서 떨어지는 감각은 흔히 불안정한 상황이나 관계에 대한 두려움을 상징합니다. "
            "하지만 동시에, 이는 오래된 습관이나 부담을 내려놓고 싶은 마음의 표현이기도 해요. "
            "오늘 하루는 스스로를 다그치기보다 잠시 힘을 빼고 흐름에 몸을 맡겨보는 건 어떨까요."
        ),
        "lucky_item": "은색 열쇠고리",
        "lucky_number": 7,
    }
