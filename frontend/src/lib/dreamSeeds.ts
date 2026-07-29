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
