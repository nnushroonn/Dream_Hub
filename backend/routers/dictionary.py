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
from models import DreamDictionaryCache, DreamStatus, DreamEntry, StandardKeyword
from routers.ai_interpretation import EXPERT_MATRIX_BLOCK

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
            "description": "현대 심리학적 관점에서 이 상징이 뜻하는 무의식적 의미를 2~3문장으로 설명 (특정 학파에 얽매이지 않고 자유롭게 서술 — 학파를 못박은 깊은 해설은 expert_insight가 별도로 담당한다)",
        },
        "selected_expert": {
            "type": "string",
            "description": "EXPERT_MATRIX 규칙에 따라 이 검색어에 가장 적합하다고 판단해 선택한 심리학자 1~2명의 이름",
        },
        "expert_badge": {
            "type": "string",
            "description": "선택된 학파를 나타내는 이모지+짧은 분야명 (예: '🌌 분석심리학')",
        },
        "expert_insight": {
            "type": "string",
            "description": "선택된 전문가 특유의 어조로 이 상징을 깊이 있게 해설하는 3~4문장",
        },
        "related_keywords": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "함께 찾아보면 좋은 연관 검색어 3~5개 (단어 자체만, '#' 없이). 검색어가 최신 트렌드 용어라면 "
                "'도파민', '알고리즘', '포모증후군', '자산변동성', '디지털네이티브'처럼 그 트렌드가 유발하는 "
                "심리 상태나 문화 현상을 가리키는 현대적인 용어를 적극적으로 섞어 제시하세요."
            ),
        },
    },
    "required": [
        "keyword",
        "summary",
        "traditional_meaning",
        "psychological_meaning",
        "selected_expert",
        "expert_badge",
        "expert_insight",
        "related_keywords",
    ],
    "additionalProperties": False,
}

# 토큰 비용 절감을 위해 프롬프트를 두 블록으로 나눈다: STATIC은 검색어와 무관하게 항상 동일해
# Claude 프롬프트 캐싱(cache_control: ephemeral) 대상이 되고, DATA_TEMPLATE만 매 요청 새로 채워진다.
SYSTEM_PROMPT_STATIC = """당신은 한국 전통 꿈해몽과 현대 심리학 양쪽에 모두 정통한 '꿈해몽 사전' 편찬자입니다.
곧이어 유저가 검색한 단어 하나가 주어지면, 전통적 해몽 관점과 심리학적 해몽 관점을 나란히 제공하는
사전 표제어를 작성하세요.

{expert_matrix}

[수행 지시사항]
1. 이 검색어가 꿈에 등장했을 때의 의미를 다룹니다. 검색어 자체가 이상하거나 모호해도, 꿈 상징으로서
   그럴듯한 해석을 창의적으로 만들어내세요 (실패하거나 거부하지 마세요).
2. 현대적 트렌드 치환: 검색어가 비트코인/가상자산, 챗GPT·AI, SNS·릴스, '갓생' 같은 최신 신조어 등
   고전 해몽 사전에 없는 현대적 개념이라면, 그 대상 자체의 사전적 의미가 아니라 그것이 지금 현대인의
   삶에 실제로 미치는 심리적 영향(변동성 불안, 통제력 상실, 도파민 중독, 도피 욕구, 성장 강박, SNS
   인정욕구 등)을 포착해 해석하세요. 예를 들어 '비트코인'은 물질적 재물이 아니라 '현재 삶의 불안정성과
   리스크 테이킹에 대한 심리적 압박감'으로 풀이하는 식입니다.
3. traditional_meaning과 psychological_meaning은 서로 다른 결의 해석이어야 하며, 상반되거나 상호
   보완적인 통찰을 담아 사전으로서의 깊이를 주세요. 다만 검색어가 현대적 트렌드 용어라 전통 민속에
   대응되는 사례가 없다면, traditional_meaning은 억지로 옛 이야기에 끼워 맞추지 말고 '이 대상이 없던
   시대라면 어떤 원형(재물욕, 이동, 소통, 변신 등)에 가장 가까운 자리를 대신 차지했을지'를 추론해
   설명하세요.
4. 전문가 동적 매칭: 위 [주제별 전문가 동적 매칭 규칙]에 따라 이 검색어의 핵심 주제를 근거로 가장
   적합한 전문가를 selected_expert/expert_badge/expert_insight에 채워 넣으세요.
5. 톤앤매너: 'Dream_Hub' 사전다운 신뢰감 있고 간결한 문체를 유지하되, 딱딱한 백과사전투는 피하고
   몽환적인 분위기를 살짝 곁들이세요.
6. 다양성: 같은 검색어라도 매번 완전히 동일한 문장을 반복하지 말고, 표현을 조금씩 다르게 창작하세요.
7. 엄격한 응답 포맷: 서론/결론 없이 반드시 지정된 JSON 스키마 구조로만 답변하세요."""

