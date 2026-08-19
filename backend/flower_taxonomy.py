"""정원 꽃 도감 분류 체계 - 속(Genus) x 종(Species/Archetype) x 변종(길흉+희귀도).

씨앗을 심을 때 즉시 기록되는 seed_type(EmotionCategory, 감정 대분류 7종)과는 계산 시점이
다른 별도 경로다 - 이 모듈은 개화(bloom) 순간에만 호출되어, 그날 감정일기를 다시 조회해
"어떤 이름/색의 꽃이 정원에 피는가"만을 독립적으로 결정한다(보통은 같은 감정에서 나와
seed_type과 genus가 EMOTION_CATEGORY_TO_GENUS로 서로 대응하지만, 이 모듈은 그 대응 관계에
기대지 않고 항상 스스로 다시 계산한다):

- 속(genus): 그 밤 감정일기(다이어리)에서 고른 감정 -> 8계열(온기/격동/몽환/여운/생동
  + 환희/냉담/동경). 이름의 형용사와 꽃 색을 결정한다. 간단 모드(이모지)는 여전히 기존
  5계열만 나오고, 신규 3계열은 깊이 모드("마음 기록장" 단어 선택)로만 도달한다 - 자세한
  이유는 GENUS_DESCRIPTIONS 주석 참고.
- 종(archetype/species): AI가 꿈 해몽에서 붙인 해시태그를 8개 원형 클러스터에
  키워드 매칭시켜 분류하고, 그 안에서 종 명사 하나를 고른다. 기존 5속 경로는 원형마다
  3개 풀에서 의사난수로 고르고(24종), 신규 3속 경로는 원형마다 그 속 전용 종 하나로
  결정론적으로 고정된다(NEW_GENUS_SPECIES, 15종) - 자세한 내용은 classify_species 참고.
- 변종: 길몽/흉몽(반짝임 vs 그림자 톤)과, 전체 유저 데이터 기준 (원형, 종) 조합의
  발생 빈도로 매기는 희귀도(1~3성) - 희귀도는 garden.py가 조회 시점에 계산한다.

전설의 꽃 6종은 이 속x종 공식을 따르지 않고, 별도 조건(연속 기록/새벽 저장/반복 인연/
강한 부정 감정 조합/월간 수집량/처음 느낀 감정)을 만족했을 때만 대신 생성된다.

도감(compendium)의 "종" 단위는 genus와 무관하게 species_name(24 + 15 = 39개) +
legendary_key(6개) = 총 45개다 - 같은 종이라도 그날의 감정(genus)에 따라 형용사/색만
달라질 뿐, 도감 슬롯과 희귀도는 종 단위로 집계한다(속까지 곱하면 조합이 지나치게 잘게
쪼개져 "희귀도"라는 말이 무의미해지기 때문).
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from datetime import date as PyDate, timedelta, timezone

import anthropic
from sqlalchemy.orm import Session

from database import get_settings
from emotion_wordbook import genus_for_word_or_category
from models import DreamEntry, DreamSeed, SeedStatus, User

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


def _seeded_fraction(seed_id: int, salt: str) -> float:
    """seed_id+salt 조합마다 항상 같은 [0, 1) 값을 돌려주는 결정론적 의사난수.
    Python의 내장 hash()는 문자열에 대해 프로세스마다 랜덤화되어(PYTHONHASHSEED)
    재현 불가능하므로 쓰지 않는다 - 순수 수식만으로 계산한다."""
    salt_value = sum(ord(ch) for ch in salt)
    combined = seed_id * 999331 + salt_value * 97 + 12.9898
    x = math.sin(combined) * 43758.5453
    return x - math.floor(x)


# --- 1. 속(Genus) - 감정일기 감정 8계열(기존 5 + 신규 3) ---------------------

GENUS_BY_EMOJI: dict[str, str] = {
    # 온기: 행복, 평온, 설렘
    "🥰": "온기", "😌": "온기", "💓": "온기",
    # 격동: 불안, 분노, 무서움, 답답함
    "😰": "격동", "😠": "격동", "😱": "격동", "😤": "격동",
    # 몽환: 혼란, 기묘함, 황당함, 놀람
    "🤔": "몽환", "🌀": "몽환", "🤷": "몽환", "😮": "몽환",
    # 여운: 슬픔, 그리움, 찝찝함
    "😢": "여운", "😔": "여운", "💧": "여운",
    # 생동: 신남, 생생함, 경이로움
    "🤩": "생동", "👁️": "생동", "✨": "생동",
}
DEFAULT_GENUS = "몽환"
NIGHTMARE_EMOJIS = {"😱", "😢", "😰", "😠", "😤", "💧"}

GENUS_ADJECTIVES: dict[str, list[str]] = {
    "온기": ["다정한", "포근한", "은은한"],
    "격동": ["날카로운", "뜨거운", "거친"],
    "몽환": ["자유로운", "흐릿한", "낯선"],
    "여운": ["저무는", "젖은", "아득한"],
    "생동": ["눈부신", "피어나는", "반짝이는"],
    # --- 신규 3속(마음 기록장 7개 대분류 도입 이후 분리) - 기존 5속의 의미는 그대로 두고,
    # 지금까지 억지로 합쳐뒀던 감정만 분리했다: 온기(사랑+기쁨) -> 온기(사랑) + 환희(기쁨),
    # 격동(분노+미움) -> 격동(분노) + 냉담(미움), 여운(슬픔+바램) -> 여운(슬픔) + 동경(바램).
    # 형용사 풀은 emotion_wordbook 확장 프롬프트가 지정한 5개를 그대로 쓴다(기존 속은 3개씩
    # 이었지만, 신규 속은 새로 만드는 김에 조금 더 풍성하게 5개로 시작한다 - pick_adjective가
    # 몇 개든 동일한 방식으로 처리하므로 개수가 달라도 문제없다). ---
    "환희": ["눈부신", "반짝이는", "짜릿한", "환한", "벅찬"],
    "냉담": ["차가운", "냉랭한", "얼어붙은", "서늘한", "시린"],
    "동경": ["아득한", "간절한", "그리운", "아스라한", "애타는"],
}

# [주 컬러, 보조 컬러] - BloomTile/상세 모달이 이 값으로 꽃 톤을 그린다.
GENUS_COLORS: dict[str, tuple[str, str]] = {
    "온기": ("#fb923c", "#fde2c8"),
    "격동": ("#ef4444", "#a855f7"),
    "몽환": ("#818cf8", "#c4b5fd"),
    "여운": ("#64748b", "#475569"),
    "생동": ("#fbbf24", "#fb923c"),
    # 환희 = 밝은 노랑/금빛(따뜻한 온기의 주황보다 더 쨍하고 눈부신 톤으로 구분).
    "환희": ("#facc15", "#fef9c3"),
    # 냉담 = 차가운 청회색/옅은 블루 - 격동의 뜨거운 빨강과 정반대 온도감으로 대비시켰다.
    "냉담": ("#64748b", "#cbd5e1"),
    # 동경 = 먼지 낀 보라/라벤더 - 여운의 무채색 슬레이트보다 한 톤 더 아련하고 몽환에 가깝지만,
    # 채도를 낮춰 몽환(생기 있는 인디고)과는 구분되게 했다.
    "동경": ("#a78bfa", "#ddd6fe"),
}

# 성장 배지(부정->긍정 감정 전환) 판정용 - 8속 전체를 커버한다. 환희/생동/온기는 긍정,
# 격동/여운/냉담/동경은 부정, 몽환만 중립(혼란/놀람 등은 방향성을 판단하기 어려워 배지
# 판정에서 제외).
GENUS_POLARITY: dict[str, str] = {
    "온기": "positive",
    "환희": "positive",
    "생동": "positive",
    "격동": "negative",
    "여운": "negative",
    "냉담": "negative",
    "동경": "negative",
    "몽환": "neutral",
}

# "기타(직접입력)" 자유 텍스트를 AI로 분류할 때 계열을 설명해 주는 문장 - 17개 고정 태그의
# 예시 감정을 그대로 근거로 대므로, 위 GENUS_BY_EMOJI 표가 바뀌면 이 설명도 함께 맞춰야 한다.
# 신규 3속(환희/냉담/동경)은 여기 포함하지 않는다 - 이 AI 분류는 간단 모드의 17개 고정
# 이모지 밖의 자유 입력을 대상으로 하는데, 간단 모드는 애초에 "기쁨 vs 사랑"처럼 신규 속이
# 갈라낸 세밀한 구분을 할 수 없는 입력(이모지 하나)이라 여전히 기존 5속 중 하나로만
# 분류한다 - 신규 속은 오직 마음 기록장(단어 선택)을 거쳐서만 도달한다.
GENUS_DESCRIPTIONS: dict[str, str] = {
    "온기": "행복, 평온, 설렘처럼 따뜻하고 안정된 긍정적 정서",
    "격동": "불안, 분노, 무서움, 답답함처럼 격렬하고 부정적인 긴장 상태",
    "몽환": "혼란, 기묘함, 황당함, 놀람처럼 낯설고 비현실적인 정서",
    "여운": "슬픔, 그리움, 찝찝함처럼 가라앉아 오래 남는 정서",
    "생동": "신남, 생생함, 경이로움처럼 활기차고 강렬한 긍정적 정서",
}

_CLASSIFY_MODEL = "claude-opus-4-8"

_CUSTOM_GENUS_SCHEMA = {
    "type": "object",
    "properties": {
        "genus": {
            "type": "string",
            "enum": list(GENUS_DESCRIPTIONS.keys()),
            "description": "이 감정 단어와 의미상 가장 가까운 계열",
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "low"],
            "description": "이 단어가 5계열 중 하나로 뚜렷하게 판별되면 high, 애매하거나 감정 단어로 보기 어려우면 low",
        },
    },
    "required": ["genus", "confidence"],
    "additionalProperties": False,
}


def _classify_custom_genus(text: str) -> str:
    """사전 정의 17개 감정 태그에 없는 "기타(직접입력)" 자유 텍스트를 5계열 중 하나로
    AI 분류한다. API 실패/저신뢰도/파싱 오류 등 어떤 이유로든 실패하면 조용히
    DEFAULT_GENUS(몽환)로 폴백한다 - 몽환은 낯설고 정의되지 않은 정서를 대표하는 계열이라
    폴백으로도 자연스럽다. 이 함수 자체가 실패해 꽃 개화(classify_flower)가 막히는 일은
    없어야 하므로, 예외를 여기서 전부 삼킨다."""
    try:
        settings = get_settings()
        if not settings.anthropic_api_key:
            return DEFAULT_GENUS
        genus_list = "\n".join(f"- {genus}: {desc}" for genus, desc in GENUS_DESCRIPTIONS.items())
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=_CLASSIFY_MODEL,
            max_tokens=100,
            system=(
                "유저가 직접 입력한 감정 단어 하나를 아래 5개 감정 계열 중 의미상 가장 가까운 "
                f"하나로 분류하세요.\n{genus_list}"
            ),
            output_config={"format": {"type": "json_schema", "schema": _CUSTOM_GENUS_SCHEMA}},
            messages=[{"role": "user", "content": f"감정 단어: {text}"}],
        )
        text_block = next(block.text for block in response.content if block.type == "text")
        result = json.loads(text_block)
        if result.get("confidence") != "high":
            return DEFAULT_GENUS
        genus = result.get("genus")
        return genus if genus in GENUS_ADJECTIVES else DEFAULT_GENUS
    except Exception:
        logger.warning("커스텀 감정 태그 계열 분류 실패 - 몽환 계열로 폴백: %r", text, exc_info=True)
        return DEFAULT_GENUS


def genus_for_emoji(emoji: str | None) -> str:
    if not emoji:
        return DEFAULT_GENUS
    if emoji in GENUS_BY_EMOJI:
        return GENUS_BY_EMOJI[emoji]
    # 17개 고정 태그가 아닌 "기타(직접입력)" 자유 텍스트 - AI 분류를 시도하고, 실패/저신뢰면
    # _classify_custom_genus 내부에서 이미 DEFAULT_GENUS로 폴백해 돌아온다.
    return _classify_custom_genus(emoji)


def genus_for_emotion_input(
    *, emoji: str | None, guided_word: str | None, guided_category: str | None = None
) -> tuple[str, str, str]:
    """감정 입력 -> 속을 결정하는 단일 창구. 간단 모드(이모지)와 깊이 모드(마음 기록장 단어)
    양쪽 다 이 함수 하나를 거쳐야 한다 - 갈라지면 "같은 감정인데 모드에 따라 다른 속이 나오는"
    버그가 생기기 쉽다.

    깊이 모드(guided_word가 있을 때)는 단어 하나하나를 개별 매핑하지 않고, 그 단어가 속한
    7개 대분류를 먼저 찾아(emotion_wordbook.genus_for_word_or_category) 대분류 -> 8속 표
    하나만 적용한다(기존 5속 중 3개는 깊이 모드에서만 갈라지는 신규 속으로 이어진다 -
    EMOTION_CATEGORY_TO_GENUS). guided_category는 "실제로 어느 대분류 아코디언에서 골랐는지"
    프론트가 함께 보내는 힌트 - "고통스러운"/"구역질나는"처럼 같은 단어가 분노/미움 둘 다에
    실재하는 경우, 이 힌트가 없으면 단어만으로는 어느 쪽을 골랐는지 구분할 수 없어 항상 배열
    순서상 먼저인 분노/격동으로 귀결됐다(레거시 기록은 이 힌트가 없어 여전히 그렇게 폴백된다).
    단어장에 없는 값이 오면(이론상 발생하지 않지만 방어적으로) 간단 모드의 "기타(직접입력)"와
    완전히 같은 AI 커스텀 분류 경로로 그대로 넘긴다 - 두 모드가 "모르는 입력을 처리하는 방식"
    까지 하나로 통일된다.

    반환값은 (속, 실제 판정에 쓰인 모드, 판정 근거 문자열) 튜플 - 뒤 두 값은 seed.genus_source_*
    에 그대로 저장해, 나중에 "왜 이 꽃이 이 속으로 피었는지"를 추적할 수 있게 한다."""
    if guided_word:
        genus = genus_for_word_or_category(guided_word, guided_category)
        if genus is not None:
            return genus, "guided", guided_word
        # 단어장에 없는 값 - 이모지 매핑 없이 곧장 AI 커스텀 분류로 넘긴다(간단 모드의
        # "기타" 자유 텍스트 처리와 동일한 함수를 그대로 재사용).
        return _classify_custom_genus(guided_word), "guided", guided_word
    return genus_for_emoji(emoji), "simple", emoji or ""


# --- 2. 종(Species) - 꿈 AI 해시태그 8원형 x 3종 -----------------------------


@dataclass(frozen=True)
class Archetype:
    key: str
    keywords: list[str]
    species: list[str]


ARCHETYPES: list[Archetype] = [
    Archetype("관계/재회형", ["전연인", "가족", "친구", "재회", "연인", "인연"], ["들꽃", "제비꽃", "프리지아"]),
    Archetype("추적/도피형", ["쫓김", "도망", "위협", "추격", "회피"], ["엉겅퀴", "가시나무꽃", "선인장꽃"]),
    Archetype("비행/자유형", ["하늘", "비행", "탈출", "해방", "자유", "날아"], ["민들레", "나팔꽃", "개양귀비"]),
    Archetype("잠식/물형", ["바다", "잠김", "익사", "파도", "물", "폭우", "잠수"], ["수련", "물망초", "부처꽃"]),
    Archetype("시험/평가형", ["시험", "노출", "평가", "실수", "지각", "낙제", "준비부족"], ["도라지", "초롱꽃", "금낭화"]),
    Archetype("탐험/발견형", ["새로운공간", "미로", "발견", "탐험", "낯선장소", "여행"], ["해바라기", "튤립", "다알리아"]),
    Archetype("상실/이별형", ["이별", "상실", "죽음", "떠남", "그리움", "미해결감정"], ["안개꽃", "수국", "리시안셔스"]),
    Archetype("성장/변신형", ["변신", "탈피", "성장", "재탄생", "도전", "자신감", "극복"], ["크로커스", "나비꽃", "접시꽃"]),
]
ARCHETYPE_BY_KEY: dict[str, Archetype] = {archetype.key: archetype for archetype in ARCHETYPES}

# 원형(archetype)마다 "의미상 자연스러운" 대표 감정 계열(genus) 참고표 - 실제 개화 시점의
# genus는 항상 그 밤 감정일기/꿈의 실제 emotion에서 파생되고(genus_for_emoji) 이 표와
# 무관하게 결정된다(그게 원래 설계다: 같은 원형이라도 그날그날 다른 색으로 핀다). 이 표는
# 오직 (1) 카탈로그/예시 데이터를 만들 때 형용사를 생동 계열 3개로만 몰아 쓰지 않고 8원형에
# 걸쳐 다양하게 배분하기 위한 참고용, (2) 실제 꿈 기록과 연결되지 않은 채로 심어진 예시 씨앗
# (관리자 지급 등)의 기본값으로만 쓰인다.
ARCHETYPE_DEFAULT_GENUS: dict[str, str] = {
    "관계/재회형": "온기",
    "추적/도피형": "격동",
    "비행/자유형": "생동",
    "잠식/물형": "몽환",
    "시험/평가형": "격동",
    "탐험/발견형": "생동",
    "상실/이별형": "여운",
    "성장/변신형": "몽환",
}

STRONG_NEGATIVE_KEYWORDS = ["무서움", "공포", "두려움", "분노", "화남", "증오", "혐오", "위협", "고통", "절박"]

# 신규 3속(환희/냉담/동경) 전용 종 15개 - (속, 원형) 조합마다 지정된 새 종 명사 하나씩.
# 기존 24종(위 ARCHETYPES.species)은 절대 건드리지 않는다 - 이 표에 없는 (속, 원형) 조합은
# (기존 5속이거나, 신규 속인데 그 속이 커버하지 않는 원형이거나) 여전히 그 원형의 기존 3종
# 풀에서 그대로 고른다. 신규 속마다 정확히 5개 원형만 골라 배정했다(8개 원형과의 정서적
# 어울림 기준) - 나머지 3개 원형에서 그 신규 속이 나오면 기존 종으로 자연스럽게 폴백된다.
NEW_GENUS_SPECIES: dict[str, dict[str, str]] = {
    "환희": {
        "관계/재회형": "금잔화",
        "비행/자유형": "황매화",
        "탐험/발견형": "금계국",
        "시험/평가형": "백일홍",
        "성장/변신형": "카랑코에",
    },
    "냉담": {
        "관계/재회형": "서리꽃",
        "추적/도피형": "얼음새꽃",
        "잠식/물형": "설련화",
        "상실/이별형": "얼음꽃",
        "시험/평가형": "냉이꽃",
    },
    "동경": {
        "상실/이별형": "라일락",
        "관계/재회형": "메꽃",
        "잠식/물형": "수레국화",
        "비행/자유형": "구절초",
        "탐험/발견형": "에델바이스",
    },
}
NEW_SPECIES_COUNT = sum(len(mapping) for mapping in NEW_GENUS_SPECIES.values())  # 5 x 3 = 15


def classify_species(tags: list[str], seed_id: int, genus: str) -> tuple[str, str]:
    """태그 -> (원형 키, 종 명사). 매칭 점수가 가장 높은 원형을 고르고, 그 안에서 종 명사를
    정한다. 태그가 하나도 안 걸리면 seed_id로 8원형 중 하나를 결정론적으로 고른다 - 그래도
    항상 유효한 (원형, 종)을 돌려줘, 태그가 없는 꿈도 반드시 어떤 꽃이 되게 한다.

    genus가 신규 3속(환희/냉담/동경) 중 하나면서 이 원형에 그 속 전용 종이 지정돼 있으면
    (NEW_GENUS_SPECIES) 그 종을 그대로 쓴다 - 신규 속은 이 15종이 "그 속에서만 나오는" 진짜
    새 종이어야 하므로 결정론적으로 고정한다(굳이 의사난수로 고를 이유가 없다, 원형당 신규
    속의 종은 하나뿐이라서). 그 외(기존 5속이거나, 신규 속인데 이 원형을 커버하지 않으면)는
    기존 3종 풀에서 seed_id 기반 의사난수로 고르는 예전 로직을 그대로 쓴다."""
    normalized = [tag.lstrip("#") for tag in tags]

    def score(archetype: Archetype) -> int:
        return sum(1 for tag in normalized for keyword in archetype.keywords if keyword in tag)

    best = max(ARCHETYPES, key=score)
    if score(best) == 0:
        index = int(_seeded_fraction(seed_id, "archetype_fallback") * len(ARCHETYPES))
        best = ARCHETYPES[min(index, len(ARCHETYPES) - 1)]

    new_species = NEW_GENUS_SPECIES.get(genus, {}).get(best.key)
    if new_species:
        return best.key, new_species

    species_index = int(_seeded_fraction(seed_id, f"species:{best.key}") * len(best.species))
    species_name = best.species[min(species_index, len(best.species) - 1)]
    return best.key, species_name


def pick_adjective(genus: str, seed_id: int, species_name: str, existing_names: set[str]) -> str:
    """같은 (형용사+종) 이름이 이미 이 유저 도감에 있으면 다른 형용사로 재선택한다 -
    실제 꽃 인스턴스는 별개이므로 이름만 다양화한다(3개를 모두 이미 써봤다면 그냥 겹친다)."""
    adjectives = GENUS_ADJECTIVES.get(genus, GENUS_ADJECTIVES[DEFAULT_GENUS])
    start = int(_seeded_fraction(seed_id, genus) * len(adjectives))
    for offset in range(len(adjectives)):
        candidate = adjectives[(start + offset) % len(adjectives)]
        if f"{candidate} {species_name}" not in existing_names:
            return candidate
    return adjectives[start]


# --- 3. 전설의 꽃 6종 - 속x종 공식과 무관한 특수 조건 ------------------------

LEGENDARY_INFO: dict[str, dict[str, str]] = {
    "몽환화": {"hint": "며칠을 꾸준히 이어온 밤에만 나타난대요."},
    "여명초": {"hint": "아주 깊은 새벽에만 모습을 보인대요."},
    "재회화": {"hint": "자꾸만 마주치는 얼굴이 있다면…"},
    "폭풍의 장미": {"hint": "마음이 크게 요동친 밤, 그 흔적일지도 몰라요."},
    "성단화": {"hint": "한 달 동안 정원을 부지런히 가꾸면 볼 수 있을지도."},
    "초행의 꽃": {"hint": "한 번도 느껴본 적 없는 감정을 마주했을 때."},
}
# 하루에 여러 조건이 동시에 만족돼도 하나만 부여한다 - 이 순서가 우선순위다.
LEGENDARY_PRIORITY = ["몽환화", "여명초", "재회화", "폭풍의 장미", "성단화", "초행의 꽃"]


def _has_seven_day_streak(db: Session, user_id: int, today: PyDate) -> bool:
    bloomed_dates = {
        row[0]
        for row in db.query(DreamSeed.planted_at)
        .filter(
            DreamSeed.user_id == user_id,
            DreamSeed.status == SeedStatus.BLOOMING,
            DreamSeed.planted_at >= today - timedelta(days=6),
            DreamSeed.planted_at <= today,
        )
        .all()
    }
    return all((today - timedelta(days=offset)) in bloomed_dates for offset in range(7))


def _is_dawn_save(dream_entry: DreamEntry) -> bool:
    hour = dream_entry.created_at.astimezone(KST).hour
    return 0 <= hour < 4


def _has_reunion_repeat(db: Session, user_id: int, this_seed_id: int, archetype_key: str) -> bool:
    if archetype_key != "관계/재회형":
        return False
    recent_archetypes = (
        db.query(DreamSeed.archetype)
        .filter(DreamSeed.user_id == user_id, DreamSeed.status == SeedStatus.BLOOMING, DreamSeed.id != this_seed_id)
        .order_by(DreamSeed.planted_at.desc())
        .limit(9)
        .all()
    )
    prior_count = sum(1 for row in recent_archetypes if row[0] == "관계/재회형")
    # 최근 기록 중 2회 + 지금 막 분류된 것(1회) = 3회 이상.
    return prior_count >= 2


def _is_storm_rose(dream_entry: DreamEntry, tags: list[str]) -> bool:
    if dream_entry.emotion not in NIGHTMARE_EMOJIS:
        return False
    normalized = [tag.lstrip("#") for tag in tags]
    matches = sum(1 for tag in normalized for keyword in STRONG_NEGATIVE_KEYWORDS if keyword in tag)
    return matches >= 2


def _has_monthly_cluster(db: Session, user_id: int, today: PyDate) -> bool:
    month_start = today.replace(day=1)
    species = {
        row[0]
        for row in db.query(DreamSeed.species_name)
        .filter(
            DreamSeed.user_id == user_id,
            DreamSeed.status == SeedStatus.BLOOMING,
            DreamSeed.planted_at >= month_start,
            DreamSeed.planted_at <= today,
            DreamSeed.species_name.isnot(None),
        )
        .all()
    }
    return len(species) >= 10


def _is_first_time_emotion(db: Session, user_id: int, diary_entry: DreamEntry | None) -> bool:
    if diary_entry is None:
        return False
    prior = (
        db.query(DreamEntry.id)
        .filter(
            DreamEntry.user_id == user_id,
            DreamEntry.interpretation.is_(None),
            DreamEntry.emotion == diary_entry.emotion,
            DreamEntry.id != diary_entry.id,
        )
        .first()
    )
    return prior is None


def _check_legendary(
    db: Session, user: User, seed: DreamSeed, dream_entry: DreamEntry, diary_entry: DreamEntry | None,
    archetype_key: str, tags: list[str],
) -> str | None:
    today = seed.planted_at
    if _has_seven_day_streak(db, user.id, today):
        return "몽환화"
    if _is_dawn_save(dream_entry):
        return "여명초"
    if _has_reunion_repeat(db, user.id, seed.id, archetype_key):
        return "재회화"
    if _is_storm_rose(dream_entry, tags):
        return "폭풍의 장미"
    if _has_monthly_cluster(db, user.id, today):
        return "성단화"
    if _is_first_time_emotion(db, user.id, diary_entry):
        return "초행의 꽃"
    return None


def _has_growth_badge(diary_survey: dict | None) -> bool:
    """"성장의 반짝임" 배지 - 마음 기록장(깊이 모드) 1단계(초기 감정)가 부정 계열(격동/여운)
    이었다가 7단계(종료 감정)에서 긍정 계열(온기/생동)로 바뀐 날에만 True. 간단 모드거나
    종료 감정을 안 골랐으면(선택값이라 비어 있을 수 있다) False. 단어장에 없는 값이 오면
    (이론상 발생 안 함) AI 커스텀 분류까지 가지 않고 그냥 배지 없음으로 처리한다 - 배지는
    부가 연출이라, 이것 때문에 추가 AI 호출 비용을 들일 필요는 없다(실제 꽃의 속 자체는
    이미 genus_for_emotion_input에서 필요하면 AI 폴백까지 거쳐 확정된 뒤다). 대분류 힌트
    (initial_emotion_category/closing_emotion_category)가 있으면 genus_for_emotion_input과
    같은 이유로 우선 사용한다 - 안 그러면 실제 꽃 속과 이 배지의 판정 근거가 어긋날 수 있다."""
    if not diary_survey or diary_survey.get("journal_mode") != "guided":
        return False
    initial_word = diary_survey.get("initial_emotion")
    closing_word = diary_survey.get("closing_emotion")
    if not initial_word or not closing_word:
        return False
    initial_genus = genus_for_word_or_category(initial_word, diary_survey.get("initial_emotion_category"))
    closing_genus = genus_for_word_or_category(closing_word, diary_survey.get("closing_emotion_category"))
    if not initial_genus or not closing_genus:
        return False
    return GENUS_POLARITY.get(initial_genus) == "negative" and GENUS_POLARITY.get(closing_genus) == "positive"


# --- 4. 진입점 -------------------------------------------------------------


def classify_flower(db: Session, user: User, seed: DreamSeed, dream_entry: DreamEntry) -> None:
    """개화 순간 seed.genus/archetype/species_name/flower_name/is_legendary/legendary_key를
    채운다. seed는 이미 db.add() + db.flush()되어 id가 확정된 상태여야 한다(의사난수 시드로 씀)."""
    tags: list[str] = []
    if dream_entry.interpretation:
        tags = dream_entry.interpretation.get("tags", []) or []

    # 그 밤 감정일기(다이어리) - 있으면 그 감정을 속의 근거로 쓰고, 없으면(씨앗 없이 꿈만
    # 기록한 '야생화' 케이스 등) 꿈 자체의 감정으로 대체한다. 그날 감정일기가 여러 편이면
    # "최초 감정일기 = 그날의 씨앗" 원칙에 따라 가장 먼저 쓴 편을 근거로 삼는다 - 나중에
    # 같은 날 감정일기를 더 추가해도(개화 이후는 물론, 개화 직전 순간이라 해도) 속(genus)
    # 판정이 흔들리지 않게 하기 위함이다.
    diary_entry = (
        db.query(DreamEntry)
        .filter(
            DreamEntry.user_id == user.id,
            DreamEntry.interpretation.is_(None),
            DreamEntry.dream_date == seed.planted_at,
        )
        .order_by(DreamEntry.created_at.asc())
        .first()
    )
    # 감정일기가 "마음 기록장"(깊이 모드)으로 쓰였으면 그 1단계(초기 감정) 단어를, 아니면
    # 이모지(간단 모드 감정일기, 또는 감정일기 자체가 없어 꿈의 emotion으로 대체하는 경우)를
    # 근거로 삼는다 - genus_for_emotion_input이 두 입력 형태를 모두 받아 같은 8속 중 하나로
    # 귀결시키는 단일 창구다(간단 모드는 여전히 기존 5속만, 깊이 모드만 신규 3속까지 도달).
    diary_survey = diary_entry.survey if diary_entry else None
    is_guided_diary = bool(diary_survey and diary_survey.get("journal_mode") == "guided")
    initial_emotion_word = diary_survey.get("initial_emotion") if is_guided_diary else None
    # "실제로 어느 대분류에서 골랐는지" 힌트 - 같은 단어가 여러 대분류에 겹치는 경우
    # (genus_for_word_or_category 주석 참고) 이게 있어야 정확한 속으로 귀결된다. 힌트 없이
    # 저장된 레거시 기록은 None이라 genus_for_emotion_input이 알아서 단어 기반으로 폴백한다.
    initial_emotion_category = diary_survey.get("initial_emotion_category") if is_guided_diary else None
    source_emoji = diary_entry.emotion if diary_entry else dream_entry.emotion
    genus, genus_source_mode, genus_source_value = genus_for_emotion_input(
        emoji=source_emoji, guided_word=initial_emotion_word, guided_category=initial_emotion_category
    )
    # 신규 3속 전용 종(NEW_GENUS_SPECIES)을 고르려면 genus가 먼저 정해져 있어야 하므로,
    # 반드시 위 genus_for_emotion_input 다음에 호출한다.
    archetype_key, species_name = classify_species(tags, seed.id, genus)

    legendary_key = _check_legendary(db, user, seed, dream_entry, diary_entry, archetype_key, tags)

    seed.genus = genus
    # 판정 근거 추적 - 나중에 "왜 이 꽃이 이 속으로 피었는지" 디버깅할 수 있게 남긴다.
    seed.genus_source_mode = genus_source_mode
    seed.genus_source_value = genus_source_value
    # 성장 배지("성장의 반짝임") - 마음 기록장 1단계(초기 감정, 부정 계열)에서 7단계(종료
    # 감정, 긍정 계열)로 바뀐 날에만 붙는다. 종/희귀도 계산(아래 archetype/species_name/
    # legendary 분기)과는 완전히 독립적으로 별도 계산하며, 그 결과에 어떤 영향도 주지 않는다.
    seed.growth_badge = _has_growth_badge(diary_survey)
    if legendary_key:
        seed.archetype = "LEGENDARY"
        seed.species_name = legendary_key
        seed.flower_name = legendary_key
        seed.is_legendary = True
        seed.legendary_key = legendary_key
        return

    existing_names = {
        row[0]
        for row in db.query(DreamSeed.flower_name)
        .filter(DreamSeed.user_id == user.id, DreamSeed.flower_name.isnot(None), DreamSeed.id != seed.id)
        .all()
    }
    adjective = pick_adjective(genus, seed.id, species_name, existing_names)
    seed.archetype = archetype_key
    seed.species_name = species_name
    seed.flower_name = f"{adjective} {species_name}"
    seed.is_legendary = False
    seed.legendary_key = None
