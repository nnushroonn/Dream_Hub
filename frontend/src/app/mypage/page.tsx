"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getCalendar,
  getScrapbook,
  getUnconsciousStats,
  type CalendarDay,
  type ScrapEntry,
  type UnconsciousStats,
} from "@/api/dream";
import AuraToggle from "@/components/AuraToggle";
import DreamClusterChart from "@/components/DreamClusterChart";
import LevelBadgeBoard from "@/components/LevelBadgeBoard";
import MyActivityTabs from "@/components/MyActivityTabs";
import NavBar from "@/components/NavBar";
import NicknameEditor from "@/components/NicknameEditor";
import { DREAM_SEEDS, isDreamSeed } from "@/lib/dreamSeeds";
import { moodBucketForEmoji } from "@/lib/moodBucket";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

function todayDateInputValue(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 가장 최근 일기 날짜가 오늘/어제가 아니면 스트릭이 끊긴 것으로 본다. 그 다음부터는 하루씩
// 거슬러 올라가며 빈 날 없이 이어지는 구간의 길이를 센다.
function computeDiaryStreak(dates: string[]): number {
  const sorted = Array.from(new Set(dates)).sort((a, b) => b.localeCompare(a));
  if (sorted.length === 0) return 0;

  const oneDayMs = 86400000;
  const today = new Date(`${todayDateInputValue()}T00:00:00`);
  const mostRecent = new Date(`${sorted[0]}T00:00:00`);
  if (Math.round((today.getTime() - mostRecent.getTime()) / oneDayMs) > 1) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    const curr = new Date(`${sorted[i]}T00:00:00`);
    if (Math.round((prev.getTime() - curr.getTime()) / oneDayMs) === 1) streak++;
    else break;
  }
  return streak;
}

const CARD_CLASS = "rounded-3xl border border-purple-900/30 bg-slate-900/40 p-6 backdrop-blur-md";

