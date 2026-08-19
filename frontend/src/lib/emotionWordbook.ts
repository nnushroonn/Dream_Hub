// "마음 기록장"(씨앗 심기 깊이 모드) 전용 감정 단어장 - "나를 지키는 마음 기록장" 워크시트의
// 7개 대분류 단어 목록을 그대로 가져왔다. 원본이 손그림 캐릭터 일러스트를 쓰지만, 여기서는
// 그 그림 대신 Dream Hub 자체 색/칩 스타일로만 표현한다.
//
// 원본 대조 확인 완료(2026-08-14): 분노/미움에 중복 등록됐던 "고통스러운"/"구역질나는"은
// 옮겨 적기 실수가 아니라 원본에 실제로 두 대분류 모두에 적혀 있던 단어였다. 처음엔 미움
// 배열에서 지워 중복을 없앴는데, "단어를 지우지 말고 고른 분위기에 따라 결과가 달라지게"
// 바꿔달라는 요청으로 다시 되돌렸다 - 두 단어 모두 분노/미움 두 배열에 그대로 남아있다.
// 대신 "실제로 어느 대분류에서 골랐는지"를 단어와 별개로 함께 저장하는 방식으로 해결했다 -
// GuidedEmotionJournalValue의 initialEmotionCategory/closingEmotionCategory가 그 값이고,
// EmotionWordPicker가 칩을 고를 때 그 카테고리도 함께 콜백으로 넘긴다. 이 파일의
// categoryForWord(word)는 "카테고리 힌트가 없는 경우"(레거시로 저장된 옛 기록 등)의
// 폴백으로만 남아있다 - 그때는 여전히 배열 순서상 먼저인 대분류(분노)로 귀결된다. 백엔드도
// 같은 힌트를 받아 실제 꽃의 속(genus) 계산에 반영한다(emotion_wordbook.py의
// genus_for_word_or_category, backend/flower_taxonomy.py 참고) - 그래야 컴포즈 화면에서
// 보이는 분위기 색과 실제로 피는 꽃의 속이 항상 일치한다. 다른 대분류 조합에도 같은 패턴의
// 중복이 몇 개 더 있다(예: 기쁨/사랑의 "뿌듯한"·"포근한") - 이 메커니즘이 전부 그대로
// 처리해주므로 별도로 지울 필요는 없다.
//
// 씨앗의 속(genus)은 이 7개 대분류가 아니라 기존 5속(온기/격동/몽환/여운/생동) 체계를 그대로
// 따른다 - EMOTION_CATEGORY_TO_GENUS가 그 다리 역할을 한다(자세한 근거는 그 상수의 주석 참고).

export type EmotionCategoryKey = "즐거움" | "바램" | "슬픔" | "분노" | "기쁨" | "사랑" | "미움";

// 기존 5속과 이름이 겹치지 않게 하고, 배경색만 파스텔 톤으로 원본 워크시트의 색감 무드를
// 살린다 - 실제 톤(hex)은 각 대분류의 정서에 맞춰 새로 골랐다(온기/격동 등 기존 GENUS_COLORS와는
// 별개 팔레트).
export interface EmotionCategory {
  key: EmotionCategoryKey;
  words: string[];
  // 칩 배경/글자색 - 다크 배경 위에서도 파스텔 무드가 옅게 드러나도록 저채도 배경 + 밝은 글자.
  bgClass: string;
  textClass: string;
  borderClass: string;
  // bgClass/textClass/borderClass와 같은 Tailwind 색상 토큰의 원시 hex 값 - 인라인 style로
  // 배경을 옅게 물들여야 하는 곳(작성 화면 상단 배너 등)에서 쓴다. 클래스 이름 문자열로는
  // opacity/그라데이션을 자유롭게 조합할 수 없어서 별도로 둔다 - 항상 위 세 클래스와 같은
  // 색 계열을 가리켜야 한다(하나를 바꾸면 나머지도 함께 맞춰야 한다).
  color: string;
}

