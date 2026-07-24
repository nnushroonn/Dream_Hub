"""마이페이지: 꿈 달력 / 무의식 통계 / 스크랩북 (더미 데이터).

뱃지/레벨은 실제 활동 데이터 기반으로 계산돼 routers/user.py의 GET /api/user/stats가 대신 맡는다."""

from fastapi import APIRouter

router = APIRouter(prefix="/mypage", tags=["mypage"])


@router.get("/calendar")
def get_calendar():
    return {
        "days": [
            {"date": "2026-07-19", "emotion": "😊"},
            {"date": "2026-07-20", "emotion": "😨"},
            {"date": "2026-07-21", "emotion": None},
        ]
    }


@router.get("/stats")
def get_unconscious_stats():
    return {
        "top_keywords": [
            {"keyword": "물", "count": 8},
            {"keyword": "가족", "count": 5},
        ],
        "emotion_distribution": {"😊": 40, "😨": 25, "😢": 15, "😴": 20},
        "lucid_dream_ratio": 0.18,
    }


@router.get("/scrapbook")
def get_scrapbook():
    return {
        "entries": [
            {"id": 1, "content": "바다 위를 걷는 꿈", "emotion": "😌", "scrapped_at": "2026-07-15T00:00:00Z"},
        ]
    }

