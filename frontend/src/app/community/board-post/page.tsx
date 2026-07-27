"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getAuthErrorMessage } from "@/api/auth";
import {
  createPostComment,
  deleteCommunityPost,
  getCommunityPost,
  getPostComments,
  POST_EDIT_WINDOW_MS,
  togglePostEmpathy,
  updateCommunityPost,
  type CommunityPost,
} from "@/api/dream";
import CommentSection from "@/components/CommentSection";
import IdentitySwitch from "@/components/IdentitySwitch";
import NavBar from "@/components/NavBar";
import { useAuthStore } from "@/store/useAuthStore";

function formatPostTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

// 자유 광장 리스트에서 제목을 눌러 들어오는 상세 페이지. 이 프로젝트는 정적 export라 [id] 같은
// 동적 경로 세그먼트를 쓸 수 없어(generateStaticParams 불가) 다른 상세 페이지들과 동일하게
// 쿼리 파라미터(?id=)로 넘긴다.
export default function BoardPostPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUser = useAuthStore((state) => state.user);
  const nickname = authUser?.nickname ?? "탐험가";

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editIsAnonymous, setEditIsAnonymous] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));
    // 리스트의 "✏️ 수정" 링크가 ?edit=1을 붙여 보내면, 상세를 읽기 모드로 먼저 보여주지 않고
    // 곧바로 편집 폼을 연다.
    const wantsEdit = params.get("edit") === "1";
    if (!Number.isFinite(id) || id <= 0) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }
    getCommunityPost(id)
      .then((data) => {
        setPost(data);
        if (wantsEdit && data.is_mine && Date.now() - new Date(data.created_at).getTime() < POST_EDIT_WINDOW_MS) {
          setEditTitle(data.title);
          setEditContent(data.content);
          setEditIsAnonymous(data.is_anonymous);
          setIsEditing(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleEmpathy = async () => {
    if (!post) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const previous = post;
    setPost({
      ...post,
      is_liked_by_me: !post.is_liked_by_me,
      empathy_count: post.empathy_count + (post.is_liked_by_me ? -1 : 1),
    });
    try {
      const result = await togglePostEmpathy(post.id);
      setPost((prev) => (prev ? { ...prev, ...result } : prev));
    } catch {
      setPost(previous);
    }
  };

  const canEdit = post?.is_mine && Date.now() - new Date(post.created_at).getTime() < POST_EDIT_WINDOW_MS;

  const startEdit = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditIsAnonymous(post.is_anonymous);
    setEditError(null);
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!post || isSaving) return;
    const title = editTitle.trim();
    const content = editContent.trim();
    if (!title || !content) return;
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await updateCommunityPost(post.id, title, content, editIsAnonymous);
      setPost(updated);
      setIsEditing(false);
    } catch (error) {
      setEditError(getAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!post || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteCommunityPost(post.id);
      router.push("/community");
    } catch {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/community" className="text-xs text-violet-300/70 underline-offset-2 hover:text-violet-200 hover:underline">
          ← 커뮤니티로 돌아가기
        </Link>

        {isLoading ? (
          <div className="mt-6 animate-pulse rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="h-6 w-2/3 rounded-full bg-white/10" />
            <div className="mt-6 h-3 w-full rounded-full bg-white/10" />
            <div className="mt-3 h-3 w-5/6 rounded-full bg-white/10" />
          </div>
        ) : notFound || !post ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-sm text-slate-300">이 게시글을 찾을 수 없어요.</p>
            <p className="mt-1.5 text-xs text-slate-500">삭제되었거나, 잘못된 링크인 것 같아요.</p>
            <Link
              href="/community"
              className="mt-5 inline-block rounded-full border border-violet-400/40 bg-violet-500/15 px-5 py-2 text-xs text-violet-200 transition-colors hover:border-violet-300/60 hover:text-white"
            >
              커뮤니티로 이동
            </Link>
          </div>
        ) : (
          <div className="relative mt-6 rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.2)] backdrop-blur-2xl">
            {isEditing ? (
              <div>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  maxLength={200}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-lg font-bold text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
                />
                <textarea
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                  rows={6}
                  maxLength={1000}
                  className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
                />
                <div className="mt-3">
                  <IdentitySwitch isAnonymous={editIsAnonymous} onChange={setEditIsAnonymous} nickname={nickname} />
                </div>
                {editError && <p className="mt-2 text-xs text-red-300">{editError}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 transition-colors hover:border-violet-400/40 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={!editTitle.trim() || !editContent.trim() || isSaving}
                    className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? "저장 중..." : "저장하기"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-2xl font-semibold text-white">{post.title}</h1>
                  {post.is_mine && !confirmDelete && (
                    <div className="flex shrink-0 items-center gap-2 pt-1 text-[11px]">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={startEdit}
                          className="text-slate-500 underline-offset-2 transition-colors hover:text-violet-300 hover:underline"
                        >
                          ✏️ 수정
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="text-slate-500 underline-offset-2 transition-colors hover:text-red-300 hover:underline"
                      >
                        🗑️ 삭제
                      </button>
                    </div>
                  )}
                </div>

                <p className="mt-1.5 text-xs text-slate-500">
                  {post.is_anonymous ? "🎭 익명의 탐험가" : `👤 ${post.author_display_name}`} · {formatPostTime(post.created_at)}
                </p>

                {confirmDelete && (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-2.5">
                    <span className="text-xs text-red-200">이 글을 정말 삭제할까요?</span>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        disabled={isDeleting}
                        className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline disabled:opacity-50"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="text-xs font-semibold text-red-300 underline-offset-2 hover:text-red-200 hover:underline disabled:opacity-50"
                      >
                        {isDeleting ? "삭제 중..." : "네, 삭제할게요"}
                      </button>
                    </div>
                  </div>
                )}

                <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-slate-200">{post.content}</p>

                <div className="mt-6 flex items-center gap-3 border-t border-white/[0.06] pt-4">
                  <button
                    type="button"
                    onClick={handleToggleEmpathy}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      post.is_liked_by_me
                        ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
                        : "border-white/10 text-slate-300 hover:border-violet-400/30 hover:text-slate-100"
                    }`}
                  >
                    ✨ 공감{post.empathy_count > 0 ? ` ${post.empathy_count}` : ""}
                  </button>
                  <span className="text-xs text-slate-500">💬 댓글 {post.comment_count}</span>
                </div>

                <div className="mt-2">
                  <CommentSection
                    targetId={post.id}
                    isOpen
                    defaultAnonymous={post.is_anonymous}
                    nickname={nickname}
                    isAuthenticated={isAuthenticated}
                    onRequireLogin={() => router.push("/login")}
                    onCommentCountChange={(count) => setPost((prev) => (prev ? { ...prev, comment_count: count } : prev))}
                    fetchComments={getPostComments}
                    submitComment={createPostComment}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