export const EMOTION_CATEGORIES: EmotionCategory[] = [
  {
    key: "즐거움",
    bgClass: "bg-amber-400/[0.1]",
    textClass: "text-amber-200",
    borderClass: "border-amber-400/25",
    color: "#fbbf24",
    words: [
      "가벼운", "가뿐한", "경쾌한", "고요한", "기분좋은", "담담한", "명랑한", "밝은", "산뜻한", "상쾌한",
      "상큼한", "숨가쁜", "신나는", "유쾌한", "자신있는", "즐거운", "쾌활한", "편안한", "홀가분한",
      "활기있는", "활발한", "흐뭇한", "흥분된", "희망찬",
    ],
  },
  {
    key: "바램",
    bgClass: "bg-sky-400/[0.1]",
    textClass: "text-sky-200",
    borderClass: "border-sky-400/25",
    color: "#38bdf8",
    words: [
      "간절한", "갈망하는", "기대하는", "바라는", "소망하는", "애끓는", "절박한", "갑갑한", "초라한",
      "초조한", "호기심", "후회스런", "희망하는",
    ],
  },
  {
    key: "슬픔",
    bgClass: "bg-slate-400/[0.1]",
    textClass: "text-slate-300",
    borderClass: "border-slate-400/25",
    color: "#94a3b8",
    words: [
      "가슴아픈", "걱정되는", "고단한", "고독한", "고민스러운", "공포에질린", "공허한", "괴로운", "구슬픈",
      "곤혹스러운", "근심되는", "기분나쁜", "낙담한", "두려운", "마음이무거운", "멍한", "뭉클한", "미어지는",
      "부끄러운", "불쌍한", "불안한", "불편한", "비참한", "비탄한", "서글픈", "암담한", "앞이깜깜한",
      "애석한", "애처로운", "애태우는", "애통한", "언짢은", "염려하는", "외로운", "우울한", "울적한",
      "음울한", "음침한", "의기소침한", "절망적인", "좌절하는", "증오하는", "지루한", "착잡한", "참담한",
      "창피한", "처량한", "처참한", "측은한", "침통한", "패배스러운", "한스러운", "허전한", "허탈한",
      "허한", "황량한",
    ],
  },
  {
    key: "분노",
    bgClass: "bg-red-400/[0.1]",
    textClass: "text-red-300",
    borderClass: "border-red-400/25",
    color: "#f87171",
    words: [
      "고통스러운", "골치아픈", "괘씸한", "가혹한", "구역질나는", "기분이상하는", "꼴사나운", "끓어오르는",
      "배반감", "모욕적", "무서운", "나쁜", "노한", "복수심", "복받치는", "분개한", "분노", "불만스러운",
      "불쾌한", "떫은", "섬뜩한", "소름끼치는", "속상한", "숨막히는", "실망감", "쓰라린", "씁쓸한",
      "약오르는",
    ],
  },
  {
    key: "기쁨",
    bgClass: "bg-yellow-300/[0.1]",
    textClass: "text-yellow-200",
    borderClass: "border-yellow-300/25",
    color: "#fde047",
    words: [
      "감격스러운", "감동적인", "감사한", "고마운", "고무적인", "기쁨", "고전적인", "날아갈듯한", "놀라운",
      "가벼운", "눈물겨운", "든든한", "만족스러운", "뭉클한", "반가운", "벅찬", "뿌듯한", "살맛나는",
      "시원한", "싱그러운", "좋은", "짜릿한", "쾌적한", "통쾌한", "포근한", "푸근한", "행복한", "환상적인",
      "흐뭇한", "흔쾌한", "흥분된",
    ],
  },
  {
    key: "사랑",
    bgClass: "bg-pink-400/[0.1]",
    textClass: "text-pink-200",
    borderClass: "border-pink-400/25",
    color: "#f472b6",
    words: [
      "감미로운", "감사하는", "그리운", "다정한", "따사로운", "묘한", "뿌듯한", "사랑스러운", "상냥한",
      "순수한", "애틋한", "열렬한", "열망하는", "친숙한", "포근한", "호감이가는", "화끈거리는", "흡족한",
    ],
  },
  {
    key: "미움",
    bgClass: "bg-purple-400/[0.1]",
    textClass: "text-purple-200",
    borderClass: "border-purple-400/25",
    color: "#c084fc",
    words: [
      "고통스러운", "괴로운", "구역질나는", "귀찮은", "근심스러운", "끔찍한", "몸서리치는", "무정한",
      "미운", "부담스러운", "서운한", "싫은", "싫증나는", "야속한", "얄미운", "억울한", "언짢스러운",
      "죄책감", "증오스러운", "지겨운", "짜증스러운", "차가운", "황량한",
    ],
  },
];

