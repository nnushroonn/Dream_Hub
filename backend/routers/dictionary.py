"""꿈해몽 사전: 검색어를 실시간으로 Claude에 보내 전통/심리학적 해석을 함께 생성하고,
검색된 키워드는 StandardKeyword.search_count에 누적해 실제 인기 검색어 랭킹의 근거로 쓴다.

꿈 기록소(AI 해몽 요청/CRUD)와는 완전히 별개의 라우터·엔드포인트로, 상태를 공유하지 않는다.
"""

import json
import logging

import anthropic
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db, get_settings
from models import DreamStatus, DreamEntry, StandardKeyword

router = APIRouter(prefix="/api/dictionary", tags=["dictionary"])
logger = logging.getLogger(__name__)

MODEL = "claude-opus-4-8"

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "keyword": {"type": "string", "description": "정규화된 검색어 표제어 (예: '고래')"},
        "summary": {"type": "string", "description": "사전 표제어 아래 붙는 한 줄 요약 정의 (20자 내외)"},
        "traditional_meaning": {
            "type": "string",
            "description": "전통 해몽(민속/토정비결류) 관점에서 이 상징이 뜻하는 바를 2~3문장으로 설명",
        },
        "psychological_meaning": {
            "type": "string",
            "description": "융 심리학 등 현대 심리학적 관점에서 이 상징이 뜻하는 무의식적 의미를 2~3문장으로 설명",
        },
        "related_keywords": {
            "type": "array",
            "items": {"type": "string"},
            "description": "함께 찾아보면 좋은 연관 검색어 3~5개 (단어 자체만, '#' 없이)",
        },
    },
    "required": ["keyword", "summary", "traditional_meaning", "psychological_meaning", "related_keywords"],
    "additionalProperties": False,
}

SYSTEM_PROMPT_TEMPLATE = """당신은 한국 전통 꿈해몽과 현대 심리학(특히 Carl Jung의 분석심리학) 양쪽에 모두 정통한
'꿈해몽 사전' 편찬자입니다. 유저가 검색한 단어 하나에 대해, 전통적 해몽 관점과 심리학적 해몽 관점을
나란히 제공하는 사전 표제어를 작성하세요.

[검색어]
{keyword}

[수행 지시사항]
1. 이 검색어가 꿈에 등장했을 때의 의미를 다룹니다. 검색어 자체가 이상하거나 모호해도, 꿈 상징으로서
   그럴듯한 해석을 창의적으로 만들어내세요 (실패하거나 거부하지 마세요).
2. traditional_meaning과 psychological_meaning은 서로 다른 결의 해석이어야 하며, 상반되거나 상호
   보완적인 통찰을 담아 사전으로서의 깊이를 주세요.
3. 톤앤매너: 'Dream_Hub' 사전다운 신뢰감 있고 간결한 문체를 유지하되, 딱딱한 백과사전투는 피하고
   몽환적인 분위기를 살짝 곁들이세요.
4. 다양성: 같은 검색어라도 매번 완전히 동일한 문장을 반복하지 말고, 표현을 조금씩 다르게 창작하세요.
5. 엄격한 응답 포맷: 서론/결론 없이 반드시 지정된 JSON 스키마 구조로만 답변하세요."""

FALLBACK_RESULT = {
    "summary": "아직 풀이가 도착하지 않은 상징이에요.",
    "traditional_meaning": "이 단어는 지금 사전의 안개 속에 있습니다. 잠시 후 다시 찾아와 주세요.",
    "psychological_meaning": "때로는 의미가 늦게 도착하는 것도 무의식의 방식입니다. 조금 뒤 다시 검색해 보세요.",
    "related_keywords": [],
}


class SearchRequest(BaseModel):
    keyword: str


class DictionaryEntry(BaseModel):
    keyword: str
    summary: str
    traditional_meaning: str
    psychological_meaning: str
    related_keywords: list[str]


class TrendingKeyword(BaseModel):
    keyword: str
    count: int


class RecentDreamTitle(BaseModel):
    title: str
    emotion: str
    dream_date: str


def _record_search(db: Session, keyword: str) -> None:
    """검색어를 StandardKeyword에 upsert하고 search_count를 1 증가시킨다.
    트렌드 집계용 부가 작업이므로, 실패해도 검색 응답 자체를 막지 않는다."""
    try:
        existing = db.execute(select(StandardKeyword).where(StandardKeyword.name == keyword)).scalar_one_or_none()
        if existing is None:
            db.add(StandardKeyword(name=keyword, search_count=1))
        else:
            existing.search_count += 1
        db.commit()
    except Exception:
        logger.warning("검색어 집계 실패: %s", keyword, exc_info=True)
        db.rollback()


def _request_entry(keyword: str) -> dict:
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT_TEMPLATE.format(keyword=keyword),
            output_config={"format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}},
            messages=[{"role": "user", "content": f"'{keyword}'의 꿈해몽 사전 표제어를 JSON으로 작성해 주세요."}],
        )
        text = next(block.text for block in response.content if block.type == "text")
        return json.loads(text)
    except (
        anthropic.APIStatusError,
        anthropic.APIConnectionError,
        RuntimeError,
        StopIteration,
        json.JSONDecodeError,
    ) as exc:
        logger.warning("꿈해몽 사전 검색 실패, 폴백으로 대체합니다: %s", exc)
        return {"keyword": keyword, **FALLBACK_RESULT}


@router.post("/search", response_model=DictionaryEntry)
def search_dictionary(payload: SearchRequest, db: Session = Depends(get_db)) -> dict:
    keyword = payload.keyword.strip()
    if not keyword:
        return {"keyword": "", **FALLBACK_RESULT}

    entry = _request_entry(keyword)
    _record_search(db, keyword)
    return entry


@router.get("/trending", response_model=list[TrendingKeyword])
def get_trending_keywords(db: Session = Depends(get_db)) -> list[dict]:
    rows = (
        db.execute(
            select(StandardKeyword)
            .where(StandardKeyword.search_count > 0)
            .order_by(StandardKeyword.search_count.desc())
            .limit(10)
        )
        .scalars()
        .all()
    )
    return [{"keyword": row.name, "count": row.search_count} for row in rows]


@router.get("/recent-dreams", response_model=list[RecentDreamTitle])
def get_recent_public_dreams(db: Session = Depends(get_db)) -> list[dict]:
    """실시간 꿈 이야기: 최근 공개로 저장된 실제 유저 꿈 제목 (더미 아님, DreamEntry 실데이터)."""
    rows = (
        db.execute(
            select(DreamEntry)
            .where(DreamEntry.status == DreamStatus.PUBLIC)
            .order_by(DreamEntry.created_at.desc())
            .limit(8)
        )
        .scalars()
        .all()
    )
    return [{"title": row.title, "emotion": row.emotion, "dream_date": row.dream_date.isoformat()} for row in rows]
