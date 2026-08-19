"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { CommunityComment } from "@/api/dream";
import AuthorBadge from "@/components/AuthorBadge";
import UserDreamProfileModal from "@/components/UserDreamProfileModal";

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

function commentDisplayLabel(comment: CommunityComment): string {
  if (comment.is_post_author) return "글쓴이";
  if (comment.is_anonymous) return `익명${comment.anonymous_index ?? ""}`;
  return comment.author_display_name ?? "탐험가";
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
  submitComment: (
    targetId: number,
    content: string,
    isAnonymous: boolean,
    parentId?: number | null
  ) => Promise<CommunityComment>;
  updateComment: (targetId: number, commentId: number, content: string, isAnonymous: boolean) => Promise<CommunityComment>;
  deleteComment: (targetId: number, commentId: number) => Promise<void>;
  /** 상세 페이지에서만 true로 켜서 입력 폼을 화면 하단에 고정한다 - 카드에 인라인으로 끼워 넣는
   * 피드 목록(community/page.tsx)에서는 여러 개가 동시에 열릴 수 있어 기본값(false)을 그대로 쓴다. */
  stickyInput?: boolean;
  /** 알림 드롭다운에서 댓글 항목을 눌러 들어왔을 때(?highlightComment=)의 대상 댓글 id -
   * 댓글이 로드되면 그 위치로 스크롤하고 잠깐 하이라이트한다. */
  highlightCommentId?: number | null;
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
  stickyInput = false,
  highlightCommentId = null,
}: CommentSectionProps) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  // 알림에서 들어왔을 때 딱 한 번만 스크롤+하이라이트하기 위한 가드 - highlightedId가 다시
  // null로 꺼진 뒤에도 댓글 목록이 갱신될 때마다 재실행되는 걸 막는다.
  const hasScrolledToHighlightRef = useRef(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  // 로그인 모달을 띄운 뒤 로그인에 성공하면 방금 시도했던 등록을 자동으로 이어가기 위한 플래그.
  const pendingSubmitAfterLoginRef = useRef(false);

  const [commentText, setCommentText] = useState("");
  const [isCommentAnonymous, setIsCommentAnonymous] = useState(defaultAnonymous);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 원댓글의 "답글 달기"를 누르면 채워진다 - 1-Depth만 허용하므로 답글에는 이 버튼 자체가 없다.
  const [replyingTo, setReplyingTo] = useState<{ id: number; label: string } | null>(null);

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
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
        setHasLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hasLoaded, targetId]);

  // 댓글 수가 바뀔 때마다 부모에게 알린다 - setComments 업데이터 함수 안에서 직접 호출하면
  // 렌더링 도중 다른 컴포넌트(부모)의 setState를 트리거하게 되어 리액트 경고/에러가 난다
  // ("Cannot update a component while rendering a different component"). 그래서 등록/삭제
  // 지점마다 흩어져 있던 호출을 이 effect 하나로 모았다. onCommentCountChange는 부모가 매
  // 렌더마다 새로 만드는 인라인 함수라 deps에 넣으면 무한 루프가 생겨 의도적으로 뺐다.
  useEffect(() => {
    if (!hasLoaded) return;
    onCommentCountChange?.(comments.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoaded, comments.length]);

  // 댓글이 로드되면 알림에서 지정한 댓글로 스크롤 이동 + 잠깐 하이라이트한다. 한 번 실행되면
  // ref 가드가 다시 실행을 막아, 이후 새 댓글이 달려 목록이 갱신돼도 재스크롤되지 않는다.
  useEffect(() => {
    if (!highlightCommentId || !hasLoaded || hasScrolledToHighlightRef.current) return;
    const el = document.getElementById(`comment-${highlightCommentId}`);
    if (!el) return;
    hasScrolledToHighlightRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(highlightCommentId);
    const timer = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(timer);
  }, [hasLoaded, highlightCommentId]);

  // 인증 확인 없이 곧장 등록하는 부분 - handleSubmit(게이트)과 로그인 후 자동 복귀 효과가 공유한다.
  const postComment = async () => {
    const content = commentText.trim();
    if (!content || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await submitComment(targetId, content, isCommentAnonymous, replyingTo?.id ?? null);
      setComments((prev) => [...prev, created]);
      setCommentText("");
      setReplyingTo(null);
    } catch {
      setError("댓글 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 로그인 모달이 떠 있는 동안에도 이 컴포넌트는 그대로 마운트돼 있어 commentText가 남아있다 -
  // 로그인에 성공해 isAuthenticated가 true로 바뀌는 순간, 방금 시도했던 댓글 등록을 자동으로
  // 이어간다(pendingSubmitAfterLoginRef가 실제로 등록을 시도했던 경우에만 켜진다).
  useEffect(() => {
    if (isAuthenticated && pendingSubmitAfterLoginRef.current) {
      pendingSubmitAfterLoginRef.current = false;
      void postComment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleSubmit = () => {
    const content = commentText.trim();
    if (!content || isSubmitting) return;
    if (!isAuthenticated) {
      pendingSubmitAfterLoginRef.current = true;
      onRequireLogin();
      return;
    }
    void postComment();
  };

  const startReply = (comment: CommunityComment) => {
    setReplyingTo({ id: comment.id, label: commentDisplayLabel(comment) });
  };

  const cancelReply = () => setReplyingTo(null);

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
      // 원댓글을 지우면 그 답글들도 함께 사라진다 - 백엔드가 CASCADE로 이미 지웠으므로
      // 프론트 상태도 원댓글 + 그 답글들을 한 번에 걸러낸다.
      setComments((prev) => prev.filter((comment) => comment.id !== commentId && comment.parent_id !== commentId));
      if (replyingTo?.id === commentId) setReplyingTo(null);
    } catch {
      // 간단한 액션이라 별도 에러 배너 없이, 확인 상태만 닫고 목록은 그대로 둔다.
    } finally {
      setConfirmDeleteCommentId(null);
      setIsDeletingComment(false);
    }
  };

  // 1-Depth 트리 구성: 원댓글(parent_id 없음) 순서대로, 그 아래 답글들을 작성 순서대로 붙인다.
  const rootComments = comments.filter((comment) => comment.parent_id === null);
  const repliesByParent = new Map<number, CommunityComment[]>();
  comments.forEach((comment) => {
    if (comment.parent_id === null) return;
    const list = repliesByParent.get(comment.parent_id) ?? [];
    list.push(comment);
    repliesByParent.set(comment.parent_id, list);
  });

  const renderCommentCard = (comment: CommunityComment, isReply: boolean) =>
    editingCommentId === comment.id ? (
      <div
        key={comment.id}
        className={`mb-2 rounded-lg border border-violet-400/30 bg-black/20 p-3 text-sm ${isReply ? "ml-8" : ""}`}
      >
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
      <div
        key={comment.id}
        className={`mb-2 flex items-start gap-1.5 ${isReply ? "ml-8" : ""}`}
      >
        {isReply && <span className="mt-3 shrink-0 text-sm text-slate-500">↳</span>}
        <div
          id={`comment-${comment.id}`}
          className={`flex-1 rounded-lg border p-3 text-sm transition-colors duration-500 ${
            comment.id === highlightedId ? "border-violet-400/60 bg-violet-500/15" : "border-white/[0.04] bg-black/20"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {comment.is_post_author ? (
                // 글쓴이 최우선 판별: 익명 체크 여부와 무관하게 항상 "글쓴이" 뱃지만 보여준다.
                <span className="rounded bg-purple-600 px-1.5 py-0.5 text-xs text-white">글쓴이</span>
              ) : comment.is_anonymous ? (
                <AuthorBadge isAnonymous displayName={`익명${comment.anonymous_index ?? ""}`} badge={null} size="sm" />
              ) : (
                <UserDreamProfileModal nickname={comment.author_display_name!}>
                  <AuthorBadge isAnonymous={false} displayName={comment.author_display_name} badge={comment.author_badge} size="sm" />
                </UserDreamProfileModal>
              )}
              <span className="text-xs text-slate-500">· {formatRelativeTime(comment.created_at)}</span>
            </div>
            {confirmDeleteCommentId !== comment.id && (
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                {!isReply && (
                  <button
                    type="button"
                    onClick={() => startReply(comment)}
                    className="underline-offset-2 transition-colors hover:text-violet-300 hover:underline"
                  >
                    답글
                  </button>
                )}
                {comment.is_mine && (
                  <>
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
                  </>
                )}
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
      </div>
    );

  // 입력 폼: stickyInput이면 화면 하단에 고정되는 별도 바로, 아니면 댓글 목록 바로 아래 인라인으로 렌더링된다.
  const commentForm = (
    <div className="space-y-3">
      {replyingTo && (
        <div className="flex items-center justify-between rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-1.5">
          <span className="text-[11px] text-violet-200">{replyingTo.label}님에게 답글 남기는 중...</span>
          <button
            type="button"
            onClick={cancelReply}
            aria-label="답글 취소"
            className="text-slate-400 transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
      <textarea
        value={commentText}
        onChange={(event) => setCommentText(event.target.value)}
        placeholder={replyingTo ? "답글을 남겨보세요..." : "댓글을 남겨보세요..."}
        rows={2}
        maxLength={500}
        className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex items-center justify-end gap-3">
        <label className="flex cursor-pointer items-center gap-1.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={isCommentAnonymous}
            onClick={() => setIsCommentAnonymous((prev) => !prev)}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              isCommentAnonymous ? "border-violet-400 bg-violet-500" : "border-white/25 bg-transparent"
            }`}
          >
            {isCommentAnonymous && <span className="text-[10px] leading-none text-white">✓</span>}
          </button>
          <span className="text-[11px] font-medium text-slate-300">익명</span>
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
  );

  return (
    <>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className={`mt-3 border-t border-white/[0.06] pt-3 ${stickyInput ? "pb-40" : "pb-4"}`}>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }, (_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
                  ))}
                </div>
              ) : comments.length > 0 ? (
                <div>
                  {rootComments.map((root) => (
                    <div key={root.id}>
                      {renderCommentCard(root, false)}
                      {(repliesByParent.get(root.id) ?? []).map((reply) => renderCommentCard(reply, true))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-2 text-center text-xs text-slate-500">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
              )}

              {!stickyInput && <div className="mt-2">{commentForm}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 상세 페이지 전용: 스크롤 중에도 언제든 댓글을 쓸 수 있도록 입력 폼을 화면 하단에 고정한다.
          env(safe-area-inset-bottom)로 아이폰 홈 인디케이터 여백(pb-safe)까지 챙긴다. */}
      {stickyInput && isOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 backdrop-blur-xl px-4 pt-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-2xl">{commentForm}</div>
        </div>
      )}
    </>
  );
}
