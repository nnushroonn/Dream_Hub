"""소셜/자각몽 강화: 꿈 도플갱어 알림 / 꿈 상징 사전 / 리얼리티 체크 푸시 /
AI 꿈 표식(Dream Sign) 분석 / 자각몽 전용 태그 (더미 데이터).
"""

from fastapi import APIRouter

router = APIRouter(prefix="/lucid", tags=["lucid"])


@router.get("/doppelganger")
def get_doppelganger_alert():
    # TODO: 실제 구현 시 유사 꿈(임베딩 유사도 등)을 꾼 다른 유저 매칭 로직으로 대체
    return {
        "matched": True,
        "similar_dream_count": 3,
        "message": "최근 24시간 동안 3명이 당신과 비슷한 꿈을 꿨어요!",
    }


@router.get("/dictionary")
def get_dream_symbol_dictionary():
    return {
        "symbols": [
            {"keyword": "물", "meaning": "감정의 흐름과 무의식을 상징합니다."},
            {"keyword": "비행", "meaning": "자유에 대한 갈망을 의미합니다."},
        ]
    }


@router.post("/reality-check/schedule")
def schedule_reality_check():
    # TODO: 실제 구현 시 User.bedtime/wake_time 기반 푸시 알림 스케줄링으로 대체
    return {"scheduled": True, "next_push_at": "2026-07-21T22:30:00Z"}


@router.get("/dream-signs")
def get_dream_signs():
    # TODO: 실제 구현 시 유저의 과거 꿈 기록을 분석한 반복 표식(Dream Sign) 추출 로직으로 대체
    return {
        "signs": [
            {"pattern": "이빨이 빠짐", "occurrences": 6},
            {"pattern": "날 수 있음", "occurrences": 4},
        ]
    }
