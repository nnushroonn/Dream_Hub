"use client";

import { useEffect, useState } from "react";

import { getDiaryCalendar, getDiaryStreak, type DiaryCalendarDay, type DiaryStreak } from "@/api/dream";
import { ConstellationDots, ConstellationMoodLegend, type ConstellationEntry } from "@/components/ConstellationCalendar";

const FALLBACK_DAYS_IN_MONTH = 30;

function toEntryMap(days: DiaryCalendarDay[]): Map<number, ConstellationEntry> {
  return new Map(
    days.map((d) => [Number(d.date.slice(-2)), { mood: d.mood, date: d.date, tooltip: d.title }])
  );
}

export default function DiaryCalendarPanel() {
  const [month, setMonth] = useState<string | null>(null);
  const [daysInMonth, setDaysInMonth] = useState(FALLBACK_DAYS_IN_MONTH);
  const [entries, setEntries] = useState<Map<number, ConstellationEntry>>(new Map());
  const [streak, setStreak] = useState<DiaryStreak | null>(null);

  useEffect(() => {
    getDiaryCalendar()
      .then((res) => {
        setMonth(res.month);
        setDaysInMonth(res.days_in_month);
        setEntries(toEntryMap(res.days));
      })
      .catch(() => {});
    getDiaryStreak().then(setStreak).catch(() => {});
  }, []);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(129,90,255,0.12),transparent_60%)]" />

      {streak && (
        <div className="relative inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-200">
          🔥 연속 {streak.streak_days}일째 무의식 탐험 중{streak.checked_in_today && " (오늘의 출석 완료)"}
        </div>
      )}

      <h2 className="relative mt-4 text-lg font-semibold text-slate-100">🌌 꿈 별자리 캘린더</h2>
      <p className="relative mt-1 text-xs text-slate-500">{month ?? "이번 달"}, 당신이 기록한 무의식의 궤적</p>

      <div className="relative mt-10 flex justify-center">
        <ConstellationDots daysInMonth={daysInMonth} entries={entries} />
      </div>

      <div className="relative mt-6">
        <ConstellationMoodLegend />
      </div>
    </div>
  );
}
