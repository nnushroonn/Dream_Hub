"use client";

import { useEffect, useState } from "react";

import { getUserStats, type UserStats } from "@/api/auth";

const LEVEL_TIER_COUNT = 5;

// 마이페이지 프로필 카드 하단의 등급 바 + 업적 뱃지 그리드. 전부 /api/user/stats가 매 요청마다
// 실제 활동 데이터(꿈 기록 수, 공감 수 등)로 다시 계산해 내려주는 값 - 저장된 더미가 아니다.
export default function LevelBadgeBoard() {
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    getUserStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-violet-200">
          Level {stats.level}. {stats.level_title}
        </span>
        <span className="text-[11px] text-slate-500">
          꿈 {stats.dream_count} · 공감 {stats.empathy_received}
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: LEVEL_TIER_COUNT }, (_, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              index < stats.level ? "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {stats.badges.map((badge) => (
          <div
            key={badge.code}
            title={badge.label}
            className={`flex min-w-[92px] flex-1 flex-col items-center gap-1.5 rounded-2xl border p-3.5 text-center backdrop-blur-sm transition-all duration-300 ${
              badge.earned
                ? "border-violet-400/40 bg-violet-500/10 shadow-[0_0_14px_rgba(167,139,250,0.25)] hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                : "border-white/[0.06] bg-white/[0.02] opacity-40 grayscale"
            }`}
          >
            <span className="text-2xl">{badge.emoji}</span>
            <span className="text-xs leading-tight text-slate-300">{badge.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
