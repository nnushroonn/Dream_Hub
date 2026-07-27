"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  buildDreamOriginalContent,
  createCommunityPost,
  createDream,
  createDreamComment,
  deleteCommunityPost,
  getCommunityPosts,
  getDreamComments,
  getDreamFeed,
  getTrends,
  requestQuickAiInterpretation,
  setDreamVisibility,
  toggleDreamEmpathy,
  type AiInterpretation,
  type CommunityPost,
  type DreamFeedAiReport,
  type DreamFeedEntry,
  type Trend,
} from "@/api/dream";
import CommentSection from "@/components/CommentSection";
import DreamAnalyzerLoading from "@/components/DreamAnalyzerLoading";
import DreamGuidePanel from "@/components/DreamGuidePanel";
import DreamOriginalQuote from "@/components/DreamOriginalQuote";
import IdentitySwitch from "@/components/IdentitySwitch";
import NavBar from "@/components/NavBar";
import { MOOD_OPTIONS } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

type Tab = "dream" | "board";

function toHashtagDisplay(tag: string): string {
  return tag.startsWith("#") ? tag : `#${tag}`;
}

function formatPostTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// 익명 글은 카드 테두리에 은은한 보랏빛 오라클 광채를 둘러 일반(닉네임) 글과 시각적으로 구분한다.
// bg-white/[0.02] + backdrop-blur-md로 어두운 배경 위에서 카드가 확실한 레이어로 분리되게 한다.
function cardClass(isAnonymous: boolean): string {
  const base = "rounded-xl bg-white/[0.02] p-5 backdrop-blur-md transition-all duration-300";
  return isAnonymous
    ? `${base} border border-violet-400/25 shadow-[0_0_18px_rgba(167,139,250,0.12)] hover:border-violet-400/50 hover:shadow-[0_0_28px_rgba(167,139,250,0.22)]`
    : `${base} border border-white/[0.06] hover:border-violet-400/30 hover:shadow-[0_0_20px_rgba(167,139,250,0.12)]`;
}

function AuthorLine({ isAnonymous, displayName }: { isAnonymous: boolean; displayName: string | null }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      {isAnonymous ? (
        <>
          <span>🎭</span>
          <span className="text-violet-300/80">익명의 탐험가</span>
        </>
      ) : (
        <>
          <span className="text-slate-500">👤</span>
          <span className="text-slate-400">{displayName}</span>
        </>
      )}
    </div>
  );
}

