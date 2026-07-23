"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ConstellationDots, ConstellationMoodLegend } from "@/components/ConstellationCalendar";
import { buildDayEntryMap } from "@/lib/constellationEntries";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

function daysInMonthOf(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

export default function DreamCalendarWidget() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // NavBar가 로그인 상태에 맞춰 이미 실제 꿈 기록으로 동기화해 둔 전역 상태를 그대로 읽는다 -
  // 꿈 기록소 캘린더와 완전히 같은 savedDreams를 바라보므로 두 화면의 데이터가 어긋날 수 없다.
  const entries = useSavedDreamsStore((state) => state.entries);

  // 서버/클라이언트 렌더 결과가 달라지는 걸 피하려고 마운트 이후에만 오늘 날짜를 채운다.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    setToday(new Date());
  }, []);

  const monthKey = today ? monthKeyOf(today) : null;
  const monthLabel = today ? monthLabelOf(today) : "이번 달";
  const daysInMonth = today ? daysInMonthOf(today) : 30;
  const startWeekday = today ? new Date(today.getFullYear(), today.getMonth(), 1).getDay() : 0;

  const entryMap = useMemo(() => (monthKey ? buildDayEntryMap(entries, monthKey) : new Map()), [entries, monthKey]);
  const hasAnyEntry = entryMap.size > 0;

  return (
    <section className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-center backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(129,90,255,0.12),transparent_60%)]" />

      <h2 className="relative text-base font-semibold text-slate-100">🌌 나의 지난밤 꿈 별자리</h2>
      <p className="relative mt-1 text-xs text-slate-500">{monthLabel}, 당신의 무의식이 그려낸 궤적</p>

      {isAuthenticated && !hasAnyEntry && (
        <p className="relative mt-4 text-xs text-slate-500">
          아직 이번 달 기록이 없어요.{" "}
          <Link href="/diary" className="text-violet-300 underline-offset-2 hover:underline">
            첫 꿈을 기록해 보세요
          </Link>{" "}
          ✨
        </p>
      )}

      <div className="relative mt-5 flex justify-center">
        <ConstellationDots daysInMonth={daysInMonth} startWeekday={startWeekday} entries={entryMap} />
      </div>

      <div className="relative mt-4">
        <ConstellationMoodLegend />
      </div>

      {!isAuthenticated && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/70 backdrop-blur-md">
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
