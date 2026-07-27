"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { createPostComment, getPostComments, type CommunityComment } from "@/api/dream";

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
  postId: number;
  isOpen: boolean;
  /** 댓글 익명 스위치의 기본값 - 본문(게시글) 자체의 익명 여부를 그대로 따른다 */
  defaultAnonymous: boolean;
  nickname: string;
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  onCommentCountChange?: (count: number) => void;
}

export default function CommentSection({
  postId,
  isOpen,
  defaultAnonymous,
  nickname,
  isAuthenticated,
  onRequireLogin,
  onCommentCountChange,
}: CommentSectionProps) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [commentText, setCommentText] = useState("");
  const [isCommentAnonymous, setIsCommentAnonymous] = useState(defaultAnonymous);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 처음 펼쳐질 때 딱 한 번만 댓글 목록을 불러온다 - 닫았다 다시 열어도 재요청하지 않는다.
  useEffect(() => {
    if (!isOpen || hasLoaded) return;
    setIsLoading(true);
    getPostComments(postId)
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
  }, [isOpen, hasLoaded, postId]);

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
      const created = await createPostComment(postId, content, isCommentAnonymous);
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
                {comments.map((comment) => (
                  <div key={comment.id} className="mb-2 rounded-lg border border-white/[0.04] bg-black/20 p-3 text-sm">
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
                    <p className="mt-1.5 whitespace-pre-line leading-relaxed text-slate-200">{comment.content}</p>
                  </div>
                ))}
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
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isCommentAnonymous}
                    onClick={() => setIsCommentAnonymous((prev) => !prev)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                      isCommentAnonymous ? "bg-violet-500" : "bg-white/15"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                        isCommentAnonymous ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-[11px] font-medium text-slate-300">🎭 익명</span>
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
