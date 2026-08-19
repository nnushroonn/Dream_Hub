import type { DreamMood } from "@/api/dream";
import { withIga } from "@/lib/korean";

// 꽃의 "아우라"(발광) 색 - genus(온기/격동/몽환/여운/생동, 그날의 감정 분류)와는 완전히
// 다른 축이다: 아우라는 그 꿈이 길몽/보통/흉몽 중 무엇이었는지(emotion을 moodBucketForEmoji로
// 판정한 값)만 따른다. 정원 상세 모달/도감 그리드가 이 표 하나를 공유해야 두 화면의 색이
// 어긋나지 않는다 - 절대 각자 하드코딩하지 않는다.
export const MOOD_AURA: Record<DreamMood, { color: string; label: string }> = {
  good: { color: "#FBBF24", label: "🌙 길몽" }, // 호박색
  neutral: { color: "#93C5FD", label: "🌀 보통" }, // 흰빛이 도는 블루
  nightmare: { color: "#8B5CF6", label: "😨 흉몽" }, // 보라색
};

// rarity(1~3, 전설의 꽃은 항상 3)에 따라 아우라 강도를 계산해 box-shadow 문자열을 만든다.
// 전설의 꽃은 항상 최대 강도(3)를 쓰되, 색상 자체는 이 함수를 호출하는 쪽이 MOOD_AURA에서
// 골라 넘긴 색을 그대로 따른다 - "전설=항상 금색"이 아니라 "전설=그 꽃의 실제 길흉 색 + 최대 강도".
export function auraGlowShadow(color: string, intensity: 1 | 2 | 3): string {
  if (intensity === 1) return `0 0 12px 2px ${color}30`;
  if (intensity === 2) return `0 0 20px 5px ${color}40`;
  return `0 0 32px 8px ${color}55, 0 0 56px 18px ${color}25`;
}

// 도감 전체 종수 - backend/flower_taxonomy.py의 (ARCHETYPES 8개 x 3종 = 24) + (NEW_GENUS_
// SPECIES 15종) = 39 / LEGENDARY_PRIORITY 6개와 항상 같은 값이어야 한다. 정원 페이지의
// 진행도 카운터와 이 아래 도감 모달(꽃 상세 관찰) 둘 다 이 값을 공유해야 두 화면의 분모가
// 어긋나지 않는다.
export const GENERAL_SPECIES_TOTAL = 39;
export const LEGENDARY_TOTAL = 6;

// 정원 꽃 도감의 "속(genus)" 8계열(2차 확장: 기존 5 + 신규 3) - 백엔드 flower_taxonomy.py의
// GENUS_COLORS와 값을 맞춰서 쓴다. [주 컬러, 보조 컬러] 순서.
export const GENUS_COLORS: Record<string, [string, string]> = {
  온기: ["#fb923c", "#fde2c8"],
  격동: ["#ef4444", "#a855f7"],
  몽환: ["#818cf8", "#c4b5fd"],
  여운: ["#64748b", "#475569"],
  생동: ["#fbbf24", "#fb923c"],
  // 환희 = 밝은 노랑/금빛(온기의 주황보다 더 쨍하고 눈부신 톤).
  환희: ["#facc15", "#fef9c3"],
  // 냉담 = 차가운 청회색/옅은 블루(격동의 뜨거운 빨강과 반대 온도감).
  냉담: ["#64748b", "#cbd5e1"],
  // 동경 = 먼지 낀 보라/라벤더(여운보다 아련하지만 몽환보다는 채도를 낮췄다).
  동경: ["#a78bfa", "#ddd6fe"],
};
const DEFAULT_GENUS_COLOR: [string, string] = ["#94a3b8", "#cbd5e1"];

export function colorForGenus(genus: string | null): [string, string] {
  if (genus && genus in GENUS_COLORS) return GENUS_COLORS[genus];
  return DEFAULT_GENUS_COLOR;
}

// (구) 종별 이모지 매핑(SPECIES_ICONS/LEGENDARY_ICONS)과 iconForFlower()는 파라메트릭
// SVG 아이콘 시스템(@/components/FlowerIcon)으로 전면 대체되어 제거했다 - 정원/도감/상세
// 모달/일기 카드/커뮤니티 공유 카드 등 모든 호출부가 FlowerIcon(archetype, genus,
// isLegendary)을 직접 쓴다. 옛 개화 기록도 species_name이 아니라 archetype/genus 필드로
// 그리므로 마이그레이션 없이 그대로 새 아이콘으로 표시된다.

