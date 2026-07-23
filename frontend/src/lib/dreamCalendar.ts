export function todayDateString(): string {
  return formatDateString(new Date());
}

export function formatDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + deltaDays);
  return formatDateString(date);
}

export interface StreakResult {
  streakDays: number;
  checkedInToday: boolean;
}

/**
 * 오늘(기록이 있으면) 또는 가장 최근 기록일부터 하루씩 과거로 소급하며
 * 끊기지 않고 이어지는 연속 기록 일수를 센다.
 */
export function computeStreak(
  entries: { dream_date: string }[],
  todayStr: string = todayDateString()
): StreakResult {
  const dateSet = new Set(entries.map((entry) => entry.dream_date));
  const checkedInToday = dateSet.has(todayStr);

  if (dateSet.size === 0) {
    return { streakDays: 0, checkedInToday: false };
  }

  let cursor = checkedInToday ? todayStr : [...dateSet].sort().at(-1)!;

  let streakDays = 0;
  while (dateSet.has(cursor)) {
    streakDays += 1;
    cursor = shiftDateString(cursor, -1);
  }

  return { streakDays, checkedInToday };
}
