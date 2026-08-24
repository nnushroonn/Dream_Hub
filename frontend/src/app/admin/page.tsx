"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getAdminStats, type AdminStats } from "@/api/admin";
import AdminGuard from "@/components/AdminGuard";
import AdminNav from "@/components/AdminNav";
import NavBar from "@/components/NavBar";

interface StatTile {
  label: string;
  value: number;
  href?: string;
  // 대기 중 신고처럼 0보다 클 때 눈에 띄어야 하는 지표만 강조색을 쓴다(상태 색상은 항상
  // 카테고리 색과 분리 - dataviz 스킬 컨벤션).
  emphasize?: boolean;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("ko-KR");
}

function StatTileCard({ tile }: { tile: StatTile }) {
  const content = (
    <div
      className={`rounded-2xl border p-5 transition-colors ${
        tile.emphasize && tile.value > 0
          ? "border-amber-400/30 bg-amber-500/[0.06] hover:border-amber-400/50"
          : "border-white/[0.06] bg-white/[0.03] hover:border-white/15"
      }`}
    >
      <p className="text-xs text-slate-400">{tile.label}</p>
      <p className={`mt-1.5 text-3xl font-semibold ${tile.emphasize && tile.value > 0 ? "text-amber-300" : "text-white"}`}>
        {formatCompact(tile.value)}
      </p>
    </div>
  );
  return tile.href ? (
    <Link href={tile.href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

// 최근 7일 가입자 추이 - 단일 시리즈라 범례 없이 막대만(dataviz 스킬: 시리즈 1개는 범례
// 불필요). 막대 두께 24px 이하, 상단만 4px 라운드, 베이스라인은 각지게, 막대 사이 2px
// 간격 - marks-and-anatomy.md 스펙 그대로.
function SignupTrendChart({ data }: { data: AdminStats["signups_last_7_days"] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.count), 1);
  const peakIndex = data.reduce((best, d, i) => (d.count > data[best].count ? i : best), 0);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
      <p className="text-xs text-slate-400">최근 7일 가입자 추이</p>
      <div className="relative mt-6 flex h-32 items-end justify-between gap-2">
        {data.map((d, i) => {
          const heightPx = Math.max((d.count / max) * 100, d.count > 0 ? 6 : 2);
          const isHovered = hoverIndex === i;
          return (
            <div key={d.date} className="relative flex flex-1 flex-col items-center">
              {(isHovered || i === peakIndex) && (
                <span
                  className={`absolute -top-6 whitespace-nowrap text-xs font-semibold tabular-nums ${
                    isHovered ? "text-indigo-200" : "text-slate-300"
                  }`}
                >
                  {d.count}
                </span>
              )}
              <button
                type="button"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(i)}
                onBlur={() => setHoverIndex(null)}
                aria-label={`${d.date}: 가입자 ${d.count}명`}
                className="flex h-24 w-full max-w-6 items-end justify-center"
              >
                <span
                  className={`w-full rounded-t-[4px] transition-colors ${
                    isHovered ? "bg-indigo-400" : "bg-indigo-500/70"
                  }`}
                  style={{ height: `${heightPx}%` }}
                />
              </button>
              <span className="mt-2 text-[10px] text-slate-500">{d.date.slice(5).replace("-", "/")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminDashboardContent() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => setError("통계를 불러오지 못했어요."));
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-xl font-semibold text-white">📊 관리자 대시보드</h1>
      <p className="mt-1.5 text-sm text-slate-400">서비스 전체 현황을 한눈에 확인하세요.</p>

      {error && <p className="mt-6 text-sm text-rose-400">{error}</p>}

      {stats && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTileCard tile={{ label: "전체 유저", value: stats.total_users, href: "/admin/users" }} />
            <StatTileCard tile={{ label: "자유 광장 글", value: stats.total_community_posts }} />
            <StatTileCard tile={{ label: "공개 꿈 기록", value: stats.total_public_dreams }} />
            <StatTileCard tile={{ label: "댓글", value: stats.total_comments }} />
            <StatTileCard tile={{ label: "AI 해몽 사용", value: stats.total_ai_interpretations }} />
            <StatTileCard
              tile={{ label: "대기 중 신고", value: stats.pending_reports, href: "/admin/reports", emphasize: true }}
            />
          </div>

          <div className="mt-6">
            <SignupTrendChart data={stats.signups_last_7_days} />
          </div>
        </>
      )}
    </main>
  );
}

export default function AdminDashboardPage() {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950">
        <NavBar />
        <AdminNav />
        <AdminDashboardContent />
      </div>
    </AdminGuard>
  );
}
