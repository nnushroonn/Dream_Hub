import type { Trend } from "@/api/dream";

// 트렌드 순위 변동(▲/▼/NEW)은 서버가 시계열로 저장해 주는 값이 아니라, 이 브라우저가 마지막으로
// 본 순위 스냅샷과 이번에 받아온 실제 순위를 비교해 계산한다 - 가짜 숫자를 지어내지 않고, 진짜
// 지난 방문 데이터를 기준으로 삼는다.
const TREND_SNAPSHOT_KEY = "dreamhub:trendSnapshot";

export type TrendRankChange = { type: "up"; amount: number } | { type: "down"; amount: number } | { type: "new" };

type TrendSnapshot = Record<string, number>; // keyword -> 지난 방문 당시의 1-based 순위

function readSnapshot(): TrendSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TREND_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as TrendSnapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(trends: Trend[]): void {
  if (typeof window === "undefined") return;
  const snapshot: TrendSnapshot = {};
  trends.forEach((trend, index) => {
    snapshot[trend.keyword] = index + 1;
  });
  try {
    window.localStorage.setItem(TREND_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // 스냅샷 저장은 부가 기능(순위 변동 뱃지)일 뿐이라 실패해도 트렌드 리스트 자체는 그대로 보여준다.
  }
}

/**
 * 이번에 받아온 트렌드 순위를 지난 방문 스냅샷과 비교해 변동 내역을 계산하고, 다음 비교를 위해
 * 이번 순위를 새 스냅샷으로 저장한다. 저장된 스냅샷이 아예 없는 첫 방문에는 비교 기준이 없으므로
 * 모든 항목이 NEW로 보이는 부자연스러움을 피하기 위해 빈 결과를 반환한다.
 */
export function syncTrendRankChanges(trends: Trend[]): Record<string, TrendRankChange> {
  const previous = readSnapshot();
  const changes: Record<string, TrendRankChange> = {};

  if (previous) {
    trends.forEach((trend, index) => {
      const currentRank = index + 1;
      const previousRank = previous[trend.keyword];
      if (previousRank === undefined) {
        changes[trend.keyword] = { type: "new" };
      } else if (previousRank !== currentRank) {
        const amount = previousRank - currentRank;
        changes[trend.keyword] = amount > 0 ? { type: "up", amount } : { type: "down", amount: Math.abs(amount) };
      }
    });
  }

  writeSnapshot(trends);
  return changes;
}
