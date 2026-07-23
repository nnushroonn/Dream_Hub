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

# --- 상황별 세부 꿈 아카이브: 키워드 -> 시나리오 목록 -> 시나리오 심층 해몽 -----------

SCENARIO_LIST_SCHEMA = {
    "type": "object",
    "properties": {
        "scenarios": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "검색어 단어를 그대로 포함한 완전한 문장형 꿈 제목 (예: '남편이 바람을 피우는 꿈')",
                    },
                    "mood": {
                        "type": "string",
                        "enum": ["good", "neutral", "nightmare"],
                        "description": "전통 해몽 관점에서 이 상황이 길몽(good)/평몽(neutral)/흉몽(nightmare) 중 무엇에 가까운지",
                    },
                },
                "required": ["title", "mood"],
                "additionalProperties": False,
            },
            "description": "검색어가 등장하는 대표적인 상황별 꿈 시나리오 8개",
        }
    },
    "required": ["scenarios"],
    "additionalProperties": False,
}

SCENARIO_LIST_PROMPT_TEMPLATE = """당신은 한국 전통 꿈해몽 사전의 편찬자입니다. 유저가 '{keyword}'라는
상징으로 사전을 검색했습니다. 이 상징이 실제로 등장할 법한 구체적인 상황별 꿈 시나리오를 8개
만들어 주세요.

[수행 지시사항]
1. 각 제목은 반드시 '{keyword}'라는 단어를 그대로 포함한, 완전한 문장형 꿈 제목이어야 합니다
   (예: 검색어가 '남편'이면 '남편이 바람을 피우는 꿈', '남편이 승진하는 꿈' 등).
2. 관계·행동·사건·감정 등 다양한 각도의 상황을 폭넓게 다뤄, 8개가 서로 겹치지 않게 하세요.
3. 각 시나리오의 mood는 전통 해몽 관점에서 길몽/평몽/흉몽 중 하나로 판단하세요. 8개가 전부
   같은 mood로 쏠리지 않도록 다양하게 분배하세요.
4. 엄격한 응답 포맷: 서론/결론 없이 반드시 지정된 JSON 스키마 구조로만 답변하세요."""

def _scenario_list_fallback(keyword: str) -> list[dict]:
    return [{"title": f"{keyword}가 등장하는 꿈", "mood": "neutral"}]

SCENARIO_DETAIL_SCHEMA = {
    "type": "object",
    "properties": {
        "mood": {
            "type": "string",
            "enum": ["good", "neutral", "nightmare"],
            "description": "이 구체적인 상황이 길몽(good)/평몽(neutral)/흉몽(nightmare) 중 무엇에 가까운지",
        },
        "interpretation": {
            "type": "string",
            "description": "이 구체적인 상황의 심층 해몽. 길몽/흉몽 여부와 그 이유를 담아 3~4문장으로 설명",
        },
        "advice": {
            "type": "string",
            "description": "오늘 현실에서 이 꿈을 어떻게 받아들이고 행동하면 좋을지 담은 실질적인 조언 1~2문장",
        },
    },
    "required": ["mood", "interpretation", "advice"],
    "additionalProperties": False,
}

SCENARIO_DETAIL_PROMPT_TEMPLATE = """당신은 한국 전통 꿈해몽과 현대 심리학에 모두 정통한 '꿈해몽 사전' 편찬자입니다.
유저가 사전에서 '{keyword}' 항목을 펼쳐보다가, 그 안의 구체적인 시나리오 하나를 골라 더 깊은 풀이를
요청했습니다.

[검색 키워드] {keyword}
[선택한 구체적 시나리오] {scenario_title}

[수행 지시사항]
1. 이 구체적인 상황에 초점을 맞춰 길몽/흉몽 여부와 그 근거를 짚어내는 심층 해몽을 작성하세요.
2. 막연한 미사여구 대신, 이 시나리오의 구체적인 요소(관계, 행동, 감정)를 직접 언급하며 설득력 있게
   해석하세요.
3. advice는 점술적 지시가 아니라, 이 꿈이 현실의 어떤 부분을 돌아보게 하는지에 대한 담백한 조언으로
   작성하세요.
4. 엄격한 응답 포맷: 서론/결론 없이 반드시 지정된 JSON 스키마 구조로만 답변하세요."""

SCENARIO_DETAIL_FALLBACK = {
    "mood": "neutral",
    "interpretation": "이 상황은 지금 사전의 안개 속에 있습니다. 잠시 후 다시 찾아와 주세요.",
    "advice": "조금 뒤 다시 열어보면 더 선명한 풀이를 만날 수 있을 거예요.",
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


class ScenarioListRequest(BaseModel):
    keyword: str


class DreamScenario(BaseModel):
    title: str
    mood: str


class ScenarioListResponse(BaseModel):
    keyword: str
    scenarios: list[DreamScenario]


class ScenarioDetailRequest(BaseModel):
    keyword: str
    scenario_title: str


class ScenarioDetailResponse(BaseModel):
    title: str
    mood: str
    interpretation: str
    advice: str


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


def _request_scenarios(keyword: str) -> list[dict]:
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=1536,
            system=SCENARIO_LIST_PROMPT_TEMPLATE.format(keyword=keyword),
            output_config={"format": {"type": "json_schema", "schema": SCENARIO_LIST_SCHEMA}},
            messages=[{"role": "user", "content": f"'{keyword}'의 상황별 꿈 시나리오 8개를 JSON으로 작성해 주세요."}],
        )
        text = next(block.text for block in response.content if block.type == "text")
        return json.loads(text)["scenarios"]
    except (
        anthropic.APIStatusError,
        anthropic.APIConnectionError,
        RuntimeError,
        StopIteration,
        json.JSONDecodeError,
        KeyError,
    ) as exc:
        logger.warning("시나리오 목록 생성 실패, 폴백으로 대체합니다: %s", exc)
        return _scenario_list_fallback(keyword)


def _request_scenario_detail(keyword: str, scenario_title: str) -> dict:
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SCENARIO_DETAIL_PROMPT_TEMPLATE.format(keyword=keyword, scenario_title=scenario_title),
            output_config={"format": {"type": "json_schema", "schema": SCENARIO_DETAIL_SCHEMA}},
            messages=[{"role": "user", "content": "위 시나리오의 심층 해몽을 JSON으로 작성해 주세요."}],
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
        logger.warning("시나리오 심층 해몽 실패, 폴백으로 대체합니다: %s", exc)
        return dict(SCENARIO_DETAIL_FALLBACK)


@router.post("/search", response_model=DictionaryEntry)
def search_dictionary(payload: SearchRequest, db: Session = Depends(get_db)) -> dict:
    keyword = payload.keyword.strip()
    if not keyword:
        return {"keyword": "", **FALLBACK_RESULT}

    entry = _request_entry(keyword)
    _record_search(db, keyword)
    return entry


@router.post("/scenarios", response_model=ScenarioListResponse)
def get_dictionary_scenarios(payload: ScenarioListRequest) -> dict:
    keyword = payload.keyword.strip()
    if not keyword:
        return {"keyword": "", "scenarios": []}
    return {"keyword": keyword, "scenarios": _request_scenarios(keyword)}


@router.post("/scenario-detail", response_model=ScenarioDetailResponse)
def get_scenario_detail(payload: ScenarioDetailRequest) -> dict:
    keyword = payload.keyword.strip()
    scenario_title = payload.scenario_title.strip()
    if not keyword or not scenario_title:
        return {"title": scenario_title, **SCENARIO_DETAIL_FALLBACK}

    detail = _request_scenario_detail(keyword, scenario_title)
    return {"title": scenario_title, **detail}


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
