"use client";

import { useEffect, useState } from "react";

import {
  getBadges,
  getCalendar,
  getScrapbook,
  getUnconsciousStats,
  type Badges,
  type CalendarDay,
  type ScrapEntry,
  type UnconsciousStats,
} from "@/api/dream";
import NavBar from "@/components/NavBar";

export default function MyPage() {
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [stats, setStats] = useState<UnconsciousStats | null>(null);
  const [scrapbook, setScrapbook] = useState<ScrapEntry[]>([]);
  const [badges, setBadges] = useState<Badges | null>(null);

  useEffect(() => {
    getCalendar().then(setCalendar).catch(() => {});
    getUnconsciousStats().then(setStats).catch(() => {});
    getScrapbook().then(setScrapbook).catch(() => {});
    getBadges().then(setBadges).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0518] via-[#170b2e] to-black text-indigo-50">
      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">마이페이지</h1>
        <p className="mt-1 text-sm text-indigo-300/70">나의 무의식 기록을 한눈에 확인해보세요.</p>

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

        {/* 무의식 통계 */}
        {stats && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-indigo-100">📊 무의식 통계</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-indigo-900/60 bg-indigo-950/30 p-4">
                <p className="text-xs text-indigo-400">자주 등장하는 키워드</p>
                <ul className="mt-2 space-y-1 text-sm text-indigo-100">
                  {stats.top_keywords.map((item) => (
                    <li key={item.keyword}>
                      #{item.keyword} <span className="text-indigo-400">{item.count}회</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-indigo-900/60 bg-indigo-950/30 p-4">
                <p className="text-xs text-indigo-400">감정 분포</p>
                <div className="mt-2 flex gap-3 text-sm">
                  {Object.entries(stats.emotion_distribution).map(([emotion, percent]) => (
                    <span key={emotion}>
                      {emotion} {percent}%
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-violet-300">
                  자각몽 비율 {Math.round(stats.lucid_dream_ratio * 100)}%
                </p>
              </div>
            </div>
          </section>
        )}

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

        {/* 뱃지 시스템 */}
        {badges && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-indigo-100">🏅 뱃지</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.earned.map((badge) => (
                <span key={badge} className="rounded-full bg-violet-600/30 px-3 py-1.5 text-xs text-violet-200">
                  {badge}
                </span>
              ))}
              {badges.available.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-indigo-800 px-3 py-1.5 text-xs text-indigo-500"
                >
                  {badge} (미획득)
                </span>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
