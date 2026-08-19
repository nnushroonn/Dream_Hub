// 9단계 우주 티어 레벨 시스템 - backend/leveling.py와 반드시 값이 일치해야 한다. 레벨/티어
// 계산 자체는 서버가 하고 API 응답에 이미 계산된 level/tier_index/tier_title/tier_color가
// 실려오므로, 여기서는 그 값을 받아 배지·링을 그리는 프레젠테이션 상수만 둔다.

export interface AuthorBadge {
  level: number;
  tier_index: number; // 1~9
  tier_title: string;
  tier_color: string;
}

export const TIER_COUNT = 9;
export const TIER_TITLES = ["별먼지", "혜성", "달", "행성", "성운", "초신성", "성단", "은하", "우주"];

// LoL 티어 컬러 참고 - backend/leveling.py TIER_COLORS와 동일한 순서/값.
export const TIER_COLORS = [
  "#A97142", // 1 별먼지 - 브론즈
  "#9CA3AF", // 2 혜성 - 실버
  "#D4AF37", // 3 달 - 골드
  "#5FD0C6", // 4 행성 - 플래티넘
  "#34D399", // 5 성운 - 에메랄드
  "#4FC3F7", // 6 초신성 - 다이아몬드
  "#A855F7", // 7 성단 - 마스터
  "#EF4444", // 8 은하 - 그랜드마스터
  "#FFD700", // 9 우주 - 챌린저(골드+블루 특수 글로우, 별도 처리)
];

// 9티어(우주=챌린저)만 골드+블루 그라데이션 특수 글로우를 쓴다 - 나머지는 단색 링.
export const CHALLENGER_TIER_INDEX = 9;

export function tierColor(tierIndex: number): string {
  const clamped = Math.min(Math.max(tierIndex, 1), TIER_COUNT);
  return TIER_COLORS[clamped - 1];
}
