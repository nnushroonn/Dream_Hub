"use client";

import { useEffect, useState } from "react";
import { Lock, Sparkles } from "lucide-react";

import { getUserStats, type UserStats } from "@/api/auth";

// 실제 레벨 상한은 5단계(backend _LEVEL_TIERS)라 1~9 스펙 그대로는 못 쓴다. 백엔드가 이미
// 계산해 내려주는 level_title 문구는 그대로 쓰고, 여기서는 구간별 색 톤만 실제 레벨 범위에
// 맞게 재분배한다 - 초반(1~2) 시안 / 중반(3~4) 퍼플 / 후반(5) 푸시아.
function tierStyleForLevel(level: number): { text: string; shadow: string } {
  if (level <= 2) return { text: "text-cyan-400", shadow: "shadow-cyan-500/20" };
  if (level <= 4) return { text: "text-purple-400", shadow: "shadow-purple-500/20" };
  return { text: "text-fuchsia-400", shadow: "shadow-fuchsia-500/20" };
}

// 잠긴 뱃지에 호버했을 때 보여줄 해제 조건 - 백엔드(user.py _compute_stats)의 badges 판정
// 로직을 그대로 문장으로 옮긴 것이라, 조건식이 바뀌면 여기도 같이 고쳐야 한다.
const BADGE_HINTS: Record<string, string> = {
  FIRST_LUCID: "자각몽 기록 1회 달성 시 잠금 해제",
  DREAM_MASTER: "꿈 기록 10회 달성 시 잠금 해제",
  COMMUNITY_STAR: "커뮤니티 글+댓글 5회 또는 공감 10회 달성 시 잠금 해제",
};

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
          {isMaxLevel || stats.next_level_locked
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

      {/* Daily XP Cap 안내 - 오늘 활동으로 번 포인트가 상한에 닿으면, 더 활동해도 레벨에는
          반영되지 않는다는 걸 미리 알려줘 "왜 안 오르지?" 하는 혼란을 막는다. 경고가 아니라
          "오늘 몫은 다 했다"는 긍정적인 마무리 톤이라 차분한 슬레이트 톤으로 둔다. */}
      {stats.daily_cap_reached && (
        <p className="mt-3 rounded-xl border border-slate-700/50 bg-slate-800/40 px-3 py-2 text-xs leading-relaxed text-slate-400">
          🌙 오늘의 무의식 탐험을 충분히 마쳤습니다. 내일 또 만나요! (오늘 획득 {stats.daily_points_earned}/
          {stats.daily_xp_cap} XP)
        </p>
      )}

      {/* Milestone Lock 안내 - 포인트는 다음 레벨 문턱을 넘었지만 연속 기록 조건이 부족해 승급이
          막힌 상태. "승급 미션" 톤으로 강조해, 이 조건만 채우면 바로 다음 레벨이라는 걸 알려준다. */}
      {stats.next_level_locked && stats.next_level_requirement && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <Lock className="h-3.5 w-3.5" />
            승급 미션: {stats.next_level_requirement}
          </div>
          {stats.next_level_streak_goal !== null && (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min((stats.diary_streak / stats.next_level_streak_goal) * 100, 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 font-mono text-[11px] tracking-wider text-amber-200/70">
                연속 {stats.diary_streak} / {stats.next_level_streak_goal}일
              </p>
            </>
          )}
        </div>
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
