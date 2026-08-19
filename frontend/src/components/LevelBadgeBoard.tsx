"use client";

import { useEffect, useState } from "react";
import { Lock, Sparkles } from "lucide-react";

import { getUserStats, type UserStats } from "@/api/auth";
import { CHALLENGER_TIER_INDEX } from "@/lib/levels";

// 잠긴 뱃지에 호버했을 때 보여줄 해제 조건 - 백엔드(user.py get_user_stats)의 badges 판정
// 로직을 그대로 문장으로 옮긴 것이라, 조건식이 바뀌면 여기도 같이 고쳐야 한다.
const BADGE_HINTS: Record<string, string> = {
  FIRST_LUCID: "자각몽 기록 1회 달성 시 잠금 해제",
  DREAM_MASTER: "꿈 기록 10회 달성 시 잠금 해제",
  COMMUNITY_STAR: "커뮤니티 글+댓글 5회 또는 공감 10회 달성 시 잠금 해제",
};

// 마이페이지 프로필 카드 하단의 레벨 게이지 + 업적 뱃지 그리드. 레벨/티어는 /api/user/stats가
// User.total_xp(award_xp가 액션 시점에 이미 적립해 둔 값)에서 파생해 내려주는 값이고, 업적
// 뱃지는 매 요청마다 실제 활동 데이터로 다시 계산된다 - 둘 다 저장된 더미가 아니다.
export default function LevelBadgeBoard() {
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    getUserStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const isChallenger = stats.tier_index >= CHALLENGER_TIER_INDEX;
  const percent = Math.min(Math.round((stats.xp_into_level / stats.xp_for_next_level) * 100), 100);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* group으로 감싸 호버 시 아래 보상 힌트 툴팁이 뜬다 */}
        <div className="group relative inline-block">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold shadow-lg"
            style={
              isChallenger
                ? {
                    backgroundImage: "linear-gradient(135deg, rgba(255,215,0,0.15), rgba(59,130,246,0.15))",
                    boxShadow: "0 0 15px rgba(255,215,0,0.25), 0 0 20px rgba(59,130,246,0.2)",
                    color: "#FFD700",
                  }
                : { color: stats.tier_color }
            }
          >
            {/* Lv.24와 칭호는 굵기/투명도로 위계를 나눈다 - 숫자가 성장 체감의 핵심이라 더 진하고
                굵게, 칭호는 그 뒤를 은은하게 받쳐준다. */}
            <span className="font-bold">Lv.{stats.level}</span>
            <span className="text-white/40">✦</span>
            <span className="font-medium opacity-80">{stats.tier_title}</span>
            <Sparkles className="h-3.5 w-3.5 animate-spin-slow" />
          </span>

          {/* 보상 힌트 툴팁 - 반투명 글래스 카드, 명조체 */}
          <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-64 rounded-xl border border-purple-400/30 bg-slate-900/90 p-3 opacity-0 shadow-xl backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100">
            <p className="font-serif text-xs leading-relaxed text-slate-300">
              티어가 오를수록 커뮤니티 프로필 테두리 색이 브론즈에서 챌린저까지 화려해집니다.
            </p>
          </div>
        </div>

        <span className="text-[11px] text-slate-500">
          꿈 {stats.dream_count} · 공감 {stats.empathy_received}
        </span>
      </div>

      <div className="group relative mt-3">
        {/* 성좌선 트랙 - 점선 가이드 노드 위로, 채워진 만큼만 은하수빛 그라디언트가 덮는다. */}
        <div className="relative h-2 overflow-hidden rounded-full bg-white/5">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0px,rgba(255,255,255,0.18)_3px,transparent_3px,transparent_9px)]" />
          <div
            className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-1000 ease-out"
            style={{ width: `${percent}%` }}
          >
            {/* 채워진 만큼만 보이는 은은한 진주빛 스윕 - 경험치가 계속 자라나는 느낌을 준다 */}
            <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/70 to-transparent animate-pearl-sweep" />
          </div>
        </div>
        <p className="mt-1.5 font-mono text-xs tracking-wider text-slate-400">
          {stats.xp_into_level.toLocaleString()} / {stats.xp_for_next_level.toLocaleString()} XP ({percent}%) · 총{" "}
          {stats.total_xp.toLocaleString()} XP
        </p>
      </div>

      {/* Daily XP Cap 안내 - 게시글/댓글 "작성"으로 번 XP가 오늘 상한에 닿으면, 더 써도 더 이상
          레벨에 반영되지 않는다는 걸 미리 알려준다. 좋아요/댓글을 "받는" XP는 상한과 무관하니
          여기서 언급하지 않는다 - 계속 들어온다. */}
      {stats.daily_cap_reached && (
        <p className="mt-3 rounded-xl border border-slate-700/50 bg-slate-800/40 px-3 py-2 text-xs leading-relaxed text-slate-400">
          🌙 오늘 작성한 글/댓글로는 더 이상 XP가 붙지 않아요. 대신 받는 좋아요·댓글 XP는 계속
          쌓입니다! (오늘 작성 XP {stats.daily_capped_xp_earned}/{stats.daily_xp_cap})
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {stats.badges.map((badge) => (
          <div
            key={badge.code}
            title={badge.label}
            className={`group relative flex min-w-[92px] flex-1 flex-col items-center gap-1.5 rounded-2xl border p-3.5 text-center backdrop-blur-sm transition-all duration-300 ${
              badge.earned
                ? "border-violet-400/40 bg-violet-500/10 shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                : "border-white/[0.06] bg-white/[0.02] opacity-50 grayscale hover:opacity-70 hover:grayscale-0"
            }`}
          >
            {/* 달성/잠김을 뱃지 자체 톤(글로우 vs 흐림)만으로 구분하면 첫눈에 안 들어와서,
                잠긴 뱃지에는 항상 보이는 락 아이콘을 우상단에 얹어 시각적 대비를 명확히 한다. */}
            {!badge.earned && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-slate-400">
                <Lock className="h-3 w-3" />
              </span>
            )}

            <span className="text-2xl">{badge.emoji}</span>
            <span className="text-xs leading-tight text-slate-300">{badge.label}</span>

            {/* 잠금 해제 조건 힌트 - 잠긴 뱃지에 호버했을 때만 카드 아래로 부드럽게 페이드인 */}
            {!badge.earned && BADGE_HINTS[badge.code] && (
              <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-44 -translate-x-1/2 rounded-xl border border-purple-500/20 bg-slate-900 p-2.5 opacity-0 shadow-xl transition-all duration-300 group-hover:opacity-100">
                <p className="text-[11px] leading-relaxed text-slate-400">🔒 {BADGE_HINTS[badge.code]}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
