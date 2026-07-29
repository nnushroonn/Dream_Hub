"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Image as ImageIcon, X } from "lucide-react";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  createCommunityPost,
  createDream,
  listDreams,
  requestQuickAiInterpretation,
  setDreamVisibility,
  uploadCommunityImage,
  type AiInterpretation,
} from "@/api/dream";
import DreamAnalyzerLoading from "@/components/DreamAnalyzerLoading";
import IdentitySwitch from "@/components/IdentitySwitch";
import TagInput from "@/components/TagInput";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { MOOD_OPTIONS } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

type WriteType = "board" | "dream";

const POST_TITLE_MAX_LENGTH = 200;
const POST_CONTENT_MAX_LENGTH = 1000;
const MAX_COMPOSE_IMAGES = 3;
const UNSAVED_CHANGES_MESSAGE = "작성 중인 내용이 저장되지 않을 수 있습니다. 나가시겠습니까?";

// 기존 "글쓰기"/"내 꿈 공유하기" 모달을 독립된 라우트로 옮긴 페이지 - 자유 광장(board)과
// 무의식 광장(dream) 두 흐름을 ?type= 쿼리 파라미터로 한 페이지에서 함께 다룬다. 정적
// export라 동적 세그먼트를 못 쓰는 이 프로젝트의 관례대로 쿼리 파라미터 방식을 그대로 따른다.
// 작성에 집중할 수 있도록 전역 NavBar 없이 이 페이지 전용 헤더만 둔다.
export default function CommunityWritePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUser = useAuthStore((state) => state.user);
  const nickname = authUser?.nickname ?? "탐험가";

  const [writeType, setWriteType] = useState<WriteType | null>(null);

  // --- 💬 자유 광장 글쓰기 상태 ---
  const [composeTitle, setComposeTitle] = useState("");
  const [composeText, setComposeText] = useState("");
  const [composeIsAnonymous, setComposeIsAnonymous] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  // 짤 첨부 - 실제 업로드 연동 전, 선택/미리보기/삭제 UI만 먼저 구현한다.
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const composeFileInputRef = useRef<HTMLInputElement>(null);
  const composeTextareaRef = useAutoResizeTextarea(composeText);

  // --- 🌙 무의식 광장 글쓰기 상태 ---
  // NavBar가 이 페이지에는 없어(집중 모드) NavBar의 listDreams() 동기화를 기대할 수 없다 -
  // 아래 effect에서 이 페이지가 직접 한 번 더 채워 넣는다.
  const savedDreamEntries = useSavedDreamsStore((state) => state.entries);
  const setSavedDreamEntries = useSavedDreamsStore((state) => state.setEntries);
  const upsertSavedDreamEntry = useSavedDreamsStore((state) => state.upsertEntry);
  const myPrivateDreams = useMemo(
    () => savedDreamEntries.filter((entry) => !entry.is_public),
    [savedDreamEntries]
  );
  const [attachmentMode, setAttachmentMode] = useState<"load" | "write">("load");
  const [shareDreamId, setShareDreamId] = useState<number | null>(null);
  // 자유 광장과 완전히 동일한 필드 구성(제목+본문) - 두 모드가 함께 쓴다.
  const [shareDreamTitle, setShareDreamTitle] = useState("");
  const [shareDreamCaption, setShareDreamCaption] = useState("");
  const shareDreamCaptionRef = useAutoResizeTextarea(shareDreamCaption);
  const [shareDreamIsAnonymous, setShareDreamIsAnonymous] = useState(false);
  // AI가 자동으로 붙여주던 해시태그를 대신해, 유저가 직접 입력한 태그(최대 5개) - 불러오기/직접
  // 쓰기 두 모드가 함께 쓴다.
  const [dreamTags, setDreamTags] = useState<string[]>([]);
  const [shareDreamWithAiReport, setShareDreamWithAiReport] = useState(false);
  const [isSharingDream, setIsSharingDream] = useState(false);
  const [shareDreamError, setShareDreamError] = useState<string | null>(null);
  const [newDreamMood, setNewDreamMood] = useState(MOOD_OPTIONS[3].emoji);
  const [newDreamContent, setNewDreamContent] = useState("");
  const newDreamContentRef = useAutoResizeTextarea(newDreamContent);
  const [isAnalyzingNewDream, setIsAnalyzingNewDream] = useState(false);
  // 불러오기 목록에서 처음 선택될 기록의 제목을 프리필하기 위해, myPrivateDreams가 로드된
  // 뒤 딱 한 번만 실행한다.
  const hasPrefilledShareDreamRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setWriteType(params.get("type") === "dream" ? "dream" : "board");
    listDreams()
      .then(setSavedDreamEntries)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (hasPrefilledShareDreamRef.current || myPrivateDreams.length === 0) return;
    hasPrefilledShareDreamRef.current = true;
    const firstDream = myPrivateDreams[0];
    setShareDreamId(firstDream.id);
    setShareDreamTitle(firstDream.title);
    setDreamTags(firstDream.tags);
  }, [myPrivateDreams]);

  const hasUnsavedChanges =
    writeType === "board"
      ? composeTitle.trim().length > 0 || composeText.trim().length > 0 || selectedImages.length > 0
      : writeType === "dream"
        ? shareDreamTitle.trim().length > 0 ||
          shareDreamCaption.trim().length > 0 ||
          (attachmentMode === "write" && newDreamContent.trim().length > 0)
        : false;

  // 새로고침/탭 닫기/다른 사이트로 이동 - 브라우저가 직접 띄우는 네이티브 팝업이라 문구를
  // 커스터마이즈할 수 없다(최신 브라우저의 보안 정책). preventDefault + returnValue만 있으면 된다.
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // 브라우저 뒤로가기 - 더미 history 항목을 하나 쌓아두고, popstate가 뜨면(뒤로가기를 누르면)
  // 우리가 먼저 가로채 네이티브 confirm을 띄운다. 취소하면 더미 항목을 다시 쌓아 같은 자리에
  // 머무르고, 확인하면 한 번 더 뒤로 가서 실제로 페이지를 벗어난다.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      if (window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        window.history.back();
      } else {
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [hasUnsavedChanges]);

  const goBackToCommunity = () => {
    router.push(`/community?tab=${writeType === "dream" ? "dream" : "board"}`);
  };

  // 헤더의 뒤로가기 버튼 - 작성 중인 내용이 있으면 네이티브 confirm으로 한 번 더 확인한다.
  const handleHeaderBack = () => {
    if (hasUnsavedChanges && !window.confirm(UNSAVED_CHANGES_MESSAGE)) return;
    goBackToCommunity();
  };

  const handleSelectImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
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

  const imagePreviewUrls = useMemo(() => selectedImages.map((file) => URL.createObjectURL(file)), [selectedImages]);
  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviewUrls]);

  const handleCreatePost = async () => {
    const title = composeTitle.trim();
    const content = composeText.trim();
    if (!title || !content || isPosting) return;
    setPostError(null);
    setIsPosting(true);
    try {
      // 이미지는 게시 시점에 순서대로 하나씩 R2로 업로드한 뒤, 받은 공개 URL 목록만
      // createCommunityPost에 함께 실어 보낸다.
      const imageUrls = await Promise.all(selectedImages.map((file) => uploadCommunityImage(file)));
      await createCommunityPost(title, content, composeIsAnonymous, imageUrls);
      router.push("/community?tab=board");
    } catch (error) {
      setPostError(getAuthErrorMessage(error));
    } finally {
      setIsPosting(false);
    }
  };

  // attachmentMode === "load": 이미 저장된 비공개 기록을 골라 공개로 전환한다 (AI 재분석 없음).
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
        tags: dreamTags,
      });
      upsertSavedDreamEntry(saved);
      router.push("/community?tab=dream");
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
      await createDream({
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
        tags: dreamTags,
      });
      router.push("/community?tab=dream");
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

  if (writeType === null) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  const isBoardSubmitDisabled = !composeTitle.trim() || !composeText.trim() || isPosting;
  const isDreamSubmitDisabled =
    isSharingDream ||
    isAnalyzingNewDream ||
    !shareDreamTitle.trim() ||
    (attachmentMode === "load" ? !shareDreamId : !newDreamContent.trim());

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* 헤더: 뒤로가기(좌) / 타이틀(중앙) / 제출 버튼(우) - 네이티브 앱의 글쓰기 화면과 동일한
          위치 감각. 작성에 집중할 수 있도록 이 헤더가 곧 페이지의 유일한 상단 내비게이션이다. */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950 px-4 py-4 md:px-8">
        <button
          type="button"
          onClick={handleHeaderBack}
          aria-label="뒤로 가기"
          className="shrink-0 text-slate-400 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 truncate text-center text-sm font-semibold text-white">
          {writeType === "dream" ? "🌙 꿈 게시판 글쓰기" : "💬 자유 게시판 글쓰기"}
        </h1>
        {/* 게시 액션은 본문 하단의 큰 버튼 하나로 단일화했다 - 헤더의 작은 버튼과 중복되어
            있던 것을 자유 광장/무의식 광장 두 흐름 모두에서 정리. 뒤로가기 아이콘과 같은
            폭의 빈 공간만 남겨 타이틀이 어긋나지 않게 한다. */}
        <div className="w-6 shrink-0" aria-hidden />
      </div>

      {/* 본문: 모바일에서는 꽉 차게, 데스크톱에서는 가독성을 위해 중앙 정렬된 적당한 너비로. */}
      <main className="w-full px-4 py-6 md:mx-auto md:max-w-2xl">
        {writeType === "board" ? (
          <>
            <div>
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
              ref={composeTextareaRef}
              value={composeText}
              onChange={(event) => setComposeText(event.target.value)}
              placeholder="자유롭게 이야기를 나눠보세요..."
              maxLength={POST_CONTENT_MAX_LENGTH}
              className="min-h-[200px] w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />
            <div className="mt-1 flex justify-end">
              <span className={`text-xs ${composeText.length >= POST_CONTENT_MAX_LENGTH ? "text-red-500" : "text-slate-500"}`}>
                {composeText.length}/{POST_CONTENT_MAX_LENGTH}
              </span>
            </div>

            {/* 짤 첨부: textarea 하단 좌측에 아이콘 버튼 + 첨부 매수 표시. */}
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

            <button
              type="button"
              onClick={handleCreatePost}
              disabled={isBoardSubmitDisabled}
              className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors ${
                isBoardSubmitDisabled ? "cursor-not-allowed bg-slate-700 text-slate-500" : "bg-purple-600 hover:bg-purple-500"
              }`}
            >
              {isPosting ? "게시 중..." : "게시하기"}
            </button>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs text-indigo-300/70">어떤 이름으로 공개할까요?</label>
              <div className="mt-2">
                <IdentitySwitch isAnonymous={shareDreamIsAnonymous} onChange={setShareDreamIsAnonymous} nickname={nickname} />
              </div>
            </div>

            {/* 커뮤니티 리스트 뷰의 메인 텍스트가 되는 제목 입력 - "불러오기"로 기존 기록을 고르면
                제목이 자동으로 채워지는데, 그래도 언제든 클릭해 고쳐 쓸 수 있다는 게 또렷이
                보이도록 뚜렷한 테두리와 넉넉한 여백의 인풋 스타일을 준다. */}
            <input
              type="text"
              value={shareDreamTitle}
              onChange={(event) => setShareDreamTitle(event.target.value)}
              placeholder="제목을 입력하세요"
              maxLength={200}
              className="mt-4 w-full rounded-lg border border-slate-700 bg-transparent p-3 text-white placeholder:text-slate-500 outline-none focus:border-purple-500"
            />

            {/* 본문(사담) - 자유 광장과 동일한 넓은 textarea. */}
            <textarea
              ref={shareDreamCaptionRef}
              value={shareDreamCaption}
              onChange={(event) => setShareDreamCaption(event.target.value)}
              placeholder="꿈에 대한 질문이나 재미있는 썰을 자유롭게 풀어보세요 (예: 어제 이런 꿈 꿨는데 길몽인가요?)"
              maxLength={1000}
              className="mt-3 min-h-[120px] w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />

            {/* 꿈 상징 태그 - AI가 자동으로 붙여주던 해시태그를 대신해 유저가 직접 입력한다. */}
            <TagInput tags={dreamTags} onChange={setDreamTags} />

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
                            setDreamTags(entry.tags);
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
                      ref={newDreamContentRef}
                      value={newDreamContent}
                      onChange={(event) => setNewDreamContent(event.target.value)}
                      placeholder="어떤 꿈을 꾸셨나요? 꿈 내용을 자세히 적어주세요."
                      className="mt-2 min-h-[160px] w-full resize-none overflow-hidden rounded-xl border border-purple-500/50 bg-purple-900/10 px-4 py-3 text-sm text-white placeholder:text-slate-500/60 focus:border-purple-400/70 focus:outline-none"
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

                <button
                  type="button"
                  onClick={handleSubmitShareDream}
                  disabled={isDreamSubmitDisabled}
                  className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors ${
                    isDreamSubmitDisabled ? "cursor-not-allowed bg-slate-700 text-slate-500" : "bg-purple-600 hover:bg-purple-500"
                  }`}
                >
                  {isSharingDream ? "공개하는 중..." : "🌐 공개하기"}
                </button>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
