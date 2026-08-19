"""AI 무의식 해몽: 6단계 문답 데이터를 그대로 LLM 시스템 프롬프트 인자로 주입해 실시간으로 해몽을 생성한다.

정적 더미 텍스트를 전혀 보관하지 않는다 — 모든 해몽 문구는 매 요청마다 Claude가 동적으로 생성한다.
생성이 실패하면(파싱 오류, API 오류 등) 감성적인 문구로 그럴듯하게 덮어씌우지 않고, 있는 그대로
502 에러를 던져 프론트가 "일시적 오류, 다시 시도해 주세요" 상태를 명확히 보여줄 수 있게 한다.
"""

import json
import logging
from datetime import date as PyDate
from typing import Literal

import anthropic
import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import get_db, get_redis, get_settings
from models import DreamEntry, EntryType, User
from routers.auth import (
    _rate_limit_exceeded,
    _record_rate_limit_attempt,
    _too_many_requests,
    get_current_user_optional,
)

router = APIRouter(prefix="/api", tags=["ai"])
logger = logging.getLogger(__name__)

# --- AI 해몽 레이트리밋 - 실제 Claude API를 호출하는 비용이 드는 경로라, 로그인 브루트포스
# 방어와 같은 Redis INCR+TTL 패턴을 그대로 재사용한다. dream-interpretation과
# dream-interpretation-quick 두 엔드포인트가 같은 카운터를 공유한다(번갈아 호출해서 사실상
# 한도를 두 배로 늘리는 걸 막기 위해) - "10분 동안 이 사용자/IP가 실제 Claude 호출을 몇 번
# 했는가" 하나만 센다. 로그인 사용자는 user_id 기준(정상적인 하루 사용 패턴엔 넉넉하게),
# 비로그인 미리보기는 IP 기준으로 더 빡빡하게 잡는다 - 회원가입 없이도 두드릴 수 있는
# 경로라 남용 위험이 더 크다.
AI_INTERPRET_USER_LIMIT = 10
AI_INTERPRET_ANON_LIMIT = 3
AI_INTERPRET_WINDOW_SECONDS = 600  # 10분


def _ai_interpret_rate_limit_key(current_user: User | None, client_ip: str) -> tuple[str, int]:
    if current_user is not None:
        return f"ai:interpret:user:{current_user.id}", AI_INTERPRET_USER_LIMIT
    return f"ai:interpret:ip:{client_ip}", AI_INTERPRET_ANON_LIMIT


def _enforce_ai_interpret_rate_limit(
    redis_client: redis_lib.Redis, current_user: User | None, request: Request
) -> None:
    client_ip = request.client.host if request.client else "unknown"
    key, limit = _ai_interpret_rate_limit_key(current_user, client_ip)
    if _rate_limit_exceeded(redis_client, key, limit):
        raise _too_many_requests()
    _record_rate_limit_attempt(redis_client, key, AI_INTERPRET_WINDOW_SECONDS)

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
4. action_plan (💡 당신을 위한 라이프 코칭 — 페르소나: 단호한 카리스마 멘토): 단순한 행동 강령
   (To-do list)이나 개조식(Bullet points) 요약을 절대 사용하지 마세요. 대신, 유저의 대인관계와 현재
   상황을 꿰뚫어 보는 '단호하고 카리스마 있는 멘토'의 목소리로 한 편의 완성된 산문(Prose)을
   작성하세요. 아래 작법을 반드시 지키세요:
   (1) 현실 직시(Tough Love): "착각하지 마세요", "단호하게 끊어내세요" 같은 강단 있는 어휘로 유저가
       빠져 있는 환상이나 나약함을 날카롭게 지적하세요.
   (2) 구체적인 대상과 상황 명시: 과거의 인연, 주변의 시기, 흔들리는 감정 등 유저가 겪고 있는 현실의
       문제를 정확히 짚어주세요.
   (3) 내면의 가치 타당화: 날카로운 지적 후에는 반드시 "당신은 그보다 훨씬 가치 있는 사람이다",
       "당신의 선의를 함부로 쓰지 마라"처럼 유저의 자존감을 단단하게 세워주는 위로를 더하세요.
   유저가 정신을 번쩍 차리고 자신의 삶을 통제할 수 있도록, 압도적인 통찰력과 묵직한 여운이 남는
   조언으로 완성하세요.

