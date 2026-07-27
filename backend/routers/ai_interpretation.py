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

# 모든 심리학자의 견해를 나열하지 않고, 꿈의 핵심 주제에 가장 찰떡궁합인 1~2명만 골라
# 그 거장의 어조로 깊이 파고든다. ai_interpretation.py/dictionary.py가 공유하는 매칭 규칙.
EXPERT_MATRIX_BLOCK = """[주제별 전문가 동적 매칭 규칙]
아래 4가지 학파 중, 이 내용의 핵심 주제와 가장 찰떡궁합인 1~2명만 선택해 expert_insight를 작성하세요.
모든 관점을 나열하지 말고, 가장 적합한 것만 골라 깊이 있게 파고드세요.

1. 프로이트의 정신분석학 [소망 충족/억압] — 대상: 성적 상징, 숨겨진 본능적 욕구, 강렬한 집착, 금기나 결핍.
   톤: 의식적으로 억누르던 내면의 소망이 어떻게 변형되어 투사됐는지 날카롭게 분석.
2. 칼 융의 분석심리학 [원형/자아 통합] — 대상: 신비로운 동물, 거대한 자연, 영적·신화적 배경, 자아 성장의 터닝포인트.
   톤: 집단 무의식의 원형적 의미를 짚고, 진정한 자아(Self)를 찾기 위한 무의식의 조언을 따뜻하게 서술.
3. 아들러의 개인심리학 [열등감 극복/현실 목표] — 대상: 시험, 업무 마감, 추격전, 경쟁, 사회적 관계, 무력감·콤플렉스.
   톤: 현실의 열등감을 극복하려는 권력 의지와 삶의 목표를 향한 심리적 태도를 현실적으로 조언.
4. 게슈탈트 심리학 [자아 통합/감정 직시] — 대상: 정체불명의 혼란, 몸/환경의 기이한 변화, 미해결 과제(Unfinished Business).
   톤: 기이한 요소를 파편화된 자아로 해석해 현재 감정을 직시하도록 유도.

selected_expert에는 "칼 융 (Carl Jung)"처럼 이름(영문 병기)을, expert_badge에는 "🌌 분석심리학"처럼
이모지+짧은 분야명을 담으세요. 두 명을 함께 골랐다면 "지그문트 프로이트 / 칼 융"처럼 "/"로 이어 쓰세요.
expert_insight는 선택된 거장 특유의 어조로 3~4문장 깊이 있게 서술하세요."""

