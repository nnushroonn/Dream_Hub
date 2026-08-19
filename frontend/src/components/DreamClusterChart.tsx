"use client";

import { getSeedDefinition, type SeedType } from "@/lib/dreamSeeds";

interface SeedStat {
  seed: SeedType;
  count: number;
}

// 마이페이지 "무의식 은하계" 상단 성운 - 도넛 링을 그대로 한 번 더 blur(-xl)로 겹쳐 깔아,
// 차트 라이브러리 없이도 은은하게 빛나는 성운처럼 보이게 한다.
export default function DreamClusterChart({ seedStats }: { seedStats: SeedStat[] }) {
  const total = seedStats.reduce((sum, stat) => sum + stat.count, 0);
  const radius = 60;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;

  // reduce로 누적 오프셋을 파생한다 - map 도중 외부 변수를 재대입하면 렌더 도중 캡처된 변수를
  // 변경하는 셈이라 react-hooks/immutability에 걸린다.
  const segments = seedStats.reduce<Array<SeedStat & { dash: number; offset: number; ratio: number }>>((acc, stat) => {
    const ratio = total > 0 ? stat.count / total : 0;
    const dash = ratio * circumference;
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset - previous.dash : 0;
    acc.push({ ...stat, dash, offset, ratio });
    return acc;
  }, []);

  return (
    // 이 카드가 항상 좁은 컬럼(lg:col-span-1) 안에 놓이게 되면서, 도넛과 범례를 가로로
    // 나란히 두면 범례 폭이 너무 좁아져 텍스트가 한 글자씩 세로로 쪼개지는 문제가 있었다 -
    // 폭에 흔들리지 않도록 아예 세로로 쌓아 차트는 상단 중앙에, 범례는 그 아래 전체 폭으로 둔다.
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-36 w-36 shrink-0">
        {/* 글로우 레이어 */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90 opacity-60 blur-xl" aria-hidden>
          {total === 0 ? (
            <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(168,85,247,0.35)" strokeWidth={strokeWidth} />
          ) : (
            segments.map(
              (seg) =>
                seg.dash > 0 && (
                  <circle
                    key={seg.seed}
                    cx="100"
                    cy="100"
                    r={radius}
                    fill="none"
                    stroke={getSeedDefinition(seg.seed).colors[0]}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
                    strokeDashoffset={seg.offset}
                  />
                )
            )
          )}
        </svg>

        {/* 실제 도넛 링 */}
        <svg viewBox="0 0 200 200" className="relative -rotate-90">
          <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
          {segments.map(
            (seg) =>
              seg.dash > 0 && (
                <circle
                  key={seg.seed}
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  stroke={getSeedDefinition(seg.seed).colors[0]}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(seg.dash - 3, 0)} ${circumference - seg.dash + 3}`}
                  strokeDashoffset={seg.offset}
                  className="transition-all duration-700 ease-out"
                />
              )
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-white">{total}</span>
          <span className="text-[11px] text-purple-300/70">심어진 씨앗</span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2.5">
        {segments.map((seg) => (
          <li key={seg.seed} className="flex items-center gap-2.5 text-xs text-slate-300">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: getSeedDefinition(seg.seed).colors[0],
                boxShadow: `0 0 8px ${getSeedDefinition(seg.seed).colors[0]}`,
              }}
            />
            <span className="flex-1 truncate">{getSeedDefinition(seg.seed).label}</span>
            <span className="shrink-0 whitespace-nowrap text-slate-500">
              {seg.count}회{total > 0 ? ` · ${Math.round(seg.ratio * 100)}%` : ""}
            </span>
          </li>
        ))}
        {total === 0 && <li className="text-xs text-slate-600">아직 심어둔 꿈 씨앗이 없어요. 일기장에서 하나 골라보세요 🌙</li>}
      </ul>
    </div>
  );
}