// 꽃말 - "일기 원문 보기"에서 보게 될 AI 해몽 리포트 원문과 절대 겹치지 않도록, 리포트
// 텍스트를 요약하는 대신 미리 지어 둔 20~30자 내외의 시적 한 줄을 쓴다.
//
// 처음엔 속(genus) 8계열 단위로만 지어 뒀는데, 그러면 같은 속을 공유하는 최대 5~6종이 전부
// 똑같은 한 줄을 나눠 쓰게 돼("환희 계열 5종이 전부 같은 꽃말") 39종 각각의 정체성이 안
// 살았다. 그래서 종(species_name) 단위로 다시 지었다 - 사실 이게 실제 "꽃말" 관습에도 더
// 맞다(장미=사랑처럼, 꽃말은 원래 그날의 감정이 아니라 그 꽃 종류 자체에 붙는 고정된 의미다).
//
// 다만 기존 24종(각 원형(archetype)당 3종)은 genus에 고정돼 있지 않다 - 같은 종이 날마다
// 다른 속으로 필 수 있으므로(backend classify_species 참고), 이 24종의 문구는 특정 속의
// 감정에 기대지 않고 그 "꽃 자체의 성격"(원형이 표현하는 정서 + 이름이 주는 인상)만으로
// 지었다. 반대로 신규 15종(환희/냉담/동경 각 5종)은 태어날 때부터 그 속 하나에 고정돼 있어서
// (NEW_GENUS_SPECIES) 그 속의 정서를 문구에 그대로 살렸다.
const SPECIES_FLOWER_LANGUAGE: Record<string, string> = {
  // 관계/재회형 - 다정하게 이어지거나 다시 만나는 정서.
  들꽃: "어디에도 매이지 않고 있는 그대로 피어난 마음이에요",
  제비꽃: "낮게 피어 있어도 곁을 알아채주는 다정함이었어요",
  프리지아: "다시 만날 순간을 향기로 미리 그려본 밤이었어요",
  금잔화: "다시 마주친 반가움에 얼굴 가득 웃음이 번졌어요",
  서리꽃: "돌아섰던 마음이 서늘하게 다시 얼어붙은 자리예요",
  메꽃: "끊어질 듯 이어지는 인연을 아득히 그리워했어요",
  // 추적/도피형 - 쫓기거나 도망치는 긴장.
  엉겅퀴: "가시로 스스로를 지키며 버텨낸 하룻밤이었어요",
  가시나무꽃: "쫓기듯 날카로워진 마음 끝에 겨우 피어났어요",
  선인장꽃: "메마른 긴장 속에서도 꿋꿋이 버텨낸 자리예요",
  얼음새꽃: "차갑게 얼어붙은 채로 도망칠 곳을 찾던 밤이에요",
  // 비행/자유형 - 바람에 날리듯 자유로운 정서.
  민들레: "바람이 부는 대로 훌훌 날아가고 싶던 마음이에요",
  나팔꽃: "새벽 공기를 가르며 자유롭게 피어난 순간이에요",
  개양귀비: "구속을 벗어던지고 바람에 온몸을 맡긴 밤이에요",
  황매화: "가슴 벅차게 자유로운 웃음이 바람에 실려 갔어요",
  구절초: "멀리 떠나고픈 마음이 산들바람에 아득히 흩날렸어요",
  // 잠식/물형 - 물속으로 서서히 잠겨드는 정서.
  수련: "고요한 물속으로 마음이 서서히 잠겨든 밤이었어요",
  물망초: "나를 잊지 말아 달라 속삭이며 물가에 피었어요",
  부처꽃: "물결처럼 밀려온 생각에 마음이 잠겨버렸어요",
  설련화: "차가운 물속으로 마음이 조용히 얼어 잠겼어요",
  수레국화: "깊은 물빛만큼이나 아득한 그리움에 잠겨들었어요",
  // 시험/평가형 - 매달린 채 시험받는 긴장(초롱꽃 모양).
  도라지: "누군가의 시선 앞에서 조심스레 고개를 숙였어요",
  초롱꽃: "작은 불빛 하나로 스스로를 비춰 보던 밤이에요",
  금낭화: "매달린 마음으로 평가의 순간을 견뎌냈어요",
  백일홍: "오래 준비한 순간이 눈부신 결실로 피어났어요",
  냉이꽃: "차갑게 매겨진 평가 앞에서 마음이 시렸어요",
  // 탐험/발견형 - 새로운 것을 향한 설렘.
  해바라기: "새로운 길을 향해 얼굴 가득 환하게 웃었어요",
  튤립: "낯선 곳에서 마주한 설렘을 그대로 담았어요",
  다알리아: "겹겹이 쌓인 호기심이 화려하게 피어났어요",
  금계국: "처음 발견한 반가움에 눈부시게 활짝 웃었어요",
  에델바이스: "닿기 힘든 높은 곳을 아득히 그리워하며 피었어요",
  // 상실/이별형 - 무게중심이 아래로 쏠린 구슬 송이, 흩어지고 잃는 정서.
  안개꽃: "흩어진 마음들이 조용히 모여 송이를 이뤘어요",
  수국: "젖은 마음이 겹겹이 모여 무겁게 고개를 숙였어요",
  리시안셔스: "이별의 자리에 남겨진 마음이 곱게 접혔어요",
  얼음꽃: "차갑게 식은 이별이 서리처럼 맺힌 자리예요",
  라일락: "떠나보낸 자리에서 그 향기만 아득히 남았어요",
  // 성장/변신형 - 말려 있던 것이 풀려나는 나선, 거듭남의 정서.
  크로커스: "겨우내 웅크렸던 마음이 천천히 풀려났어요",
  나비꽃: "다른 모습으로 거듭나려 날개를 펼쳤어요",
  접시꽃: "낯선 하루 끝에서 조금씩 자기 모습을 찾아갔어요",
  카랑코에: "새롭게 태어난 듯한 벅찬 기쁨이 소용돌이쳤어요",
};
// 위 39종 표에 없는 값(species_name이 비었거나 목록에 없는 옛 기록)에 대비한 속(genus) 단위
// 폴백 - 도감 체계 도입 이전에 개화한 기록은 species_name이 아예 없어 이 표를 거친다.
const GENUS_FLOWER_LANGUAGE: Record<string, string> = {
  온기: "포근한 온기가 마음 깊이 스며든 밤이었어요",
  격동: "거센 감정이 휘몰아친 자리에 핀 꽃이에요",
  몽환: "흐릿한 경계 너머에서 피어난 낯선 위로예요",
  여운: "저무는 마음 한 켠에 조용히 맺힌 여운이에요",
  생동: "눈부신 생기가 가득 차오른 순간이었어요",
  환희: "벅찬 기쁨이 눈부시게 터져 나온 순간이었어요",
  냉담: "차갑게 식어버린 마음이 조용히 얼어붙은 자리예요",
  동경: "닿을 수 없는 무언가를 아득히 그리워한 밤이에요",
};
const DEFAULT_FLOWER_LANGUAGE = "말로 다 담기 힘든 밤의 이야기가 피어났어요";
const LEGENDARY_FLOWER_LANGUAGE = "아주 특별한 밤에만 허락되는 이야기예요";