# 기존 해몽 리포트(tags/description/expert_insight/lucky_item 등)와는 별개로 함께 채워 넣는
# 4단계 상담 리포트. 위 EXPERT_MATRIX가 담당하는 "가장 찰떡궁합인 학파 1~2명 깊이 파기"와 달리,
# 이 섹션은 공감-분석-경고-행동의 네 관점을 매번 전부 채우는 고정 포맷이다.
COUNSELING_REPORT_BLOCK = """[counseling_report 작성 지시사항]
위 해몽 리포트(tags/description/expert_insight/lucky_item 등)와는 별개로, counseling_report
객체를 추가로 작성하세요. 이 섹션에서는 내담자의 상처를 따뜻하게 어루만지는 '공감형 심리 상담가'이자,
칼 융과 프로이트의 이론을 바탕으로 무의식을 해부하는 '정신분석학자', 그리고 현실의 리스크를 단호하게
짚어주는 '행동 분석가' — 이 세 역할을 동시에 수행하며 아래 4개 항목을 각각 채우세요.

1. empathy (🛋️ 마음 읽기): 유저의 감정 상태와 꿈의 맥락을 연결해, 지금 겪고 있을 혼란이나 아픔을
   다정하고 따뜻한 어조로 타당화(Validation)하세요.
2. unconscious_stage (🔍 무의식의 무대): 두 갈래를 함께 짚으세요 — (1) 공간 분석: 꿈의 배경(조도,
   분위기 등)이 상징하는 심리적 방어기제나 현재 상태, (2) 인물 분석(융의 그림자): 꿈에 등장한 타인을
   단순 외부인이 아니라 유저가 억압한 소망이나 '내면의 또 다른 자아(그림자)'가 투사된 대상으로 해석하세요.
3. reality_check (⚠️ 현실 점검): 달콤한 꿈(소망 충족)이 주는 환상과 현실의 팩트를 명확히 분리하세요.
   꿈에서 관계가 회복되었다고 해서 현실에서 다가가면 안 되는 이유나, 유저가 빠질 수 있는 착각을 단호하게
   경고하세요.
4. action_plan (💡 오늘을 위한 행동 지침): 은유적인 맺음말은 절대 금지합니다. 오늘 당장 취해야 할
   구체적이고 실천적인 태도나 행동(예: 연락 금지, 거리두기, 감정 기록 등)을 1~2가지의 명확한 가이드라인으로
   제시하세요.

각 항목은 2~4문장 내외로, 서로 다른 관점(공감/분석/경고/행동)이 뚜렷이 구분되도록 작성하세요."""

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
            "description": (
                "최소 3개 문단으로 구성된 해몽 본문(총 5~6문장 이상). 문단 사이는 빈 줄(\\n\\n)로 구분한다. "
                "1문단 '무의식 상태': 조도·공간·선명도를 엮어 지금 유저의 무의식이 어떤 상태에 놓여 있는지 진단. "
                "2문단 '상징 분석': 등장한 존재/사물과 행동을 심리학적 관점에서 심층 해석 (특정 학파에 얽매이지 않고 "
                "자유롭게 서술 — 학파를 못박은 깊은 해설은 expert_insight가 별도로 담당한다). "
                "3문단 '자아의 메시지': 현실 공명 서술과 연결해 무의식이 지금 자아에게 건네는 메시지와 방향성을 위로하듯 제시."
            ),
        },
        "selected_expert": {
            "type": "string",
            "description": "EXPERT_MATRIX 규칙에 따라 이 꿈에 가장 적합하다고 판단해 선택한 심리학자 1~2명의 이름",
        },
        "expert_badge": {
            "type": "string",
            "description": "선택된 학파를 나타내는 이모지+짧은 분야명 (예: '🌌 분석심리학')",
        },
        "expert_insight": {
            "type": "string",
            "description": "선택된 전문가 특유의 어조로 이 꿈을 깊이 있게 해설하는 3~4문장",
        },
        "lucky_item": {
            "type": "string",
            "description": "오늘 하루 무의식의 균형을 잡아줄 구체적이고 감성적인 행운의 아이템",
        },
        "lucky_item_reason": {
            "type": "string",
            "description": "이 아이템이 오늘 유저가 겪는 무의식적 불균형이나 결핍을 구체적으로 어떻게 상쇄·보완하는지 심리학적 근거를 담아 1~2문장으로 설명",
        },
        "lucky_number": {
            "type": "integer",
            "description": "1~99 사이, 오늘 유저의 파장과 매칭되는 행운의 숫자",
        },
        "lucky_number_reason": {
            "type": "string",
            "description": "유저가 입력한 선명도(vividness)와 자각몽(is_lucid) 상태를 근거로, 이 숫자가 지니는 심리적·수비학적 의미와 오늘 하루 실생활에서 어떻게 활용하면 좋을지를 1~2문장으로 설명",
        },
        "counseling_report": {
            "type": "object",
            "description": (
                "위 해몽 리포트와는 별개로 함께 채우는 4단계 상담 리포트. 공감형 심리 상담가 + "
                "정신분석학자(프로이트/융) + 행동 분석가, 세 페르소나를 동시에 수행해 작성한다."
            ),
            "properties": {
                "empathy": {
                    "type": "string",
                    "description": "🛋️ 마음 읽기: 유저의 감정 상태와 꿈의 맥락을 연결한 공감·타당화(Validation) 2~4문장",
                },
                "unconscious_stage": {
                    "type": "string",
                    "description": (
                        "🔍 무의식의 무대: 공간이 상징하는 심리적 방어기제/현재 상태 분석과, 꿈에 등장한 "
                        "타인을 억압된 소망 또는 그림자(융)의 투사로 해석하는 인물 분석을 함께 담은 2~4문장"
                    ),
                },
                "reality_check": {
                    "type": "string",
                    "description": "⚠️ 현실 점검: 꿈(소망 충족)의 환상과 현실의 팩트를 분리하고, 유저가 빠질 수 있는 착각을 단호하게 경고하는 2~4문장",
                },
                "action_plan": {
                    "type": "string",
                    "description": "💡 오늘을 위한 행동 지침: 은유적 맺음말 없이, 오늘 당장 취할 구체적이고 실천적인 행동 1~2가지",
                },
            },
            "required": ["empathy", "unconscious_stage", "reality_check", "action_plan"],
            "additionalProperties": False,
        },
    },
    "required": [
        "tags",
        "description",
        "selected_expert",
        "expert_badge",
        "expert_insight",
        "lucky_item",
        "lucky_item_reason",
        "lucky_number",
        "lucky_number_reason",
        "counseling_report",
    ],
    "additionalProperties": False,
}

