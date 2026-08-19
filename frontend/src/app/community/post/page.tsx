"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getAuthErrorMessage } from "@/api/auth";
import {
  createDreamComment,
  deleteDreamComment,
  dreamDisplayTitle,
  getDreamComments,
  getPublicDream,
  POST_EDIT_WINDOW_MS,
  setDreamVisibility,
  updateDreamComment,
  voteOnDream,
  type DreamEntryRecord,
} from "@/api/dream";
import AttachedDreamViewer from "@/components/AttachedDreamViewer";
import AuthorBadge from "@/components/AuthorBadge";
import CommentSection from "@/components/CommentSection";
import FlowerIcon from "@/components/FlowerIcon";
import IdentitySwitch from "@/components/IdentitySwitch";
import NavBar from "@/components/NavBar";
import VoteButtons from "@/components/VoteButtons";
import { consumeBackNavOrigin } from "@/lib/communityBackNav";
import { rarityStars } from "@/lib/flowerRarity";
import { flowerLanguageFor } from "@/lib/flowerTaxonomy";
import { useAuthStore } from "@/store/useAuthStore";
import { useLoginModalStore } from "@/store/useLoginModalStore";

// 홈 화면 우측 하단 실시간 토스트(LiveTicker)를 클릭했을 때 도착하는 익명 공개 상세 페이지.
// 이 프로젝트는 Cloudflare Pages 정적 export(next.config.mjs output: "export")라 [id] 같은
// 동적 경로 세그먼트를 쓸 수 없다 (빌드 시점에 미래에 생길 id를 알 수 없어 generateStaticParams가
// 불가능) - 그래서 사전 검색(/dictionary?search=)과 동일하게 쿼리 파라미터(?id=)로 넘긴다.
// 로그인 여부와 무관하게 누구나 볼 수 있다. 레이아웃은 위에서부터 (1) 유저가 직접 쓴 사담
// (share_caption) (2) AttachedDreamViewer로 감싼 첨부 꿈 데이터 (3) 투표+댓글 순으로 시선을
// 유도한다 - 사담을 먼저 읽게 해 "무슨 얘기지?" 호기심이 생긴 뒤에 꿈 데이터를 만나게 한다.
export default function CommunityPostPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUser = useAuthStore((state) => state.user);
  const nickname = authUser?.nickname ?? "탐험가";
  const openLoginModal = useLoginModalStore((state) => state.open);

  const [entry, setEntry] = useState<DreamEntryRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editIsAnonymous, setEditIsAnonymous] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // 무의식 광장의 "삭제"는 꿈 기록소(/diary) 원본까지 지우지 않는다 - 공개를 취소해
  // 커뮤니티에서만 사라지게 한다(is_public=false).
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 알림 드롭다운에서 댓글 항목을 눌러 들어오면 ?highlightComment=로 대상 댓글 id가 붙는다.
  const [highlightCommentId, setHighlightCommentId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));
    // 리스트의 "✏️ 수정" 링크가 ?edit=1을 붙여 보내면, 상세를 읽기 모드로 먼저 보여주지 않고
    // 곧바로 편집 폼을 연다.
    const wantsEdit = params.get("edit") === "1";
    const highlightComment = Number(params.get("highlightComment"));
    if (Number.isFinite(highlightComment) && highlightComment > 0) {
      setHighlightCommentId(highlightComment);
    }
    if (!Number.isFinite(id) || id <= 0) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }
    getPublicDream(id)
      .then((data) => {
        setEntry(data);
        if (wantsEdit && data.is_mine && Date.now() - new Date(data.created_at).getTime() < POST_EDIT_WINDOW_MS) {
          setEditTitle(dreamDisplayTitle(data));
          setEditCaption(data.share_caption ?? "");
          setEditIsAnonymous(data.is_anonymous);
          setIsEditing(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 목록에서 태그 필터를 걸어두고 들어온 경우, 고정 경로로 다시 이동하면 필터/스크롤 위치가
  // 초기화된다. 실제로 리스트에서 넘어온 경우에만 history.back()으로 같은 목록 인스턴스에
  // 되돌아가고, 알림/공유 링크로 곧장 들어와 되돌아갈 목록 히스토리가 없으면 고정 경로로 보낸다.
  const handleBack = () => {
    if (consumeBackNavOrigin("list")) {
      router.back();
    } else {
      router.push("/community?tab=dream");
    }
  };

  // 인증 확인 없이 곧장 투표를 실행하는 부분 - handleVote(게이트)와 로그인 모달의 onSuccess
  // 복귀 콜백이 공유한다. onSuccess 시점엔 handleVote의 예전 클로저를 다시 부르면 isAuthenticated가
  // 그 순간의 stale 값(false)에 갇혀 다시 로그인 모달을 띄우는 문제가 생기므로 분리해 둔다.
  const performVote = async (voteType: "up" | "down") => {
    if (!entry || entry.is_mine) return;
    const previous = entry;
    setEntry((prev) => {
      if (!prev) return prev;
      let upvote_count = prev.upvote_count;
      let downvote_count = prev.downvote_count;
      if (prev.my_vote === "up") upvote_count -= 1;
      if (prev.my_vote === "down") downvote_count -= 1;
      const my_vote = prev.my_vote === voteType ? null : voteType;
      if (my_vote === "up") upvote_count += 1;
      if (my_vote === "down") downvote_count += 1;
      return { ...prev, my_vote, upvote_count, downvote_count };
    });
    try {
      const result = await voteOnDream(entry.id, voteType);
      setEntry((prev) => (prev ? { ...prev, ...result } : prev));
    } catch {
      setEntry(previous);
    }
  };

  const handleVote = (voteType: "up" | "down") => {
    if (!entry || entry.is_mine) return;
    if (!isAuthenticated) {
      openLoginModal({ triggerSource: "community", onSuccess: () => performVote(voteType) });
      return;
    }
    void performVote(voteType);
  };

  const startEdit = () => {
    if (!entry) return;
    setEditTitle(dreamDisplayTitle(entry));
    setEditCaption(entry.share_caption ?? "");
    setEditIsAnonymous(entry.is_anonymous);
    setEditError(null);
    setIsEditing(true);
  };

  // 제목/사담/공개 아이덴티티만 고쳐 쓴다 - 꿈의 구조화된 원문(survey)과 AI 해몽(interpretation)은
  // 이 편집 폼의 대상이 아니라 손대지 않고 그대로 보존한다(setDreamVisibility가 내부적으로 함께
  // 처리해 준다).
  const saveEdit = async () => {
    if (!entry || isSaving) return;
    const title = editTitle.trim();
    if (!title) return;
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await setDreamVisibility(entry, {
        isPublic: true,
        isAnonymous: editIsAnonymous,
        shareWithAiAnalysis: entry.share_with_ai_analysis,
        shareCaption: editCaption.trim(),
        publicTitle: title,
      });
      setEntry(updated);
      setIsEditing(false);
    } catch (error) {
      setEditError(getAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  // 자유 광장의 "삭제"와 달리 꿈 기록소(/diary) 원본은 지우지 않는다 - 공개만 취소해
  // 무의식 광장에서 사라지게 한다. 성공하면 더 이상 공개 상세로 조회되지 않으므로 목록으로 보낸다.
  const handleDelete = async () => {
    if (!entry || isDeleting) return;
    setIsDeleting(true);
    try {
      await setDreamVisibility(entry, {
        isPublic: false,
        isAnonymous: entry.is_anonymous,
        shareWithAiAnalysis: entry.share_with_ai_analysis,
        shareCaption: entry.share_caption ?? undefined,
      });
      router.push("/community?tab=dream");
    } catch {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-2xl px-6 py-16">
        <button
          type="button"
          onClick={handleBack}
          className="text-xs text-violet-300/70 underline-offset-2 hover:text-violet-200 hover:underline"
        >
          ← 꿈 게시판으로 돌아가기
        </button>
        <div className="mt-3">
          <span className="rounded-full border border-purple-800/50 bg-purple-950/40 px-2.5 py-1 text-xs font-medium text-purple-300">
            🔮 꿈 게시판
          </span>
        </div>

        {isLoading ? (
          <div className="mt-6 animate-pulse rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="mx-auto h-6 w-2/3 rounded-full bg-white/10" />
            <div className="mt-6 h-3 w-full rounded-full bg-white/10" />
            <div className="mt-3 h-3 w-5/6 rounded-full bg-white/10" />
          </div>
        ) : notFound || !entry ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-sm text-slate-300">이 꿈 기록을 찾을 수 없어요.</p>
            <p className="mt-1.5 text-xs text-slate-500">삭제되었거나, 더 이상 공개 상태가 아닌 것 같아요.</p>
            <Link
              href="/community?tab=dream"
              className="mt-5 inline-block rounded-full border border-violet-400/40 bg-violet-500/15 px-5 py-2 text-xs text-violet-200 transition-colors hover:border-violet-300/60 hover:text-white"
            >
              꿈 게시판으로 이동
            </Link>
          </div>
        ) : (
          <div className="relative mt-6 rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.2)] backdrop-blur-2xl">
            {isEditing ? (
              <div>
                <label className="text-xs text-indigo-300/70">어떤 이름으로 공개할까요?</label>
                <div className="mt-2">
                  <IdentitySwitch isAnonymous={editIsAnonymous} onChange={setEditIsAnonymous} nickname={nickname} />
                </div>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  maxLength={200}
                  className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-lg font-bold text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
                />
                <textarea
                  value={editCaption}
                  onChange={(event) => setEditCaption(event.target.value)}
                  rows={6}
                  maxLength={1000}
                  placeholder="꿈에 대한 질문이나 재미있는 썰을 자유롭게 풀어보세요"
                  className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
                />
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
                    disabled={!editTitle.trim() || isSaving}
                    className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? "저장 중..." : "저장하기"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Top: 작성자/작성일 + 유저가 직접 쓴 본문(사담). whitespace-pre-wrap으로 줄바꿈·공백을
                    원본 그대로 보존해, 자유 광장 글쓰기와 동일한 "낚시글" 표현도 여기서 그대로 동작한다. */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs tracking-widest text-indigo-300/70">
                      <AuthorBadge isAnonymous={entry.is_anonymous} displayName={entry.author_display_name} badge={entry.author_badge} />
                    </div>
                    <h1 className="mt-1 text-2xl font-semibold text-white">
                      {entry.emotion} {dreamDisplayTitle(entry)}
                    </h1>
                  </div>
                  {entry.is_mine && !confirmDelete && (
                    <div className="flex shrink-0 items-center gap-2 pt-1 text-[11px]">
                      {/* 자유 게시판과 동일하게(POST_EDIT_WINDOW_MS), 게시 후 10분이 지나면
                          서버(update_dream)가 403으로 거절하므로 프론트도 버튼 자체를 미리 숨긴다. */}
                      {Date.now() - new Date(entry.created_at).getTime() < POST_EDIT_WINDOW_MS && (
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
                  {/* 부적절한 콘텐츠 신고 - 실제 처리 로직은 아직 없고, 우선 UI만 배치한다. */}
                  {!entry.is_mine && (
                    <button
                      type="button"
                      onClick={() => window.alert("신고가 접수되었습니다. 빠르게 검토할게요.")}
                      className="shrink-0 pt-1 text-[11px] text-slate-500 underline-offset-2 transition-colors hover:text-red-300 hover:underline"
                    >
                      🚨 신고하기
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {entry.dream_date} · 조회 {entry.view_count.toLocaleString()}
                </p>

                {confirmDelete && (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-2.5">
                    <span className="text-xs text-red-200">
                      공개를 취소할까요? 꿈 기록소의 원본은 그대로 남고, 꿈 게시판에서만 사라져요.
                    </span>
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
                        {isDeleting ? "전환 중..." : "네, 비공개로 전환할게요"}
                      </button>
                    </div>
                  </div>
                )}

                {/* 공백만 있는 사담(예: 엔터만 몇 번 친 경우)까지 걸러내야 빈 여백만 남는 걸 막을 수
                    있어, 단순 truthy 체크가 아니라 trim() 결과로 존재 여부를 판단한다. */}
                {entry.share_caption?.trim() && (
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{entry.share_caption}</p>
                )}

                {/* Middle: "꽃" 콘텐츠 타입이면 정원 꽃 카드를, 아니면 기존처럼 첨부된 꿈 데이터
                    (원문/태그/AI 해몽/행운/상담 리포트)를 "첨부 파일"처럼 보이는 카드에 담는다.
                    꽃 공유 글은 survey가 스키마를 채우기 위한 빈 더미라 AttachedDreamViewer로
                    보여줄 실질 내용이 없다. */}
                {entry.attached_flower ? (
                  <div
                    className={`mt-4 flex flex-col items-center gap-2 rounded-2xl border p-6 text-center ${
                      entry.attached_flower.is_legendary
                        ? "border-amber-400/50 bg-amber-500/[0.04]"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-400">
                      도감 No.{String(entry.attached_flower.dex_number).padStart(3, "0")}
                    </span>
                    <span className="mt-1 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
                      <FlowerIcon
                        archetype={entry.attached_flower.archetype}
                        genus={entry.attached_flower.genus}
                        speciesName={entry.attached_flower.species_name}
                        isLegendary={entry.attached_flower.is_legendary}
                        sizePx={56}
                      />
                    </span>
                    <p className="mt-1 text-base font-semibold text-white">{entry.attached_flower.flower_name}</p>
                    <p className="text-xs text-amber-300">{rarityStars(entry.attached_flower.rarity)}</p>
                    <p className="mt-2 max-w-xs font-serif text-sm leading-relaxed text-slate-300">
                      {flowerLanguageFor(entry.attached_flower)}
                    </p>
                  </div>
                ) : (
                  <AttachedDreamViewer
                    id={entry.id}
                    survey={entry.survey}
                    summary={entry.summary}
                    tags={entry.tags}
                  />
                )}
              </>
            )}

            {!isEditing && (
              <>
                {/* Bottom: 👍/👎 투표(중앙 정렬) + 하이브리드 익명 댓글. */}
                <div className="border-t border-white/[0.06] pt-5">
                  <VoteButtons
                    myVote={entry.my_vote}
                    upvoteCount={entry.upvote_count}
                    downvoteCount={entry.downvote_count}
                    onVote={handleVote}
                    disabled={entry.is_mine}
                  />
                </div>

                {/* 💬 댓글: 이 꿈에 대해 다른 탐험가들과 이야기를 나눌 수 있는 자리 - 페이지 성격상
                    토글 없이 항상 펼쳐 둔다. CommentSection 자체가 위쪽 구분선을 이미 그려준다. */}
                <div className="mt-6">
                  <p className="text-sm font-semibold text-white">💬 댓글</p>
                  <CommentSection
                    targetId={entry.id}
                    isOpen
                    defaultAnonymous={entry.is_anonymous}
                    nickname={nickname}
                    isAuthenticated={isAuthenticated}
                    onRequireLogin={() => openLoginModal({ triggerSource: "community" })}
                    fetchComments={getDreamComments}
                    submitComment={createDreamComment}
                    updateComment={updateDreamComment}
                    deleteComment={deleteDreamComment}
                    stickyInput
                    highlightCommentId={highlightCommentId}
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
