"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { getUserStats, type UserStats } from "@/api/auth";

// 실제 레벨 상한은 5단계(backend _LEVEL_TIERS)라 1~9 스펙 그대로는 못 쓴다. 백엔드가 이미
// 계산해 내려주는 level_title 문구는 그대로 쓰고, 여기서는 구간별 색 톤만 실제 레벨 범위에
// 맞게 재분배한다 - 초반(1~2) 시안 / 중반(3~4) 퍼플 / 후반(5) 푸시아.
function tierStyleForLevel(level: number): { text: string; shadow: string } {
  if (level <= 2) return { text: "text-cyan-400", shadow: "shadow-cyan-500/20" };
  if (level <= 4) return { text: "text-purple-400", shadow: "shadow-purple-500/20" };
  return { text: "text-fuchsia-400", shadow: "shadow-fuchsia-500/20" };
}

// 마이페이지 프로필 카드 하단의 레벨 게이지 + 업적 뱃지 그리드. 전부 /api/user/stats가 매
// 요청마다 실제 활동 데이터(꿈 기록 수, 공감 수 등)로 다시 계산해 내려주는 값 - 저장된 더미가 아니다.
export default function LevelBadgeBoard() {
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    getUserStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const tier = tierStyleForLevel(stats.level);
  const isMaxLevel = stats.next_level_threshold === null;
  const percent = isMaxLevel ? 100 : Math.min(Math.round((stats.points / stats.next_level_threshold!) * 100), 100);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* group으로 감싸 호버 시 아래 보상 힌트 툴팁이 뜬다 */}
        <div className="group relative inline-block">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold shadow-lg ${tier.text} ${tier.shadow}`}
          >
            Level {stats.level}. {stats.level_title}
            <Sparkles className="h-3.5 w-3.5 animate-spin-slow" />
          </span>

          {/* 보상 힌트 툴팁 - 반투명 글래스 카드, 명조체 */}
          <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-64 rounded-xl border border-purple-400/30 bg-slate-900/90 p-3 opacity-0 shadow-xl backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100">
            <p className="font-serif text-xs leading-relaxed text-slate-300">
              Level 5 달성 시: 세 번째 무의식 룬 슬롯 해금 및 커뮤니티 보라빛 성운 프로필 테두리 획득
            </p>
          </div>
        </div>

        <span className="text-[11px] text-slate-500">
          꿈 {stats.dream_count} · 공감 {stats.empathy_received}
        </span>
      </div>

      <div className="group relative mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full animate-pulse rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_10px_rgba(168,85,247,0.6)] transition-all duration-1000 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {isMaxLevel
            ? `${stats.points.toLocaleString()} XP (MAX)`
            : `${stats.points.toLocaleString()} / ${stats.next_level_threshold!.toLocaleString()} XP (${percent}%)`}
        </p>

        {/* 경험치 바 위에서도 같은 보상 힌트가 뜬다 */}
        <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-64 rounded-xl border border-purple-400/30 bg-slate-900/90 p-3 opacity-0 shadow-xl backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100">
          <p className="font-serif text-xs leading-relaxed text-slate-300">
            Level 5 달성 시: 세 번째 무의식 룬 슬롯 해금 및 커뮤니티 보라빛 성운 프로필 테두리 획득
          </p>
        </div>
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
