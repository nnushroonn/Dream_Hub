"use client";

import { useState } from "react";

import type { DreamMood } from "@/api/dream";

const COLS = 7;
const CELL = 34;

const MOOD_DOT: Record<DreamMood, string> = {
  good: "h-2.5 w-2.5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]",
  neutral: "h-2.5 w-2.5 bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.5)]",
  nightmare: "h-2.5 w-2.5 bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.85)]",
};

export interface ConstellationEntry {
  mood: DreamMood;
  date: string;
  tooltip: string;
}

interface ConstellationDotsProps {
  daysInMonth: number;
  entries: Map<number, ConstellationEntry>;
}

function cellCenter(dayIndex: number) {
  const col = dayIndex % COLS;
  const row = Math.floor(dayIndex / COLS);
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function ConstellationDots({ daysInMonth, entries }: ConstellationDotsProps) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const rows = Math.ceil(daysInMonth / COLS);
  const width = COLS * CELL;
  const height = rows * CELL;

  const linePoints = Array.from(entries.keys())
    .sort((a, b) => a - b)
    .map((day) => cellCenter(day - 1));

  return (
    <div className="relative" style={{ width, height }}>
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
        const entry = entries.get(day);
        const { x, y } = cellCenter(i);
        const isTopRow = Math.floor(i / COLS) === 0;
        return (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: x, top: y }}
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
                className={`pointer-events-none absolute left-1/2 z-10 w-40 -translate-x-1/2 rounded-xl border border-violet-400/30 bg-black/90 px-3 py-2 text-[11px] leading-relaxed text-violet-100 shadow-lg backdrop-blur-md transition-opacity duration-200 ${
                  isTopRow ? "top-full mt-2" : "bottom-full mb-2"
                } ${hoveredDay === day ? "opacity-100" : "opacity-0"}`}
              >
                <span className="block text-[10px] text-violet-300/70">{entry.date}</span>
                {entry.tooltip}
              </div>
            )}
          </div>
        );
      })}
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