// 2차 확장(속 5 -> 8) - "기존 5속의 의미는 그대로 두고, 지금까지 억지로 합쳐뒀던 감정
// 3개만 새 속으로 분리 독립시킨다"는 설계 원칙에 따라 온기/격동/여운에서 각각 기쁨/미움/
// 바램이 갈라져 나왔다. backend/flower_taxonomy.py의 GENUS_ADJECTIVES/GENUS_COLORS와
// 키를 그대로 맞춘다.
export type Genus = "온기" | "격동" | "몽환" | "여운" | "생동" | "환희" | "냉담" | "동경";

// 7개 대분류 -> 8속 매핑:
//   온기 = "행복, 평온, 설렘처럼 따뜻하고 안정된 긍정" -> 사랑이 그대로 남는다.
//   환희(신규) = 온기에서 분리 - 기쁨(눈부신/반짝이는/짜릿한 등 강렬하고 들뜬 긍정)은 온기의
//                "포근함"보다 더 쨍한 톤이라 별도 속으로 독립시켰다.
//   격동 = "불안, 분노, 무서움, 답답함처럼 격렬하고 부정적인 긴장" -> 분노가 그대로 남는다.
//   냉담(신규) = 격동에서 분리 - 미움(차가운/냉랭한/얼어붙은 등)은 격동의 "뜨거운 격발"과
//                반대로 차갑게 식은 부정 정서라 온도감이 달라 별도 속으로 독립시켰다.
//   여운 = "슬픔, 그리움, 찝찝함처럼 가라앉아 오래 남는 정서" -> 슬픔이 그대로 남는다.
//   동경(신규) = 여운에서 분리 - 바램(아득한/간절한/그리운 등 멀리 있는 것을 향한 그리움)은
//                여운의 "가라앉음"보다 "먼 곳을 향한 마음"에 가까워 별도 속으로 독립시켰다.
//   생동 = "신남, 생생함, 경이로움처럼 활기차고 강렬한 긍정" -> 즐거움 대부분이 부합(분리 없음).
//   몽환 = "혼란, 기묘함, 황당함, 놀람" - 7개 대분류 중 이 정서에 직접 대응하는 카테고리가
//          없다(원본 워크시트 자체에 "혼란/놀람" 계열 대분류가 없음) - 그래서 몽환은 이 표에서
//          목적지가 되지 않고, 매핑되지 않는 값이 들어왔을 때의 폴백(기존 AI 분류 fallback과
//          같은 역할)으로만 쓰인다.
//
// 다만 "즐거움"(고요한/담담한/편안한 등 차분한 단어도 섞여 있음)과 "바램"(기대하는/희망하는처럼
// 밝은 단어도 섞여 있음) 대분류 자체가 내부적으로 톤이 섞여 있어, 대분류 단위 매핑은 근사치다 -
// 기존 온기 계열도 "평온"과 "설렘"처럼 강도가 다른 정서를 함께 묶어 두므로, 같은 수준의 근사로
// 본다.
export const EMOTION_CATEGORY_TO_GENUS: Record<EmotionCategoryKey, Genus> = {
  사랑: "온기",
  기쁨: "환희",
  분노: "격동",
  미움: "냉담",
  슬픔: "여운",
  바램: "동경",
  즐거움: "생동",
};

