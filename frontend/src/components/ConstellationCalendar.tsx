"use client";

import { useState, type CSSProperties } from "react";

import type { DreamMood } from "@/api/dream";

const COLS = 7;
const CELL = 40;
const NODE_SIZE = 32;

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// 기록이 있는 날의 노드: 숫자는 항상 화이트로 통일하고, 배경에만 감정별 컬러의
// 은은한 네온 글로우를 깔아 '진짜 밤하늘의 별'처럼 보이도록 한다.
const MOOD_NODE_GLOW: Record<DreamMood, string> = {
  good: "bg-amber-400/20 shadow-[0_0_15px_rgba(251,191,36,0.65)]",
  neutral: "bg-white/15 shadow-[0_0_15px_rgba(255,255,255,0.55)]",
  nightmare: "bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.65)]",
};

// 하루에 감정이 다른 꿈이 2개 이상 섞여 있을 때, 그 색들을 그라데이션으로 녹여 성단처럼 보이게 한다.
const MOOD_GLOW_RGBA: Record<DreamMood, string> = {
  good: "rgba(251,191,36,0.9)",
  neutral: "rgba(226,232,240,0.9)",
  nightmare: "rgba(168,85,247,0.9)",
};

export interface ConstellationEntry {
  id: number;
  mood: DreamMood;
  date: string;
  tooltip: string;
  emoji: string;
}

interface ConstellationDotsProps {
  daysInMonth: number;
  /** 그 달 1일의 요일. 0(일) ~ 6(토) */
  startWeekday: number;
  /** 하루에 여러 꿈을 기록할 수 있어, 날짜당 기록이 배열로 들어온다 */
  entries: Map<number, ConstellationEntry[]>;
  /** 불 켜진 노드를 클릭하면 그 날의 전체 기록 목록과 함께 호출된다 (상세 보기 오픈용) */
  onSelectEntry?: (dayEntries: ConstellationEntry[]) => void;
  /** 오늘 날짜(1~31) - 조회 중인 달이 이번 달일 때만 넘어오며, 기록 유무와 무관하게 링으로 표시한다 */
  todayDay?: number | null;
}

function cellCenter(gridIndex: number) {
  const col = gridIndex % COLS;
  const row = Math.floor(gridIndex / COLS);
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function ConstellationDots({ daysInMonth, startWeekday, entries, onSelectEntry, todayDay }: ConstellationDotsProps) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const totalCells = startWeekday + daysInMonth;
  const rows = Math.ceil(totalCells / COLS);
  const width = COLS * CELL;
  const height = rows * CELL;

  const linePoints = Array.from(entries.keys())
    .sort((a, b) => a - b)
    .map((day) => cellCenter(startWeekday + day - 1));

  return (
    <div style={{ width }}>
      {/* 요일 헤더: 구조적 명확성만 담당하는 극도로 슬림한 라벨 */}
      <div className="flex">
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

      <div className="relative mt-3" style={{ width, height }}>
        <svg width={width} height={height} className="pointer-events-none absolute inset-0">
          <polyline
            points={linePoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="rgba(167,139,250,0.35)"
            strokeWidth="1"
          />
        </svg>

        {Array.from({ length: daysInMonth }, (_, i) => i).map((i) => {
          const day = i + 1;
          const gridIndex = startWeekday + i;
          const dayEntries = entries.get(day);
          const entry = dayEntries?.[0];
          const extraCount = (dayEntries?.length ?? 0) - 1;
          const uniqueMoods = dayEntries ? Array.from(new Set(dayEntries.map((e) => e.mood))) : [];
          const { x, y } = cellCenter(gridIndex);
          const isTopRow = Math.floor(gridIndex / COLS) === 0;
          const isHovered = hoveredDay === day;
          const isToday = todayDay === day;

          // 감정이 섞인 성단(2개 이상 기록 + 서로 다른 무드)은 인라인 그라데이션으로 색을 섞는다.
          const clusterStyle: CSSProperties | undefined =
            uniqueMoods.length > 1
              ? {
                  background: `linear-gradient(135deg, ${uniqueMoods.map((m) => MOOD_GLOW_RGBA[m]).join(", ")})`,
                  boxShadow: `0 0 16px ${MOOD_GLOW_RGBA[uniqueMoods[0]]}`,
                }
              : undefined;

          return (
              <div
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: x, top: y, width: NODE_SIZE, height: NODE_SIZE }}
                onMouseEnter={() => entry && setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* 날짜 숫자 자체가 별자리의 노드가 된다 — 별도의 점(dot) 없이 하나로 일체화 */}
                <button
                  type="button"
                  disabled={!entry}
                  onClick={() => dayEntries && onSelectEntry?.(dayEntries)}
                  aria-label={
                    entry ? `${entry.date} 꿈 기록 ${dayEntries!.length}건 상세 보기` : undefined
                  }
                  style={clusterStyle}
                  className={`flex h-full w-full select-none items-center justify-center rounded-full transition-all duration-300 ${
                    entry
                      ? `cursor-pointer text-white font-medium ${clusterStyle ? "" : MOOD_NODE_GLOW[entry.mood]} ${
                          isHovered ? "scale-110" : ""
                        }`
                      : "cursor-default text-xs font-light text-slate-400/50 hover:bg-white/5 hover:backdrop-blur-sm"
                  } ${isToday ? "ring-2 ring-violet-300/80 ring-offset-2 ring-offset-slate-950" : ""}`}
                >
                  <span className="flex flex-col items-center justify-center leading-none">
                    <span className={entry ? "text-sm" : undefined}>{day}</span>
                    {isToday && !entry && (
                      <span className="mt-0.5 h-1 w-1 animate-pulse rounded-full bg-white/30 mx-auto" />
                    )}
                  </span>
                </button>

                {/* 이중 궤도 링: 하루에 기록이 2개 이상이면 노드를 감싸는 궤도 하나를 더 그려
                    '여러 기록이 공전하는 성단'처럼 보이게 한다. 노드와 같은 wrapper(-translate-x/y-1/2로
                    이미 (x,y)에 중심이 맞춰진 absolute 컨테이너) 안에서 inset만으로 확장하므로,
                    별자리 선(polyline)의 중심 좌표 계산에는 전혀 영향을 주지 않는다. */}
                {extraCount > 0 && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-[-4px] rotate-12 rounded-full border-2 border-dashed border-violet-300/70 opacity-40"
                  />
                )}

                {entry && (
                  <div
                    className={`pointer-events-none absolute left-1/2 z-10 w-44 -translate-x-1/2 rounded-xl border border-violet-400/30 bg-black/90 px-3 py-2 text-[11px] leading-relaxed text-violet-100 shadow-lg backdrop-blur-md transition-all duration-300 ${
                      isTopRow ? "top-full mt-2" : "bottom-full mb-2"
                    } ${
                      isHovered
                        ? "translate-y-0 opacity-100"
                        : `${isTopRow ? "-translate-y-1" : "translate-y-1"} opacity-0`
                    }`}
                  >
                    <span className="text-[10px] text-violet-300/70">
                      {entry.date}
                      {extraCount > 0 && ` · 꿈 ${dayEntries!.length}편`}
                    </span>
                    {dayEntries!.map((e) => (
                      <div key={e.id} className="mt-1 flex items-start gap-1.5">
                        <span className="text-sm leading-tight">{e.emoji}</span>
                        <p className="leading-tight">{e.tooltip}</p>
                      </div>
                    ))}
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
