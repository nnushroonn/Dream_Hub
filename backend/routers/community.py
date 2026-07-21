"""커뮤니티: 공개된 꿈 피드 / 공감 버튼 / 키워드 필터링 (더미 데이터)."""

from fastapi import APIRouter

router = APIRouter(prefix="/community", tags=["community"])


@router.get("/feed")
def get_feed():
    return {
        "entries": [
            {
                "id": 1,
                "author_email": "dreamer1@example.com",
                "content": "친구와 함께 우주선을 타고 여행하는 꿈을 꿨어요.",
                "emotion": "😊",
                "keywords": ["우주", "여행", "친구"],
                "empathy_count": 12,
                "is_liked_by_me": False,
            }
        ]
    }


@router.post("/entries/{entry_id}/empathy")
def toggle_empathy(entry_id: int):
    # TODO: 실제 구현 시 Interaction(type=LIKE) 생성/삭제 토글 로직으로 대체
    return {"entry_id": entry_id, "is_liked_by_me": True, "empathy_count": 13}


@router.get("/keywords")
def get_filter_keywords():
    return {"keywords": ["물", "비행", "추락", "뱀", "이빨 빠짐", "가족"]}