// 속마다 무드 버킷(good/neutral/nightmare, lib/moodBucket.ts) 색상용으로 고른 대표
// 이모지 하나씩 - 마음 기록장에서 고른 "단어"를 저장할 때, DreamEntry.emotion 컬럼(이모지
// 8자 제한, 앱 전역의 무드 버킷/컬러 로직이 전부 이 값을 이모지로 가정한다)과의 호환을
// 위해 이 이모지로 함께 저장한다. 신규 3속은 더 이상 이 이모지가 속 계산에 관여하지
// 않는다(백엔드가 깊이 모드일 땐 저장된 단어 원문으로 직접 속을 계산한다 - flower_taxonomy.
// genus_for_emotion_input) - 순수하게 다른 화면(무드 버킷 색 등)이 이모지를 기대하는 곳을
// 위한 표시용이라, 같은 무드 계열의 기존 이모지를 그대로 재사용해도 무방하다(예: 환희=🤩는
// 생동과 같은 "good" 버킷을 공유- 실제로 둘 다 밝은 긍정 정서라 자연스럽다).
export const GENUS_REPRESENTATIVE_EMOJI: Record<Genus, string> = {
  온기: "🥰",
  격동: "😠",
  몽환: "🤔",
  여운: "😢",
  생동: "🤩",
  환희: "🤩",
  냉담: "😠",
  // moodBucket.ts의 MOOD_OPTIONS에 이미 "😔: 그리움(neutral)"이 있다 - "먼 곳을 향한
  // 그리움"이라는 동경의 정서와 정확히 들어맞아 그대로 재사용한다.
  동경: "😔",
};

const WORD_TO_CATEGORY = new Map<string, EmotionCategoryKey>();
for (const category of EMOTION_CATEGORIES) {
  for (const word of category.words) {
    // 같은 단어가 여러 대분류에 중복 등장하면(예: "가벼운"은 즐거움/기쁨 둘 다에 있음) 먼저
    // 나온 대분류를 우선한다 - 이 순서는 EMOTION_CATEGORIES 배열 선언 순서를 따른다.
    if (!WORD_TO_CATEGORY.has(word)) WORD_TO_CATEGORY.set(word, category.key);
  }
}

export function categoryForWord(word: string): EmotionCategoryKey | null {
  return WORD_TO_CATEGORY.get(word) ?? null;
}

// 마음 기록장에서 고른 단어 -> 속. 단어장에 없는 값(이론상 발생하지 않지만 방어적으로)이 오면
// 몽환으로 폴백한다 - backend DEFAULT_GENUS와 같은 이유(낯설고 정의되지 않은 정서의 대표 계열).
export function genusForWord(word: string | null): Genus {
  if (!word) return "몽환";
  const category = categoryForWord(word);
  if (!category) return "몽환";
  return EMOTION_CATEGORY_TO_GENUS[category];
}

export function representativeEmojiForWord(word: string | null): string {
  return GENUS_REPRESENTATIVE_EMOJI[genusForWord(word)];
}

// 감정 단어 하나가 "단독으로" 뜨는 배지(2~6단계 상단 현재 감정, 감정의 여정 미니 칩, 리캡
// 화면 등) 전용 톤 - EMOTION_CATEGORIES.bgClass/textClass처럼 채도 높은 파스텔을 그대로
// 쓰지 않는다. 그건 1/7단계 감정 선택 그리드처럼 "여러 칩을 한 번에 비교"하는 화면에만
// 어울리고, 혼자 떠 있는 배지에 그대로 쓰면 앱의 어두운 남색/보라 톤과 겉돈다(스티커 붙인
// 느낌). 대신 GENUS_COLORS/MOOD_AURA/SEED_DEFINITIONS 등 앱 전역이 이미 쓰는 "hex + 낮은
// 불투명도" 규칙(예: `${color}22`)을 그대로 재사용해, 배경은 아주 옅게(약 13%), 테두리는
// 조금 더 또렷하게(약 50%) 두르고, 글자는 색 있는 톤 대신 흰색에 가깝게 남긴다 - 색은
// 배지의 은은한 틴트만으로 구분되면 충분하다.
export function emotionBadgeStyle(category: EmotionCategory | null): { className: string; style?: { backgroundColor: string; borderColor: string } } {
  if (!category) return { className: "border border-white/10 bg-white/5 text-slate-300" };
  return {
    className: "border text-slate-50",
    style: { backgroundColor: `${category.color}22`, borderColor: `${category.color}80` },
  };
}