empathy/unconscious_stage/reality_check는 각각 2~4문장 내외로 작성하세요. action_plan은 위 세
요소(현실 직시·구체적 대상·가치 타당화)가 하나의 응집력 있는 글로 자연스럽게 녹아들어야 하므로,
개조식이나 번호 매기기 없이 5~7문장 이상의 이어지는 산문으로 풍부하게 서술하세요."""

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
        "counseling_report": {
            "type": "object",
            "description": (
                "위 해몽 리포트와는 별개로 함께 채우는 4단계 상담 리포트. 공감형 심리 상담가 + "
                "정신분석학자(프로이트/융) + 단호한 카리스마 멘토, 세 페르소나를 동시에 수행해 작성한다. "
                "아래 lucky_item/lucky_number가 이 안의 action_plan을 실천하는 도구이므로, 이 객체를 먼저 채운다."
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
                    "description": (
                        "💡 당신을 위한 라이프 코칭: 단호한 카리스마 멘토의 목소리로 쓰는 5~7문장 이상의 "
                        "완성된 산문(개조식/번호 매기기 금지). Tough Love로 유저가 빠진 환상·나약함을 "
                        "구체적인 대상(과거의 인연, 주변의 시기, 흔들리는 감정 등)과 함께 날카롭게 짚고, "
                        "그 뒤에 반드시 유저의 내면적 가치를 단단하게 세워주는 위로로 마무리한다."
                    ),
                },
            },
            "required": ["empathy", "unconscious_stage", "reality_check", "action_plan"],
            "additionalProperties": False,
        },
        "lucky_item": {
            "type": "string",
            "description": (
                "🍀 일상 밀착형 행운 아이템. 향초·손거울·크리스탈 같은 신비로운 운세 아이템은 절대 금지. "
                "대신 유저가 당장 책상 위나 가방 안에서 찾을 수 있는 흔한 물건 하나 (예: 차가운 물 한 컵, "
                "스마트폰 메모장, 즐겨 신는 운동화, 이어폰) - 반드시 counseling_report.action_plan을 "
                "실천하는 데 쓸 수 있는 도구여야 한다."
            ),
        },
        "lucky_item_reason": {
            "type": "string",
            "description": "이 물건이 counseling_report.action_plan의 조언을 실천하는 데 구체적으로 어떻게 쓰이는지 1문장으로 설명 (심리적 상징 해설 금지, 실용적 쓰임 위주)",
        },
        "lucky_number": {
            "type": "integer",
            "description": "1~99 사이의 숫자. 수비학적 의미(예: 3은 완성을 상징) 부여는 금지하고, 아래 lucky_number_reason에서 오늘 지킬 행동 규칙의 기준값으로만 쓴다.",
        },
        "lucky_number_reason": {
            "type": "string",
            "description": (
                "미신적 상징 설명 없이, 이 숫자를 counseling_report.action_plan과 이어지는 오늘 하루의 "
                "현실적인 행동 규칙으로 제시 (예: 충동이 들 때 '3'분간 기다리기, 과거에 대한 생각이 들면 "
                "'0'으로 차단하고 다른 일에 집중하기) 1~2문장"
            ),
        },
        "inferred_mood_emoji": {
            "type": "string",
            "description": (
                "이 꿈 서술 전체의 정서적 톤을 가장 잘 나타내는 이모지 하나를, 아래 후보 중에서 정확히 "
                "골라 그대로(다른 문자 추가 없이) 반환하세요: 😱 🤩 😢 😌 🤔 🥰 😰 😠 👁️ 😤 💧 😔 💓 😮 🌀 🤷 ✨. "
                "유저가 이미 별도로 감정 태그를 직접 선택했더라도, 이 필드는 그 선택과 무관하게 서술/데이터 "
                "내용만 근거로 독립적으로 추론해 채우세요 - 유저가 감정 태그를 고르지 않고 저장하는 경우를 "
                "대비한 폴백 값입니다."
            ),
        },
    },
    "required": [
        "tags",
        "description",
        "selected_expert",
        "expert_badge",
        "expert_insight",
        "counseling_report",
        "lucky_item",
        "lucky_item_reason",
        "lucky_number",
        "lucky_number_reason",
        "inferred_mood_emoji",
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
4. counseling_report 작성: 위 [counseling_report 작성 지시사항]에 따라 4개 항목을 모두 빠짐없이 채우세요. lucky_item/lucky_number가 이 안의 action_plan을 참조하므로 반드시 먼저 완성하세요.
5. 일상 밀착형 행운 요소: lucky_item과 lucky_number는 운세스러운 신비 아이템(향초·손거울·크리스탈 등)이나 수비학적 상징(예: "3은 완성을 의미합니다") 부여를 절대 금지합니다. lucky_item은 유저가 책상 위나 가방 안에서 바로 찾을 수 있는 흔한 물건(예: 차가운 물 한 컵, 스마트폰 메모장, 즐겨 신는 운동화, 이어폰) 하나를 counseling_report.action_plan을 실천하는 도구로 제시하고, lucky_number는 오늘 지킬 현실적인 행동 규칙의 기준값(예: 충동이 들 때 "3"분간 기다리기, 과거 생각이 들면 "0"으로 차단하기)으로 의미를 부여하세요.
6. 톤앤매너: 'Dream_Hub' 서비스의 정체성에 맞게 신비롭고 몽환적이면서도, 내면을 꿰뚫어 보는 듯한 차분하고 세련된 어조를 유지하세요.
7. 다양성과 동적 생성: 고정된 결과는 절대 금지합니다. 입력값들의 상호작용을 계산하여 매번 유니크한 키워드 태그와 행운의 요소를 실시간으로 창작하세요.
8. 엄격한 응답 포맷: 대화형 답변이나 서론/결론은 모두 배제하고, 반드시 지정된 JSON 스키마 구조로만 정확히 답변하세요."""