SYSTEM_PROMPT_DATA_TEMPLATE = """[검색어]
{keyword}"""

FALLBACK_RESULT = {
    "summary": "아직 풀이가 도착하지 않은 상징이에요.",
    "traditional_meaning": "이 단어는 지금 사전의 안개 속에 있습니다. 잠시 후 다시 찾아와 주세요.",
    "psychological_meaning": "때로는 의미가 늦게 도착하는 것도 무의식의 방식입니다. 조금 뒤 다시 검색해 보세요.",
    "selected_expert": "칼 융 (Carl Jung)",
    "expert_badge": "🌌 분석심리학",
    "expert_insight": "융이라면 이 침묵조차 무의식이 스스로 정리할 시간을 요구하는 신호라고 말했을 거예요. 조금 뒤 다시 찾아와 보세요.",
    "related_keywords": [],
}

# --- 문장/구절 검색어 파싱: "뱀한테 물리는 꿈을 꿨어요" -> 키워드 '뱀' + 맥락 '뱀에게 물림' --

QUERY_PARSE_SCHEMA = {
    "type": "object",
    "properties": {
        "keyword": {
            "type": "string",
            "description": (
                "검색 쿼리에서 뽑아낸 대표 상징 단어(명사) 하나. 조사(을/를/이/가/에게 등)와 서술어는 "
                "제거하고, 사전 표제어로 쓰기 좋은 짧은 명사형으로 정규화한다 (예: '뱀')."
            ),
        },
        "context": {
            "type": "string",
            "description": (
                "검색 쿼리에 담긴 구체적인 상황/행동만 뽑아낸 짧은 맥락 구절 (예: '뱀에게 물림', "
                "'하늘을 자유롭게 날아다님'). 쿼리가 이미 단어 하나뿐이라 추가 맥락이 없으면 빈 문자열."
            ),
        },
    },
    "required": ["keyword", "context"],
    "additionalProperties": False,
}

