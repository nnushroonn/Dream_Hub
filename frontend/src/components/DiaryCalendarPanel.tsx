"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ConstellationDots, ConstellationMoodLegend, type ConstellationEntry } from "@/components/ConstellationCalendar";
import { computeStreak } from "@/lib/dreamCalendar";
import { useSavedDreamsStore, type SavedDream } from "@/store/useSavedDreamsStore";

const CHECK_IN_PULSE_MS = 1600;

const MOOD_EMOJI_FALLBACK: Record<SavedDream["mood"], string> = {
  good: "😊",
  neutral: "😐",
  nightmare: "😱",
};

function daysInMonthOf(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export default function DiaryCalendarPanel() {
  const entries = useSavedDreamsStore((state) => state.entries);

  // 조회 중인 달은 클라이언트 시각에 의존하므로, 서버/클라이언트 렌더 불일치를 피하려고
  // 마운트 이후에만 채운다. 이후 좌우 화살표로 다른 달을 자유롭게 넘나들 수 있다.
  const [viewDate, setViewDate] = useState<Date | null>(null);

  useEffect(() => {
    setViewDate(new Date());
  }, []);

  const monthKey = viewDate ? monthKeyOf(viewDate) : null;
  const monthLabel = viewDate ? monthLabelOf(viewDate) : "이번 달";
  const daysInMonth = viewDate ? daysInMonthOf(viewDate) : 30;
  const startWeekday = viewDate ? new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() : 0;
  const isViewingCurrentMonth = viewDate ? monthKey === monthKeyOf(new Date()) : true;

  const goToPrevMonth = () => setViewDate((prev) => (prev ? shiftMonth(prev, -1) : prev));
  const goToNextMonth = () => setViewDate((prev) => (prev ? shiftMonth(prev, 1) : prev));

  // 기록이 없는 날은 하드코딩 없이 그대로 비어 있어야 하므로, savedDreams에서
  // 조회 중인 달에 해당하는 항목만 뽑아 도트 좌표로 매핑한다.
  const entryMap = useMemo(() => {
    if (!monthKey) return new Map<number, ConstellationEntry>();
    return new Map(
      entries
        .filter((entry) => entry.date.startsWith(monthKey))
        .map((entry) => [
          Number(entry.date.slice(-2)),
          {
            mood: entry.mood,
            date: entry.date,
            tooltip: entry.title,
            emoji: entry.emoji ?? MOOD_EMOJI_FALLBACK[entry.mood],
          },
        ])
    );
  }, [entries, monthKey]);

  const { streakDays, checkedInToday } = useMemo(() => computeStreak(entries), [entries]);

  // 출석 체크가 방금 완료된 순간(false -> true 전환)에만 배지가 잠깐 부풀어 오르며 강조된다.
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const wasCheckedInRef = useRef(checkedInToday);

  useEffect(() => {
    const wasCheckedIn = wasCheckedInRef.current;
    wasCheckedInRef.current = checkedInToday;
    if (!wasCheckedIn && checkedInToday) {
      setJustCheckedIn(true);
      const timer = window.setTimeout(() => setJustCheckedIn(false), CHECK_IN_PULSE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [checkedInToday]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(129,90,255,0.12),transparent_60%)]" />

      {streakDays > 0 ? (
        <div
          className={`relative inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs transition-all duration-700 ${
            justCheckedIn
              ? "scale-110 border-amber-300/60 bg-amber-400/20 text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.5)]"
              : "border-amber-400/30 bg-amber-400/10 text-amber-200"
          }`}
        >
          🔥 연속 {streakDays}일째 무의식 탐험 중{checkedInToday && " (오늘의 출석 완료)"}
        </div>
      ) : (
        <p className="relative text-xs text-slate-500">아직 기록된 꿈이 없어요. 오늘 첫 발자국을 남겨보세요 ✨</p>
      )}

      <h2 className="relative mt-4 text-lg font-semibold text-slate-100">🌌 꿈 별자리 캘린더</h2>

      {/* 월 네비게이션: 좌우 화살표로 다른 달의 별자리를 자유롭게 조회한다 */}
      <div className="relative mt-3 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={goToPrevMonth}
          disabled={!viewDate}
          aria-label="이전 달"
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors duration-200 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ◀
        </button>
        <p className="min-w-[6rem] text-sm font-medium tracking-wide text-slate-200">{monthLabel}</p>
        <button
          type="button"
          onClick={goToNextMonth}
          disabled={!viewDate || isViewingCurrentMonth}
          aria-label="다음 달"
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors duration-200 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ▶
        </button>
      </div>
      <p className="relative mt-1 text-xs text-slate-500">당신이 기록한 무의식의 궤적</p>

      <div className="relative mt-8 flex justify-center">
        <ConstellationDots daysInMonth={daysInMonth} startWeekday={startWeekday} entries={entryMap} />
      </div>

      <div className="relative mt-6">
        <ConstellationMoodLegend />
      </div>
    </div>
  );
}