export function flowerLanguageFor(bloom: { genus: string | null; species_name: string | null; is_legendary: boolean }): string {
  if (bloom.is_legendary) return LEGENDARY_FLOWER_LANGUAGE;
  if (bloom.species_name && bloom.species_name in SPECIES_FLOWER_LANGUAGE) return SPECIES_FLOWER_LANGUAGE[bloom.species_name];
  if (bloom.genus && bloom.genus in GENUS_FLOWER_LANGUAGE) return GENUS_FLOWER_LANGUAGE[bloom.genus];
  return DEFAULT_FLOWER_LANGUAGE;
}

// "이 꽃에 대하여" 섹션 전용 데이터 - "꽃말"(그날 그 사용자의 개인화된 시적 한 줄, 위
// flowerLanguageFor)과는 역할이 다르다: 이건 종 자체의 일반적인 특성 설명이라 같은 종/조건이면
// 누가 보든 항상 같은 문구다.
//
// 일반 종 39개는 (속 8계열 x 원형 8종)의 조합이라 종마다 따로 문장을 안 외워도 된다 -
// 실제로 이 꽃을 피운 그 개화(bloom)의 genus/archetype 필드로 그때그때 조합해서 만든다.
// 기존 5속의 예시 감정 3개는 backend/flower_taxonomy.py의 GENUS_BY_EMOJI 주석과 값을 맞춘
// 것이고, 신규 3속(환희/냉담/동경)은 마음 기록장 대분류(기쁨/미움/바램)의 대표 단어 3개씩을
// 그대로 가져왔다.
const GENUS_EXAMPLE_EMOTIONS: Record<string, string> = {
  온기: "행복·평온·설렘",
  격동: "불안·분노·무서움",
  몽환: "혼란·기묘함·놀람",
  여운: "슬픔·그리움·찝찝함",
  생동: "신남·생생함·경이로움",
  환희: "눈부심·짜릿함·벅참",
  냉담: "차가움·서늘함·시림",
  동경: "간절함·아득함·애타는 그리움",
};