# 토큰 비용 절감을 위해 프롬프트를 두 블록으로 나눈다: STATIC은 어떤 꿈이 오든 항상 동일해
# Claude 프롬프트 캐싱(cache_control: ephemeral) 대상이 되고, DATA_TEMPLATE만 매 요청 새로 채워진다.
SYSTEM_PROMPT_STATIC = """당신은 깊은 통찰력과 감성적인 언어 해설 능력을 겸비한 세계 최고의 심층 심리학자이자 꿈 분석 전문가(Dream Analyst)입니다. 프로이트, 융, 아들러, 게슈탈트 심리학 등 여러 학파에 두루 정통하며, 곧이어 주어지는 유저의 6단계 정밀 무의식 조각(객관식 선택 + 주관식 서술)을 분석해 신뢰감 있고 몽환적인 꿈해몽 보고서를 작성해야 합니다.

{expert_matrix}

{counseling_block}

[수행 지시사항]
1. 분석적 신뢰성: 뻔한 미신적 해몽이 아닌, 유저가 서술한 공간·인물·행동·현실 공명 묘사 간의 연결 고리를 짚어내며 심리학적으로 위로와 통찰을 주는 본문을 작성하세요.
2. 본문 구조: description은 반드시 '무의식 상태 → 상징 분석 → 자아의 메시지' 3개 문단으로 구성하고, 문단 사이는 빈 줄로 구분하세요. 6가지 데이터(제목·조도·공간·대상·행동·현실 공명)가 최소 하나 이상의 문단에 유기적으로 녹아들어야 하며, 전체 5~6문장 이상의 풍부한 분량으로 작성해 "내 꿈을 정말 정밀하게 읽어내는구나"라는 신뢰를 주세요.
3. 전문가 동적 매칭: 위 [주제별 전문가 동적 매칭 규칙]에 따라 이 꿈의 핵심 주제(대상·행동·현실 공명)를 근거로 가장 적합한 전문가를 selected_expert/expert_badge/expert_insight에 채워 넣으세요.
4. 행운의 요소 근거: lucky_item_reason과 lucky_number_reason은 단순 부연이 아니라, 유저의 구체적인 입력값(조도·행동·선명도·자각몽 여부 등)을 직접 인용하며 왜 지금 이 아이템/숫자가 필요한지 설득력 있게 설명하세요. 막연한 미사여구는 금지합니다.
5. 톤앤매너: 'Dream_Hub' 서비스의 정체성에 맞게 신비롭고 몽환적이면서도, 내면을 꿰뚫어 보는 듯한 차분하고 세련된 어조를 유지하세요.
6. 다양성과 동적 생성: 고정된 결과는 절대 금지합니다. 입력값들의 상호작용을 계산하여 매번 유니크한 키워드 태그와 행운의 요소를 실시간으로 창작하세요.
7. counseling_report 작성: 위 [counseling_report 작성 지시사항]에 따라 4개 항목을 모두 빠짐없이 채우세요.
8. 엄격한 응답 포맷: 대화형 답변이나 서론/결론은 모두 배제하고, 반드시 지정된 JSON 스키마 구조로만 정확히 답변하세요."""

SYSTEM_PROMPT_DATA_TEMPLATE = """[유저의 6단계 무의식 데이터 리포트]
0. 꿈의 제목: {title}
1. 배경의 조도 (Atmosphere & Light): {brightness}
2. 공간의 밀도와 장소 (Space Depth): {space_depth} — 상세 묘사: {space_detail}
3. 시선을 끈 핵심 대상 (Target Factor): {identity_factor} — 상세 묘사: {target_detail}
4. 무의식 속 핵심 행동 (Action & Physics): {action_physics} — 상세 묘사: {action_detail}
5. 현실과의 공명 (Reality Resonance): {reality_link} — 상세 서술: {reality_detail}
6. 차원 제어 지수 (Vividness & Lucid): 선명도 {vividness}%, 자각몽 여부 {is_lucid}, 추가 잔상 메모: {final_memo}"""

