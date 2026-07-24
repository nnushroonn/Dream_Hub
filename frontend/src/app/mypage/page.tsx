"use client";

import { useEffect, useState } from "react";

import {
  getCalendar,
  getScrapbook,
  getUnconsciousStats,
  type CalendarDay,
  type ScrapEntry,
  type UnconsciousStats,
} from "@/api/dream";
import AuraToggle from "@/components/AuraToggle";
import LevelBadgeBoard from "@/components/LevelBadgeBoard";
import MyActivityTabs from "@/components/MyActivityTabs";
import NavBar from "@/components/NavBar";
import NicknameEditor from "@/components/NicknameEditor";

export default function MyPage() {
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [stats, setStats] = useState<UnconsciousStats | null>(null);
  const [scrapbook, setScrapbook] = useState<ScrapEntry[]>([]);

  useEffect(() => {
    getCalendar().then(setCalendar).catch(() => {});
    getUnconsciousStats().then(setStats).catch(() => {});
    getScrapbook().then(setScrapbook).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0518] via-[#170b2e] to-black text-indigo-50">
      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">마이페이지</h1>
        <p className="mt-1 text-sm text-indigo-300/70">나의 무의식 기록을 한눈에 확인해보세요.</p>

        {/* 프로필 카드: 아바타 오라 + 닉네임 수정 + 무의식 탐험 등급/업적 뱃지 */}
        <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
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

        <MyActivityTabs />
      </main>
    </div>
  );
}