SYSTEM_PROMPT_DATA_TEMPLATE = """[유저의 6단계 무의식 데이터 리포트]
0. 꿈의 제목: {title}
1. 배경의 조도 (Atmosphere & Light): {brightness}
2. 공간의 밀도와 장소 (Space Depth): {space_depth} — 상세 묘사: {space_detail}
3. 시선을 끈 핵심 대상 (Target Factor): {identity_factor} — 상세 묘사: {target_detail}
4. 무의식 속 핵심 행동 (Action & Physics): {action_physics} — 상세 묘사: {action_detail}
5. 현실과의 공명 (Reality Resonance): {reality_link} — 상세 서술: {reality_detail}
6. 차원 제어 지수 (Vividness & Lucid): 선명도 {vividness}%, 자각몽 수준 {lucid_level}{control_level_note}, 추가 잔상 메모: {final_memo}"""

QUICK_SYSTEM_PROMPT_STATIC = """당신은 깊은 통찰력과 감성적인 언어 해설 능력을 겸비한 세계 최고의 심층 심리학자이자 꿈 분석 전문가(Dream Analyst)입니다. 프로이트, 융, 아들러, 게슈탈트 심리학 등 여러 학파에 두루 정통하며, 곧이어 주어지는 유저가 형식 없이 자유롭게 적은 꿈 서술 한 편을 분석해 신뢰감 있고 몽환적인 꿈해몽 보고서를 작성해야 합니다.

{expert_matrix}

{counseling_block}

[수행 지시사항]
1. 유저는 6단계 정밀 문답을 거치지 않고 짧은 서술 하나만 남겼습니다. 문장 속에서 조도·공간·등장 인물/사물·행동·감정의 단서를 스스로 찾아내 6단계 정밀 분석에 준하는 깊이의 해몽을 작성하세요. 단서가 부족한 부분은 서술의 전체 분위기에서 합리적으로 추론하세요.
2. 본문 구조: description은 반드시 '무의식 상태 → 상징 분석 → 자아의 메시지' 3개 문단으로 구성하고, 문단 사이는 빈 줄로 구분하세요. 전체 5~6문장 이상의 풍부한 분량으로 작성해 "짧게 적었을 뿐인데도 내 꿈을 제대로 읽어내는구나"라는 신뢰를 주세요.
3. 전문가 동적 매칭: 위 [주제별 전문가 동적 매칭 규칙]에 따라 이 서술의 핵심 주제를 근거로 가장 적합한 전문가를 selected_expert/expert_badge/expert_insight에 채워 넣으세요.
4. counseling_report 작성: 위 [counseling_report 작성 지시사항]에 따라 4개 항목을 모두 빠짐없이 채우세요. 서술이 짧더라도 전체 분위기에서 합리적으로 추론해 채우세요. lucky_item/lucky_number가 이 안의 action_plan을 참조하므로 반드시 먼저 완성하세요.
5. 일상 밀착형 행운 요소: lucky_item과 lucky_number는 운세스러운 신비 아이템(향초·손거울·크리스탈 등)이나 수비학적 상징(예: "3은 완성을 의미합니다") 부여를 절대 금지합니다. lucky_item은 유저가 책상 위나 가방 안에서 바로 찾을 수 있는 흔한 물건(예: 차가운 물 한 컵, 스마트폰 메모장, 즐겨 신는 운동화, 이어폰) 하나를 counseling_report.action_plan을 실천하는 도구로 제시하고, lucky_number는 오늘 지킬 현실적인 행동 규칙의 기준값(예: 충동이 들 때 "3"분간 기다리기, 과거 생각이 들면 "0"으로 차단하기)으로 의미를 부여하세요.
6. 톤앤매너: 'Dream_Hub' 서비스의 정체성에 맞게 신비롭고 몽환적이면서도, 내면을 꿰뚫어 보는 듯한 차분하고 세련된 어조를 유지하세요.
7. 다양성과 동적 생성: 고정된 결과는 절대 금지합니다. 서술 내용에 맞춰 매번 유니크한 키워드 태그와 행운의 요소를 실시간으로 창작하세요.
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
    # 자각의 정도 - 기존 단순 on/off 토글(is_lucid)을 대신한다. "감독 모드"처럼 세부 통제력까지
    # 물으려면 최소한 순간적으로라도 자각은 했어야 하므로, control_level은 lucid_level이
    # "momentary"/"full"일 때만 의미가 있다.
    lucid_level: Literal["none", "momentary", "full"] = "none"
    control_level: Literal["director", "observer", "lost_control"] | None = None
    final_memo: str
    # --- 씨앗 심기(감정일기) "마음 기록장" 깊이 모드 전용 필드 - 모두 선택값이라 꿈일기
    # (entry_type=dream)나 감정일기 간단 모드는 전혀 채우지 않는다. journal_mode가 "guided"인
    # 행만 아래 필드가 채워진다. 씨앗의 속(genus)은 initial_emotion(+initial_emotion_category)만
    # 근거로 삼고(프론트가 이 값으로 대표 이모지를 골라 emotion 컬럼에 실어 보내므로 백엔드
    # genus 계산 로직은 손대지 않는다), closing_emotion(+closing_emotion_category)은 "감정의
    # 여정" 표시와 성장 배지 판정 전용이라 꽃의 속 분류 자체에는 관여하지 않는다.
    journal_mode: Literal["simple", "guided"] = "simple"
    initial_emotion: str | None = None
    # 사용자가 실제로 고른 대분류 아코디언 - "고통스러운"/"구역질나는"처럼 같은 단어가 여러
    # 대분류(예: 분노/미움)에 겹쳐 있을 때, 이 힌트가 없으면 단어만으로는 어느 쪽을 골랐는지
    # 구분할 수 없어 flower_taxonomy.genus_for_word_or_category가 배열 순서 우선 폴백으로
    # 넘어간다(EMOTION_CATEGORY_TO_GENUS에 없는 값이 오면 같은 폴백). 선택값이라 예전
    # 프론트 버전이 안 보내도(레거시 초안 등) 여전히 정상 동작한다.
    initial_emotion_category: str | None = None
    trigger_event: str | None = None
    desire: str | None = None
    message_to_other: str | None = None
    desired_message: str | None = None
    self_compassion: str | None = None
    closing_emotion: str | None = None
    closing_emotion_category: str | None = None

    @field_validator("control_level")
    @classmethod
    def _clear_control_level_when_not_lucid(cls, value, info):
        # 프론트가 실수로 값을 남겨 보내도, 일반 꿈(lucid_level="none")이면 서버가 조용히 무효화한다.
        if info.data.get("lucid_level") == "none":
            return None
        return value


# routers/dreams.py의 저장 payload가 이 모델을 그대로 재사용한다 - AI 응답의 counseling_report와
# 필드가 어긋나면 저장할 때 조용히 잘려나가므로, 두 스키마가 항상 같은 소스를 공유하게 한다.
class CounselingReportInput(BaseModel):
    empathy: str
    unconscious_stage: str
    reality_check: str
    action_plan: str


class LinkedDiaryContext(BaseModel):
    """이 꿈을 꾸기 전(같은 취침일의) 감정일기 내용 - 서버가 DB에서 직접 조회해 채운다
    (예전엔 프론트가 이미 화면에 로드해 둔 목록에서 조립해 보냈는데, 화면마다 그 목록을
    안 갖고 있으면 - 예: /journal/record 전용 페이지 - 조용히 빠지는 문제가 있었다. 이제는
    요청 쪽에서 이 필드 자체를 보내지 않고, 아래 _resolve_linked_diary_context가 매 요청마다
    직접 조회한다). journal_mode로 형태가 갈린다:
    - guided(마음 기록장): 서술형 5개(trigger_event~self_compassion)가 채워진다.
    - simple(간단히 쓰기): 자유 텍스트(body) + 그날 고른 감정 이모지(mood_emoji) 하나만 채워진다.
    원본 텍스트를 요약하지 않고 그대로 전달하되(질문당 몇 문장 수준이라 별도 요약 호출을
    추가하면 오히려 지연시간+비용만 늘고 절감 효과는 미미하다), 극단적으로 긴 간단 모드
    본문만 방어적으로 길이를 자른다(_truncate 참고)."""

    journal_mode: Literal["simple", "guided"]
    trigger_event: str | None = None
    desire: str | None = None
    message_to_other: str | None = None
    desired_message: str | None = None
    self_compassion: str | None = None
    body: str | None = None
    mood_emoji: str | None = None


class DreamInterpretationRequest(BaseModel):
    date: str | None = None
    emotion: str | None = None
    is_public: bool | None = None
    survey: DreamSurveyInput


class QuickDreamInterpretationRequest(BaseModel):
    title: str
    raw_text: str
    date: str | None = None


# --- 비즈니스 로직: 프롬프트 주입 / Claude 호출 -----------------------------


_LUCID_LEVEL_LABEL = {"none": "일반 꿈(자각 없음)", "momentary": "순간적 자각", "full": "완벽한 자각몽"}
_CONTROL_LEVEL_LABEL = {"director": "감독 모드(적극적 통제)", "observer": "관찰자/참여자 모드", "lost_control": "통제 상실"}


_LINKED_DIARY_BODY_MAX_CHARS = 600


def _truncate(text: str, max_chars: int = _LINKED_DIARY_BODY_MAX_CHARS) -> str:
    """토큰 비용 방어용 하드 캡 - 별도 요약 LLM 호출 없이(LinkedDiaryContext 독스트링 참고),
    지나치게 긴 자유 서술(주로 간단 모드 본문)만 앞부분 위주로 잘라낸다. 마음 기록장 서술형
    답변은 원래 질문당 몇 문장 수준이라 이 한도에 거의 걸리지 않는다."""
    stripped = text.strip()
    if len(stripped) <= max_chars:
        return stripped
    return f"{stripped[:max_chars].rstrip()}…"


def _diary_entry_to_context(survey: dict, emotion: str) -> LinkedDiaryContext | None:
    """감정일기 DreamEntry의 survey(JSON)/emotion 컬럼을 LinkedDiaryContext로 변환하는 순수
    함수 - DB 세션이 필요 없어 라이브 서버 없이 단위 테스트할 수 있다(실제 조회는
    _find_linked_diary_entry가 담당). journal_mode가 "guided"면 서술형 5개를, 그 외(간단
    모드/필드 자체가 없는 옛 기록)는 본문(action_detail)을 쓴다 - 본문마저 비어 있으면
    (제목만 있고 내용은 없는 등) 이 감정일기는 컨텍스트로서 의미가 없어 None을 돌려준다."""
    if survey.get("journal_mode") == "guided":
        return LinkedDiaryContext(
            journal_mode="guided",
            trigger_event=survey.get("trigger_event"),
            desire=survey.get("desire"),
            message_to_other=survey.get("message_to_other"),
            desired_message=survey.get("desired_message"),
            self_compassion=survey.get("self_compassion"),
        )
    body = (survey.get("action_detail") or "").strip()
    if not body:
        return None
    return LinkedDiaryContext(journal_mode="simple", body=_truncate(body), mood_emoji=emotion or None)


def _find_linked_diary_entry(db: Session, user_id: int, target_date: PyDate) -> DreamEntry | None:
    """같은 취침일(dream_date)의 감정일기 중 가장 먼저 쓴 편을 찾는다 - 하루에 여러 편을
    남겨도 항상 첫 편만 근거로 삼는다("최초 감정일기 = 그날의 씨앗" 원칙과 같은 이유,
    프론트가 예전에 guidedDiaryContextByDate를 만들 때 쓰던 것과 같은 규칙)."""
    return (
        db.query(DreamEntry)
        .filter(
            DreamEntry.user_id == user_id,
            DreamEntry.entry_type == EntryType.EMOTION,
            DreamEntry.dream_date == target_date,
        )
        .order_by(DreamEntry.created_at.asc())
        .first()
    )


def _resolve_linked_diary_context(db: Session, current_user: User | None, date_str: str | None) -> LinkedDiaryContext | None:
    """AI 해몽 요청 시점에 같은 취침일의 감정일기를 직접 조회해 LinkedDiaryContext로 만든다.
    비로그인 미리보기(current_user=None)거나 날짜가 없거나(quick 모드에서 프론트가 안 보낸
    구버전 등) 그 날짜에 감정일기가 없으면 조용히 None을 돌려준다 - 해몽 자체는 항상 기존
    방식 그대로 진행되고 에러가 나지 않는다(완료 기준의 핵심 요구사항)."""
    if current_user is None or not date_str:
        return None
    try:
        target_date = PyDate.fromisoformat(date_str)
    except ValueError:
        return None
    entry = _find_linked_diary_entry(db, current_user.id, target_date)
    if entry is None:
        return None
    return _diary_entry_to_context(entry.survey or {}, entry.emotion)


def _linked_diary_context_block(context: LinkedDiaryContext | None) -> str:
    """감정일기 내용을 DATA 블록에 덧붙일 문자열로 만든다. STATIC 블록(캐시 대상)이 아니라
    DATA 블록에만 얹는다 - 요청마다 있고 없고가 갈리는 내용을 STATIC 쪽에 넣으면 캐시
    히트율만 떨어뜨릴 뿐 실익이 없다. journal_mode에 따라 두 형태 중 하나로 렌더링하고,
    채워진 내용이 하나도 없으면(감정일기가 없는 날 등) 빈 문자열을 돌려줘 프롬프트에 아무
    흔적도 남기지 않는다 - 회귀 없음."""
    if context is None:
        return ""
    if context.journal_mode == "guided":
        lines = [
            ("무슨 일이 있었나요", context.trigger_event),
            ("진짜 바랐던 것", context.desire),
            ("그때 하고 싶었던 말", context.message_to_other),
            ("반대로 듣고 싶었던 말", context.desired_message),
            ("스스로에게 해준 위로", context.self_compassion),
        ]
        filled = [(label, value.strip()) for label, value in lines if value and value.strip()]
        if not filled:
            return ""
        body = "\n".join(f"- {label}: {value}" for label, value in filled)
    else:
        body_text = (context.body or "").strip()
        if not body_text:
            return ""
        mood_line = f"- 그날의 감정: {context.mood_emoji}\n" if context.mood_emoji else ""
        body = f"{mood_line}- 자유롭게 적은 하루: {body_text}"
    return (
        "\n\n[이 꿈을 꾸기 전, 낮에 남긴 감정일기 기록]\n"
        f"{body}\n"
        "※ 위 낮의 감정 기록도 함께 참고해, 밤의 꿈과 낮의 감정이 어떻게 이어지는지 자연스럽게 녹여 해몽하세요."
    )


def build_system_prompt(survey: DreamSurveyInput, linked_diary_context: LinkedDiaryContext | None = None) -> tuple[str, str]:
    """6단계 문답 응답을 (캐시 가능한 STATIC 블록, 매번 바뀌는 DATA 블록) 튜플로 나눠 반환한다.
    순수 함수로 유지한다 - linked_diary_context는 이미 조회를 마친 값을 그대로 주입받을 뿐,
    이 함수 자체는 db/user에 접근하지 않는다(실제 조회는 _resolve_linked_diary_context가
    라우트 레이어에서 담당). 값이 없으면(비로그인/감정일기 없는 날 등) 이전과 완전히
    동일하게 동작한다."""
    static_block = SYSTEM_PROMPT_STATIC.format(expert_matrix=EXPERT_MATRIX_BLOCK, counseling_block=COUNSELING_REPORT_BLOCK)
    control_level_note = (
        f", 꿈 통제력 {_CONTROL_LEVEL_LABEL[survey.control_level]}" if survey.control_level is not None else ""
    )
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
        lucid_level=_LUCID_LEVEL_LABEL[survey.lucid_level],
        control_level_note=control_level_note,
        final_memo=survey.final_memo or "(없음)",
    )
    data_block += _linked_diary_context_block(linked_diary_context)
    return static_block, data_block


def build_quick_system_prompt(title: str, raw_text: str, linked_diary_context: LinkedDiaryContext | None = None) -> tuple[str, str]:
    """⚡ 10초 미니멀 빠른 기록 모드: 6단계 문답 없이 자유 서술 한 편만으로 DATA 블록을 구성한다.
    linked_diary_context 처리는 build_system_prompt와 완전히 동일하다."""
    static_block = QUICK_SYSTEM_PROMPT_STATIC.format(expert_matrix=EXPERT_MATRIX_BLOCK, counseling_block=COUNSELING_REPORT_BLOCK)
    data_block = QUICK_SYSTEM_PROMPT_DATA_TEMPLATE.format(title=title, raw_text=raw_text)
    data_block += _linked_diary_context_block(linked_diary_context)
    return static_block, data_block


def request_interpretation(static_block: str, data_block: str) -> dict:
    """Claude에 구조화 출력(JSON Schema)을 요청한다.

    static_block(꿈 종류와 무관하게 항상 동일한 페르소나/지시사항)은 cache_control로 표시해,
    Claude 프롬프트 캐싱이 반복 호출 시 그 부분의 입력 토큰 비용을 절감하게 한다.

    실패 시(파싱 오류, API 오류, 인증 누락 등) 감성적인 문구로 그럴듯하게 대체하지 않고,
    원인을 서버 로그에 상세히 남긴 뒤 502로 그대로 실패를 알린다 - 프론트가 진짜 결과와
    가짜 위로 문구를 구분하지 못하는 상황을 막기 위함이다."""
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=MODEL,
            # counseling_report(4개 항목) 추가 이후 출력 스키마가 커져, 2048로는 응답이
            # 중간에 잘려 JSONDecodeError가 나는 경우가 있었다 - 여유 있게 4096으로 상향.
            max_tokens=4096,
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
        logger.error(
            "AI 해몽 생성 실패 - 원인: %s: %s",
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=502,
            detail="AI 해몽 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
        ) from exc


# --- 라우트: 얇은 HTTP 어댑터 --------------------------------------------
# 두 라우트 모두 비로그인 상태에서도 미리보기를 계산할 수 있어야 한다(dreams.py 모듈
# docstring 참고) - get_current_user가 아니라 get_current_user_optional을 써서, 토큰이
# 없거나 유효하지 않아도 401 대신 None으로 넘어가게 한다. 그러면 _resolve_linked_diary_context가
# 조용히 컨텍스트 없이(None) 진행해, 비로그인 미리보기도 기존과 동일하게 계속 동작한다.


@router.post("/dream-interpretation")
def create_dream_interpretation(
    payload: DreamInterpretationRequest,
    request: Request,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
    redis_client: redis_lib.Redis = Depends(get_redis),
) -> dict:
    _enforce_ai_interpret_rate_limit(redis_client, current_user, request)
    linked_diary_context = _resolve_linked_diary_context(db, current_user, payload.date)
    static_block, data_block = build_system_prompt(payload.survey, linked_diary_context)
    return request_interpretation(static_block, data_block)


@router.post("/dream-interpretation-quick")
def create_quick_dream_interpretation(
    payload: QuickDreamInterpretationRequest,
    request: Request,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
    redis_client: redis_lib.Redis = Depends(get_redis),
) -> dict:
    _enforce_ai_interpret_rate_limit(redis_client, current_user, request)
    linked_diary_context = _resolve_linked_diary_context(db, current_user, payload.date)
    static_block, data_block = build_quick_system_prompt(payload.title, payload.raw_text, linked_diary_context)
    return request_interpretation(static_block, data_block)
