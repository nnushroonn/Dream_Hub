// 나만의 일기장(/journal)의 "꿈 씨앗" 리추얼 - 마이페이지 은하계 대시보드가 같은 목록/색상을
// 다시 써야 해서 두 화면이 공유하는 단일 소스로 뺐다. DB에 별도 컬럼이 없어, journal에서
// 선택한 씨앗은 DreamEntry.tags에 문자열 그대로 실어 저장한다(최대 5개 태그 중 하나 슬롯).
export const DREAM_SEEDS = [
  "🌿 비워내기 (차분한 휴식)",
  "🔥 성장하기 (자신감과 용기)",
  "💜 치유하기 (위로와 평온)",
  "✨ 모험하기 (새로운 영감)",
] as const;

export type DreamSeed = (typeof DREAM_SEEDS)[number];

export function isDreamSeed(tag: string): tag is DreamSeed {
  return (DREAM_SEEDS as readonly string[]).includes(tag);
}

export const DREAM_SEED_COLOR: Record<DreamSeed, string> = {
  "🌿 비워내기 (차분한 휴식)": "#34d399",
  "🔥 성장하기 (자신감과 용기)": "#fb923c",
  "💜 치유하기 (위로와 평온)": "#c084fc",
  "✨ 모험하기 (새로운 영감)": "#60a5fa",
};

// 커뮤니티 헤더 "주파수 필터"용 공개 슬러그 - 백엔드 PUBLIC_TAG_OPTIONS와 반드시 일치해야 한다.
// 개인 씨앗(DREAM_SEEDS)과 1:1로 대응하되, 이건 유저가 게시글에 "직접" 붙이는 공개 태그다.
export interface CommunityFrequencyTag {
  slug: "rest" | "growth" | "healing" | "adventure";
  label: string;
  seed: DreamSeed;
}

export const COMMUNITY_FREQUENCY_TAGS: CommunityFrequencyTag[] = [
  { slug: "rest", label: "🌿 비움", seed: DREAM_SEEDS[0] },
  { slug: "growth", label: "🔥 성장", seed: DREAM_SEEDS[1] },
  { slug: "healing", label: "💜 치유", seed: DREAM_SEEDS[2] },
  { slug: "adventure", label: "✨ 모험", seed: DREAM_SEEDS[3] },
];
