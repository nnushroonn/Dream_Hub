// 꿈해몽 사전의 2차 카테고리 매퍼: [대분류] - [세부 상징 단어] 구조의 큐레이션된 색인이다.
// 실제 풀이 문구는 여기 없다 - 단어를 클릭하면 /api/dictionary/search가 그때그때 실시간으로 생성한다.
export interface DictionaryCategory {
  label: string;
  emoji: string;
  words: string[];
}

export const DICTIONARY_CATEGORIES: DictionaryCategory[] = [
  {
    label: "사람/인물",
    emoji: "🧑",
    words: ["아기", "연예인", "돌아가신 조상", "전 애인", "선생님", "낯선 사람", "군인", "신랑/신부"],
  },
  {
    label: "동물/식물",
    emoji: "🐾",
    words: ["뱀", "호랑이", "고래", "강아지", "고양이", "나비", "거미", "꽃"],
  },
  {
    label: "자연/장소",
    emoji: "🏞️",
    words: ["바다", "산", "하늘", "우리 집", "학교", "화장실", "다리", "무덤"],
  },
  {
    label: "사물/음식",
    emoji: "🍽️",
    words: ["돈", "반지", "자동차", "칼", "거울", "이빨", "쌀밥", "열쇠"],
  },
  {
    label: "행동/사건",
    emoji: "🏃",
    words: ["떨어지는", "날아가는", "쫓기는", "결혼하는", "시험보는", "죽는", "우는", "불이 나는"],
  },
];

export const ALL_DICTIONARY_WORDS: string[] = DICTIONARY_CATEGORIES.flatMap((category) => category.words);

/** 자음 인덱스 바에 노출할 기본(쌍자음 제외) 초성 14개. */
export const BASIC_CHOSEONG = [
  "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;
