"""꿈 기록소: 꿈 작성 폼 / AI 해몽 모달 (더미 데이터)."""

from fastapi import APIRouter

router = APIRouter(prefix="/diary", tags=["diary"])


@router.get("/entries")
def list_entries():
    return {
        "entries": [
            {
                "id": 1,
                "content": "높은 곳에서 떨어지는 꿈을 꿨다.",
                "emotion": "😨",
                "is_public": False,
                "is_lucid": False,
                "created_at": "2026-07-20T23:10:00Z",
            }
        ]
    }


@router.post("/entries")
def create_entry():
    # TODO: 실제 구현 시 DreamEntry 생성 로직 (content, emotion, is_public 등)으로 대체
    return {
        "id": 2,
        "content": "(더미) 방금 작성한 꿈",
        "emotion": "😴",
        "is_public": False,
        "is_lucid": False,
        "created_at": "2026-07-21T09:00:00Z",
    }


@router.post("/entries/{entry_id}/interpret")
def interpret_entry(entry_id: int):
    # TODO: 실제 구현 시 LLM 호출 결과(의미/상징/행운요소)로 대체
    return {
        "entry_id": entry_id,
        "meaning": "이 꿈은 통제력을 잃는 것에 대한 두려움을 상징합니다.",
        "symbols": ["추락", "높이", "두려움"],
        "lucky_element": "오늘은 파란색 아이템을 곁에 두세요.",
    }
