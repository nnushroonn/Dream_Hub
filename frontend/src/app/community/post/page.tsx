"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createDreamComment,
  deleteDreamComment,
  getDreamComments,
  getPublicDream,
  updateDreamComment,
  voteOnDream,
  type DreamEntryRecord,
} from "@/api/dream";
import AttachedDreamViewer from "@/components/AttachedDreamViewer";
import CommentSection from "@/components/CommentSection";
import NavBar from "@/components/NavBar";
import VoteButtons from "@/components/VoteButtons";
import { useAuthStore } from "@/store/useAuthStore";

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

  const [entry, setEntry] = useState<DreamEntryRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 알림 드롭다운에서 댓글 항목을 눌러 들어오면 ?highlightComment=로 대상 댓글 id가 붙는다.
  const [highlightCommentId, setHighlightCommentId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));
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
      .then(setEntry)
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVote = async (voteType: "up" | "down") => {
    if (!entry) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
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

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/community" className="text-xs text-violet-300/70 underline-offset-2 hover:text-violet-200 hover:underline">
          ← 커뮤니티로 돌아가기
        </Link>

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
              href="/community"
              className="mt-5 inline-block rounded-full border border-violet-400/40 bg-violet-500/15 px-5 py-2 text-xs text-violet-200 transition-colors hover:border-violet-300/60 hover:text-white"
            >
              커뮤니티로 이동
            </Link>
          </div>
        ) : (
          <div className="relative mt-6 rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.2)] backdrop-blur-2xl">
            {/* Top: 작성자/작성일 + 유저가 직접 쓴 본문(사담). whitespace-pre-wrap으로 줄바꿈·공백을
                원본 그대로 보존해, 자유 광장 글쓰기와 동일한 "낚시글" 표현도 여기서 그대로 동작한다. */}
            <p className="text-xs tracking-widest text-indigo-300/70">
              {entry.is_anonymous ? "🎭 익명의 탐험가" : `👤 ${entry.author_display_name}`}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white">
              {entry.emotion} {entry.title}
            </h1>
            <p className="mt-1 text-xs text-slate-500">{entry.dream_date}</p>

            {/* 공백만 있는 사담(예: 엔터만 몇 번 친 경우)까지 걸러내야 빈 여백만 남는 걸 막을 수
                있어, 단순 truthy 체크가 아니라 trim() 결과로 존재 여부를 판단한다. */}
            {entry.share_caption?.trim() && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{entry.share_caption}</p>
            )}

            {/* Middle: 첨부된 꿈 데이터(원문/태그/AI 해몽/행운/상담 리포트) - 위 본문과 뚜렷이
                구분되는 카드 안에 담아 "첨부 파일"처럼 보이게 한다. */}
            <AttachedDreamViewer
              id={entry.id}
              survey={entry.survey}
              summary={entry.summary}
              tags={entry.interpretation?.tags ?? []}
            />

            {/* Bottom: 👍/👎 투표(중앙 정렬) + 하이브리드 익명 댓글. */}
            <div className="border-t border-white/[0.06] pt-5">
              <VoteButtons
                myVote={entry.my_vote}
                upvoteCount={entry.upvote_count}
                downvoteCount={entry.downvote_count}
                onVote={handleVote}
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
                onRequireLogin={() => router.push("/login")}
                fetchComments={getDreamComments}
                submitComment={createDreamComment}
                updateComment={updateDreamComment}
                deleteComment={deleteDreamComment}
                stickyInput
                highlightCommentId={highlightCommentId}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
