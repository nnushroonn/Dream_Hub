"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getDreamCalendar, type DreamCalendarDay, type DreamMood } from "@/api/dream";
import { ConstellationDots, ConstellationMoodLegend, type ConstellationEntry } from "@/components/ConstellationCalendar";
import { useAuthStore } from "@/store/useAuthStore";

const FALLBACK_DAYS_IN_MONTH = 30;

const MOOD_EMOJI_FALLBACK: Record<DreamMood, string> = {
  good: "😊",
  neutral: "😐",
  nightmare: "😱",
};

function toEntryMap(days: DreamCalendarDay[]): Map<number, ConstellationEntry> {
  return new Map(
    days.map((d) => [
      Number(d.date.slice(-2)),
      { mood: d.mood, date: d.date, tooltip: d.summary, emoji: MOOD_EMOJI_FALLBACK[d.mood] },
    ])
  );
}

function startWeekdayOf(monthLabel: string | null): number {
  if (!monthLabel) return 0;
  const [year, month] = monthLabel.split("-").map(Number);
  return new Date(year, month - 1, 1).getDay();
}

export default function DreamCalendarWidget() {
  const { isAuthenticated } = useAuthStore();
  const [month, setMonth] = useState<string | null>(null);
  const [daysInMonth, setDaysInMonth] = useState(FALLBACK_DAYS_IN_MONTH);
  const [entries, setEntries] = useState<Map<number, ConstellationEntry>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) return;
    getDreamCalendar()
      .then((res) => {
        setMonth(res.month);
        setDaysInMonth(res.days_in_month);
        setEntries(toEntryMap(res.days));
      })
      .catch(() => {});
  }, [isAuthenticated]);

  return (
    <section className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-center backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(129,90,255,0.12),transparent_60%)]" />

      <h2 className="relative text-lg font-semibold text-slate-100">🌌 나의 지난밤 꿈 별자리</h2>
      <p className="relative mt-1 text-xs text-slate-500">
        {month ?? "이번 달"}, 당신의 무의식이 그려낸 궤적
      </p>

      <div className="relative mt-10 flex justify-center">
        <ConstellationDots daysInMonth={daysInMonth} startWeekday={startWeekdayOf(month)} entries={entries} />
      </div>

      <div className="relative mt-6">
        <ConstellationMoodLegend />
      </div>

      {!isAuthenticated && (
        <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-slate-950/70 backdrop-blur-md">
          <Link
            href="/login"
            className="rounded-full border border-violet-400/40 bg-white/5 px-5 py-2.5 text-sm text-violet-200 shadow-[0_0_20px_rgba(167,139,250,0.3)] transition-colors hover:border-violet-300/60 hover:text-white"
          >
            로그인하고 나만의 꿈 별자리 캘린더를 채워보세요 ✨
          </Link>
        </div>
      )}
    </section>
  );
}
