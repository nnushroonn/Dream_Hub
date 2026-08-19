"use client";

interface MonthlyMoodChartProps {
  good: number;
  neutral: number;
  nightmare: number;
}

const SIZE = 160;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ConstellationMoodLegend와 같은 팔레트(amber-400/white/purple-500)를 그대로 써서, 캘린더 도트
// 색상과 이 도넛 차트가 같은 무드를 가리키고 있다는 게 한눈에 이어져 보이게 한다.
const SEGMENTS: { key: "good" | "neutral" | "nightmare"; color: string; label: string }[] = [
  { key: "good", color: "#fbbf24", label: "길몽" },
  { key: "neutral", color: "#e2e8f0", label: "보통" },
  { key: "nightmare", color: "#a855f7", label: "악몽" },
];

export default function MonthlyMoodChart({ good, neutral, nightmare }: MonthlyMoodChartProps) {
  const counts = { good, neutral, nightmare };
  const total = good + neutral + nightmare;

  if (total === 0) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
        <p className="max-w-[180px] text-xs text-slate-500">이번 달 기록이 쌓이면 길몽·보통·악몽 비율을 보여드려요.</p>
      </div>
    );
  }

  // 각 세그먼트의 길이/누적 오프셋을 map 중 외부 변수를 재대입하는 방식 대신 reduce로 한 번에
  // 파생한다 - 렌더 도중 캡처된 변수를 변경하지 않는 순수한 방식이라야 한다.
  const arcs = SEGMENTS.filter((segment) => counts[segment.key] > 0).reduce<
    { key: "good" | "neutral" | "nightmare"; color: string; length: number; offset: number }[]
  >((acc, segment) => {
    const length = (counts[segment.key] / total) * CIRCUMFERENCE;
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    return [...acc, { key: segment.key, color: segment.color, length, offset }];
  }, []);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {/* -rotate-90으로 12시 방향부터 그리기 시작 */}
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE}
              strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{total}</span>
          <span className="text-[11px] text-slate-500">이번 달 기록</span>
        </div>
      </div>

      <ul className="mt-5 w-full space-y-2">
        {SEGMENTS.map((segment) => {
          const count = counts[segment.key];
          const percent = Math.round((count / total) * 100);
          return (
            <li key={segment.key} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                {segment.label}
              </span>
              <span className="text-slate-400">
                {count}건 <span className="text-slate-500">({percent}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