QUERY_PARSE_PROMPT_TEMPLATE = """당신은 꿈해몽 사전 검색어를 분석하는 자연어 파서입니다. 유저가 사전
검색창에 입력한 쿼리에서 (1) 해몽의 핵심이 되는 대표 상징 단어와 (2) 그 단어를 둘러싼 구체적인 상황/행동
맥락을 분리해 추출하세요.

[검색 쿼리]
{query}

[수행 지시사항]
1. keyword는 사전 표제어가 될 만한 짧은 명사 하나여야 합니다. 조사와 서술어를 제거하세요.
   예: "뱀한테 물리는 꿈을 꿨어요" → keyword: "뱀". "하늘을 나는 꿈" → keyword: "하늘".
   "호랑이한테 쫓기는 꿈" → keyword: "호랑이".
2. context는 keyword를 뺀 나머지에서 상황/행동만 간결하게 정리하세요.
   예: "뱀한테 물리는 꿈을 꿨어요" → context: "뱀에게 물림". "하늘을 나는 꿈" → context: "하늘을 자유롭게
   날아다님". 쿼리가 이미 "뱀"처럼 단어 하나뿐이면 context는 빈 문자열("")로 둡니다.
3. 쿼리가 이상하거나 모호해도 최선의 추정으로 keyword/context를 만들어내세요 (거부하지 마세요).
4. 엄격한 응답 포맷: 서론/결론 없이 반드시 지정된 JSON 스키마 구조로만 답변하세요."""

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
                    "is_best_match": {
                        "type": "boolean",
                        "description": (
                            "유저가 검색창에 입력했던 원본 문맥(context hint)과 가장 정확히 일치하는 "
                            "시나리오 단 하나에만 true를 부여한다. context hint가 없거나, 어떤 시나리오도 "
                            "명확히 일치하지 않으면 전부 false."
                        ),
                    },
                },
                "required": ["title", "mood", "is_best_match"],
                "additionalProperties": False,
            },
            "description": "검색어가 등장하는 대표적인 상황별 꿈 시나리오 8개",
        }
    },
    "required": ["scenarios"],
    "additionalProperties": False,
}

SCENARIO_LIST_PROMPT_TEMPLATE = """당신은 한국 전통 꿈해몽과 현대 트렌드 심리 양쪽에 정통한 '꿈해몽 사전'의
편찬자입니다. 유저가 '{keyword}'라는 상징으로 사전을 검색했습니다. 이 상징이 실제로 등장할 법한 구체적인
상황별 꿈 시나리오를 8개 만들어 주세요.
{context_block}
[수행 지시사항]
1. 각 제목은 반드시 '{keyword}'라는 단어를 그대로 포함한, 완전한 문장형 꿈 제목이어야 합니다
   (예: 검색어가 '남편'이면 '남편이 바람을 피우는 꿈', '남편이 승진하는 꿈' 등).
2. 하이퍼-리얼리스틱 원칙: 하드코딩된 문장 구조에 단어만 갈아 끼우는 방식은 엄격히 금지합니다.
   '{keyword}'가 현실에서 실제로 어떻게 쓰이고 소비되는지 그 구체적 맥락을 그대로 반영한 고유한
   시나리오를 창조하세요. 예를 들어 검색어가 주식/코인이면 '종목 차트가 급락해 파란 불로 도배된 화면을
   보며 식은땀을 흘리는 꿈', AI/챗GPT면 '인공지능이 내 감정을 완벽히 이해하고 위로해 주어 눈물을
   흘리는 꿈', SNS/인스타면 '내가 올린 피드에 좋아요와 댓글이 폭발적으로 달리는 것을 새로고침하며
   확인하는 꿈'처럼, 그 개념이 실생활에서 소비되는 방식(화면, 알림, 지표, 피드 등)을 구체적인 소재로
   삼으세요. '{keyword}'가 이런 현대적 개념이 아니라면 이 원칙은 관계·행동·사건·감정을 생생하고
   구체적으로 그리는 데에 동일하게 적용하세요.
3. 관계·행동·사건·감정 등 다양한 각도의 상황을 폭넓게 다뤄, 8개가 서로 겹치지 않게 하세요.
4. 각 시나리오의 mood는, '{keyword}'가 전통 민속에 대응 사례가 있는 상징이면 전통 해몽 관점에서,
   현대적 트렌드 개념이면 그 상황이 유저에게 주는 심리적 충격(불안·상실·성취·안도 등)을 기준으로
   길몽/평몽/흉몽 중 하나로 판단하세요. 8개가 전부 같은 mood로 쏠리지 않도록 다양하게 분배하세요.
5. is_best_match 판단: 아래 [유저 원본 검색 맥락]이 주어졌다면, 8개 중 그 맥락과 가장 정확히 일치하는
   시나리오 하나를 반드시 포함시키고 그 항목에만 is_best_match: true를 부여하세요 (나머지는 false).
   맥락이 없거나("(없음)") 뚜렷이 일치하는 상황이 없다면 전부 false로 두세요.
6. 엄격한 응답 포맷: 서론/결론 없이 반드시 지정된 JSON 스키마 구조로만 답변하세요."""

