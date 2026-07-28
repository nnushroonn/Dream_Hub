"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getBestFeed, type BestFeedEntry } from "@/api/dream";

const HOME_BEST_FEED_LIMIT = 3;

// 홈 화면용 베스트 피드 - 최근 좋아요 랭킹 Top 3를 가로 카드로 보여준다. 콜드 스타트로 랭킹에
// 오를 글이 아직 없으면(빈 배열) 섹션 자체를 렌더링하지 않는다.
export default function HomeBestShowcase() {
  const [entries, setEntries] = useState<BestFeedEntry[]>([]);

  useEffect(() => {
    getBestFeed(HOME_BEST_FEED_LIMIT).then(setEntries).catch(() => {});
  }, []);

  if (entries.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">🏆 이번 주 베스트 꿈</h2>
        <Link
          href="/community"
          className="text-xs text-violet-300/70 underline-offset-2 hover:text-violet-200 hover:underline"
        >
          더 보기 →
        </Link>
      </div>
      <div className="mt-4 flex flex-row gap-6">
        {entries.map((entry, index) => (
          <Link key={entry.id} href={`/community/post?id=${entry.id}`} className="min-w-0 flex-1">
            {index === 0 ? (
              <div className="best-feed-shine-border flex h-full flex-col items-center gap-2 rounded-2xl border-2 border-transparent bg-clip-border px-4 py-6 text-center transition-transform duration-300 hover:-translate-y-1">
                <span className="text-3xl">{entry.emotion}</span>
                <h3 className="line-clamp-2 text-lg font-bold text-white">{entry.title}</h3>
                <span className="mt-1 text-sm font-semibold text-amber-300">👍 {entry.upvote_count}</span>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-violet-400/30">
                <span className="text-3xl">{entry.emotion}</span>
                <h3 className="line-clamp-2 text-lg font-bold text-white">{entry.title}</h3>
                <span className="mt-1 text-sm font-medium text-slate-400">👍 {entry.upvote_count}</span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
