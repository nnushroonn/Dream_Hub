"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getBestPosts, type BestPostEntry } from "@/api/dream";

const PREVIEW_POST_LIMIT = 2;

// 홈 하단 좌측 카드 - 예전엔 검색창이 있는 "꿈해몽 사전" 카드였지만, 히어로 상단에 이미 사전
// 검색창이 생겨 기능이 중복됐다. 그 자리를 대신해 실시간 인기 게시글 Top 2를 보여주는 커뮤니티
// 프리뷰 카드로 교체한다.
export default function CommunityPreviewCard() {
  const [posts, setPosts] = useState<BestPostEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getBestPosts(PREVIEW_POST_LIMIT)
      .then(setPosts)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="rounded-2xl border border-purple-500/30 bg-slate-900/80 p-6 shadow-lg backdrop-blur-md transition-all hover:border-purple-500/60">
      <h3 className="text-lg font-semibold text-white">🌌 무의식 광장 (커뮤니티)</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">지금 탐험가들이 나누는 흥미로운 꿈 이야기</p>

      <ul className="mt-4 space-y-1.5">
        {isLoading
          ? Array.from({ length: PREVIEW_POST_LIMIT }, (_, index) => (
              <li key={index} className="h-9 animate-pulse rounded-lg bg-white/5" />
            ))
          : posts.length === 0
            ? <li className="py-2 text-xs text-slate-500">아직 인기 게시글이 없어요.</li>
            : posts.map((post) => (
                <li key={`${post.category}-${post.id}`}>
                  <Link
                    href={post.category === "DREAM" ? `/community/post?id=${post.id}` : `/community/board-post?id=${post.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-purple-500/10"
                  >
                    <span className="truncate text-sm text-slate-200">{post.title}</span>
                    <span className="shrink-0 text-xs text-slate-500">💬 {post.comment_count}</span>
                  </Link>
                </li>
              ))}
      </ul>

      <Link
        href="/community"
        className="mt-3 inline-block text-xs text-purple-300/80 underline-offset-2 hover:underline"
      >
        커뮤니티 전체보기 ➔
      </Link>
    </div>
  );
}