def _scenario_list_fallback(keyword: str) -> list[dict]:
    return [{"title": f"{keyword}가 등장하는 꿈", "mood": "neutral", "is_best_match": False}]

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
        "selected_expert": {
            "type": "string",
            "description": "EXPERT_MATRIX 규칙에 따라 이 상황에 가장 적합하다고 판단해 선택한 심리학자 1~2명의 이름",
        },
        "expert_badge": {
            "type": "string",
            "description": "선택된 학파를 나타내는 이모지+짧은 분야명 (예: '🌌 분석심리학')",
        },
        "expert_insight": {
            "type": "string",
            "description": "선택된 전문가 특유의 어조로 이 상황을 깊이 있게 해설하는 3~4문장",
        },
        "advice": {
            "type": "string",
            "description": "오늘 현실에서 이 꿈을 어떻게 받아들이고 행동하면 좋을지 담은 실질적인 조언 1~2문장",
        },
    },
    "required": ["mood", "interpretation", "selected_expert", "expert_badge", "expert_insight", "advice"],
    "additionalProperties": False,
}

SCENARIO_DETAIL_PROMPT_TEMPLATE = """당신은 한국 전통 꿈해몽과 현대 심리학에 모두 정통한 '꿈해몽 사전' 편찬자입니다.
유저가 사전에서 '{keyword}' 항목을 펼쳐보다가, 그 안의 구체적인 시나리오 하나를 골라 더 깊은 풀이를
요청했습니다.

[검색 키워드] {keyword}
[선택한 구체적 시나리오] {scenario_title}

{expert_matrix}

[수행 지시사항]
1. 이 구체적인 상황에 초점을 맞춰 길몽/흉몽 여부와 그 근거를 짚어내는 심층 해몽을 작성하세요.
2. 막연한 미사여구 대신, 이 시나리오의 구체적인 요소(관계, 행동, 감정)를 직접 언급하며 설득력 있게
   해석하세요.
3. 이 시나리오가 가상자산·AI·SNS 등 최신 트렌드/기술 개념과 관련되어 있다면, 고전 민속 해몽으로
   억지로 끼워 맞추지 말고 그 트렌드가 현대인에게 유발하는 심리 상태(변동성 불안, 통제력 상실,
   도파민 중독, 도피 욕구, 성장 강박, 인정욕구 등)를 심리학적으로 해석하세요.
4. 전문가 동적 매칭: 위 [주제별 전문가 동적 매칭 규칙]에 따라 이 상황의 핵심 주제를 근거로 가장
   적합한 전문가를 selected_expert/expert_badge/expert_insight에 채워 넣으세요.
5. advice는 점술적 지시가 아니라, 이 꿈이 현실의 어떤 부분을 돌아보게 하는지에 대한 담백한 조언으로
   작성하세요.
6. 엄격한 응답 포맷: 서론/결론 없이 반드시 지정된 JSON 스키마 구조로만 답변하세요."""

SCENARIO_DETAIL_FALLBACK = {
    "mood": "neutral",
    "interpretation": "이 상황은 지금 사전의 안개 속에 있습니다. 잠시 후 다시 찾아와 주세요.",
    "selected_expert": "칼 융 (Carl Jung)",
    "expert_badge": "🌌 분석심리학",
    "expert_insight": "융이라면 이 침묵조차 무의식이 스스로 정리할 시간을 요구하는 신호라고 말했을 거예요. 조금 뒤 다시 찾아와 보세요.",
    "advice": "조금 뒤 다시 열어보면 더 선명한 풀이를 만날 수 있을 거예요.",
}


