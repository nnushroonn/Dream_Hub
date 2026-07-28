"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getBestFeed, type BestFeedEntry } from "@/api/dream";

const SIDEBAR_BEST_FEED_LIMIT = 5;

// 컴팩트한 우측 사이드바용 베스트 피드 Top 5 - 순위 1~3위는 보라색으로 강조하고 4~5위는
// 톤을 낮춰 시각적 위계를 준다. 랭킹에 오를 글이 없으면(콜드 스타트) 렌더링하지 않는다.
export default function SidebarBestList() {
  const [entries, setEntries] = useState<BestFeedEntry[]>([]);

  useEffect(() => {
    getBestFeed(SIDEBAR_BEST_FEED_LIMIT).then(setEntries).catch(() => {});
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <p className="mb-4 text-lg font-bold text-white">🏆 베스트 꿈 랭킹</p>
      <div className="flex flex-col gap-3">
        {entries.map((entry, index) => {
          const rank = index + 1;
          return (
            <Link
              key={entry.id}
              href={`/community/post?id=${entry.id}`}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/5"
            >
              <span className={`w-4 shrink-0 text-sm ${rank <= 3 ? "font-bold text-purple-400" : "text-slate-500"}`}>
                {rank}
              </span>
              <span className="line-clamp-1 min-w-0 flex-1 text-xs text-slate-300">{entry.title}</span>
              <span className="shrink-0 text-[11px] text-violet-300/60">👍{entry.upvote_count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
