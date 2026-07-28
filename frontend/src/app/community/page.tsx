"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, X } from "lucide-react";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  buildDreamOriginalContent,
  createCommunityPost,
  createDream,
  deleteCommunityPost,
  getCommunityPosts,
  getDreamFeed,
  getTrends,
  requestQuickAiInterpretation,
  setDreamVisibility,
  type AiInterpretation,
  type CommunityPost,
  type DreamFeedEntry,
  type Trend,
} from "@/api/dream";
import DreamAnalyzerLoading from "@/components/DreamAnalyzerLoading";
import IdentitySwitch from "@/components/IdentitySwitch";
import NavBar from "@/components/NavBar";
import SidebarBestList from "@/components/SidebarBestList";
import { MOOD_OPTIONS } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

type Tab = "dream" | "board";

const POST_TITLE_MAX_LENGTH = 200;
const POST_CONTENT_MAX_LENGTH = 1000;
const MAX_COMPOSE_IMAGES = 3;

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
  const authUser = useAuthStore((state) => state.user);
  const nickname = authUser?.nickname ?? "탐험가";

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

  // 자유 광장 글쓰기 모달. 기본값은 "닉네임 공개"(isAnonymous: false) - 무의식 피드가
  // 기본 익명인 것과 대비되는 자유 광장의 기본값이다. 모달을 열 때마다 다시 기본값으로 맞춘다.
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeText, setComposeText] = useState("");
  const [composeIsAnonymous, setComposeIsAnonymous] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  // 짤 첨부 - 실제 업로드 연동 전, 선택/미리보기/삭제 UI만 먼저 구현한다.
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const composeFileInputRef = useRef<HTMLInputElement>(null);

  // 🌙 내 꿈 공유하기 모달: 꿈 기록소에 저장은 해뒀지만 아직 비공개인 내 기록 중 하나를 골라
  // 커뮤니티에 공개한다. AI 재분석 없이 setDreamVisibility()로 공개 범위만 바꾼다.
  const savedDreamEntries = useSavedDreamsStore((state) => state.entries);
  const upsertSavedDreamEntry = useSavedDreamsStore((state) => state.upsertEntry);
  const myPrivateDreams = useMemo(
    () => savedDreamEntries.filter((entry) => !entry.is_public),
    [savedDreamEntries]
  );
  const [isShareDreamOpen, setIsShareDreamOpen] = useState(false);
  // 모달 안에서 "기존 꿈 불러오기" ↔ "직접 쓰기"를 오갈 수 있다 - 자유 광장 글쓰기처럼
  // 무의식 피드에서도 곧바로 글을 쓸 수 있게 해달라는 요청으로 추가된 투트랙 첨부 방식.
  const [attachmentMode, setAttachmentMode] = useState<"load" | "write">("load");
  const [shareDreamId, setShareDreamId] = useState<number | null>(null);
  // 자유 광장과 완전히 동일한 필드 구성(제목+본문) - 두 모드가 함께 쓴다. 제목은 커뮤니티
  // 리스트 뷰에 노출되는 메인 텍스트가 되고(공유 시점에 다시 지어도 된다), 본문(사담)은
  // 무의식 피드 상세 페이지 상단에 유저가 직접 쓴 말로 노출된다.
  const [shareDreamTitle, setShareDreamTitle] = useState("");
  const [shareDreamCaption, setShareDreamCaption] = useState("");
  // 자유 광장과 마찬가지로 기본값은 닉네임 공개(false) - 하이브리드 익명 뱃지 시스템 도입 이후
  // 두 모드의 기본 아이덴티티를 통일했다.
  const [shareDreamIsAnonymous, setShareDreamIsAnonymous] = useState(false);
  const [shareDreamWithAiReport, setShareDreamWithAiReport] = useState(false);
  const [isSharingDream, setIsSharingDream] = useState(false);
  const [shareDreamError, setShareDreamError] = useState<string | null>(null);

  // attachmentMode === "write" 전용 상태: 감정 이모지 + 직접 쓴 꿈 내용. AI 해몽은
  // shareDreamWithAiReport 토글이 켜져 있을 때만 제출 시점에 한 번 호출한다(선택적 처리).
  const [newDreamMood, setNewDreamMood] = useState(MOOD_OPTIONS[3].emoji);
  const [newDreamContent, setNewDreamContent] = useState("");
  const [isAnalyzingNewDream, setIsAnalyzingNewDream] = useState(false);

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
    setSelectedImages([]);
    setIsComposeOpen(true);
  };

  // X 버튼/백드롭 클릭 시 곧바로 닫지 않고, 작성 중인 내용(제목/본문/첨부 이미지)이 있으면
  // 확인을 한 번 받는다 - 실수로 작성 중이던 글을 날리는 사고를 막는다.
  const handleCloseCompose = () => {
    if (isPosting) return;
    const hasUnsavedChanges =
      composeTitle.trim().length > 0 || composeText.trim().length > 0 || selectedImages.length > 0;
    if (hasUnsavedChanges && !window.confirm("작성 중인 글이 있습니다. 작성을 취소하시겠습니까?")) {
      return;
    }
    setIsComposeOpen(false);
    setComposeTitle("");
    setComposeText("");
    setComposeIsAnonymous(false);
    setPostError(null);
    setSelectedImages([]);
  };

  const handleSelectImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // 같은 파일을 다시 골라도 onChange가 다시 발화하도록 input 값 자체를 비운다.
    event.target.value = "";
    if (files.length === 0) return;
    setSelectedImages((prev) => {
      const remaining = MAX_COMPOSE_IMAGES - prev.length;
      if (remaining <= 0 || files.length > remaining) {
        window.alert(`이미지는 최대 ${MAX_COMPOSE_IMAGES}장까지 첨부할 수 있습니다.`);
      }
      if (remaining <= 0) return prev;
      return [...prev, ...files.slice(0, remaining)];
    });
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // 각 File을 미리보기용 blob URL로 바꾼다 - selectedImages가 바뀔 때마다 새로 만들고,
  // 이전 URL은 정리(revoke)해 메모리 누수를 막는다.
  const imagePreviewUrls = useMemo(() => selectedImages.map((file) => URL.createObjectURL(file)), [selectedImages]);
  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviewUrls]);

  const openShareDream = () => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    setAttachmentMode("load");
    const firstDream = myPrivateDreams[0];
    setShareDreamId(firstDream?.id ?? null);
    setShareDreamTitle(firstDream?.title ?? "");
    setShareDreamIsAnonymous(false);
    setShareDreamWithAiReport(false);
    setShareDreamCaption("");
    setShareDreamError(null);
    setNewDreamMood(MOOD_OPTIONS[3].emoji);
    setNewDreamContent("");
    setIsShareDreamOpen(true);
  };

  // attachmentMode === "load": 이미 저장된 비공개 기록을 골라 공개로 전환한다 (AI 재분석 없음).
  // 제목은 이 자리에서 다시 지어도 되므로 shareDreamTitle을 함께 실어 보낸다.
  const handleConfirmShareDream = async () => {
    const entry = myPrivateDreams.find((item) => item.id === shareDreamId);
    const title = shareDreamTitle.trim();
    if (!entry || !title || isSharingDream) return;
    setIsSharingDream(true);
    setShareDreamError(null);
    try {
      const saved = await setDreamVisibility(entry, {
        isPublic: true,
        isAnonymous: shareDreamIsAnonymous,
        shareWithAiAnalysis: shareDreamWithAiReport,
        shareCaption: shareDreamCaption.trim(),
        title,
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

  // attachmentMode === "write": AI 해몽은 shareDreamWithAiReport 토글이 켜져 있을 때만 제출
  // 시점에 한 번 요청한다 - 꺼져 있으면 AI 호출 자체를 건너뛰고 곧바로 게시해 대기 시간을 없앤다.
  const handleConfirmShareWrite = async () => {
    const title = shareDreamTitle.trim();
    const content = newDreamContent.trim();
    if (!title || !content || isSharingDream || isAnalyzingNewDream) return;

    setShareDreamError(null);

    let interpretation: AiInterpretation | null = null;
    if (shareDreamWithAiReport) {
      setIsAnalyzingNewDream(true);
      try {
        interpretation = await requestQuickAiInterpretation(title, content);
      } catch (error) {
        setIsAnalyzingNewDream(false);
        setShareDreamError(getAuthErrorMessage(error));
        return;
      }
      setIsAnalyzingNewDream(false);
    }

    setIsSharingDream(true);
    try {
      const survey = {
        title,
        brightness: "",
        space_depth: "",
        space_detail: "",
        identity_factor: "",
        target_detail: "",
        action_physics: "",
        action_detail: content,
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
        // AI 해몽을 건너뛴 경우(interpretation === null) 공개할 해몽 결과 자체가 없으므로
        // 토글 값과 무관하게 항상 false로 보낸다 - 백엔드도 동일한 불변식을 강제한다.
        share_with_ai_analysis: interpretation !== null && shareDreamWithAiReport,
        share_caption: shareDreamCaption.trim(),
        survey,
        interpretation,
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

  const handleSubmitShareDream = () => {
    if (attachmentMode === "load") {
      handleConfirmShareDream();
    } else {
      handleConfirmShareWrite();
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
      setSelectedImages([]);
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

              <SidebarBestList />
            </div>
          </aside>
        </div>
      </main>

      {/* 자유 광장 글쓰기 모달: CommunityPostForm - 아이덴티티 선택 시스템 포함 */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleCloseCompose} />

          <div className="relative w-full max-w-md rounded-3xl border border-violet-400/30 bg-white/10 p-7 shadow-[0_0_60px_rgba(139,92,246,0.25)] backdrop-blur-2xl">
            <button
              type="button"
              onClick={handleCloseCompose}
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
              maxLength={POST_TITLE_MAX_LENGTH}
              autoFocus
              className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />
            <div className="mt-1 flex justify-end">
              <span className={`text-xs ${composeTitle.length >= POST_TITLE_MAX_LENGTH ? "text-red-500" : "text-slate-500"}`}>
                {composeTitle.length}/{POST_TITLE_MAX_LENGTH}
              </span>
            </div>

            <textarea
              value={composeText}
              onChange={(event) => setComposeText(event.target.value)}
              placeholder="자유롭게 이야기를 나눠보세요..."
              rows={4}
              maxLength={POST_CONTENT_MAX_LENGTH}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />
            <div className="mt-1 flex justify-end">
              <span className={`text-xs ${composeText.length >= POST_CONTENT_MAX_LENGTH ? "text-red-500" : "text-slate-500"}`}>
                {composeText.length}/{POST_CONTENT_MAX_LENGTH}
              </span>
            </div>

            {/* 짤 첨부: textarea 하단 좌측에 아이콘 버튼 + 첨부 매수 표시. 실제 input은 숨기고
                버튼 클릭 시 ref로 클릭 이벤트를 위임한다. */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => composeFileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-violet-400/40 hover:text-violet-200"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                이미지
              </button>
              <span className="text-xs text-slate-500">
                ({selectedImages.length}/{MAX_COMPOSE_IMAGES})
              </span>
              <input
                ref={composeFileInputRef}
                type="file"
                accept="image/jpeg, image/png, image/gif"
                multiple
                hidden
                onChange={handleSelectImages}
              />
            </div>

            {selectedImages.length > 0 && (
              <div className="mt-2 flex flex-row gap-2 overflow-x-auto pb-1">
                {selectedImages.map((file, index) => (
                  <div key={index} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10">
                    {/* blob URL 미리보기라 next/image 로더 대상이 아니다 - 일반 img가 맞다. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreviewUrls[index]} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      aria-label="이미지 삭제"
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {postError && <p className="mt-2 text-xs text-red-300">{postError}</p>}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleCreatePost}
                disabled={!composeTitle.trim() || !composeText.trim() || isPosting}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all ${
                  !composeTitle.trim() || !composeText.trim() || isPosting
                    ? "cursor-not-allowed bg-slate-700 text-slate-500"
                    : "bg-purple-600 hover:-translate-y-0.5 hover:bg-purple-500"
                }`}
              >
                {isPosting ? "게시 중..." : "게시하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌙 내 꿈 공유하기 모달: 자유 광장 글쓰기와 동일한 필드 구성(익명 토글 → 제목 → 본문)
          아래에, 꿈 데이터를 "불러오기"(기존 비공개 기록 선택) 또는 "직접 쓰기" 중 골라 첨부한다. */}
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

            <div className="mt-4">
              <label className="text-xs text-indigo-300/70">어떤 이름으로 공개할까요?</label>
              <div className="mt-2">
                <IdentitySwitch isAnonymous={shareDreamIsAnonymous} onChange={setShareDreamIsAnonymous} nickname={nickname} />
              </div>
            </div>

            {/* 자유 광장과 완전히 동일한 제목 입력 - 커뮤니티 리스트 뷰의 메인 텍스트가 된다. */}
            <input
              type="text"
              value={shareDreamTitle}
              onChange={(event) => setShareDreamTitle(event.target.value)}
              placeholder="제목을 입력하세요"
              maxLength={200}
              className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />

            {/* 본문(사담) - 자유 광장과 동일한 넓은 textarea. 라벨 없이 플레이스홀더로 작성을 유도한다. */}
            <textarea
              value={shareDreamCaption}
              onChange={(event) => setShareDreamCaption(event.target.value)}
              placeholder="꿈에 대한 질문이나 재미있는 썰을 자유롭게 풀어보세요 (예: 어제 이런 꿈 꿨는데 길몽인가요?)"
              rows={4}
              maxLength={1000}
              className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />

            {/* 첨부 모드 세그먼트 컨트롤: 불러오기 ↔ 직접 쓰기 */}
            <div className="mt-4 flex rounded-lg bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => {
                  setAttachmentMode("load");
                  setShareDreamWithAiReport(false);
                }}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-all duration-200 ${
                  attachmentMode === "load" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                📂 불러오기
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachmentMode("write");
                  setShareDreamWithAiReport(false);
                }}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-all duration-200 ${
                  attachmentMode === "write" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ✏️ 직접 쓰기
              </button>
            </div>

            {attachmentMode === "write" && isAnalyzingNewDream ? (
              <div className="mt-5">
                <DreamAnalyzerLoading />
                <p className="mt-3 text-center text-xs text-violet-300/80">AI가 해몽을 분석 중입니다...</p>
              </div>
            ) : (
              <>
                {attachmentMode === "load" ? (
                  myPrivateDreams.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-xs leading-relaxed text-slate-400">
                      아직 공유할 수 있는 비공개 기록이 없어요.
                      <br />
                      꿈 기록소에서 먼저 꿈을 기록하거나, 위에서 "✏️ 직접 쓰기"를 선택해 보세요.
                    </p>
                  ) : (
                    <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                      {myPrivateDreams.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setShareDreamId(entry.id);
                            setShareDreamTitle(entry.title);
                          }}
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
                  )
                ) : (
                  <div className="mt-4">
                    <div className="flex flex-wrap gap-2">
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
                    {/* 사담(위 textarea)과 헷갈리지 않도록 보라색 테두리/배경으로 시각적으로 구분한다. */}
                    <textarea
                      value={newDreamContent}
                      onChange={(event) => setNewDreamContent(event.target.value)}
                      placeholder="어떤 꿈을 꾸셨나요? 꿈 내용을 자세히 적어주세요."
                      rows={5}
                      className="mt-2 w-full resize-none rounded-xl border border-purple-500/50 bg-purple-900/10 px-4 py-3 text-sm text-white placeholder:text-slate-500/60 focus:border-purple-400/70 focus:outline-none"
                    />
                  </div>
                )}

                <label className="mt-4 flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-xs leading-relaxed text-slate-300">
                    {attachmentMode === "load"
                      ? "체크 시 AI 해몽 결과도 피드에 함께 공개합니다"
                      : "AI 해몽 분석 함께 받기 (선택)"}
                  </span>
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
                    onClick={handleSubmitShareDream}
                    disabled={
                      isSharingDream ||
                      !shareDreamTitle.trim() ||
                      (attachmentMode === "load" ? !shareDreamId : !newDreamContent.trim())
                    }
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