class SearchRequest(BaseModel):
    keyword: str
    # 홈 화면 '오늘의 상징' 카드처럼 유저가 직접 검색한 게 아닌 자동 조회에서는
    # False로 넘겨 인기 검색어 집계(search_count)를 오염시키지 않는다.
    record: bool = True


class DictionaryEntry(BaseModel):
    keyword: str
    summary: str
    traditional_meaning: str
    psychological_meaning: str
    selected_expert: str
    expert_badge: str
    expert_insight: str
    related_keywords: list[str]


class TrendingKeyword(BaseModel):
    keyword: str
    count: int


class RecentDreamTitle(BaseModel):
    title: str
    emotion: str
    dream_date: str


class QueryParseRequest(BaseModel):
    query: str
    # 트렌드 집계는 AI가 뽑아낸 대표 키워드가 아니라 유저가 실제로 입력한 구절 원문을
    # 기준으로 남겨야 "#하늘을_나는_꿈"처럼 온전한 구절로 트렌드에 잡힌다.
    record: bool = True


class QueryParseResponse(BaseModel):
    keyword: str
    context: str


class ScenarioListRequest(BaseModel):
    keyword: str
    # 문장/구절 검색에서 파싱된 원본 맥락 힌트. 있으면 8개 시나리오 중 가장 가까운 하나를
    # is_best_match=True로 표시해 프론트에서 최상단 하이라이트에 쓴다.
    context: str = ""


class DreamScenario(BaseModel):
    title: str
    mood: str
    is_best_match: bool = False


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
    selected_expert: str
    expert_badge: str
    expert_insight: str
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


def _normalize_cache_input(value: str) -> str:
    """캐시 키 충돌을 줄이기 위해 앞뒤/연속 공백만 정리한다 (의미는 바꾸지 않는다)."""
    return " ".join(value.split())


def _get_cached(db: Session, cache_key: str) -> dict | None:
    """캐시 테이블에서 완전히 일치하는 이전 AI 응답을 찾는다. 있으면 Claude를 다시 호출하지 않고 그대로 반환한다."""
    row = db.execute(
        select(DreamDictionaryCache).where(DreamDictionaryCache.cache_key == cache_key)
    ).scalar_one_or_none()
    if row is None:
        return None
    try:
        row.hit_count += 1
        db.commit()
    except Exception:
        db.rollback()
    return row.payload


def _store_cache(db: Session, cache_key: str, payload: dict) -> None:
    """새로 생성한 AI 응답을 캐시 테이블에 저장한다. 부가 작업이므로 실패해도 응답 자체를 막지 않는다."""
    try:
        db.add(DreamDictionaryCache(cache_key=cache_key, payload=payload))
        db.commit()
    except Exception:
        logger.warning("사전 캐시 저장 실패: %s", cache_key, exc_info=True)
        db.rollback()


def _request_entry(keyword: str) -> dict | None:
    """실패 시 None을 반환한다 (폴백은 라우트에서 합성) - 폴백 데이터가 캐시 테이블에 영구 저장되는 걸 막기 위해."""
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT_STATIC.format(expert_matrix=EXPERT_MATRIX_BLOCK),
                    "cache_control": {"type": "ephemeral"},
                },
                {"type": "text", "text": SYSTEM_PROMPT_DATA_TEMPLATE.format(keyword=keyword)},
            ],
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
        return None


def _parse_query(query: str) -> dict:
    """문장/구절 검색어에서 대표 상징 키워드와 상황 맥락을 분리한다.
    실패 시 원문 전체를 keyword로, context는 빈 문자열로 취급 - 파싱 이전의 기존 동작과 동일한 안전한 폴백."""
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=256,
            system=QUERY_PARSE_PROMPT_TEMPLATE.format(query=query),
            output_config={"format": {"type": "json_schema", "schema": QUERY_PARSE_SCHEMA}},
            messages=[{"role": "user", "content": "위 검색 쿼리를 keyword/context로 분리해 JSON으로 작성해 주세요."}],
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
        logger.warning("검색어 파싱 실패, 원문을 그대로 키워드로 사용합니다: %s", exc)
        return {"keyword": query, "context": ""}