// backend/flower_taxonomy.py의 ARCHETYPES 8개와 키를 그대로 맞췄다 - 값(라벨)만 "/" 대신
// "·"로 표시용으로 다듬었다.
const ARCHETYPE_LABELS: Record<string, string> = {
  "관계/재회형": "관계·재회형",
  "추적/도피형": "추적·도피형",
  "비행/자유형": "비행·자유형",
  "잠식/물형": "잠식·물형",
  "시험/평가형": "시험·평가형",
  "탐험/발견형": "탐험·발견형",
  "상실/이별형": "상실·이별형",
  "성장/변신형": "성장·변신형",
};

// 전설의 꽃 6종의 실제 언락 조건 - backend/flower_taxonomy.py의 _check_legendary()에 구현된
// 로직을 그대로 문장화했다(값이 바뀌면 이 문구도 함께 고쳐야 한다). 도감 미발견 실루엣에는
// 절대 이 문구를 쓰지 않는다(LEGENDARY_INFO의 은유적 hint만 쓴다) - 여기는 오직 이미 소장한
// 꽃의 상세 관찰 모달에서만 노출된다.
export const LEGENDARY_UNLOCK_CONDITIONS: Record<string, string> = {
  몽환화: "최근 7일 동안 매일 밤 씨앗을 심어 빠짐없이 꽃까지 피우면(7일 연속 개화) 피어나요.",
  여명초: "새벽 0시부터 4시 사이에 꿈을 기록하면 피어나요.",
  재회화: "최근에 심은 씨앗 9개 안에서 '관계·재회형' 원형의 꿈이 이번까지 3번 이상 나오면 피어나요.",
  "폭풍의 장미": "흉몽으로 기록한 꿈에 강렬한 부정적 감정을 나타내는 태그가 2개 이상 붙으면 피어나요.",
  성단화: "이번 달 안에 서로 다른 종류의 꽃을 10종 이상 피우면 피어나요.",
  "초행의 꽃": "그동안 한 번도 골라본 적 없는 새로운 감정으로 감정일기를 처음 남기면 피어나요.",
};

// "이 꽃에 대하여" 본문 - 일반 종은 실제 genus/archetype 이름을 그대로 밝히고(숨길 이유가
// 없는, 그날 자기 기록에서 바로 드러나는 정보라서), 전설의 꽃은 이미 소장한 경우에만 정확한
// 언락 조건을 보여준다(위 LEGENDARY_UNLOCK_CONDITIONS). genus/archetype이 없는 옛 기록
// (도감 체계 도입 전 개화)이면 null을 돌려줘 호출부가 섹션 자체를 생략하게 한다. displayName은
// "이 종류의 꽃" 같은 딱딱한 지시어 대신 실제 꽃 이름("포근한 프리지아" 등)을 문장에 그대로
// 넣어 더 자연스럽게 읽히게 한다.
export function speciesDescriptionFor(
  bloom: {
    is_legendary: boolean;
    legendary_key: string | null;
    genus: string | null;
    archetype: string | null;
  },
  displayName: string
): string | null {
  if (bloom.is_legendary) {
    return bloom.legendary_key ? (LEGENDARY_UNLOCK_CONDITIONS[bloom.legendary_key] ?? null) : null;
  }
  if (!bloom.genus || !bloom.archetype) return null;
  const exampleEmotions = GENUS_EXAMPLE_EMOTIONS[bloom.genus];
  const archetypeLabel = ARCHETYPE_LABELS[bloom.archetype];
  if (!exampleEmotions || !archetypeLabel) return null;
  return `${bloom.genus} 계열 감정(${exampleEmotions})과 ${archetypeLabel} 꿈이 만나면 ${withIga(displayName)} 피어나요.`;
}
