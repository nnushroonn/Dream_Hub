"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  getMyLikedDreams,
  getMyPosts,
  listDreams,
  type CommunityPost,
  type DreamEntryRecord,
  type DreamFeedEntry,
} from "@/api/dream";
import { useAuthStore } from "@/store/useAuthStore";

type HistoryTab = "shared" | "posts" | "liked";

function EmptyState({ text }: { text: string }) {
  return (
    <p className="col-span-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-8 text-center text-xs text-slate-500">
      {text}
    </p>
  );
}

// 마이페이지 하단 "내가 공유한 꿈 & 작성한 글" 아카이브. 세 탭 전부 실제 커뮤니티 연동
// 데이터다 - 공유 꿈일기는 /api/dreams(본인 소유 전체)를 공개 상태로 필터링, 자유글/공감한
// 꿈은 각각 전용 엔드포인트에서 가져온다.
export default function MyActivityTabs() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [tab, setTab] = useState<HistoryTab>("shared");

  const [sharedDreams, setSharedDreams] = useState<DreamEntryRecord[]>([]);
  const [myPosts, setMyPosts] = useState<CommunityPost[]>([]);
  const [likedDreams, setLikedDreams] = useState<DreamFeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    Promise.all([listDreams(), getMyPosts(), getMyLikedDreams()])
      .then(([dreams, posts, liked]) => {
        setSharedDreams(dreams.filter((entry) => entry.is_public));
        setMyPosts(posts);
        setLikedDreams(liked);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  const tabs: { key: HistoryTab; label: string; count: number }[] = [
    { key: "shared", label: "🔮 내가 공유한 꿈일기", count: sharedDreams.length },
    { key: "posts", label: "💬 내가 쓴 자유글", count: myPosts.length },
    { key: "liked", label: "❤️ 공감한 꿈", count: likedDreams.length },
  ];

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-white">🗂️ 내 활동 아카이브</h2>

      {!isAuthenticated ? (
        <p className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-8 text-center text-xs text-slate-500">
          로그인하면 내가 공유한 꿈과 작성한 글을 모아볼 수 있어요.
        </p>
      ) : (
        <>
          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  tab === item.key
                    ? "border-purple-500 bg-purple-600/30 text-purple-300"
                    : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-400/30 hover:text-slate-200"
                }`}
              >
                {item.label}
                {item.count > 0 ? ` (${item.count})` : ""}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {isLoading ? (
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.03]" />
              ))
            ) : tab === "shared" ? (
              sharedDreams.length > 0 ? (
                sharedDreams.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="min-w-0 truncate text-sm font-semibold text-white">
                        {entry.emotion} {entry.title}
                      </h3>
                      <span className="shrink-0 text-[11px] text-slate-500">{entry.dream_date}</span>
                    </div>
                    {entry.summary && <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">{entry.summary}</p>}
                  </div>
                ))
              ) : (
                <EmptyState text="아직 공개로 공유한 꿈일기가 없어요." />
              )
            ) : tab === "posts" ? (
              myPosts.length > 0 ? (
                myPosts.map((post) => (
                  <div key={post.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <Link href={`/community/board-post?id=${post.id}`} className="text-sm font-semibold text-slate-100 hover:underline">
                      {post.title}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-400">{post.content}</p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      👍 {post.upvote_count} · 💬 {post.comment_count}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState text="아직 자유 게시판에 쓴 글이 없어요." />
              )
            ) : likedDreams.length > 0 ? (
              likedDreams.map((dream) => (
                <div key={dream.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <h3 className="truncate text-sm font-semibold text-white">
                    {dream.emotion} {dream.title}
                  </h3>
                  {dream.summary && <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">{dream.summary}</p>}
                </div>
              ))
            ) : (
              <EmptyState text="아직 공감한 꿈이 없어요." />
            )}
          </div>
        </>
      )}
    </section>
  );
}
