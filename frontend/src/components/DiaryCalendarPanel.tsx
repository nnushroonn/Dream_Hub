"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ConstellationDots, ConstellationMoodLegend, type ConstellationEntry } from "@/components/ConstellationCalendar";
import { computeStreak } from "@/lib/dreamCalendar";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

const FALLBACK_DAYS_IN_MONTH = 30;
const CHECK_IN_PULSE_MS = 1600;

function daysInMonthOf(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthLabelOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function DiaryCalendarPanel() {
  const entries = useSavedDreamsStore((state) => state.entries);

  // 이번 달 정보는 클라이언트 시각에 의존하므로, 서버/클라이언트 렌더 불일치를 피하려고
  // 마운트 이후에만 채운다.
  const [month, setMonth] = useState<string | null>(null);
  const [daysInMonth, setDaysInMonth] = useState(FALLBACK_DAYS_IN_MONTH);

  useEffect(() => {
    const now = new Date();
    setMonth(monthLabelOf(now));
    setDaysInMonth(daysInMonthOf(now));
  }, []);

  // 기록이 없는 날은 하드코딩 없이 그대로 비어 있어야 하므로, savedDreams에서
  // 이번 달에 해당하는 항목만 뽑아 도트 좌표로 매핑한다.
  const entryMap = useMemo(() => {
    if (!month) return new Map<number, ConstellationEntry>();
    return new Map(
      entries
        .filter((entry) => entry.date.startsWith(month))
        .map((entry) => [Number(entry.date.slice(-2)), { mood: entry.mood, date: entry.date, tooltip: entry.title }])
    );
  }, [entries, month]);

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
      <p className="relative mt-1 text-xs text-slate-500">{month ?? "이번 달"}, 당신이 기록한 무의식의 궤적</p>

      <div className="relative mt-10 flex justify-center">
        <ConstellationDots daysInMonth={daysInMonth} entries={entryMap} />
      </div>

      <div className="relative mt-6">
        <ConstellationMoodLegend />
      </div>
    </div>
  );
}
