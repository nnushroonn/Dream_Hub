export type RarityTier = 1 | 2 | 3;

// 정원 꽃의 희귀도(1~3성)는 백엔드가 전체 유저 기준 (속, 종) 빈도로 계산해 bloom.rarity로
// 내려준다 - 여기 남은 건 별점 문자열/라벨로 바꾸는 순수 포맷터뿐이다. rarity가 없는 경우
// (도감 체계 도입 전 옛 기록 등) 호출부는 점수를 새로 매기지 않고 그냥 가장 흔한 등급(1)을
// 기본값으로 둔다 - "데이터가 부족하면 3성"이 되는 쪽이 훨씬 어색하기 때문이다.
export function rarityStars(tier: RarityTier): string {
  return "★".repeat(tier) + "☆".repeat(3 - tier);
}

export function rarityLabel(tier: RarityTier): string {
  if (tier === 3) return "희귀";
  if (tier === 2) return "고급";
  return "평범";
}
