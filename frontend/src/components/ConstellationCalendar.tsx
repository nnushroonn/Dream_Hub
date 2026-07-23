"use client";

import { Fragment, useState } from "react";

import type { DreamMood } from "@/api/dream";

const COLS = 7;
const COL_WIDTH = 34;
const ROW_HEIGHT = 40;
const DOT_Y = 13;
const NUMBER_Y = 29;

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const MOOD_DOT: Record<DreamMood, string> = {
  good: "h-2.5 w-2.5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]",
  neutral: "h-2.5 w-2.5 bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.5)]",
  nightmare: "h-2.5 w-2.5 bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.85)]",
};

const MOOD_NUMBER_CLASS: Record<DreamMood, string> = {
  good: "text-amber-300 drop-shadow-[0_0_4px_rgba(251,191,36,0.7)]",
  neutral: "text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]",
  nightmare: "text-purple-300 drop-shadow-[0_0_4px_rgba(168,85,247,0.7)]",
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

function cellPosition(gridIndex: number) {
  const col = gridIndex % COLS;
  const row = Math.floor(gridIndex / COLS);
  return {
    x: col * COL_WIDTH + COL_WIDTH / 2,
    dotY: row * ROW_HEIGHT + DOT_Y,
    numberY: row * ROW_HEIGHT + NUMBER_Y,
  };
}

export function ConstellationDots({ daysInMonth, startWeekday, entries }: ConstellationDotsProps) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const totalCells = startWeekday + daysInMonth;
  const rows = Math.ceil(totalCells / COLS);
  const width = COLS * COL_WIDTH;
  const height = rows * ROW_HEIGHT;

  const linePoints = Array.from(entries.keys())
    .sort((a, b) => a - b)
    .map((day) => cellPosition(startWeekday + day - 1));

  return (
    <div style={{ width }}>
      {/* 요일 헤더: 아주 슬림하고 투명도 높은 라벨 */}
      <div className="flex">
        {WEEKDAY_LABELS.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="flex items-center justify-center text-[10px] font-light tracking-widest text-slate-500/40"
            style={{ width: COL_WIDTH }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="relative mt-1" style={{ width, height }}>
        <svg width={width} height={height} className="pointer-events-none absolute inset-0">
          <polyline
            points={linePoints.map((p) => `${p.x},${p.dotY}`).join(" ")}
            fill="none"
            stroke="rgba(167,139,250,0.35)"
            strokeWidth="1"
          />
        </svg>

        {Array.from({ length: daysInMonth }, (_, i) => i).map((i) => {
          const day = i + 1;
          const gridIndex = startWeekday + i;
          const entry = entries.get(day);
          const { x, dotY, numberY } = cellPosition(gridIndex);
          const isTopRow = Math.floor(gridIndex / COLS) === 0;

          return (
            <Fragment key={i}>
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: x, top: dotY }}
                onMouseEnter={() => entry && setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                <span
                  className={`block rounded-full transition-transform duration-200 ${
                    entry ? `${MOOD_DOT[entry.mood]} ${hoveredDay === day ? "scale-150" : ""}` : "h-1 w-1 bg-white/15"
                  }`}
                />
                {entry && (
                  <div
                    className={`pointer-events-none absolute left-1/2 z-10 w-40 -translate-x-1/2 rounded-xl border border-violet-400/30 bg-black/90 px-3 py-2 text-[11px] leading-relaxed text-violet-100 shadow-lg backdrop-blur-md transition-all duration-300 ${
                      isTopRow ? "top-full mt-2" : "bottom-full mb-2"
                    } ${
                      hoveredDay === day
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

              <span
                className={`pointer-events-none absolute -translate-x-1/2 select-none text-[9px] leading-none transition-colors duration-300 ${
                  entry ? `font-medium ${MOOD_NUMBER_CLASS[entry.mood]}` : "text-white/15"
                }`}
                style={{ left: x, top: numberY }}
              >
                {day}
              </span>
            </Fragment>
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
