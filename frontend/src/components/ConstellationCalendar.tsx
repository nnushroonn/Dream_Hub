"use client";

import { useState } from "react";

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

export interface ConstellationEntry {
  mood: DreamMood;
  date: string;
  tooltip: string;
  emoji: string;
}

interface ConstellationDotsProps {
  daysInMonth: number;
  /** 그 달 1일의 요일. 0(일) ~ 6(토) */
  startWeekday: number;
  entries: Map<number, ConstellationEntry>;
}

function cellCenter(gridIndex: number) {
  const col = gridIndex % COLS;
  const row = Math.floor(gridIndex / COLS);
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function ConstellationDots({ daysInMonth, startWeekday, entries }: ConstellationDotsProps) {
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
          const entry = entries.get(day);
          const { x, y } = cellCenter(gridIndex);
          const isTopRow = Math.floor(gridIndex / COLS) === 0;
          const isHovered = hoveredDay === day;

          return (
              <div
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: x, top: y, width: NODE_SIZE, height: NODE_SIZE }}
                onMouseEnter={() => entry && setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* 날짜 숫자 자체가 별자리의 노드가 된다 — 별도의 점(dot) 없이 하나로 일체화 */}
                <div
                  className={`flex h-full w-full select-none items-center justify-center rounded-full transition-all duration-300 ${
                    entry
                      ? `text-white font-medium ${MOOD_NODE_GLOW[entry.mood]} ${isHovered ? "scale-110" : ""}`
                      : "text-xs font-light text-slate-400/50 hover:bg-white/5 hover:backdrop-blur-sm"
                  }`}
                >
                  <span className={entry ? "text-sm" : undefined}>{day}</span>
                </div>

                {entry && (
                  <div
                    className={`pointer-events-none absolute left-1/2 z-10 w-40 -translate-x-1/2 rounded-xl border border-violet-400/30 bg-black/90 px-3 py-2 text-[11px] leading-relaxed text-violet-100 shadow-lg backdrop-blur-md transition-all duration-300 ${
                      isTopRow ? "top-full mt-2" : "bottom-full mb-2"
                    } ${
                      isHovered
                        ? "translate-y-0 opacity-100"
                        : `${isTopRow ? "-translate-y-1" : "translate-y-1"} opacity-0`
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm leading-none">{entry.emoji}</span>
                      <span className="text-[10px] text-violet-300/70">{entry.date}</span>
                    </div>
                    <p className="mt-1">{entry.tooltip}</p>
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
