"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ConstellationDots, ConstellationMoodLegend } from "@/components/ConstellationCalendar";
import MonthlyMoodChart from "@/components/MonthlyMoodChart";
import { buildDayEntryMap } from "@/lib/constellationEntries";
import { moodBucketForEmoji } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useLoginModalStore } from "@/store/useLoginModalStore";
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

// 홈 최하단 개인 분석 대시보드 - 인기 검색어가 히어로 우측 사이드바로 옮겨가며 비게 된 자리를,
// 풀 위드 캘린더(좌) + 월간 길몽/보통/악몽 통계 차트(우) 2열 구성으로 채웠다. 두 열 모두 같은
// entries/monthKey에서 파생해 계산이 서로 어긋나지 않는다. DreamCalendarWidget을 대체한다.
export default function MonthlyDashboardPanel() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const openLoginModal = useLoginModalStore((state) => state.open);
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

  // 길몽/보통/악몽 비율은 실제 꿈일기(entry_type==="dream")만 센다 - AI 해몽 유무로 걸러내지
  // 않는다(해몽 없이 저장되는 진짜 꿈일기도 있다). 감정일기(꿈일기가 아닌 일반 일기)는 그날의
  // 기분 체크인일 뿐 꿈의 길흉과 무관해서, 섞이면 "보통" 비율이 실제보다 부풀려진다.
  // 캘린더(entryMap/buildDayEntryMap)와 이 통계가 같은 기준으로 걸러지도록 여기서도 동일한
  // 조건을 쓴다.
  const moodCounts = useMemo(() => {
    const counts = { good: 0, neutral: 0, nightmare: 0 };
    if (!monthKey) return counts;
    for (const entry of entries) {
      if (entry.entry_type !== "dream") continue;
      if (!entry.dream_date.startsWith(monthKey)) continue;
      counts[moodBucketForEmoji(entry.emotion)] += 1;
    }
    return counts;
  }, [entries, monthKey]);

  return (
    <section className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-6 py-6 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(129,90,255,0.12),transparent_60%)]" />

      <div className="relative grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="text-center">
          <h2 className="text-base font-semibold text-slate-100">🌌 나의 지난밤 꿈 별자리</h2>
          <p className="mt-1 text-xs text-slate-500">{monthLabel}, 당신의 무의식이 그려낸 궤적</p>

          {isAuthenticated && !hasAnyEntry && (
            <p className="mt-4 text-xs text-slate-500">
              아직 이번 달 기록이 없어요.{" "}
              <Link href="/journal?openRecord=1" className="text-violet-300 underline-offset-2 hover:underline">
                첫 꿈을 기록해 보세요
              </Link>{" "}
              ✨
            </p>
          )}

          <div className="mt-5 flex justify-center">
            <ConstellationDots daysInMonth={daysInMonth} startWeekday={startWeekday} entries={entryMap} />
          </div>

          <div className="mt-4">
            <ConstellationMoodLegend />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center border-t border-white/10 pt-8 md:border-t-0 md:border-l md:pt-0 md:pl-8">
          <h2 className="text-base font-semibold text-slate-100">📊 {monthLabel} 꿈 통계 리포트</h2>
          <p className="mt-1 text-xs text-slate-500">길몽·보통·악몽 비율로 보는 이번 달 무의식</p>
          <div className="mt-5">
            <MonthlyMoodChart good={moodCounts.good} neutral={moodCounts.neutral} nightmare={moodCounts.nightmare} />
          </div>
        </div>
      </div>

      {!isAuthenticated && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-sm">
          <div className="text-center">
            <p className="text-sm text-slate-200">로그인 후 나만의 꿈 별자리를 모아보세요</p>
            <button
              type="button"
              onClick={() => openLoginModal({ triggerSource: "calendar" })}
              className="mt-4 rounded-full border border-violet-400/40 bg-white/5 px-5 py-2.5 text-sm text-violet-200 shadow-[0_0_20px_rgba(167,139,250,0.3)] transition-colors hover:border-violet-300/60 hover:text-white"
            >
              로그인하기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