// 🔮 AI 무의식 리포트 함께 보기: shareWithAiAnalysis가 true인 카드에서만 노출되는 아코디언.
function AiReportAccordion({ report }: { report: DreamFeedAiReport }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-xs font-medium text-purple-300 transition-colors hover:text-purple-200"
      >
        🔮 AI 무의식 리포트 함께 보기
        <span className={`inline-block transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>▾</span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-950/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-200">
                  {report.expert_badge}
                </span>
                <span className="text-xs text-violet-300/80">{report.selected_expert}의 시선</span>
              </div>
              <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-slate-300">{report.description}</p>
              <p className="mt-2.5 text-xs leading-relaxed text-slate-400">{report.expert_insight}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  const authUser = useAuthStore((state) => state.user);
  const nickname = authUser?.nickname ?? "탐험가";

  const [tab, setTab] = useState<Tab>("dream");

  const [dreams, setDreams] = useState<DreamFeedEntry[]>([]);
  const [isLoadingDreams, setIsLoadingDreams] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // 한 번에 댓글 창을 펼칠 수 있는 꿈 기록은 하나 - 다른 꿈의 댓글을 열면 이전 것은 접힌다.
  const [openDreamCommentsFor, setOpenDreamCommentsFor] = useState<number | null>(null);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  // 리스트에서 바로 삭제할 수 있는 빠른 액션 - 수정은 상세 페이지(edit=1)로 보낸다.
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<number | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);

  // 사이드바의 "지금 뜨는 꿈 상징" 위젯 - 홈 화면과 같은 실제 집계(trends.py)를 그대로 재사용한다.
  const [trends, setTrends] = useState<Trend[]>([]);

  // 자유 광장 글쓰기 모달. 기본값은 "닉네임 공개"(isAnonymous: false) - 무의식 피드가
  // 기본 익명인 것과 대비되는 자유 광장의 기본값이다. 모달을 열 때마다 다시 기본값으로 맞춘다.
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeText, setComposeText] = useState("");
  const [composeIsAnonymous, setComposeIsAnonymous] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // 🌙 내 꿈 공유하기 모달: 꿈 기록소에 저장은 해뒀지만 아직 비공개인 내 기록 중 하나를 골라
  // 커뮤니티에 공개한다. AI 재분석 없이 setDreamVisibility()로 공개 범위만 바꾼다.
  const savedDreamEntries = useSavedDreamsStore((state) => state.entries);
  const upsertSavedDreamEntry = useSavedDreamsStore((state) => state.upsertEntry);
  const myPrivateDreams = useMemo(
    () => savedDreamEntries.filter((entry) => !entry.is_public),
    [savedDreamEntries]
  );
  const [isShareDreamOpen, setIsShareDreamOpen] = useState(false);
  // 모달 안에서 "기존 기록에서 고르기" ↔ "새로 작성하기"를 오갈 수 있다 - 자유 광장처럼
  // 무의식 피드에서도 곧바로 글을 쓸 수 있게 해달라는 요청으로 추가된 탭.
  const [shareDreamMode, setShareDreamMode] = useState<"existing" | "new">("existing");
  const [shareDreamId, setShareDreamId] = useState<number | null>(null);
  const [shareDreamIsAnonymous, setShareDreamIsAnonymous] = useState(true);
  const [shareDreamWithAiReport, setShareDreamWithAiReport] = useState(false);
  // 꿈 내용과는 별개로, 공유하면서 덧붙이는 한마디(질문/자랑거리 등) - 무의식 피드 카드 상단에 노출된다.
  const [shareDreamCaption, setShareDreamCaption] = useState("");
  const [isSharingDream, setIsSharingDream] = useState(false);
  const [shareDreamError, setShareDreamError] = useState<string | null>(null);

  // "새로 작성하기" 탭 전용 상태: ⚡ 10초 미니멀 빠른 기록과 동일하게 제목+분위기+자유 서술만
  // 받아 AI 해몽을 요청하고, 결과가 오면 곧바로 공개 설정을 골라 커뮤니티에 게시한다.
  const [newDreamTitle, setNewDreamTitle] = useState("");
  const [newDreamMood, setNewDreamMood] = useState(MOOD_OPTIONS[3].emoji);
  const [newDreamText, setNewDreamText] = useState("");
  const [newDreamInterpretation, setNewDreamInterpretation] = useState<AiInterpretation | null>(null);
  const [isAnalyzingNewDream, setIsAnalyzingNewDream] = useState(false);
  const [newDreamError, setNewDreamError] = useState<string | null>(null);

  useEffect(() => {
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

  const openCompose = () => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    setComposeTitle("");
    setComposeText("");
    setComposeIsAnonymous(false);
    setPostError(null);
    setIsComposeOpen(true);
  };

  const openShareDream = () => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    setShareDreamMode("existing");
    setShareDreamId(myPrivateDreams[0]?.id ?? null);
    setShareDreamIsAnonymous(true);
    setShareDreamWithAiReport(false);
    setShareDreamCaption("");
    setShareDreamError(null);
    setNewDreamTitle("");
    setNewDreamMood(MOOD_OPTIONS[3].emoji);
    setNewDreamText("");
    setNewDreamInterpretation(null);
    setNewDreamError(null);
    setIsShareDreamOpen(true);
  };

  const handleConfirmShareDream = async () => {
    const entry = myPrivateDreams.find((item) => item.id === shareDreamId);
    if (!entry || isSharingDream) return;
    setIsSharingDream(true);
    setShareDreamError(null);
    try {
      const saved = await setDreamVisibility(entry, {
        isPublic: true,
        isAnonymous: shareDreamIsAnonymous,
        shareWithAiAnalysis: shareDreamWithAiReport,
        shareCaption: shareDreamCaption.trim(),
      });
      upsertSavedDreamEntry(saved);
      // 방금 공개한 기록이 무의식 피드에 바로 보이도록 다시 불러온다.
      getDreamFeed()
        .then(setDreams)
        .catch(() => {});
      setIsShareDreamOpen(false);
    } catch (error) {
      setShareDreamError(getAuthErrorMessage(error));
    } finally {
      setIsSharingDream(false);
    }
  };

  // "새로 작성하기" 탭: ⚡ 10초 미니멀 빠른 기록과 동일한 방식으로 AI 해몽을 먼저 받는다.
  const handleAnalyzeNewDream = async () => {
    const title = newDreamTitle.trim();
    const text = newDreamText.trim();
    if (!title || !text || isAnalyzingNewDream) return;
    setNewDreamError(null);
    setIsAnalyzingNewDream(true);
    try {
      const result = await requestQuickAiInterpretation(title, text);
      setNewDreamInterpretation(result);
    } catch (error) {
      setNewDreamError(getAuthErrorMessage(error));
    } finally {
      setIsAnalyzingNewDream(false);
    }
  };

  // 해몽 결과가 나온 뒤, 공개 설정을 골라 곧바로 공개 상태로 저장한다 (임시로 비공개 저장 후
  // 다시 공개 전환하는 두 단계를 거치지 않는다).
  const handleConfirmShareNewDream = async () => {
    if (!newDreamInterpretation || isSharingDream) return;
    const title = newDreamTitle.trim();
    const text = newDreamText.trim();
    if (!title || !text) return;

    setIsSharingDream(true);
    setShareDreamError(null);
    try {
      const survey = {
        title,
        brightness: "",
        space_depth: "",
        space_detail: "",
        identity_factor: "",
        target_detail: "",
        action_physics: "",
        action_detail: text,
        reality_link: "",
        reality_detail: "",
        vividness: 50,
        is_lucid: false,
        final_memo: "",
      };
      const created = await createDream({
        dream_date: new Date().toISOString().slice(0, 10),
        title,
        emotion: newDreamMood,
        summary: buildDreamOneLineSummary(survey),
        is_public: true,
        is_anonymous: shareDreamIsAnonymous,
        share_with_ai_analysis: shareDreamWithAiReport,
        share_caption: shareDreamCaption.trim(),
        survey,
        interpretation: newDreamInterpretation,
      });
      upsertSavedDreamEntry(created);
      getDreamFeed()
        .then(setDreams)
        .catch(() => {});
      setIsShareDreamOpen(false);
    } catch (error) {
      setShareDreamError(getAuthErrorMessage(error));
    } finally {
      setIsSharingDream(false);
    }
  };

  const handleCreatePost = async () => {
    const title = composeTitle.trim();
    const content = composeText.trim();
    if (!title || !content || isPosting) return;
    setPostError(null);
    setIsPosting(true);
    try {
      const created = await createCommunityPost(title, content, composeIsAnonymous);
      setPosts((prev) => [created, ...prev]);
      setIsComposeOpen(false);
    } catch {
      setPostError("게시에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsPosting(false);
    }
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

                <div className="flex flex-col gap-3">
                  {isLoadingDreams ? (
                    Array.from({ length: 3 }, (_, index) => (
                      <div key={index} className="h-28 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]" />
                    ))
                  ) : filteredDreams.length > 0 ? (
                    filteredDreams.map((dream) => (
                      <article key={dream.id} className={cardClass(dream.is_anonymous)}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <AuthorLine isAnonymous={dream.is_anonymous} displayName={dream.author_display_name} />
                          <span className="shrink-0 text-[11px] text-slate-500">{dream.dream_date}</span>
                        </div>
                        {dream.share_caption && (
                          <p className="mb-3 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm leading-relaxed text-violet-100">
                            💭 {dream.share_caption}
                          </p>
                        )}
                        <h3 className="truncate text-sm font-semibold text-white">
                          {dream.emotion} {dream.title}
                        </h3>
                        <div className="mt-2">
                          <DreamOriginalQuote content={buildDreamOriginalContent(dream.survey)} />
                        </div>
                        {dream.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {dream.tags.map((tag) => (
                              <span key={tag} className="text-[11px] text-violet-300/70">
                                {toHashtagDisplay(tag)}
                              </span>
                            ))}
                          </div>
                        )}

                        {dream.share_with_ai_analysis && dream.ai_report && <AiReportAccordion report={dream.ai_report} />}

                        <div className="mt-4 flex items-center gap-2">
                          <DreamReactionButton
                            isLiked={dream.is_liked_by_me}
                            count={dream.empathy_count}
                            onToggle={() => handleDreamToggle(dream.id)}
                          />
                          <button
                            type="button"
                            onClick={() => setOpenDreamCommentsFor((prev) => (prev === dream.id ? null : dream.id))}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              openDreamCommentsFor === dream.id
                                ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
                                : "border-white/10 text-slate-300 hover:border-violet-400/30 hover:text-slate-100"
                            }`}
                          >
                            💬 댓글{dream.comment_count > 0 ? ` ${dream.comment_count}` : ""}
                          </button>
                        </div>

                        <CommentSection
                          targetId={dream.id}
                          isOpen={openDreamCommentsFor === dream.id}
                          defaultAnonymous={dream.is_anonymous}
                          nickname={nickname}
                          isAuthenticated={isAuthenticated}
                          onRequireLogin={() => router.push("/login")}
                          onCommentCountChange={(count) =>
                            setDreams((prev) => prev.map((d) => (d.id === dream.id ? { ...d, comment_count: count } : d)))
                          }
                          fetchComments={getDreamComments}
                          submitComment={createDreamComment}
                        />
                      </article>
                    ))
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
                          {post.content && <p className="mt-0.5 line-clamp-1 text-sm text-slate-400">{post.content}</p>}
                          <p className="mt-1 text-[11px] text-slate-500">
                            {post.is_anonymous ? "🎭 익명의 탐험가" : `👤 ${post.author_display_name}`} · {formatPostTime(post.created_at)}
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
                          <span className="text-xs text-slate-400">✨ {post.empathy_count}</span>
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
                  onClick={openShareDream}
                  className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 font-medium text-white shadow-lg transition-all hover:from-purple-700 hover:to-indigo-700"
                >
                  🌙 내 꿈 공유하기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openCompose}
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
            </div>
          </aside>
        </div>
      </main>

      {/* 자유 광장 글쓰기 모달: CommunityPostForm - 아이덴티티 선택 시스템 포함 */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !isPosting && setIsComposeOpen(false)} />

          <div className="relative w-full max-w-md rounded-3xl border border-violet-400/30 bg-white/10 p-7 shadow-[0_0_60px_rgba(139,92,246,0.25)] backdrop-blur-2xl">
            <button
              type="button"
              onClick={() => setIsComposeOpen(false)}
              aria-label="닫기"
              className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
            >
              ✕
            </button>

            <h2 className="text-lg font-semibold text-white">✏️ 자유 광장에 글쓰기</h2>

            <div className="mt-4">
              <label className="text-xs text-indigo-300/70">어떤 이름으로 남길까요?</label>
              <div className="mt-2">
                <IdentitySwitch isAnonymous={composeIsAnonymous} onChange={setComposeIsAnonymous} nickname={nickname} />
              </div>
            </div>

            <input
              type="text"
              value={composeTitle}
              onChange={(event) => setComposeTitle(event.target.value)}
              placeholder="제목을 입력하세요"
              maxLength={200}
              autoFocus
              className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />

            <textarea
              value={composeText}
              onChange={(event) => setComposeText(event.target.value)}
              placeholder="자유롭게 이야기를 나눠보세요..."
              rows={4}
              maxLength={1000}
              className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />
            {postError && <p className="mt-2 text-xs text-red-300">{postError}</p>}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleCreatePost}
                disabled={!composeTitle.trim() || !composeText.trim() || isPosting}
                className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPosting ? "게시 중..." : "게시하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌙 내 꿈 공유하기 모달: 꿈 기록소에 이미 저장해 둔 비공개 기록 중 하나를 골라 무의식 피드에
          공개한다. AI는 재분석하지 않고 공개 범위만 바꾼다 - 작성 시점이 아니라 이렇게 나중에,
          원하는 기록만 골라 공개할 수 있게 하기 위함. */}
      {isShareDreamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !isSharingDream && setIsShareDreamOpen(false)} />

          <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-violet-400/30 bg-white/10 p-7 shadow-[0_0_60px_rgba(139,92,246,0.25)] backdrop-blur-2xl">
            <button
              type="button"
              onClick={() => setIsShareDreamOpen(false)}
              aria-label="닫기"
              className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
            >
              ✕
            </button>

            <h2 className="text-lg font-semibold text-white">🌙 내 꿈 공유하기</h2>

            {/* 기존 기록에서 고르기 ↔ 새로 작성하기 */}
            <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5">
              <button
                type="button"
                onClick={() => setShareDreamMode("existing")}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 ${
                  shareDreamMode === "existing" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                기존 기록에서 고르기
              </button>
              <button
                type="button"
                onClick={() => setShareDreamMode("new")}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 ${
                  shareDreamMode === "new" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ✏️ 새로 작성하기
              </button>
            </div>

            {shareDreamMode === "existing" ? (
              myPrivateDreams.length === 0 ? (
                <p className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-xs leading-relaxed text-slate-400">
                  아직 공유할 수 있는 비공개 기록이 없어요.
                  <br />
                  꿈 기록소에서 먼저 꿈을 기록해 보세요.
                </p>
              ) : (
                <>
                  <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                    {myPrivateDreams.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setShareDreamId(entry.id)}
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                          shareDreamId === entry.id
                            ? "border-violet-400/70 bg-violet-500/15 text-white"
                            : "border-white/10 bg-white/5 text-slate-300 hover:border-violet-400/30"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {entry.emotion} {entry.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-500">{entry.dream_date}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4">
                    <label className="text-xs text-indigo-300/70">어떤 이름으로 공개할까요?</label>
                    <div className="mt-2">
                      <IdentitySwitch isAnonymous={shareDreamIsAnonymous} onChange={setShareDreamIsAnonymous} nickname={nickname} />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="text-xs text-indigo-300/70">이 꿈과 함께 남길 말 (질문이나 자랑거리 등, 선택)</label>
                    <textarea
                      value={shareDreamCaption}
                      onChange={(event) => setShareDreamCaption(event.target.value)}
                      placeholder="예: 이런 꿈 꿔본 사람 있나요? / 오랜만에 좋은 꿈 꿨어요 ✨"
                      rows={2}
                      maxLength={300}
                      className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
                    />
                  </div>

                  <label className="mt-4 flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-xs leading-relaxed text-slate-300">체크 시 AI 해몽 결과도 피드에 함께 공개합니다</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={shareDreamWithAiReport}
                      onClick={() => setShareDreamWithAiReport((prev) => !prev)}
                      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                        shareDreamWithAiReport ? "bg-violet-500" : "bg-white/15"
                      }`}
                    >
                      <span
                        className={`ml-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                          shareDreamWithAiReport ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </label>

                  {shareDreamError && <p className="mt-3 text-xs text-red-300">{shareDreamError}</p>}

                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={handleConfirmShareDream}
                      disabled={!shareDreamId || isSharingDream}
                      className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSharingDream ? "공개하는 중..." : "🌐 커뮤니티에 공개하기"}
                    </button>
                  </div>
                </>
              )
            ) : isAnalyzingNewDream ? (
              <div className="mt-5">
                <DreamAnalyzerLoading />
              </div>
            ) : !newDreamInterpretation ? (
              <>
                <div className="mt-4">
                  <label className="text-xs text-indigo-300/70">오늘의 꿈 제목</label>
                  <input
                    type="text"
                    value={newDreamTitle}
                    onChange={(event) => setNewDreamTitle(event.target.value)}
                    placeholder="예: 황금 고래와 함께한 하늘 비행"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-slate-500/80 focus:border-violet-400/60 focus:outline-none"
                  />
                </div>

                <div className="mt-4">
                  <label className="text-xs text-indigo-300/70">꿈의 분위기</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MOOD_OPTIONS.map((option) => (
                      <button
                        key={option.emoji}
                        type="button"
                        onClick={() => setNewDreamMood(option.emoji)}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs backdrop-blur-md transition-all duration-200 ${
                          newDreamMood === option.emoji
                            ? "border-violet-400/70 bg-violet-500/25 text-white"
                            : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/30 hover:text-slate-200"
                        }`}
                      >
                        <span className="text-sm">{option.emoji}</span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-xs text-indigo-300/70">지난밤 꾼 꿈을 자유롭게 적어주세요</label>
                  <div className="mt-1.5">
                    <DreamGuidePanel />
                  </div>
                  <textarea
                    value={newDreamText}
                    onChange={(event) => setNewDreamText(event.target.value)}
                    placeholder="위 가이드를 참고하여 자유롭게 적어보세요..."
                    rows={5}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-slate-500/60 focus:border-violet-400/60 focus:outline-none"
                  />
                </div>

                {newDreamError && <p className="mt-3 text-xs text-red-300">{newDreamError}</p>}

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAnalyzeNewDream}
                    disabled={!newDreamTitle.trim() || !newDreamText.trim() || isAnalyzingNewDream}
                    className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isAnalyzingNewDream ? "해몽 받는 중..." : "🔮 AI 해몽 받기"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-relaxed text-slate-300">
                  <p className="font-medium text-white">
                    {newDreamMood} {newDreamTitle}
                  </p>
                  <p className="mt-1 text-slate-400">{newDreamInterpretation.description}</p>
                </div>

                <div className="mt-4">
                  <label className="text-xs text-indigo-300/70">어떤 이름으로 공개할까요?</label>
                  <div className="mt-2">
                    <IdentitySwitch isAnonymous={shareDreamIsAnonymous} onChange={setShareDreamIsAnonymous} nickname={nickname} />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-xs text-indigo-300/70">이 꿈과 함께 남길 말 (질문이나 자랑거리 등, 선택)</label>
                  <textarea
                    value={shareDreamCaption}
                    onChange={(event) => setShareDreamCaption(event.target.value)}
                    placeholder="예: 이런 꿈 꿔본 사람 있나요? / 오랜만에 좋은 꿈 꿨어요 ✨"
                    rows={2}
                    maxLength={300}
                    className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
                  />
                </div>

                <label className="mt-4 flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-xs leading-relaxed text-slate-300">체크 시 AI 해몽 결과도 피드에 함께 공개합니다</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={shareDreamWithAiReport}
                    onClick={() => setShareDreamWithAiReport((prev) => !prev)}
                    className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                      shareDreamWithAiReport ? "bg-violet-500" : "bg-white/15"
                    }`}
                  >
                    <span
                      className={`ml-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                        shareDreamWithAiReport ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>

                {shareDreamError && <p className="mt-3 text-xs text-red-300">{shareDreamError}</p>}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNewDreamInterpretation(null)}
                    disabled={isSharingDream}
                    className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-violet-400/40 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    다시 쓰기
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmShareNewDream}
                    disabled={isSharingDream}
                    className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSharingDream ? "공개하는 중..." : "🌐 커뮤니티에 공개하기"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
