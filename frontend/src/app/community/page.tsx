"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createCommunityPost,
  getCommunityPosts,
  getDreamFeed,
  toggleDreamEmpathy,
  togglePostEmpathy,
  type CommunityPost,
  type DreamFeedEntry,
} from "@/api/dream";
import NavBar from "@/components/NavBar";
import { useAuthStore } from "@/store/useAuthStore";

type Tab = "dream" | "board";

function toHashtagDisplay(tag: string): string {
  return tag.startsWith("#") ? tag : `#${tag}`;
}

function formatPostTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// 🌀 나도 이런 꿈 꾼 적 있어: 클릭할 때마다 보랏빛 동심원이 밖으로 퍼져나가는 파동을 하나씩 더한다.
// 애니메이션이 끝난 링은 onAnimationComplete에서 스스로 목록에서 지운다.
function DreamReactionButton({
  isLiked,
  count,
  onToggle,
}: {
  isLiked: boolean;
  count: number;
  onToggle: () => void;
}) {
  const [ripples, setRipples] = useState<number[]>([]);
  const nextRippleId = useRef(0);

  const handleClick = () => {
    const id = nextRippleId.current++;
    setRipples((prev) => [...prev, id]);
    onToggle();
  };

  return (
    <div className="relative inline-block">
      <AnimatePresence>
        {ripples.map((id) => (
          <motion.span
            key={id}
            className="pointer-events-none absolute inset-0 rounded-full border border-violet-400/70"
            initial={{ opacity: 0.7, scale: 0.7 }}
            animate={{ opacity: 0, scale: 2.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            onAnimationComplete={() => setRipples((prev) => prev.filter((rippleId) => rippleId !== id))}
          />
        ))}
      </AnimatePresence>
      <button
        type="button"
        onClick={handleClick}
        className={`relative rounded-full border px-4 py-2 text-xs font-medium transition-all duration-300 ${
          isLiked
            ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
            : "border-white/10 bg-white/5 text-slate-300 hover:border-violet-400/40 hover:bg-violet-500/10"
        }`}
      >
        🌀 나도 이런 꿈 꾼 적 있어{count > 0 ? ` ${count}` : ""}
      </button>
    </div>
  );
}

export default function CommunityPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [tab, setTab] = useState<Tab>("dream");

  const [dreams, setDreams] = useState<DreamFeedEntry[]>([]);
  const [isLoadingDreams, setIsLoadingDreams] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [composeText, setComposeText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    getDreamFeed()
      .then(setDreams)
      .catch(() => {})
      .finally(() => setIsLoadingDreams(false));
    getCommunityPosts()
      .then(setPosts)
      .catch(() => {})
      .finally(() => setIsLoadingPosts(false));
  }, []);

  // 무의식 피드에 실제로 등장한 상징 태그만 필터 칩으로 보여준다 - 등장 빈도순.
  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    dreams.forEach((dream) => dream.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [dreams]);

  const filteredDreams = useMemo(() => {
    if (!activeTag) return dreams;
    return dreams.filter((dream) => dream.tags.includes(activeTag));
  }, [dreams, activeTag]);

  const handleDreamToggle = async (dreamId: number) => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const previous = dreams;
    setDreams((prev) =>
      prev.map((dream) =>
        dream.id === dreamId
          ? {
              ...dream,
              is_liked_by_me: !dream.is_liked_by_me,
              empathy_count: dream.empathy_count + (dream.is_liked_by_me ? -1 : 1),
            }
          : dream
      )
    );
    try {
      const result = await toggleDreamEmpathy(dreamId);
      setDreams((prev) => prev.map((dream) => (dream.id === dreamId ? { ...dream, ...result } : dream)));
    } catch {
      setDreams(previous);
    }
  };

  const handlePostToggle = async (postId: number) => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const previous = posts;
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              is_liked_by_me: !post.is_liked_by_me,
              empathy_count: post.empathy_count + (post.is_liked_by_me ? -1 : 1),
            }
          : post
      )
    );
    try {
      const result = await togglePostEmpathy(postId);
      setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, ...result } : post)));
    } catch {
      setPosts(previous);
    }
  };

  const handleCreatePost = async () => {
    const content = composeText.trim();
    if (!content || isPosting) return;
    setPostError(null);
    setIsPosting(true);
    try {
      const created = await createCommunityPost(content);
      setPosts((prev) => [created, ...prev]);
      setComposeText("");
    } catch {
      setPostError("게시에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-white">🌌 무의식 광장</h1>
        <p className="mt-1.5 text-sm text-slate-400">다른 탐험가들의 꿈을 둘러보고, 자유롭게 이야기를 나눠보세요.</p>

        {/* 이원화 탭: 활성 탭 아래로 보랏빛 언더라인 글로우가 슬라이드한다 */}
        <div className="relative mt-8">
          <div className="grid grid-cols-2">
            <button
              type="button"
              onClick={() => setTab("dream")}
              className={`pb-3 text-sm font-semibold transition-colors ${
                tab === "dream" ? "text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              🔮 무의식 피드
            </button>
            <button
              type="button"
              onClick={() => setTab("board")}
              className={`pb-3 text-sm font-semibold transition-colors ${
                tab === "board" ? "text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              💬 자유 광장
            </button>
          </div>
          <div className="h-px w-full bg-white/10" />
          <div
            className={`absolute bottom-0 h-0.5 w-1/2 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.85)] transition-transform duration-300 ease-out ${
              tab === "board" ? "translate-x-full" : "translate-x-0"
            }`}
          />
        </div>

        {tab === "dream" ? (
          <div className="mt-6">
            {availableTags.length > 0 && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {availableTags.map((tag) => {
                  const isActive = activeTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setActiveTag(isActive ? null : tag)}
                      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                        isActive
                          ? "border-purple-500 bg-purple-600/30 text-purple-300"
                          : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-400/30 hover:text-slate-200"
                      }`}
                    >
                      {toHashtagDisplay(tag)}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3">
              {isLoadingDreams ? (
                Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.03]" />
                ))
              ) : filteredDreams.length > 0 ? (
                filteredDreams.map((dream) => (
                  <article
                    key={dream.id}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-md transition-all duration-300 hover:border-violet-400/30 hover:shadow-[0_0_25px_rgba(167,139,250,0.15)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="min-w-0 truncate text-sm font-semibold text-white">
                        {dream.emotion} {dream.title}
                      </h3>
                      <span className="shrink-0 text-[11px] text-slate-500">{dream.dream_date}</span>
                    </div>
                    {dream.summary && <p className="mt-2 text-xs leading-relaxed text-slate-400">{dream.summary}</p>}
                    {dream.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {dream.tags.map((tag) => (
                          <span key={tag} className="text-[11px] text-violet-300/70">
                            {toHashtagDisplay(tag)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-4">
                      <DreamReactionButton
                        isLiked={dream.is_liked_by_me}
                        count={dream.empathy_count}
                        onToggle={() => handleDreamToggle(dream.id)}
                      />
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-8 text-center text-xs text-slate-500">
                  {activeTag
                    ? `${toHashtagDisplay(activeTag)} 태그의 공개된 꿈이 아직 없어요.`
                    : "아직 공개된 꿈이 없어요. 꿈 기록소에서 첫 공개 기록을 남겨보세요 ✨"}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6">
            {isAuthenticated ? (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <textarea
                  value={composeText}
                  onChange={(event) => setComposeText(event.target.value)}
                  placeholder="자유롭게 이야기를 나눠보세요..."
                  rows={3}
                  maxLength={1000}
                  className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
                />
                {postError && <p className="mt-2 text-xs text-red-300">{postError}</p>}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={!composeText.trim() || isPosting}
                    className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-1.5 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPosting ? "게시 중..." : "게시하기"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 text-center text-xs text-slate-400">
                로그인하면 자유 광장에 글을 남길 수 있어요.{" "}
                <Link href="/login" className="text-violet-300 underline-offset-2 hover:underline">
                  로그인하기
                </Link>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3">
              {isLoadingPosts ? (
                Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.03]" />
                ))
              ) : posts.length > 0 ? (
                posts.map((post) => (
                  <article
                    key={post.id}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 transition-all duration-300 hover:border-violet-400/30 hover:shadow-[0_0_20px_rgba(167,139,250,0.12)]"
                  >
                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">{post.content}</p>
                    <p className="mt-3 text-[11px] text-slate-500">{formatPostTime(post.created_at)}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePostToggle(post.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          post.is_liked_by_me
                            ? "border-violet-400/60 bg-violet-500/20 text-violet-200"
                            : "border-white/10 text-slate-400 hover:border-violet-400/30 hover:text-slate-200"
                        }`}
                      >
                        ✨ 공감{post.empathy_count > 0 ? ` ${post.empathy_count}` : ""}
                      </button>
                      <button
                        type="button"
                        disabled
                        title="댓글 기능은 준비 중이에요"
                        className="cursor-not-allowed rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-600"
                      >
                        💬 댓글
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-8 text-center text-xs text-slate-500">
                  아직 작성된 글이 없어요. 첫 이야기를 남겨보세요 ✨
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