export default function MyPage() {
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [stats, setStats] = useState<UnconsciousStats | null>(null);
  const [scrapbook, setScrapbook] = useState<ScrapEntry[]>([]);
  const allEntries = useSavedDreamsStore((state) => state.entries);

  useEffect(() => {
    getCalendar().then(setCalendar).catch(() => {});
    getUnconsciousStats().then(setStats).catch(() => {});
    getScrapbook().then(setScrapbook).catch(() => {});
  }, []);

  // 🌌 무의식 은하계 대시보드용 파생 통계 - 전부 NavBar가 이미 채워둔 useSavedDreamsStore
  // 원본 기록에서 클라이언트가 직접 계산한다(별도 백엔드 엔드포인트 없음).
  const seedStats = useMemo(() => {
    const counts = new Map(DREAM_SEEDS.map((seed) => [seed, 0]));
    for (const entry of allEntries) {
      if (entry.interpretation) continue; // 씨앗은 일기(해몽 전) 기록에만 심을 수 있다
      const seed = entry.tags.find(isDreamSeed);
      if (seed) counts.set(seed, (counts.get(seed) ?? 0) + 1);
    }
    return DREAM_SEEDS.map((seed) => ({ seed, count: counts.get(seed) ?? 0 }));
  }, [allEntries]);

  const diaryStats = useMemo(() => {
    const diaryDates = allEntries.filter((entry) => !entry.interpretation).map((entry) => entry.dream_date);
    return { totalCount: new Set(diaryDates).size, streak: computeDiaryStreak(diaryDates) };
  }, [allEntries]);

  const luckyDreamPercent = useMemo(() => {
    const dreamEntries = allEntries.filter((entry) => entry.interpretation);
    if (dreamEntries.length === 0) return null;
    const goodCount = dreamEntries.filter((entry) => moodBucketForEmoji(entry.emotion) === "good").length;
    return Math.round((goodCount / dreamEntries.length) * 100);
  }, [allEntries]);

  const topRunes = stats?.top_keywords.slice(0, 3) ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0518] via-[#170b2e] to-black text-indigo-50">
      <NavBar />

      <main className="mx-auto max-w-6xl p-8">
        <h1 className="text-2xl font-semibold">마이페이지</h1>
        <p className="mt-1 text-sm text-indigo-300/70">나의 무의식 기록을 한눈에 확인해보세요.</p>

        {/* 프로필 카드: 아바타 오라 + 닉네임 수정 + 무의식 탐험 등급/업적 뱃지 */}
        <div className={`mt-6 ${CARD_CLASS}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <AuraToggle />
            <div className="min-w-0 flex-1">
              <NicknameEditor />
            </div>
          </div>
          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <LevelBadgeBoard />
          </div>
        </div>

        {/* 꿈 달력: 날짜별 감정 아이콘 */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-indigo-100">📅 꿈 달력</h2>
          <div className="mt-3 grid grid-cols-7 gap-2">
            {calendar.map((day) => (
              <div
                key={day.date}
                className="flex aspect-square flex-col items-center justify-center rounded-xl border border-indigo-900/60 bg-indigo-950/30 text-xs"
              >
                <span className="text-indigo-400">{day.date.slice(-2)}</span>
                <span className="mt-1 text-lg">{day.emotion ?? "·"}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 🌌 무의식 은하계 대시보드 */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-indigo-100">🌌 무의식 은하계 대시보드</h2>
          <p className="mt-1 text-xs text-indigo-300/60">일기장에 심어온 꿈 씨앗과 꿈 기록이 그려낸 나만의 성운이에요.</p>

          <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* 상단: 성운 차트 - 전체 폭 */}
            <div className={`md:col-span-3 ${CARD_CLASS}`}>
              <h3 className="text-sm font-semibold text-slate-200">꿈 씨앗 성운</h3>
              <div className="mt-5">
                <DreamClusterChart seedStats={seedStats} />
              </div>
            </div>

            {/* 중단: 투트랙 업적 카드 */}
            <div className={CARD_CLASS}>
              <h3 className="text-sm font-semibold text-slate-200">🌍 현실 케어</h3>
              <p className="mt-1 text-xs text-slate-500">일상을 얼마나 꾸준히 기록하고 있는지 보여줘요.</p>
              <div className="mt-6 flex items-end gap-2">
                <span className="text-4xl font-bold text-white">{diaryStats.streak}</span>
                <span className="pb-1 text-sm text-slate-400">일 연속 작성 중</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">누적 {diaryStats.totalCount}개의 하루를 기록했어요.</p>
            </div>

            <div className={CARD_CLASS}>
              <h3 className="text-sm font-semibold text-slate-200">🌙 무의식 탐험</h3>
              <p className="mt-1 text-xs text-slate-500">지금까지의 꿈 중 길몽으로 해석된 비율이에요.</p>
              <div className="mt-5 flex items-center justify-center">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300/40 via-yellow-500/20 to-transparent blur-lg" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-amber-300/50 bg-gradient-to-br from-amber-400/20 to-yellow-600/10 shadow-[0_0_20px_rgba(251,191,36,0.35)]">
                    <span className="text-lg font-bold text-amber-200">
                      {luckyDreamPercent === null ? "-" : `${luckyDreamPercent}%`}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-amber-200/80">🌟 길몽 판정 비율</p>
            </div>

            <div className={CARD_CLASS}>
              <h3 className="text-sm font-semibold text-slate-200">📊 요약</h3>
              <p className="mt-1 text-xs text-slate-500">지금까지 남긴 전체 기록이에요.</p>
              <div className="mt-6 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">일기</span>
                  <span className="font-medium text-white">{diaryStats.totalCount}개</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">꿈 해몽</span>
                  <span className="font-medium text-white">
                    {allEntries.filter((entry) => entry.interpretation).length}개
                  </span>
                </div>
              </div>
            </div>

            {/* 하단: 무의식의 룬 */}
            <div className="md:col-span-3">
              <h3 className="text-sm font-semibold text-slate-200">🪬 무의식의 룬</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {topRunes.length === 0 ? (
                  <p className="col-span-full rounded-3xl border border-purple-900/30 bg-slate-900/40 px-4 py-8 text-center text-xs text-slate-500 backdrop-blur-md">
                    아직 해몽 키워드가 쌓이지 않았어요.
                  </p>
                ) : (
                  topRunes.map((item, index) => (
                    <div
                      key={item.keyword}
                      className={`cursor-pointer text-center transition-transform duration-300 hover:scale-105 ${CARD_CLASS}`}
                    >
                      <span className="text-2xl">{["🥇", "🥈", "🥉"][index]}</span>
                      <p className="mt-2 text-base font-semibold text-purple-100">#{item.keyword}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.count}회 등장</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 스크랩북 */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-indigo-100">🔖 스크랩북</h2>
          <div className="mt-3 space-y-3">
            {scrapbook.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-indigo-900/60 bg-indigo-950/30 p-4">
                <span>{entry.emotion}</span>
                <p className="mt-1 text-sm text-indigo-100">{entry.content}</p>
              </div>
            ))}
          </div>
        </section>

        <MyActivityTabs />
      </main>
    </div>
  );
}