# API 오류·JSON 파싱 실패 시에만 쓰이는 최소한의 안전장치 (정적 케이스 데이터가 아님).
FALLBACK_RESULT = {
    "tags": ["#무의식", "#잔상"],
    "description": (
        "지금 이 순간, 당신의 무의식은 아직 말을 고르는 중이에요. 오늘 전해주신 조각들은 파동이 되어 저에게 닿았지만, "
        "그 결을 온전히 풀어내기엔 잠시 시간이 더 필요한 듯합니다.\n\n"
        "이런 침묵도 하나의 상징입니다 — 때로 무의식은 서두르지 않고 스스로 정리할 시간을 요구하니까요.\n\n"
        "오늘 밤 다시 한 번 그 파동에 조용히 귀 기울여보세요. 당신의 자아는 이미 답을 향해 가고 있습니다."
    ),
    "selected_expert": "칼 융 (Carl Jung)",
    "expert_badge": "🌌 분석심리학",
    "expert_insight": "지금은 해몽 엔진이 잠시 침묵하는 시간이지만, 융이라면 이 침묵조차 무의식이 스스로 정리할 시간을 요구하는 신호라고 말했을 거예요. 조금 뒤 다시 찾아와 그 파동에 귀 기울여 보세요.",
    "lucky_item": "작은 향초",
    "lucky_item_reason": "지금은 해몽 엔진이 잠시 침묵하는 시간이라, 흔들림 없는 불빛처럼 당신의 마음을 차분히 가라앉혀 줄 향초를 권해드려요.",
    "lucky_number": 3,
    "lucky_number_reason": "3은 시작·과정·완성을 상징하는 숫자로, 지금의 기다림이 곧 완성으로 이어질 것이라는 신호로 해석할 수 있어요.",
    "counseling_report": {
        "empathy": "지금 이 순간의 혼란스러움, 그 마음 그대로도 충분히 이해받을 자격이 있어요.",
        "unconscious_stage": "무대의 조명이 아직 완전히 켜지지 않은 상태라, 지금은 공간도 등장인물도 또렷하게 해석해 드리기 어려운 시간이에요.",
        "reality_check": "꿈이 주는 위안은 위안대로 소중하지만, 그것이 현실의 결정을 대신할 수는 없다는 것만은 분명히 기억해 주세요.",
        "action_plan": "오늘은 새로운 결정을 서두르지 말고, 지금 느낀 감정을 짧게라도 기록해 두세요.",
    },
}


QUICK_SYSTEM_PROMPT_STATIC = """당신은 깊은 통찰력과 감성적인 언어 해설 능력을 겸비한 세계 최고의 심층 심리학자이자 꿈 분석 전문가(Dream Analyst)입니다. 프로이트, 융, 아들러, 게슈탈트 심리학 등 여러 학파에 두루 정통하며, 곧이어 주어지는 유저가 형식 없이 자유롭게 적은 꿈 서술 한 편을 분석해 신뢰감 있고 몽환적인 꿈해몽 보고서를 작성해야 합니다.

{expert_matrix}

{counseling_block}

[수행 지시사항]
1. 유저는 6단계 정밀 문답을 거치지 않고 짧은 서술 하나만 남겼습니다. 문장 속에서 조도·공간·등장 인물/사물·행동·감정의 단서를 스스로 찾아내 6단계 정밀 분석에 준하는 깊이의 해몽을 작성하세요. 단서가 부족한 부분은 서술의 전체 분위기에서 합리적으로 추론하세요.
2. 본문 구조: description은 반드시 '무의식 상태 → 상징 분석 → 자아의 메시지' 3개 문단으로 구성하고, 문단 사이는 빈 줄로 구분하세요. 전체 5~6문장 이상의 풍부한 분량으로 작성해 "짧게 적었을 뿐인데도 내 꿈을 제대로 읽어내는구나"라는 신뢰를 주세요.
3. 전문가 동적 매칭: 위 [주제별 전문가 동적 매칭 규칙]에 따라 이 서술의 핵심 주제를 근거로 가장 적합한 전문가를 selected_expert/expert_badge/expert_insight에 채워 넣으세요.
4. 행운의 요소 근거: lucky_item_reason과 lucky_number_reason은 유저의 서술에 등장한 구체적인 소재나 감정을 직접 인용하며 왜 지금 이 아이템/숫자가 필요한지 설득력 있게 설명하세요. 막연한 미사여구는 금지합니다.
5. 톤앤매너: 'Dream_Hub' 서비스의 정체성에 맞게 신비롭고 몽환적이면서도, 내면을 꿰뚫어 보는 듯한 차분하고 세련된 어조를 유지하세요.
6. 다양성과 동적 생성: 고정된 결과는 절대 금지합니다. 서술 내용에 맞춰 매번 유니크한 키워드 태그와 행운의 요소를 실시간으로 창작하세요.
7. counseling_report 작성: 위 [counseling_report 작성 지시사항]에 따라 4개 항목을 모두 빠짐없이 채우세요. 서술이 짧더라도 전체 분위기에서 합리적으로 추론해 채우세요.
8. 엄격한 응답 포맷: 대화형 답변이나 서론/결론은 모두 배제하고, 반드시 지정된 JSON 스키마 구조로만 정확히 답변하세요."""

