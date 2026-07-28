"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  buildDreamOriginalContent,
  deleteCommunityPost,
  getCommunityPosts,
  getDreamFeed,
  getTrends,
  type CommunityPost,
  type DreamFeedEntry,
  type Trend,
} from "@/api/dream";
import NavBar from "@/components/NavBar";
import SidebarBestList from "@/components/SidebarBestList";
import { useAuthStore } from "@/store/useAuthStore";

type Tab = "dream" | "board";

function toHashtagDisplay(tag: string): string {
  return tag.startsWith("#") ? tag : `#${tag}`;
}

function formatPostTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// 리스트 미리보기 스포일러 방지: "반전은 다음 줄에" 같은 낚시글을 첫 줄만 잘라 보여주면, 유저가
// 일부러 엔터를 여러 번 눌러 감춰둔 반전 텍스트가 리스트에서 미리 새어나가지 않는다.
function firstLine(content: string): string {
  return content.split(/\r\n|\n/)[0];
}

// 사담(share_caption)이 비어 있거나 공백뿐이면 리스트 행이 텅 비어 보이지 않도록, 첨부된 꿈
// 원문 첫 줄로 대체하고 🌙를 붙여 "유저의 말이 아니라 꿈 데이터"임을 시각적으로 구분한다.
function dreamListPreview(dream: DreamFeedEntry): string | null {
  const caption = firstLine(dream.share_caption ?? "").trim();
  if (caption.length >= 20) return caption;
  if (caption.length > 0) return null; // 사담은 있지만 너무 짧음 - 스포일러 방지로 제목만 노출

  const fallback = firstLine(buildDreamOriginalContent(dream.survey)).trim();
  return fallback.length > 0 ? `🌙 ${fallback}` : null;
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
  // 리스트에서 바로 삭제할 수 있는 빠른 액션 - 수정은 상세 페이지(edit=1)로 보낸다.
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<number | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);

  // 사이드바의 "지금 뜨는 꿈 상징" 위젯 - 홈 화면과 같은 실제 집계(trends.py)를 그대로 재사용한다.
  const [trends, setTrends] = useState<Trend[]>([]);

  useEffect(() => {
    // 글쓰기 페이지에서 게시 후 돌아올 때 ?tab=board|dream으로 어느 탭에 있었는지 알려준다 -
    // 없으면(첫 진입) 기존처럼 무의식 피드가 기본 탭이다.
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "board") setTab("board");

    getDreamFeed()
      .then(setDreams)
      .catch(() => {})
      .finally(() => setIsLoadingDreams(false));
    getCommunityPosts()
      .then(setPosts)
      .catch(() => {})
      .finally(() => setIsLoadingPosts(false));
    getTrends().then(setTrends).catch(() => {});
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

  const handleDeletePost = async (postId: number) => {
    if (isDeletingPost) return;
    setIsDeletingPost(true);
    try {
      await deleteCommunityPost(postId);
      setPosts((prev) => prev.filter((post) => post.id !== postId));
    } catch {
      // 간단한 액션이라 별도 에러 배너 없이, 확인 상태만 닫고 목록은 그대로 둔다.
    } finally {
      setConfirmDeletePostId(null);
      setIsDeletingPost(false);
    }
  };

  // 글쓰기/내 꿈 공유하기는 이제 독립 페이지(/community/write)다 - 로그인하지 않은 유저가
  // 그 링크를 눌렀을 때만 여기서 미리 막는다.
  const requireLoginThen = (href: string) => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    router.push(href);
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-7xl px-4 py-12">
        <h1 className="text-2xl font-semibold text-white">🌌 무의식 광장</h1>
        <p className="mt-1.5 text-sm text-slate-400">다른 탐험가들의 꿈을 둘러보고, 자유롭게 이야기를 나눠보세요.</p>

        {/* 이원화 탭: 활성 탭 아래로 보랏빛 언더라인 글로우가 슬라이드한다 */}
        <div className="relative mt-8 max-w-md">
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

        {/* 2단 대시보드: 좌측은 활성 탭의 피드, 우측은 탭과 무관하게 항상 떠 있는 사이드바.
            max-w-6xl로 이 아래 영역만의 가로폭을 고정해 탭 바 위 헤더와 무관하게 화면 중심이
            흔들리지 않게 하고, items-start로 두 컬럼이 서로의 높이에 맞춰 늘어나지 않게 한다. */}
        <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {tab === "dream" ? (
              <div>
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-3">
                  <button
                    type="button"
                    onClick={() => setActiveTag(null)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      activeTag === null
                        ? "border-purple-500 bg-purple-600/30 text-purple-300"
                        : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-500/50"
                    }`}
                  >
                    #전체
                  </button>
                  {availableTags.map((tag) => {
                    const isActive = activeTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveTag(isActive ? null : tag)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          isActive
                            ? "border-purple-500 bg-purple-600/30 text-purple-300"
                            : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-500/50"
                        }`}
                      >
                        {toHashtagDisplay(tag)}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col">
                  {isLoadingDreams ? (
                    Array.from({ length: 5 }, (_, index) => (
                      <div key={index} className="h-14 animate-pulse border-b border-white/10 bg-white/[0.02]" />
                    ))
                  ) : filteredDreams.length > 0 ? (
                    filteredDreams.map((dream) => {
                      const preview = dreamListPreview(dream);
                      return (
                        <div
                          key={dream.id}
                          role="link"
                          tabIndex={0}
                          onClick={() => router.push(`/community/post?id=${dream.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") router.push(`/community/post?id=${dream.id}`);
                          }}
                          className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/10 px-2 py-3 transition-colors hover:bg-white/5"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            {/* 자유 광장 리스트의 "글 번호" 자리를 대신해, 좌측에 이 꿈의 메인 감정
                                이모지를 배치한다 - 무의식 피드 행임을 한눈에 구분해 준다. */}
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-lg">
                              {dream.emotion}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="inline-flex min-w-0 flex-wrap items-baseline gap-1.5">
                                <span className="truncate text-lg font-bold text-slate-100 hover:underline">{dream.title}</span>
                                <span className="shrink-0 rounded bg-purple-900 px-2 text-xs text-purple-200">🌙 꿈 기록</span>
                                {dream.comment_count > 0 && (
                                  <span className="shrink-0 text-sm font-semibold text-violet-400">[{dream.comment_count}]</span>
                                )}
                              </span>
                              {preview && (
                                <div className="relative mt-0.5">
                                  <p className="line-clamp-1 overflow-hidden text-ellipsis text-sm text-slate-400">
                                    {preview}
                                  </p>
                                  {/* 자유 광장과 동일한 페이드아웃 + 낚시글 스포일러 방지 로직 -
                                      첫 줄만 잘라 보여주고 우측 끝을 리스트 배경색으로 흐려지게 한다. */}
                                  <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-slate-950 to-transparent" />
                                </div>
                              )}
                              <p className="mt-1 text-[11px] text-slate-500">
                                {dream.is_anonymous ? "🎭 익명의 탐험가" : `👤 ${dream.author_display_name}`} · {dream.dream_date}
                                {" "}
                                · 조회 {dream.view_count}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-xs text-slate-400">👍 {dream.upvote_count}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center text-xs text-slate-500">
                      {activeTag
                        ? `${toHashtagDisplay(activeTag)} 태그의 공개된 꿈이 아직 없어요.`
                        : "아직 공개된 꿈이 없어요. 꿈 기록소에서 첫 공개 기록을 남겨보세요 ✨"}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {isLoadingPosts ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <div key={index} className="h-14 animate-pulse border-b border-white/10 bg-white/[0.02]" />
                  ))
                ) : posts.length > 0 ? (
                  posts.map((post) =>
                    confirmDeletePostId === post.id ? (
                      <div
                        key={post.id}
                        className="flex items-center justify-between gap-3 border-b border-white/10 bg-red-500/10 px-2 py-3"
                      >
                        <span className="text-xs text-red-200">"{post.title}" 글을 정말 삭제할까요?</span>
                        <div className="flex shrink-0 gap-3">
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePostId(null)}
                            disabled={isDeletingPost}
                            className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline disabled:opacity-50"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            disabled={isDeletingPost}
                            className="text-xs font-semibold text-red-300 underline-offset-2 hover:text-red-200 hover:underline disabled:opacity-50"
                          >
                            {isDeletingPost ? "삭제 중..." : "네, 삭제할게요"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={post.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/community/board-post?id=${post.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") router.push(`/community/board-post?id=${post.id}`);
                        }}
                        className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/10 px-2 py-3 transition-colors hover:bg-white/5"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="inline-flex min-w-0 items-baseline gap-1.5">
                            <span className="truncate text-lg font-bold text-slate-100 hover:underline">{post.title}</span>
                            {post.comment_count > 0 && (
                              <span className="shrink-0 text-sm font-semibold text-violet-400">[{post.comment_count}]</span>
                            )}
                          </span>
                          {firstLine(post.content).length >= 20 && (
                            <div className="relative mt-0.5">
                              <p className="line-clamp-1 overflow-hidden text-ellipsis text-sm text-slate-400">
                                {firstLine(post.content)}
                              </p>
                              {/* 우측 끝을 리스트 배경색(slate-950)으로 페이드아웃시켜 텍스트가 갑자기
                                  잘리지 않고 스르륵 사라지는 것처럼 보이게 한다 - 호기심을 자극하는
                                  의도적인 "제한적 노출" 장치. */}
                              <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-slate-950 to-transparent" />
                            </div>
                          )}
                          <p className="mt-1 text-[11px] text-slate-500">
                            {post.is_anonymous ? "🎭 익명의 탐험가" : `👤 ${post.author_display_name}`} · {formatPostTime(post.created_at)}
                            {" "}
                            · 조회 {post.view_count}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {post.is_mine && (
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              <Link
                                href={`/community/board-post?id=${post.id}&edit=1`}
                                onClick={(event) => event.stopPropagation()}
                                className="underline-offset-2 transition-colors hover:text-violet-300 hover:underline"
                              >
                                ✏️ 수정
                              </Link>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setConfirmDeletePostId(post.id);
                                }}
                                className="underline-offset-2 transition-colors hover:text-red-300 hover:underline"
                              >
                                🗑️ 삭제
                              </button>
                            </div>
                          )}
                          <span className="text-xs text-slate-400">👍 {post.upvote_count}</span>
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center text-xs text-slate-500">
                    아직 작성된 글이 없어요. 첫 이야기를 남겨보세요 ✨
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 사이드바: 탭과 무관하게 항상 노출 - 메인 액션(탭에 따라 내 꿈 공유하기/글쓰기로 전환) +
              실시간 트렌드 위젯. flex flex-col gap-4로 묶어 두 박스의 가로 너비를 완벽히 일치시키고
              수직 간격을 통일한다. */}
          <aside className="lg:col-span-4">
            <div className="flex flex-col gap-4 lg:sticky lg:top-6">
              {tab === "dream" ? (
                <button
                  type="button"
                  onClick={() => requireLoginThen("/community/write?type=dream")}
                  className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 font-medium text-white shadow-lg transition-all hover:from-purple-700 hover:to-indigo-700"
                >
                  🌙 내 꿈 공유하기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => requireLoginThen("/community/write?type=board")}
                  className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 font-medium text-white shadow-lg transition-all hover:from-purple-700 hover:to-indigo-700"
                >
                  🖊️ 글쓰기
                </button>
              )}

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="mb-4 text-lg font-bold text-white">🔥 지금 뜨는 꿈 상징</p>
                <div className="flex flex-col gap-2">
                  {trends.length > 0 ? (
                    trends.slice(0, 6).map((trend, index) => (
                      <button
                        key={trend.keyword}
                        type="button"
                        onClick={() => router.push(`/dictionary?search=${encodeURIComponent(trend.keyword)}`)}
                        className="group flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="w-4 shrink-0 text-[11px] font-semibold text-violet-400/70">{index + 1}</span>
                          <span className="truncate text-xs text-slate-300 group-hover:text-white">
                            {toHashtagDisplay(trend.keyword)}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-violet-300/60">{trend.count}회</span>
                      </button>
                    ))
                  ) : (
                    <p className="px-1.5 py-1 text-[11px] text-slate-500">아직 집계된 트렌드가 없어요.</p>
                  )}
                </div>
              </div>

              <SidebarBestList />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
