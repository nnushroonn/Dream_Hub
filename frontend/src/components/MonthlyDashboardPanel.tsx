"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ConstellationDots, ConstellationMoodLegend } from "@/components/ConstellationCalendar";
import MonthlyMoodChart from "@/components/MonthlyMoodChart";
import PreviewGateway from "@/components/PreviewGateway";
import { buildDayEntryMap } from "@/lib/constellationEntries";
import { moodBucketForEmoji } from "@/lib/moodBucket";
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

// 홈 최하단 개인 분석 대시보드 - 인기 검색어가 히어로 우측 사이드바로 옮겨가며 비게 된 자리를,
// 풀 위드 캘린더(좌) + 월간 길몽/보통/악몽 통계 차트(우) 2열 구성으로 채웠다. 두 열 모두 같은
// entries/monthKey에서 파생해 계산이 서로 어긋나지 않는다. DreamCalendarWidget을 대체한다.
export default function MonthlyDashboardPanel() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const entries = useSavedDreamsStore((state) => state.entries);

  // 서버/클라이언트 렌더 결과가 달라지는 걸 피하려고 마운트 이후에만 오늘 날짜를 채운다 -
  // 정적 export라 빌드 시점에 한 번 굳어진 HTML이 방문자마다 재사용되므로, 렌더 중에 바로
  // new Date()를 계산하면 그 빌드 시점 날짜가 하이드레이션 시점(방문자의 실제 "오늘")과
  // 어긋난다. React가 공식적으로 권장하는 "마운트 후에만 채우기" 패턴이라 파생 상태로
  // 대체할 수 없다.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 하이드레이션 불일치 방지용, 렌더 중 계산 불가
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

  const dashboardGrid = (
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
  );

  // 비로그인 상태는 grid를 자체 오버레이로 덮지 않는다 - 모바일에서 두 열이 세로로 쌓이면
  // 섹션 전체 높이가 들쭉날쭉해져서, inset-0로 중앙 정렬한 로그인 유도 카드가 캘린더와
  // 차트 사이 애매한 위치에 걸린다(실사용자 스크린샷으로 확인된 버그). 대신 다른 잠금 콘텐츠에서
  // 이미 쓰는 PreviewGateway로 교체 - 자체 min-h[60vh] 컨테이너 안에서 중앙 정렬하므로
  // 콘텐츠 높이와 무관하게 카드 위치가 항상 안정적이다.
  if (!isAuthenticated) {
    return (
      <section className="relative w-full">
        <PreviewGateway
          title="나만의 꿈 별자리를 확인해보세요"
          subtitle="로그인하면 이번 달 기록을 별자리 캘린더와 길몽·보통·악몽 통계로 한눈에 볼 수 있어요."
          ctaLabel="로그인하기"
          triggerSource="calendar"
        >
          <div className="px-6 py-6">{dashboardGrid}</div>
        </PreviewGateway>
      </section>
    );
  }

  return (
    <section className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-6 py-6 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(129,90,255,0.12),transparent_60%)]" />
      {dashboardGrid}
    </section>
  );
}