def _request_scenarios(keyword: str, context: str = "") -> list[dict] | None:
    """실패 시 None을 반환한다 (폴백은 라우트에서 합성) - 폴백 데이터가 캐시 테이블에 영구 저장되는 걸 막기 위해."""
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        context_block = f"\n[유저 원본 검색 맥락]\n{context}\n" if context.strip() else "\n[유저 원본 검색 맥락]\n(없음)\n"

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=1536,
            system=SCENARIO_LIST_PROMPT_TEMPLATE.format(keyword=keyword, context_block=context_block),
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
        return None


def _request_scenario_detail(keyword: str, scenario_title: str) -> dict | None:
    """실패 시 None을 반환한다 (폴백은 라우트에서 합성) - 폴백 데이터가 캐시 테이블에 영구 저장되는 걸 막기 위해."""
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SCENARIO_DETAIL_PROMPT_TEMPLATE.format(
                keyword=keyword, scenario_title=scenario_title, expert_matrix=EXPERT_MATRIX_BLOCK
            ),
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
        return None


@router.post("/search", response_model=DictionaryEntry)
def search_dictionary(payload: SearchRequest, db: Session = Depends(get_db)) -> dict:
    keyword = payload.keyword.strip()
    if not keyword:
        return {"keyword": "", **FALLBACK_RESULT}

    cache_key = f"search:{_normalize_cache_input(keyword)}"
    entry = _get_cached(db, cache_key)
    if entry is None:
        entry = _request_entry(keyword)
        if entry is not None:
            _store_cache(db, cache_key, entry)
        else:
            entry = {"keyword": keyword, **FALLBACK_RESULT}
    if payload.record:
        _record_search(db, keyword)
    return entry


@router.post("/parse-query", response_model=QueryParseResponse)
def parse_dictionary_query(payload: QueryParseRequest, db: Session = Depends(get_db)) -> dict:
    query = payload.query.strip()
    if not query:
        return {"keyword": "", "context": ""}
    if payload.record:
        _record_search(db, query)
    return _parse_query(query)


@router.post("/scenarios", response_model=ScenarioListResponse)
def get_dictionary_scenarios(payload: ScenarioListRequest, db: Session = Depends(get_db)) -> dict:
    keyword = payload.keyword.strip()
    if not keyword:
        return {"keyword": "", "scenarios": []}

    context = payload.context.strip()
    cache_key = f"scenarios:{_normalize_cache_input(keyword)}|{_normalize_cache_input(context)}"
    cached = _get_cached(db, cache_key)
    if cached is not None:
        return {"keyword": keyword, "scenarios": cached["scenarios"]}

    scenarios = _request_scenarios(keyword, context)
    if scenarios is not None:
        _store_cache(db, cache_key, {"scenarios": scenarios})
    else:
        scenarios = _scenario_list_fallback(keyword)
    return {"keyword": keyword, "scenarios": scenarios}


@router.post("/scenario-detail", response_model=ScenarioDetailResponse)
def get_scenario_detail(payload: ScenarioDetailRequest, db: Session = Depends(get_db)) -> dict:
    keyword = payload.keyword.strip()
    scenario_title = payload.scenario_title.strip()
    if not keyword or not scenario_title:
        return {"title": scenario_title, **SCENARIO_DETAIL_FALLBACK}

    cache_key = f"detail:{_normalize_cache_input(keyword)}|{_normalize_cache_input(scenario_title)}"
    detail = _get_cached(db, cache_key)
    if detail is None:
        detail = _request_scenario_detail(keyword, scenario_title)
        if detail is not None:
            _store_cache(db, cache_key, detail)
        else:
            detail = dict(SCENARIO_DETAIL_FALLBACK)
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
