"""AI 무의식 해몽: 6단계 문답 데이터를 그대로 LLM 시스템 프롬프트 인자로 주입해 실시간으로 해몽을 생성한다.

정적 더미 텍스트를 전혀 보관하지 않는다 — 모든 해몽 문구는 매 요청마다 Claude가 동적으로 생성한다.
API 오류나 파싱 실패 시에만 최소한의 폴백 데이터로 안전하게 대체한다.
"""

import json
import logging

import anthropic
from fastapi import APIRouter
from pydantic import BaseModel

from database import get_settings

router = APIRouter(prefix="/api", tags=["ai"])
logger = logging.getLogger(__name__)

# --- 선언부: 모델 / 응답 스키마 / 시스템 프롬프트 템플릿 --------------------

MODEL = "claude-opus-4-8"

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "tags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "'#' 기호를 포함한 상징 키워드 태그 2~4개 (예: '#그림자', '#자각')",
        },
        "description": {
            "type": "string",
            "description": "조도·행동·최종 잔상을 엮어 무의식 상태를 분석하고 위로를 건네는 3~4문장의 해몽 본문",
        },
        "lucky_item": {
            "type": "string",
            "description": "오늘 하루 무의식의 균형을 잡아줄 구체적이고 감성적인 행운의 아이템",
        },
        "lucky_number": {
            "type": "integer",
            "description": "1~99 사이, 오늘 유저의 파장과 매칭되는 행운의 숫자",
        },
    },
    "required": ["tags", "description", "lucky_item", "lucky_number"],
    "additionalProperties": False,
}

SYSTEM_PROMPT_TEMPLATE = """당신은 깊은 통찰력과 감성적인 언어 해설 능력을 겸비한 세계 최고의 심층 심리학자이자 꿈 분석 전문가(Dream Analyst)입니다. Carl Jung의 분석심리학과 무의식 투사 이론을 바탕으로, 유저가 제공한 6단계 정밀 무의식 조각(객관식 선택 + 주관식 서술)을 분석하여 신뢰감 있고 몽환적인 꿈해몽 보고서를 작성해야 합니다.

[유저의 6단계 무의식 데이터 리포트]
0. 꿈의 제목: {title}
1. 배경의 조도 (Atmosphere & Light): {brightness}
2. 공간의 밀도와 장소 (Space Depth): {space_depth} — 상세 묘사: {space_detail}
3. 시선을 끈 핵심 존재 (Identity Factor): {identity_factor} — 상세 묘사: {identity_detail}
4. 무의식 속 핵심 행동 (Action & Physics): {action_physics} — 상세 묘사: {action_detail}
5. 현실과의 공명 (Reality Resonance): {reality_link} — 상세 서술: {reality_detail}
6. 차원 제어 지수 (Vividness & Lucid): 선명도 {vividness}%, 자각몽 여부 {is_lucid}

[수행 지시사항]
1. 분석적 신뢰성: 뻔한 미신적 해몽이 아닌, 유저가 서술한 공간·인물·행동·현실 공명 묘사 간의 연결 고리를 짚어내며 심리학적으로 위로와 통찰을 주는 본문을 작성하세요.
2. 톤앤매너: 'Dream_Hub' 서비스의 정체성에 맞게 신비롭고 몽환적이면서도, 내면을 꿰뚫어 보는 듯한 차분하고 세련된 어조를 유지하세요.
3. 다양성과 동적 생성: 고정된 결과는 절대 금지합니다. 입력값들의 상호작용을 계산하여 매번 유니크한 키워드 태그와 행운의 요소를 실시간으로 창작하세요.
4. 엄격한 응답 포맷: 대화형 답변이나 서론/결론은 모두 배제하고, 반드시 지정된 JSON 스키마 구조로만 정확히 답변하세요."""

# API 오류·JSON 파싱 실패 시에만 쓰이는 최소한의 안전장치 (정적 케이스 데이터가 아님).
FALLBACK_RESULT = {
    "tags": ["#무의식", "#잔상"],
    "description": "지금 이 순간, 당신의 무의식은 아직 말을 고르는 중이에요. 오늘 밤 다시 한 번 그 파동에 조용히 귀 기울여보세요.",
    "lucky_item": "작은 향초",
    "lucky_number": 3,
}


class DreamSurveyInput(BaseModel):
    title: str
    brightness: str
    space_depth: str
    space_detail: str
    identity_factor: str
    identity_detail: str
    action_physics: str
    action_detail: str
    reality_link: str
    reality_detail: str
    vividness: int
    is_lucid: bool


class DreamInterpretationRequest(BaseModel):
    date: str | None = None
    emotion: str | None = None
    is_public: bool | None = None
    survey: DreamSurveyInput


# --- 비즈니스 로직: 프롬프트 주입 / Claude 호출 -----------------------------


def build_system_prompt(survey: DreamSurveyInput) -> str:
    """6단계 문답 응답을 시스템 프롬프트 템플릿의 각 자리표시자에 문자열 치환한다."""
    return SYSTEM_PROMPT_TEMPLATE.format(
        title=survey.title,
        brightness=survey.brightness,
        space_depth=survey.space_depth,
        space_detail=survey.space_detail,
        identity_factor=survey.identity_factor,
        identity_detail=survey.identity_detail,
        action_physics=survey.action_physics,
        action_detail=survey.action_detail,
        reality_link=survey.reality_link,
        reality_detail=survey.reality_detail,
        vividness=survey.vividness,
        is_lucid="True" if survey.is_lucid else "False",
    )


def request_interpretation(system_prompt: str) -> dict:
    """Claude에 구조화 출력(JSON Schema)을 요청한다. 실패 시 최소 폴백 데이터로 대체한다."""
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=system_prompt,
            output_config={"format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}},
            messages=[{"role": "user", "content": "위 데이터를 기반으로 꿈해몽 리포트를 JSON으로 작성해 주세요."}],
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
        logger.warning("AI 해몽 생성 실패, 폴백 데이터로 대체합니다: %s", exc)
        return dict(FALLBACK_RESULT)


# --- 라우트: 얇은 HTTP 어댑터 --------------------------------------------


@router.post("/dream-interpretation")
def create_dream_interpretation(payload: DreamInterpretationRequest) -> dict:
    system_prompt = build_system_prompt(payload.survey)
    return request_interpretation(system_prompt)
