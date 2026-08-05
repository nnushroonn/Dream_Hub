"use client";

import { useState } from "react";

import type { DreamMood } from "@/api/dream";

const COLS = 7;
const CELL = 40;
const NODE_SIZE = 32;

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// 단일 무드일 때: 날짜 숫자를 가리지 않도록 배경은 옅게, 종류는 테두리+외곽 글로우로만 표현한다.
const MOOD_NODE_GLOW: Record<DreamMood, string> = {
  good: "bg-amber-400/10 shadow-[0_0_15px_rgba(245,158,11,0.4)] border border-amber-500/30",
  neutral: "bg-white/10 shadow-[0_0_15px_rgba(226,232,240,0.4)] border border-white/20",
  nightmare: "bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-purple-500/30",
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

export function ConstellationDots({ daysInMonth, startWeekday, entries, onSelectEntry, todayDay }: ConstellationDotsProps) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  // 기록이 2편 이상인 날을 클릭하면 바로 상세로 보내는 대신, 어떤 편을 볼지 고르는 미니
  // 스냅샷 팝오버를 먼저 띄운다. 기록이 1편뿐인 날은 고를 게 없으니 곧장 상세로 연다.
  const [openPopoverDay, setOpenPopoverDay] = useState<number | null>(null);

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
          const isMulti = (dayEntries?.length ?? 0) > 1;
          const uniqueMoods = dayEntries ? Array.from(new Set(dayEntries.map((e) => e.mood))) : [];
          const { x, y } = cellCenter(gridIndex);
          const isTopRow = Math.floor(gridIndex / COLS) === 0;
          const isHovered = hoveredDay === day;
          const isToday = todayDay === day;
          const isPopoverOpen = openPopoverDay === day;

          const moodClass = uniqueMoods.length > 1 ? mixedMoodClass(uniqueMoods) : entry ? MOOD_NODE_GLOW[entry.mood] : "";

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
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: x, top: y, width: NODE_SIZE, height: NODE_SIZE }}
                onMouseEnter={() => entry && setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* 날짜 숫자 자체가 별자리의 노드가 된다 — 별도의 점(dot) 없이 하나로 일체화.
                    숫자는 항상 text-slate-200로 가독성을 지키고, 종류는 테두리+글로우로만 표현한다. */}
                <button
                  type="button"
                  disabled={!entry}
                  onClick={handleNodeClick}
                  aria-label={
                    entry ? `${entry.date} 꿈 기록 ${dayEntries!.length}건 ${isMulti ? "선택" : "상세 보기"}` : undefined
                  }
                  className={`flex h-full w-full select-none items-center justify-center rounded-full font-medium transition-all duration-300 ${
                    entry
                      ? `cursor-pointer text-slate-200 ${moodClass} ${isMulti ? "shadow-lg" : ""} ${
                          isHovered || isPopoverOpen ? "scale-110" : ""
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
