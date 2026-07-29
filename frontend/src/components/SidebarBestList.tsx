"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getBestPosts, type BestPostEntry } from "@/api/dream";

const SIDEBAR_BEST_POSTS_LIMIT = 5;
// 이 프로젝트는 React Query 없이 axios를 직접 쓰는 구조라, "1분마다 백그라운드 동기화"는
// react-query의 refetchInterval 대신 동일한 효과를 내는 setInterval로 구현한다.
const REFETCH_INTERVAL_MS = 60_000;

// 꿈 게시판/자유 게시판을 통틀어 인기 점수(조회수×1 + 좋아요×10) 내림차순으로 뽑은 실시간
// 인기 글 Top 5. 순위 1~3위는 보라색으로 강조하고 4~5위는 톤을 낮춰 시각적 위계를 준다.
// 랭킹에 오를 글이 없으면(콜드 스타트) 렌더링하지 않는다.
export default function SidebarBestList() {
  const [entries, setEntries] = useState<BestPostEntry[]>([]);

  useEffect(() => {
    const fetchBestPosts = () => {
      getBestPosts(SIDEBAR_BEST_POSTS_LIMIT).then(setEntries).catch(() => {});
    };
    fetchBestPosts();
    const intervalId = window.setInterval(fetchBestPosts, REFETCH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <p className="text-base font-bold text-white">🏆 실시간 인기 글</p>
      <div className="mt-2 flex flex-col">
        {entries.map((entry, index) => {
          const rank = index + 1;
          const href = entry.category === "DREAM" ? `/community/post?id=${entry.id}` : `/community/board-post?id=${entry.id}`;
          return (
            <Link key={entry.id} href={href} className="flex items-start gap-3 py-2 border-b border-slate-800/50 last:border-b-0">
              <span className={`shrink-0 text-sm ${rank <= 3 ? "text-purple-400 font-extrabold" : "text-slate-500 font-bold"}`}>
                {rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="shrink-0 text-xs">{entry.category === "DREAM" ? "🔮" : "💬"}</span>
                  <span className="truncate text-sm text-slate-200 hover:text-purple-300 transition-colors cursor-pointer line-clamp-1">
                    {entry.title}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  👍 {entry.upvote_count} · 👁️ {entry.view_count}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
