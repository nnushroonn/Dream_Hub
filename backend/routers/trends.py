"""실시간 트렌드 키워드: 홈 화면 '실시간 트렌드 키워드' 리스트의 진짜 데이터 소스.

더미 순위표를 쓰지 않고, 두 실제 소스를 합산한다:
1. 꿈 기록소에 공개(PUBLIC)로 저장된 실제 꿈 제목 - 같은 제목이 여러 번 기록될 때마다 누적
2. 꿈해몽 사전에서 실제로 검색된 키워드 - StandardKeyword.search_count

비공개 일기 제목은 절대 집계에 포함하지 않는다(개인 기록 유출 방지).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from models import DreamEntry, DreamStatus, StandardKeyword

router = APIRouter(prefix="/api/trends", tags=["trends"])

TOP_N = 5


class TrendKeyword(BaseModel):
    keyword: str
    count: int


@router.get("/keywords", response_model=list[TrendKeyword])
def get_trend_keywords(db: Session = Depends(get_db)) -> list[dict]:
    counts: dict[str, int] = {}

    title_rows = db.execute(
        select(DreamEntry.title, func.count(DreamEntry.id))
        .where(DreamEntry.status == DreamStatus.PUBLIC)
        .group_by(DreamEntry.title)
    ).all()
    for title, title_count in title_rows:
        key = title.strip()
        if key:
            counts[key] = counts.get(key, 0) + title_count

    keyword_rows = db.execute(
        select(StandardKeyword.name, StandardKeyword.search_count).where(StandardKeyword.search_count > 0)
    ).all()
    for name, search_count in keyword_rows:
        key = name.strip()
        if key:
            counts[key] = counts.get(key, 0) + search_count

    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:TOP_N]
    return [{"keyword": keyword, "count": count} for keyword, count in ranked]
