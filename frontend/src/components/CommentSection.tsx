"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { CommunityComment } from "@/api/dream";

function formatRelativeTime(iso: string): string {
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

interface CommentSectionProps {
  /** 댓글이 달리는 대상(게시글/꿈 기록)의 id - fetchComments/submitComment 재요청 시 재사용 키로도 쓴다 */
  targetId: number;
  isOpen: boolean;
  /** 댓글 익명 스위치의 기본값 - 본문(게시글) 자체의 익명 여부를 그대로 따른다 */
  defaultAnonymous: boolean;
  nickname: string;
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  onCommentCountChange?: (count: number) => void;
  /** 자유 광장 게시글/무의식 피드 꿈 기록 등, 댓글이 달리는 대상마다 다른 API를 주입받는다 */
  fetchComments: (targetId: number) => Promise<CommunityComment[]>;
  submitComment: (targetId: number, content: string, isAnonymous: boolean) => Promise<CommunityComment>;
  updateComment: (targetId: number, commentId: number, content: string, isAnonymous: boolean) => Promise<CommunityComment>;
  deleteComment: (targetId: number, commentId: number) => Promise<void>;
}

export default function CommentSection({
  targetId,
  isOpen,
  defaultAnonymous,
  nickname,
  isAuthenticated,
  onRequireLogin,
  onCommentCountChange,
  fetchComments,
  submitComment,
  updateComment,
  deleteComment,
}: CommentSectionProps) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [commentText, setCommentText] = useState("");
  const [isCommentAnonymous, setIsCommentAnonymous] = useState(defaultAnonymous);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 내 댓글 수정/삭제
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [editCommentIsAnonymous, setEditCommentIsAnonymous] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [editCommentError, setEditCommentError] = useState<string | null>(null);
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<number | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);

  // 처음 펼쳐질 때 딱 한 번만 댓글 목록을 불러온다 - 닫았다 다시 열어도 재요청하지 않는다.
  useEffect(() => {
    if (!isOpen || hasLoaded) return;
    setIsLoading(true);
    fetchComments(targetId)
      .then((result) => {
        setComments(result);
        onCommentCountChange?.(result.length);
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
        setHasLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hasLoaded, targetId]);

  const handleSubmit = async () => {
    const content = commentText.trim();
    if (!content || isSubmitting) return;
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await submitComment(targetId, content, isCommentAnonymous);
      setComments((prev) => {
        const next = [...prev, created];
        onCommentCountChange?.(next.length);
        return next;
      });
      setCommentText("");
    } catch {
      setError("댓글 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditComment = (comment: CommunityComment) => {
    setEditingCommentId(comment.id);
    setEditCommentText(comment.content);
    setEditCommentIsAnonymous(comment.is_anonymous);
    setEditCommentError(null);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentError(null);
  };

  const saveEditComment = async (commentId: number) => {
    const content = editCommentText.trim();
    if (!content || isSavingComment) return;
    setIsSavingComment(true);
    setEditCommentError(null);
    try {
      const updated = await updateComment(targetId, commentId, content, editCommentIsAnonymous);
      setComments((prev) => prev.map((comment) => (comment.id === commentId ? updated : comment)));
      setEditingCommentId(null);
    } catch {
      setEditCommentError("댓글 수정에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (isDeletingComment) return;
    setIsDeletingComment(true);
    try {
      await deleteComment(targetId, commentId);
      setComments((prev) => {
        const next = prev.filter((comment) => comment.id !== commentId);
        onCommentCountChange?.(next.length);
        return next;
      });
    } catch {
      // 간단한 액션이라 별도 에러 배너 없이, 확인 상태만 닫고 목록은 그대로 둔다.
    } finally {
      setConfirmDeleteCommentId(null);
      setIsDeletingComment(false);
    }
  };

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="mt-3 border-t border-white/[0.06] pt-3 pb-4">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }, (_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
                ))}
              </div>
            ) : comments.length > 0 ? (
              <div>
                {comments.map((comment) =>
                  editingCommentId === comment.id ? (
                    <div key={comment.id} className="mb-2 rounded-lg border border-violet-400/30 bg-black/20 p-3 text-sm">
                      <textarea
                        value={editCommentText}
                        onChange={(event) => setEditCommentText(event.target.value)}
                        rows={2}
                        maxLength={500}
                        autoFocus
                        className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <label className="flex cursor-pointer items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-300">🎭 익명</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={editCommentIsAnonymous}
                            onClick={() => setEditCommentIsAnonymous((prev) => !prev)}
                            className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                              editCommentIsAnonymous ? "bg-violet-500" : "bg-white/15"
                            }`}
                          >
                            <span
                              className={`ml-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                                editCommentIsAnonymous ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={cancelEditComment}
                            disabled={isSavingComment}
                            className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline disabled:opacity-50"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEditComment(comment.id)}
                            disabled={!editCommentText.trim() || isSavingComment}
                            className="text-xs font-semibold text-violet-300 underline-offset-2 hover:text-violet-200 hover:underline disabled:opacity-50"
                          >
                            {isSavingComment ? "저장 중..." : "저장"}
                          </button>
                        </div>
                      </div>
                      {editCommentError && <p className="mt-1.5 text-xs text-red-300">{editCommentError}</p>}
                    </div>
                  ) : (
                    <div key={comment.id} className="mb-2 rounded-lg border border-white/[0.04] bg-black/20 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {comment.is_anonymous ? (
                            <>
                              <span className="text-xs">🎭</span>
                              <span className="text-xs text-violet-300/80">익명의 탐험가</span>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-slate-500">👤</span>
                              <span className="text-xs text-slate-400">{comment.author_display_name}</span>
                            </>
                          )}
                          <span className="text-xs text-slate-500">· {formatRelativeTime(comment.created_at)}</span>
                        </div>
                        {comment.is_mine && confirmDeleteCommentId !== comment.id && (
                          <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                            <button
                              type="button"
                              onClick={() => startEditComment(comment)}
                              className="underline-offset-2 transition-colors hover:text-violet-300 hover:underline"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCommentId(comment.id)}
                              className="underline-offset-2 transition-colors hover:text-red-300 hover:underline"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>

                      {confirmDeleteCommentId === comment.id ? (
                        <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-2">
                          <span className="text-xs text-red-200">이 댓글을 삭제할까요?</span>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCommentId(null)}
                              disabled={isDeletingComment}
                              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline disabled:opacity-50"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment.id)}
                              disabled={isDeletingComment}
                              className="text-xs font-semibold text-red-300 underline-offset-2 hover:text-red-200 hover:underline disabled:opacity-50"
                            >
                              {isDeletingComment ? "삭제 중..." : "네, 삭제할게요"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1.5 whitespace-pre-line leading-relaxed text-slate-200">{comment.content}</p>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-slate-500">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
            )}

            {/* 댓글 입력 폼: 텍스트 영역 아래에 이 댓글만의 익명 여부를 고르는 미니 토글이 붙는다 */}
            <div className="mt-2 space-y-3">
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="댓글을 남겨보세요..."
                rows={2}
                maxLength={500}
                className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
              />
              {error && <p className="text-xs text-red-300">{error}</p>}
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-300">🎭 익명</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isCommentAnonymous}
                    onClick={() => setIsCommentAnonymous((prev) => !prev)}
                    className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                      isCommentAnonymous ? "bg-violet-500" : "bg-white/15"
                    }`}
                  >
                    <span
                      className={`ml-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                        isCommentAnonymous ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!commentText.trim() || isSubmitting}
                  className="rounded-full bg-purple-700/80 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "등록 중..." : isAuthenticated ? "댓글 등록" : "로그인하고 댓글 쓰기"}
                </button>
              </div>
              {!isAuthenticated && (
                <p className="text-[11px] text-slate-500">
                  {isCommentAnonymous ? "🎭 익명" : `👤 ${nickname}`}으로 남길 예정이에요.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