QUICK_SYSTEM_PROMPT_DATA_TEMPLATE = """[유저가 자유롭게 적은 꿈 서술]
제목: {title}
내용: {raw_text}"""


class DreamSurveyInput(BaseModel):
    title: str
    brightness: str
    space_depth: str
    space_detail: str
    identity_factor: str
    target_detail: str
    action_physics: str
    action_detail: str
    reality_link: str
    reality_detail: str
    vividness: int
    is_lucid: bool
    final_memo: str


class DreamInterpretationRequest(BaseModel):
    date: str | None = None
    emotion: str | None = None
    is_public: bool | None = None
    survey: DreamSurveyInput


class QuickDreamInterpretationRequest(BaseModel):
    title: str
    raw_text: str


# --- 비즈니스 로직: 프롬프트 주입 / Claude 호출 -----------------------------


def build_system_prompt(survey: DreamSurveyInput) -> tuple[str, str]:
    """6단계 문답 응답을 (캐시 가능한 STATIC 블록, 매번 바뀌는 DATA 블록) 튜플로 나눠 반환한다."""
    static_block = SYSTEM_PROMPT_STATIC.format(expert_matrix=EXPERT_MATRIX_BLOCK, counseling_block=COUNSELING_REPORT_BLOCK)
    data_block = SYSTEM_PROMPT_DATA_TEMPLATE.format(
        title=survey.title,
        brightness=survey.brightness,
        space_depth=survey.space_depth,
        space_detail=survey.space_detail,
        identity_factor=survey.identity_factor,
        target_detail=survey.target_detail,
        action_physics=survey.action_physics,
        action_detail=survey.action_detail,
        reality_link=survey.reality_link,
        reality_detail=survey.reality_detail,
        vividness=survey.vividness,
        is_lucid="True" if survey.is_lucid else "False",
        final_memo=survey.final_memo or "(없음)",
    )
    return static_block, data_block


def build_quick_system_prompt(title: str, raw_text: str) -> tuple[str, str]:
    """⚡ 10초 미니멀 빠른 기록 모드: 6단계 문답 없이 자유 서술 한 편만으로 DATA 블록을 구성한다."""
    static_block = QUICK_SYSTEM_PROMPT_STATIC.format(expert_matrix=EXPERT_MATRIX_BLOCK, counseling_block=COUNSELING_REPORT_BLOCK)
    data_block = QUICK_SYSTEM_PROMPT_DATA_TEMPLATE.format(title=title, raw_text=raw_text)
    return static_block, data_block


def request_interpretation(static_block: str, data_block: str) -> dict:
    """Claude에 구조화 출력(JSON Schema)을 요청한다. 실패 시 최소 폴백 데이터로 대체한다.

    static_block(꿈 종류와 무관하게 항상 동일한 페르소나/지시사항)은 cache_control로 표시해,
    Claude 프롬프트 캐싱이 반복 호출 시 그 부분의 입력 토큰 비용을 절감하게 한다."""
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=[
                {"type": "text", "text": static_block, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": data_block},
            ],
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
    static_block, data_block = build_system_prompt(payload.survey)
    return request_interpretation(static_block, data_block)


@router.post("/dream-interpretation-quick")
def create_quick_dream_interpretation(payload: QuickDreamInterpretationRequest) -> dict:
    static_block, data_block = build_quick_system_prompt(payload.title, payload.raw_text)
    return request_interpretation(static_block, data_block)
