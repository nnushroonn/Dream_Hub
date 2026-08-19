"use client";

import { useMemo, useState, type CSSProperties } from "react";

import type { DreamMood } from "@/api/dream";

const COLS = 7;
const CELL = 40;
const NODE_SIZE = 32;
// 하루에 기록이 여럿이면 원 자체가 커진다 - 숫자 배지는 유지하되 크기가 1차 정보, 숫자는
// 보조 정보가 되도록 한다. 1편=기본, 2편=+15%, 3편 이상=+30%.
const NODE_SIZE_MULTIPLIER = { 1: 1, 2: 1.15, 3: 1.3 } as const;

function nodeSizeFor(entryCount: number): number {
  const multiplier = NODE_SIZE_MULTIPLIER[Math.min(entryCount, 3) as 1 | 2 | 3] ?? 1;
  return NODE_SIZE * multiplier;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// 단일 무드일 때: 날짜 숫자를 가리지 않도록 배경은 옅게 유지하되, 예전보다 채움/테두리를
// 더 진하게 하고 글로우도 넓혀(0 0 12px 4px) 별자리 도감처럼 또렷하게 빛나 보이게 한다.
// 범례(ConstellationMoodLegend)와 정확히 같은 색상 계열을 쓴다: 길몽=amber, 악몽=purple, 보통=흰색.
const MOOD_NODE_GLOW: Record<DreamMood, string> = {
  good: "bg-amber-400/25 shadow-[0_0_12px_4px_rgba(245,158,11,0.6)] border border-amber-400/50",
  neutral: "bg-white/20 shadow-[0_0_12px_4px_rgba(226,232,240,0.6)] border border-white/40",
  nightmare: "bg-purple-500/25 shadow-[0_0_12px_4px_rgba(168,85,247,0.6)] border border-purple-400/50",
};

// 하루에 감정이 다른 꿈이 2개 이상 섞여 있을 때 쓰는 성단 그라데이션 - 길몽+악몽이 함께 있으면
// 앰버->퍼플 그라데이션, 그 외 조합(보통이 섞인 경우 등)은 존재하는 무드 중 더 강한 색을 우선한다.
function mixedMoodClass(moods: DreamMood[]): string {
  const has = (mood: DreamMood) => moods.includes(mood);
  if (has("good") && has("nightmare")) {
    return "bg-gradient-to-tr from-amber-500/40 to-purple-500/40 border border-purple-500/30";
  }
  if (has("good")) return MOOD_NODE_GLOW.good;
  if (has("nightmare")) return MOOD_NODE_GLOW.nightmare;
  return MOOD_NODE_GLOW.neutral;
}

// 팝오버 리스트에 붙는 길/평/흉 이모지 뱃지.
const MOOD_BADGE: Record<DreamMood, string> = {
  good: "🌙 길몽",
  neutral: "🌀 보통",
  nightmare: "😨 악몽",
};

function formatEntryTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// 필드가 전부 문자열인 이유는 아래 generateEdgeStar 주석 참고 - 서버/클라이언트가 100% 같은
// HTML 문자열을 뱉게 하려면 숫자를 style에 그대로 넘기지 않고 여기서 미리 고정해야 한다.
interface Star {
  left: string;
  top: string;
  size: string;
  opacity: string;
  delay: string;
  duration: string;
}

// 서버 렌더와 클라이언트 첫 렌더가 항상 같은 값을 뽑아야 하이드레이션이 어긋나지 않는다.
// Math.random()은 호출될 때마다 다른 값이라 서버가 그린 위치/타이밍과 클라이언트가 다시
// 계산한 값이 매번 어긋나 "hydration mismatch" 콘솔 에러가 났다 - index+salt로만 결정되는
// 결정론적 의사난수로 대신한다(backend/flower_taxonomy.py의 _seeded_fraction과 같은 방식).
// 진짜 무작위는 아니지만 눈으로 보기엔 여전히 흩뿌려진 것처럼 보이고, 몇 번을 다시 계산해도
// 항상 같은 값이 나온다.
function seededFraction(seed: number, salt: string): number {
  let saltValue = 0;
  for (let i = 0; i < salt.length; i++) saltValue += salt.charCodeAt(i);
  const combined = seed * 999331 + saltValue * 97 + 12.9898;
  const x = Math.sin(combined) * 43758.5453;
  return x - Math.floor(x);
}

// 캘린더 그리드(요일 헤더+날짜 칸) 바깥의 여백 프레임에만 흩뿌리는 배경 별 - 날짜 숫자나
// 텍스트 위로 절대 겹치지 않도록, 그리드 영역 자체가 아니라 그 바깥 네 변(상/하/좌/우)의
// 얇은 띠에만 배치한다. 그리드 폭/칸 사이 여백에 비쳐 보이게 하던 예전 방식은 숫자와
// 시각적으로 뒤엉켜 보인다는 피드백을 받아, 그리드를 완전히 벗어난 프레임으로 옮겼다.
// 이 컴포넌트를 감싸는 카드(MonthlyDashboardPanel)의 px-6 py-6(24px) 패딩 안에서 잘리지
// 않도록, 그 폭보다 살짝 작게 잡는다.
const STAR_FRAME_PAD = 18; // px - 그리드 바깥으로 별을 흩뿌리는 여백 폭.

// 값을 여기서 미리 고정 소수점 문자열로 굳혀 둔다(예: "1.4587px") - 숫자를 그대로 style에
// 넘기면, 서버가 HTML로 직렬화할 때 쓰는 반올림/자릿수와 클라이언트가 style 객체에 적용할 때
// 쓰는 표현이 서로 달라(둘 다 "같은 값"이긴 해도 문자열 형태가 달라) 하이드레이션 불일치로
// 잡힌다 - seededFraction으로 값 자체는 이미 결정론적이어도, 문자열화까지 직접 고정해야
// 완전히 같은 HTML이 나온다.
function generateEdgeStar(index: number): Star {
  const along = seededFraction(index, "along") * 100; // 그 변을 따라가는 위치(0~100%)
  const depth = seededFraction(index, "depth") * 100; // 프레임 띠 안에서의 깊이(0~100%)
  const size = 1 + seededFraction(index, "size"); // 1~2px
  const opacity = 0.2 + seededFraction(index, "opacity") * 0.7; // 0.2~0.9
  const delay = seededFraction(index, "delay") * 4;
  const duration = 3 + seededFraction(index, "duration") * 2; // 3~5초
  return {
    left: `${along.toFixed(4)}%`,
    top: `${depth.toFixed(4)}%`,
    size: `${size.toFixed(4)}px`,
    opacity: opacity.toFixed(4),
    delay: `${delay.toFixed(4)}s`,
    duration: `${duration.toFixed(4)}s`,
  };
}

// 45개를 상/하/좌/우 네 변에 고르게 나눠 배정한다 - 각 변은 독립된 좌표계(그 변 자체의
// along/depth)를 쓰므로, 배정 순서만 바뀔 뿐 좌표 계산에는 영향이 없다.
function generateEdgeStars(count: number): { top: Star[]; bottom: Star[]; left: Star[]; right: Star[] } {
  const edges: { top: Star[]; bottom: Star[]; left: Star[]; right: Star[] } = { top: [], bottom: [], left: [], right: [] };
  const order: (keyof typeof edges)[] = ["top", "bottom", "left", "right"];
  for (let index = 0; index < count; index++) {
    edges[order[index % 4]].push(generateEdgeStar(index));
  }
  return edges;
}

function EdgeStarStrip({ stars, className, style }: { stars: Star[]; className: string; style: CSSProperties }) {
  return (
    <div className={className} style={style} aria-hidden>
      {stars.map((star, index) => (
        <span
          key={index}
          className="absolute animate-star-twinkle rounded-full bg-white motion-reduce:animate-none"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  );
}

// 캘린더(요일 헤더+날짜 그리드) 바깥 네 변에 얇은 띠를 두르고, 그 띠 안에서만 별이 반짝이게
// 한다. 상/하 띠는 컴포넌트 폭 전체를 따라가고(along=가로 위치), 좌/우 띠는 부모의 top:0·
// bottom:0로 실제 렌더 높이를 몰라도 항상 전체 높이를 따라간다.
function StarField({ edgeStars }: { edgeStars: { top: Star[]; bottom: Star[]; left: Star[]; right: Star[] } }) {
  return (
    <>
      <EdgeStarStrip
        stars={edgeStars.top}
        className="pointer-events-none absolute overflow-hidden"
        style={{ left: 0, right: 0, top: -STAR_FRAME_PAD, height: STAR_FRAME_PAD }}
      />
      <EdgeStarStrip
        stars={edgeStars.bottom}
        className="pointer-events-none absolute overflow-hidden"
        style={{ left: 0, right: 0, bottom: -STAR_FRAME_PAD, height: STAR_FRAME_PAD }}
      />
      <EdgeStarStrip
        stars={edgeStars.left}
        className="pointer-events-none absolute overflow-hidden"
        style={{ top: 0, bottom: 0, left: -STAR_FRAME_PAD, width: STAR_FRAME_PAD }}
      />
      <EdgeStarStrip
        stars={edgeStars.right}
        className="pointer-events-none absolute overflow-hidden"
        style={{ top: 0, bottom: 0, right: -STAR_FRAME_PAD, width: STAR_FRAME_PAD }}
      />
    </>
  );
}

export interface ConstellationEntry {
  id: number;
  mood: DreamMood;
  date: string;
  tooltip: string;
  emoji: string;
  createdAt: string;
}

interface ConstellationDotsProps {
  daysInMonth: number;
  /** 그 달 1일의 요일. 0(일) ~ 6(토) */
  startWeekday: number;
  /** 하루에 여러 꿈을 기록할 수 있어, 날짜당 기록이 배열로 들어온다 */
  entries: Map<number, ConstellationEntry[]>;
  /** 노드(또는 미니 스냅샷 팝오버의 항목)를 선택하면 그 날의 전체 기록 목록과, 그중 어떤 편을
   * 먼저 열어야 하는지(preferredEntryId)와 함께 호출된다 (상세 보기 오픈용). */
  onSelectEntry?: (dayEntries: ConstellationEntry[], preferredEntryId?: number) => void;
  /** 오늘 날짜(1~31) - 조회 중인 달이 이번 달일 때만 넘어오며, 기록 유무와 무관하게 링으로 표시한다 */
  todayDay?: number | null;
}

function cellCenter(gridIndex: number) {
  const col = gridIndex % COLS;
  const row = Math.floor(gridIndex / COLS);
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function buildStraightPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
}

export function ConstellationDots({ daysInMonth, startWeekday, entries, onSelectEntry, todayDay }: ConstellationDotsProps) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  // 기록이 2편 이상인 날을 클릭하면 바로 상세로 보내는 대신, 어떤 편을 볼지 고르는 미니
  // 스냅샷 팝오버를 먼저 띄운다. 기록이 1편뿐인 날은 고를 게 없으니 곧장 상세로 연다.
  const [openPopoverDay, setOpenPopoverDay] = useState<number | null>(null);
  // 캘린더 바깥 프레임에 흩뿌리는 배경 별 - 마운트 시 한 번만 뽑아서 리렌더마다 위치가
  // 널뛰지 않게 한다.
  const edgeStars = useMemo(() => generateEdgeStars(45), []);

  const totalCells = startWeekday + daysInMonth;
  const rows = Math.ceil(totalCells / COLS);
  const width = COLS * CELL;
  const height = rows * CELL;

  const linePoints = Array.from(entries.keys())
    .sort((a, b) => a - b)
    .map((day) => cellCenter(startWeekday + day - 1));

  return (
    <div className="relative" style={{ width }}>
      <StarField edgeStars={edgeStars} />

      {/* 요일 헤더: 구조적 명확성만 담당하는 극도로 슬림한 라벨 */}
      <div className="relative z-10 flex">
        {WEEKDAY_LABELS.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="flex items-center justify-center text-[10px] font-semibold tracking-[0.2em] text-slate-500/70"
            style={{ width: CELL }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="relative z-10 mt-3" style={{ width, height }}>
        {/* 별자리 도감처럼 은은하게 - 얇게(0.75) 긋고 옅은 글로우를 얹는다. 날짜 숫자보다
            항상 아래에 깔리도록 z-0을 명시한다(날짜 노드 쪽은 아래에서 z-10으로 명시). 기록을
            이은 선은 원래대로 일직선으로 긋는다. */}
        <svg width={width} height={height} className="pointer-events-none absolute inset-0 z-0">
          <path
            d={buildStraightPath(linePoints)}
            fill="none"
            stroke="rgba(167,139,250,0.45)"
            strokeWidth="0.75"
            style={{ filter: "drop-shadow(0 0 3px rgba(167,139,250,0.5))" }}
          />
        </svg>

        {Array.from({ length: daysInMonth }, (_, i) => i).map((i) => {
          const day = i + 1;
          const gridIndex = startWeekday + i;
          const dayEntries = entries.get(day);
          const entry = dayEntries?.[0];
          const isMulti = (dayEntries?.length ?? 0) > 1;
          const uniqueMoods = dayEntries ? Array.from(new Set(dayEntries.map((e) => e.mood))) : [];
          const { x, y } = cellCenter(gridIndex);
          const isTopRow = Math.floor(gridIndex / COLS) === 0;
          const isHovered = hoveredDay === day;
          const isToday = todayDay === day;
          const isPopoverOpen = openPopoverDay === day;

          const moodClass = uniqueMoods.length > 1 ? mixedMoodClass(uniqueMoods) : entry ? MOOD_NODE_GLOW[entry.mood] : "";
          const dynamicNodeSize = nodeSizeFor(dayEntries?.length ?? 0);

          const handleNodeClick = () => {
            if (!dayEntries || !entry) return;
            if (isMulti) {
              setOpenPopoverDay((prev) => (prev === day ? null : day));
              return;
            }
            onSelectEntry?.(dayEntries, entry.id);
          };

          return (
              <div
                key={i}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: x, top: y, width: dynamicNodeSize, height: dynamicNodeSize }}
                onMouseEnter={() => entry && setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* 날짜 숫자 자체가 별자리의 노드가 된다 — 별도의 점(dot) 없이 하나로 일체화.
                    숫자는 항상 text-slate-200로 가독성을 지키고, 종류는 테두리+글로우로만 표현한다.
                    반짝이는 애니메이션은 숫자 위에는 얹지 않는다 - 텍스트 가독성을 해치지 않도록,
                    반짝임은 그리드 바깥 프레임의 배경 별(StarField)만 담당한다. */}
                <button
                  type="button"
                  disabled={!entry}
                  onClick={handleNodeClick}
                  aria-label={
                    entry ? `${entry.date} 꿈 기록 ${dayEntries!.length}건 ${isMulti ? "선택" : "상세 보기"}` : undefined
                  }
                  className={`flex h-full w-full select-none items-center justify-center rounded-full font-medium transition-all duration-300 ${
                    entry
                      ? `cursor-pointer text-slate-100 ${moodClass} ${isMulti ? "shadow-lg" : ""} ${
                          isHovered || isPopoverOpen ? "scale-110" : ""
                        }`
                      : "cursor-default text-xs font-light text-slate-400 hover:bg-white/5 hover:backdrop-blur-sm"
                  } ${isToday ? "ring-2 ring-violet-300/80 ring-offset-2 ring-offset-slate-950" : ""}`}
                >
                  <span className="flex flex-col items-center justify-center leading-none">
                    <span className={entry ? "text-sm" : undefined}>{day}</span>
                    {isToday && !entry && (
                      <span className="mt-0.5 h-1 w-1 animate-pulse rounded-full bg-white/30 mx-auto" />
                    )}
                  </span>
                </button>

                {/* 이중 궤도 링 + 카운트 칩: 하루에 기록이 2개 이상이면 노드를 감싸는 궤도와,
                    우측 상단에 몇 편인지 바로 읽히는 컴팩트한 칩을 함께 띄운다. */}
                {isMulti && (
                  <>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-[-4px] rotate-12 rounded-full border-2 border-dashed border-violet-300/70 opacity-40"
                    />
                    <span className="pointer-events-none absolute -right-1 -top-1 rounded bg-purple-950/80 px-1 text-[9px] text-purple-300">
                      {dayEntries!.length}
                    </span>
                  </>
                )}

                {/* 단일 기록일 tag는 가볍게 호버 미리보기만 - 고를 게 없으니 클릭은 바로 상세로 간다. */}
                {entry && !isMulti && (
                  <div
                    className={`pointer-events-none absolute left-1/2 z-10 w-44 -translate-x-1/2 rounded-xl border border-violet-400/30 bg-black/90 px-3 py-2 text-[11px] leading-relaxed text-violet-100 shadow-lg backdrop-blur-md transition-all duration-300 ${
                      isTopRow ? "top-full mt-2" : "bottom-full mb-2"
                    } ${
                      isHovered
                        ? "translate-y-0 opacity-100"
                        : `${isTopRow ? "-translate-y-1" : "translate-y-1"} opacity-0`
                    }`}
                  >
                    <span className="text-[10px] text-violet-300/70">{entry.date}</span>
                    <div className="mt-1 flex items-start gap-1.5">
                      <span className="text-sm leading-tight">{entry.emoji}</span>
                      <p className="leading-tight">{entry.tooltip}</p>
                    </div>
                  </div>
                )}

                {/* 다중 기록일 미니 스냅샷 팝오버: 클릭해서 열고, 항목을 고르면 그 편으로 바로
                    상세 보기가 열린다 - 시간/제목/길·평·흉 뱃지를 한 줄씩 리스트로 보여준다. */}
                {isMulti && isPopoverOpen && (
                  <div
                    className={`absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded-xl border border-slate-700/50 bg-slate-900/90 p-3 shadow-lg backdrop-blur-md ${
                      isTopRow ? "top-full mt-2" : "bottom-full mb-2"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-violet-300/70">{entry!.date} · 꿈 {dayEntries!.length}편</span>
                      <button
                        type="button"
                        aria-label="닫기"
                        onClick={() => setOpenPopoverDay(null)}
                        className="text-slate-500 transition-colors hover:text-slate-300"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayEntries!.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => {
                            onSelectEntry?.(dayEntries!, e.id);
                            setOpenPopoverDay(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-violet-100 transition-colors hover:bg-violet-500/15"
                        >
                          <span className="shrink-0 font-mono text-[10px] text-slate-500">{formatEntryTime(e.createdAt)}</span>
                          <span className="min-w-0 flex-1 truncate">{e.tooltip}</span>
                          <span className="shrink-0 text-[10px] text-slate-400">{MOOD_BADGE[e.mood]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
          );
        })}
      </div>
    </div>
  );
}

export function ConstellationMoodLegend() {
  return (
    <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-400" /> 길몽
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-white/80" /> 보통
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-purple-500" /> 악몽
      </span>
    </div>
  );
}
