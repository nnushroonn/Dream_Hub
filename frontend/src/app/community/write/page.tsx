"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Image as ImageIcon, X } from "lucide-react";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  createCommunityPost,
  createDream,
  dreamDisplayTitle,
  getMyGarden,
  listDreams,
  requestQuickAiInterpretation,
  setDreamVisibility,
  uploadCommunityImage,
  type AiInterpretation,
  type DreamSurvey,
  type GardenBloomEntry,
} from "@/api/dream";
import CommunityPostTagSelector from "@/components/CommunityPostTagSelector";
import DreamAnalyzerLoading from "@/components/DreamAnalyzerLoading";
import FlowerIcon from "@/components/FlowerIcon";
import IdentitySwitch from "@/components/IdentitySwitch";
import PreviewGateway from "@/components/PreviewGateway";
import TagInput from "@/components/TagInput";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { rarityStars } from "@/lib/flowerRarity";
import { flowerLanguageFor } from "@/lib/flowerTaxonomy";
import { MOOD_OPTIONS } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

type WriteType = "board" | "dream";
// 무의식 광장 글쓰기의 5가지 콘텐츠 타입 - "flower"만 DreamSeed(정원 꽃)를 원본으로 쓰고,
// 나머지 넷은 전부 DreamEntry가 원본이며 interpretation 유무 + share_with_ai_analysis 조합으로만
// 갈린다: diary/free=interpretation 없음, dream=있지만 리포트 비공개, analysis=있고 리포트 공개.
// "free"는 감정일기의 "직접 쓰기"와 동작이 완전히 같다(무드+자유 텍스트, AI 없음) - 다만
// 감정일기 기존 기록을 "불러오기"할 필요 없이 곧장 새로 쓰고 싶을 때를 위해 별도 탭으로 분리해
// 둔 것뿐이라, 이 탭은 "불러오기" 없이 항상 쓰기 모드로 시작한다.
type DreamContentType = "flower" | "diary" | "dream" | "analysis" | "free";

const CONTENT_TYPE_TABS: { value: DreamContentType; label: string }[] = [
  { value: "flower", label: "🌸 꽃" },
  { value: "diary", label: "📔 감정일기" },
  { value: "dream", label: "🌙 꿈일기" },
  { value: "analysis", label: "🔮 꿈해몽분석" },
  { value: "free", label: "✍️ 자유" },
];

const POST_TITLE_MAX_LENGTH = 200;
const POST_CONTENT_MAX_LENGTH = 1000;
const MAX_COMPOSE_IMAGES = 3;
const UNSAVED_CHANGES_MESSAGE = "작성 중인 내용이 저장되지 않을 수 있습니다. 나가시겠습니까?";

// 마이페이지 "🌌 내 무의식 은하 공유하기" 버튼이 ?template=galaxy&data=...로 넘기는 스냅샷.
interface GalaxyTemplateData {
  streak: number;
  totalDiary: number;
  luckyPercent: number | null;
  topSeed: string | null;
  topKeywords: string[];
}

function buildGalaxyText(data: GalaxyTemplateData): string {
  const lines = [
    `연속 일기 ${data.streak}일째, 지금까지 ${data.totalDiary}개의 하루를 기록했어요.`,
  ];
  if (data.luckyPercent !== null) lines.push(`제 꿈의 길몽 비율은 ${data.luckyPercent}%예요.`);
  if (data.topSeed) lines.push(`요즘 가장 많이 심은 씨앗은 "${data.topSeed}"예요.`);
  if (data.topKeywords.length > 0) {
    lines.push(`자주 등장하는 무의식의 키워드: ${data.topKeywords.map((keyword) => `#${keyword}`).join(" ")}`);
  }
  return lines.join("\n");
}

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
  // 마이페이지에서 "🌌 내 무의식 은하 공유하기"로 넘어온 경우에만 채워진다 - 에디터 안에
  // 보라색 테두리 미리보기 카드로 렌더링하고, 실제 게시되는 본문은 별도의 서술형 텍스트다.
  const [galaxyTemplate, setGalaxyTemplate] = useState<GalaxyTemplateData | null>(null);
  // 은하 공유 글에만 필요한 필수 선택 - CommunityPostTagSelector가 채운다.
  const [publicTags, setPublicTags] = useState<string[]>([]);

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
  // 4가지 콘텐츠 타입 탭 - 기본값은 "새 글쓰기"로 곧장 들어온 경우의 기대값(감정일기)과 같다.
  // ?dreamId=/?seedId= 진입점 effect가 대상에 맞춰 다시 설정해 준다.
  const [dreamContentType, setDreamContentType] = useState<DreamContentType>("diary");
  // "감정일기"/"꿈일기"/"꿈해몽분석" 탭의 불러오기 목록 - AI 해몽(interpretation) 유무로만
  // 갈린다. 꿈일기/꿈해몽분석은 같은 풀(해몽 있는 기록)을 공유하고, 공개 시 리포트를 함께
  // 드러낼지(share_with_ai_analysis)만 탭에 따라 자동으로 달라진다.
  const loadableDreams = useMemo(() => {
    // entry_type 필드로만 구분한다 - AI 해몽 유무로 유추하지 않는다(꿈해몽 사전 연계 저장처럼
    // 해몽 없이 저장되는 진짜 꿈일기가 있다). "꿈일기" 탭은 그런 기록도 전부 포함해서 보여주고
    // (목록에서 "해몽 없음" 배지로 구분), "꿈해몽분석" 탭만 해몽이 완료된 것으로 한 번 더 좁힌다.
    if (dreamContentType === "diary") return myPrivateDreams.filter((entry) => entry.entry_type === "emotion");
    if (dreamContentType === "dream") return myPrivateDreams.filter((entry) => entry.entry_type === "dream");
    if (dreamContentType === "analysis") {
      return myPrivateDreams.filter((entry) => entry.entry_type === "dream" && entry.interpretation !== null);
    }
    return [];
  }, [myPrivateDreams, dreamContentType]);
  const [gardenBlooms, setGardenBlooms] = useState<GardenBloomEntry[]>([]);
  const [selectedFlowerSeedId, setSelectedFlowerSeedId] = useState<number | null>(null);
  const bloomedFlowers = useMemo(() => gardenBlooms.filter((bloom) => bloom.stage === "bloom"), [gardenBlooms]);
  const selectedFlower = useMemo(
    () => bloomedFlowers.find((bloom) => bloom.id === selectedFlowerSeedId) ?? null,
    [bloomedFlowers, selectedFlowerSeedId]
  );
  const [shareDreamId, setShareDreamId] = useState<number | null>(null);
  // 불러오기로 고른 기록의 원본 AI 해몽 키워드(interpretation.tags) - 유저가 직접 입력한
  // dreamTags와 별개로, "이것도 태그로 붙일래?" 하고 클릭 한 번으로 추가할 수 있는 추천 목록이다.
  const selectedDreamEntry = useMemo(
    () => loadableDreams.find((entry) => entry.id === shareDreamId) ?? null,
    [loadableDreams, shareDreamId]
  );
  // 자유 광장과 완전히 동일한 필드 구성(제목+본문) - 두 모드가 함께 쓴다.
  const [shareDreamTitle, setShareDreamTitle] = useState("");
  const [shareDreamCaption, setShareDreamCaption] = useState("");
  const shareDreamCaptionRef = useAutoResizeTextarea(shareDreamCaption);
  const [shareDreamIsAnonymous, setShareDreamIsAnonymous] = useState(false);
  // AI가 자동으로 붙여주던 해시태그를 대신해, 유저가 직접 입력한 태그(최대 5개) - 불러오기/직접
  // 쓰기 두 모드가 함께 쓴다.
  const [dreamTags, setDreamTags] = useState<string[]>([]);
  // 이미 dreamTags에 들어간 것과 겹치지 않는 AI 원본 키워드만 추천 칩으로 보여준다.
  // AI 원본 태그(interpretation.tags)는 "#전연인"처럼 "#"이 이미 붙어 오지만, dreamTags/TagInput은
  // "#" 없는 순수 텍스트만 담는 게 불변식이다(TagInput의 commitDraft가 직접 입력 시 "#"을 벗겨낸다) -
  // 여기서 먼저 벗겨 두지 않으면 칩에 "##전연인"처럼 겹쳐 보이고, dreamTags와의 중복 비교도
  // 어긋나 이미 추가한 태그가 추천 목록에서 사라지지 않는 버그가 생긴다.
  const suggestedDreamTags = useMemo(
    () =>
      (selectedDreamEntry?.interpretation?.tags ?? [])
        .map((tag) => tag.replace(/^#+/, ""))
        .filter((tag) => tag.length > 0 && !dreamTags.includes(tag)),
    [selectedDreamEntry, dreamTags]
  );
  const [isSharingDream, setIsSharingDream] = useState(false);
  const [shareDreamError, setShareDreamError] = useState<string | null>(null);
  // 인덱스가 아니라 이모지를 직접 고정한다 - MOOD_OPTIONS 목록 순서가 바뀌어도 이 페이지의
  // 기본 감정(평온)이 조용히 달라지지 않는다.
  const [newDreamMood, setNewDreamMood] = useState("😌");
  const [newDreamContent, setNewDreamContent] = useState("");
  const newDreamContentRef = useAutoResizeTextarea(newDreamContent);
  const [isAnalyzingNewDream, setIsAnalyzingNewDream] = useState(false);
  // 불러오기 목록에서 처음 선택될 기록의 제목을 프리필하기 위해, myPrivateDreams가 로드된
  // 뒤 딱 한 번만 실행한다.
  const hasPrefilledShareDreamRef = useRef(false);

  useEffect(() => {
    // 북마크/직접 URL 접근처럼 requireLoginThen(community/page.tsx)을 거치지 않고 곧장 이 경로로
    // 들어온 비로그인 유저는, 페이지 이동 대신 아래 렌더 분기의 PreviewGateway로 안내한다.
    // 로그인에 성공해 isAuthenticated가 true로 바뀌면 이 effect가 다시 돌면서 자연스럽게 이어진다.
    if (!isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    setWriteType(params.get("type") === "dream" ? "dream" : "board");
    listDreams()
      .then(setSavedDreamEntries)
      .catch(() => {});
    getMyGarden()
      .then((profile) => setGardenBlooms(profile.blooms))
      .catch(() => {});

    if (params.get("template") === "galaxy") {
      const raw = params.get("data");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as GalaxyTemplateData;
          setGalaxyTemplate(parsed);
          setComposeTitle("🌌 나의 무의식 은하를 공개합니다");
          setComposeText(buildGalaxyText(parsed));
        } catch {
          // 파싱 실패하면 그냥 빈 글쓰기로 둔다 - 잘못된 URL을 직접 조작해 들어온 경우 정도.
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // 정원의 "🌐 공유하기"(flower)는 아래 별도 effect가 전담하므로, 여기서는 그 진입점이 아닐
  // 때만 감정일기/꿈일기 기록을 프리필한다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // ?dreamId=로 특정 기록을 지목해 들어온 경우(예: 저널 카드의 "공유하기") 그 기록을 곧장
    // 선택하고, 그 기록의 entry_type으로 감정일기/꿈일기 탭도 함께 맞춘다. 지목이 없으면
    // 기본 탭(감정일기)에 해당하는 첫 기록을 프리필한다.
    const dreamIdParam = params.get("dreamId");
    const requested = dreamIdParam ? myPrivateDreams.find((entry) => entry.id === Number(dreamIdParam)) : undefined;
    const target = requested ?? myPrivateDreams.filter((entry) => entry.entry_type === "emotion")[0];
    if (
      hasPrefilledShareDreamRef.current ||
      myPrivateDreams.length === 0 ||
      params.get("contentType") === "flower" ||
      !target
    ) {
      return;
    }
    hasPrefilledShareDreamRef.current = true;
    setDreamContentType(target.entry_type === "emotion" ? "diary" : "dream");
    setShareDreamId(target.id);
    setShareDreamTitle(dreamDisplayTitle(target));
    setDreamTags(target.tags);
  }, [myPrivateDreams]);

  // 정원 꽃 상세 모달의 "🌐 공유하기"(?contentType=flower&seedId=)로 넘어온 경우, 그 꽃을
  // 곧장 "꽃" 탭에 선택해 둔다. 정원 데이터가 비동기로 로드되므로 blooms가 채워진 뒤 실행된다.
  const hasPrefilledFlowerRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      hasPrefilledFlowerRef.current ||
      bloomedFlowers.length === 0 ||
      params.get("contentType") !== "flower"
    ) {
      return;
    }
    hasPrefilledFlowerRef.current = true;
    setDreamContentType("flower");
    const seedIdParam = params.get("seedId");
    const requested = seedIdParam ? bloomedFlowers.find((bloom) => bloom.id === Number(seedIdParam)) : undefined;
    setSelectedFlowerSeedId((requested ?? bloomedFlowers[0]).id);
  }, [bloomedFlowers]);

  const hasUnsavedChanges =
    writeType === "board"
      ? composeTitle.trim().length > 0 || composeText.trim().length > 0 || selectedImages.length > 0
      : writeType === "dream"
        ? shareDreamTitle.trim().length > 0 ||
          shareDreamCaption.trim().length > 0 ||
          selectedFlowerSeedId !== null ||
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
    // 은하 공유 템플릿은 주파수 태그를 반드시 하나 골라야 발행할 수 있다.
    if (!title || !content || isPosting || (galaxyTemplate && publicTags.length === 0)) return;
    setPostError(null);
    setIsPosting(true);
    try {
      // 이미지는 게시 시점에 순서대로 하나씩 R2로 업로드한 뒤, 받은 공개 URL 목록만
      // createCommunityPost에 함께 실어 보낸다.
      const imageUrls = await Promise.all(selectedImages.map((file) => uploadCommunityImage(file)));
      await createCommunityPost(title, content, composeIsAnonymous, imageUrls, publicTags);
      router.push("/community?tab=board");
    } catch (error) {
      setPostError(getAuthErrorMessage(error));
    } finally {
      setIsPosting(false);
    }
  };

  // attachmentMode === "load": 이미 저장된 비공개 기록을 골라 공개로 전환한다 (AI 재분석 없음).
  // 리포트 공개 여부(share_with_ai_analysis)는 더 이상 토글이 아니라 탭 자체로 정해진다 -
  // "꿈해몽분석" 탭에서 고르면 true, "꿈일기" 탭에서 고르면 false.
  const handleConfirmShareDream = async () => {
    const entry = loadableDreams.find((item) => item.id === shareDreamId);
    const title = shareDreamTitle.trim();
    if (!entry || !title || isSharingDream) return;
    setIsSharingDream(true);
    setShareDreamError(null);
    try {
      const saved = await setDreamVisibility(entry, {
        isPublic: true,
        isAnonymous: shareDreamIsAnonymous,
        shareWithAiAnalysis: dreamContentType === "analysis",
        shareCaption: shareDreamCaption.trim(),
        publicTitle: title,
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

  // attachmentMode === "write": "꿈일기" 탭은 이 풀 자체가 "AI 해몽이 있는 기록"으로 정의되므로
  // 항상 AI 해몽을 요청한다(선택 아님) - 다만 리포트는 절대 공개하지 않는다. "감정일기" 탭은
  // 반대로 AI 호출 자체를 건너뛰어 순수 텍스트로만 남긴다.
  const handleConfirmShareWrite = async () => {
    const title = shareDreamTitle.trim();
    const content = newDreamContent.trim();
    if (!title || !content || isSharingDream || isAnalyzingNewDream) return;

    setShareDreamError(null);

    let interpretation: AiInterpretation | null = null;
    if (dreamContentType === "dream") {
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
      const survey: DreamSurvey = {
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
        lucid_level: "none",
        control_level: null,
        final_memo: "",
      };
      await createDream({
        dream_date: new Date().toISOString().slice(0, 10),
        title,
        // "감정일기"/"자유" 탭은 emotion, "꿈일기" 탭만 dream - AI 해몽 유무로 유추하지 않는다.
        entry_type: dreamContentType === "dream" ? "dream" : "emotion",
        emotion: newDreamMood,
        summary: buildDreamOneLineSummary(survey),
        is_public: true,
        is_anonymous: shareDreamIsAnonymous,
        // "꿈일기" 탭은 해몽을 받되 리포트는 비공개로 남긴다 - 리포트 공개는 오직
        // "꿈해몽분석" 탭(불러오기 전용)에서만 일어난다.
        share_with_ai_analysis: false,
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

  // "꽃" 탭: 정원에서 이미 개화한 내 꽃 한 송이를 새 공개 글로 게시한다. 다른 세 탭과 달리
  // 원본이 DreamEntry가 아니라 DreamSeed라 setDreamVisibility(기존 기록 전환)가 아니라
  // createDream으로 완전히 새 글을 만들고, attached_flower_seed_id로 스냅샷만 서버에 요청한다.
  const handleConfirmShareFlower = async () => {
    if (!selectedFlower || isSharingDream) return;
    setIsSharingDream(true);
    setShareDreamError(null);
    try {
      const survey: DreamSurvey = {
        title: selectedFlower.flower_name ?? "",
        brightness: "",
        space_depth: "",
        space_detail: "",
        identity_factor: "",
        target_detail: "",
        action_physics: "",
        action_detail: "",
        reality_link: "",
        reality_detail: "",
        vividness: 50,
        lucid_level: "none",
        control_level: null,
        final_memo: "",
      };
      await createDream({
        dream_date: selectedFlower.bloomed_at,
        title: selectedFlower.flower_name ?? "이름 모를 꽃",
        // 꽃 공유 글은 꿈 기록도 감정일기도 아니지만, 꿈 통계/꿈일기 탭 집계에서는 빠져야
        // 하므로(예전에 interpretation===null로 자연히 제외되던 것과 동일한 취지) emotion으로 둔다.
        entry_type: "emotion",
        emotion: selectedFlower.emotion ?? "🌸",
        summary: flowerLanguageFor(selectedFlower),
        is_public: true,
        is_anonymous: shareDreamIsAnonymous,
        share_with_ai_analysis: false,
        share_caption: shareDreamCaption.trim(),
        survey,
        interpretation: null,
        tags: dreamTags,
        attached_flower_seed_id: selectedFlower.id,
      });
      router.push("/community?tab=dream");
    } catch (error) {
      setShareDreamError(getAuthErrorMessage(error));
    } finally {
      setIsSharingDream(false);
    }
  };

  const handleSubmitShareDream = () => {
    if (dreamContentType === "flower") {
      handleConfirmShareFlower();
    } else if (attachmentMode === "load") {
      handleConfirmShareDream();
    } else {
      handleConfirmShareWrite();
    }
  };

  // 북마크/직접 URL 접근으로 로그인 없이 곧장 들어온 경우 - requireLoginThen을 거쳐 정상적으로
  // 들어온 유저는 이 분기를 보지 않는다.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <PreviewGateway
            title="글을 쓰기 전에 로그인해 주세요"
            subtitle="가입하고 무의식 광장에 나만의 이야기를 남겨보세요."
            ctaLabel="🔮 로그인하고 글쓰기"
            triggerSource="community"
          />
        </div>
      </div>
    );
  }

  if (writeType === null) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  const isBoardSubmitDisabled =
    !composeTitle.trim() || !composeText.trim() || isPosting || (galaxyTemplate !== null && publicTags.length === 0);
  const isDreamSubmitDisabled =
    isSharingDream ||
    isAnalyzingNewDream ||
    (dreamContentType === "flower"
      ? !selectedFlowerSeedId
      : !shareDreamTitle.trim() || (attachmentMode === "load" ? !shareDreamId : !newDreamContent.trim()));

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

            {/* 🌌 무의식 은하 스냅샷 임베드 - 실제로 게시되는 본문은 아래 textarea의 서술형
                텍스트고, 이 카드는 에디터 안에서만 보이는 미리보기다. */}
            {galaxyTemplate && (
              <div className="mt-4 rounded-2xl border border-purple-400/40 bg-gradient-to-br from-purple-950/60 to-indigo-950/40 p-4 shadow-[0_0_24px_rgba(168,85,247,0.25)]">
                <p className="text-xs font-semibold text-purple-300">🌌 나의 무의식 은하 스냅샷</p>
                <p className="mt-2 text-sm text-white">
                  연속 일기 {galaxyTemplate.streak}일 · 누적 {galaxyTemplate.totalDiary}개
                </p>
                {galaxyTemplate.luckyPercent !== null && (
                  <p className="mt-1 text-xs text-purple-200">🌟 길몽 비율 {galaxyTemplate.luckyPercent}%</p>
                )}
                {galaxyTemplate.topSeed && (
                  <p className="mt-1 text-xs text-purple-200">가장 많이 심은 씨앗: {galaxyTemplate.topSeed}</p>
                )}
                {galaxyTemplate.topKeywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {galaxyTemplate.topKeywords.map((keyword) => (
                      <span key={keyword} className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] text-purple-200">
                        #{keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 은하 공유 글만 필수로 노출되는 주파수 태그 선택 - 여기서 고른 값이 그대로
                CommunityPost.public_tags로 저장되고, 헤더의 주파수 필터가 이것만 조회한다. */}
            {galaxyTemplate ? (
              <CommunityPostTagSelector value={publicTags} onChange={setPublicTags} />
            ) : (
              // 일반 자유 글은 큐레이션 프리셋 대신, 직접 입력한 커스텀 해시태그를 자유롭게 붙일
              // 수 있다 - 같은 public_tags 필드를 쓰므로 상단 태그 필터 바 집계에도 그대로 잡힌다.
              <TagInput tags={publicTags} onChange={setPublicTags} />
            )}

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
            {/* 콘텐츠 타입 5탭: 꽃/감정일기/꿈일기/꿈해몽분석/자유 - 무엇을 공유할지부터 고른다.
                이전엔 "AI 해몽 결과도 공개" 체크박스 하나로 뭉뚱그렸던 것을, 이제 탭 자체가
                그 역할(꿈해몽분석=공개, 꿈일기=비공개)을 대신한다. */}
            <div className="grid grid-cols-5 gap-1.5 rounded-lg bg-slate-800 p-1">
              {CONTENT_TYPE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setDreamContentType(tab.value);
                    // "자유"는 불러오기 목록 자체가 없어(감정일기와 같은 풀이라 굳이 또
                    // 보여줄 필요가 없다) 항상 쓰기 모드로 시작한다.
                    setAttachmentMode(tab.value === "free" ? "write" : "load");
                    setShareDreamId(null);
                    setSelectedFlowerSeedId(null);
                    setShareDreamTitle("");
                    setDreamTags([]);
                  }}
                  className={`rounded-md px-1.5 py-2 text-[11px] font-medium leading-tight transition-all duration-200 ${
                    dreamContentType === tab.value ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="text-xs text-indigo-300/70">어떤 이름으로 공개할까요?</label>
              <div className="mt-2">
                <IdentitySwitch isAnonymous={shareDreamIsAnonymous} onChange={setShareDreamIsAnonymous} nickname={nickname} />
              </div>
            </div>

            {/* 커뮤니티 리스트 뷰의 메인 텍스트가 되는 제목 입력 - "불러오기"로 기존 기록을 고르면
                제목이 자동으로 채워지는데, 그래도 언제든 클릭해 고쳐 쓸 수 있다는 게 또렷이
                보이도록 뚜렷한 테두리와 넉넉한 여백의 인풋 스타일을 준다. "꽃" 탭은 카드 이름이
                곧 제목이라 별도 입력을 받지 않는다. */}
            {dreamContentType !== "flower" && (
              <input
                type="text"
                value={shareDreamTitle}
                onChange={(event) => setShareDreamTitle(event.target.value)}
                placeholder="제목을 입력하세요"
                maxLength={200}
                className="mt-4 w-full rounded-lg border border-slate-700 bg-transparent p-3 text-white placeholder:text-slate-500 outline-none focus:border-purple-500"
              />
            )}

            {/* 본문(사담) - 자유 광장과 동일한 넓은 textarea. */}
            <textarea
              ref={shareDreamCaptionRef}
              value={shareDreamCaption}
              onChange={(event) => setShareDreamCaption(event.target.value)}
              placeholder="꿈에 대한 질문이나 재미있는 썰을 자유롭게 풀어보세요 (예: 어제 이런 꿈 꿨는데 길몽인가요?)"
              maxLength={1000}
              className="mt-3 min-h-[120px] w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
            />

            {/* 꿈 상징 태그 - AI가 자동으로 붙여주던 해시태그를 대신해 유저가 직접 입력한다.
                (최대 3개로 제한 - 태그가 너무 많으면 필터 바 집계가 희석된다.) */}
            <TagInput tags={dreamTags} onChange={setDreamTags} maxTags={3} />

            {/* AI 추천 태그 - 불러온 기록에 원래 AI가 뽑아줬던 키워드(interpretation.tags) 중
                아직 안 붙인 것만 클릭 한 번으로 추가할 수 있는 프리셋으로 보여준다. */}
            {dreamContentType !== "flower" && attachmentMode === "load" && suggestedDreamTags.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500">💡 AI 추천 태그</span>
                {suggestedDreamTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setDreamTags((prev) => (prev.length >= 5 || prev.includes(tag) ? prev : [...prev, tag]))
                    }
                    className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-[11px] text-purple-200 transition-colors hover:border-purple-400/60 hover:bg-purple-500/20"
                  >
                    + #{tag}
                  </button>
                ))}
              </div>
            )}

            {/* 첨부 모드 세그먼트 컨트롤: 불러오기 ↔ 직접 쓰기 - "직접 쓰기"는 감정일기/꿈일기
                탭에서만 뜻이 통한다(꽃은 정원에서 고르는 것뿐이고, 꿈해몽분석은 이미 해몽이
                끝난 기록만 대상이라 새로 쓸 수 없다). */}
            {(dreamContentType === "diary" || dreamContentType === "dream") && (
              <div className="mt-4 flex rounded-lg bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setAttachmentMode("load")}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-all duration-200 ${
                    attachmentMode === "load" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  📂 불러오기
                </button>
                <button
                  type="button"
                  onClick={() => setAttachmentMode("write")}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-all duration-200 ${
                    attachmentMode === "write" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  ✏️ 직접 쓰기
                </button>
              </div>
            )}

            {attachmentMode === "write" && isAnalyzingNewDream ? (
              <div className="mt-5">
                <DreamAnalyzerLoading />
                <p className="mt-3 text-center text-xs text-violet-300/80">AI가 해몽을 분석 중입니다...</p>
              </div>
            ) : (
              <>
                {dreamContentType === "flower" ? (
                  bloomedFlowers.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-xs leading-relaxed text-slate-400">
                      아직 정원에 개화한 꽃이 없어요.
                      <br />
                      먼저 꿈을 기록해 씨앗을 개화시켜 보세요.
                    </p>
                  ) : (
                    <div className="mt-4 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
                      {bloomedFlowers.map((bloom) => (
                        <button
                          key={bloom.id}
                          type="button"
                          onClick={() => setSelectedFlowerSeedId(bloom.id)}
                          className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors ${
                            selectedFlowerSeedId === bloom.id
                              ? "border-violet-400/70 bg-violet-500/15 text-white"
                              : "border-white/10 bg-white/5 text-slate-300 hover:border-violet-400/30"
                          }`}
                        >
                          <FlowerIcon
                            archetype={bloom.archetype}
                            genus={bloom.genus}
                            speciesName={bloom.species_name}
                            isLegendary={bloom.is_legendary}
                            sizePx={30}
                          />
                          <span className="w-full truncate text-[11px]">{bloom.flower_name ?? "이름 모를 꽃"}</span>
                          <span className="text-[10px] text-amber-300">{rarityStars(bloom.rarity ?? 1)}</span>
                        </button>
                      ))}
                    </div>
                  )
                ) : attachmentMode === "load" ? (
                  loadableDreams.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-xs leading-relaxed text-slate-400">
                      {dreamContentType === "diary"
                        ? "아직 공유할 수 있는 감정일기가 없어요."
                        : "아직 AI 해몽이 있는 꿈 기록이 없어요."}
                      <br />
                      {dreamContentType === "diary"
                        ? "꿈 기록소에서 먼저 일기를 남기거나, 위에서 \"✏️ 직접 쓰기\"를 선택해 보세요."
                        : "꿈 기록소에서 먼저 AI 해몽을 받아보세요."}
                    </p>
                  ) : (
                    <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                      {loadableDreams.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setShareDreamId(entry.id);
                            setShareDreamTitle(dreamDisplayTitle(entry));
                            setDreamTags(entry.tags);
                          }}
                          className={`w-full rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                            shareDreamId === entry.id
                              ? "border-violet-400/70 bg-violet-500/15 text-white"
                              : "border-white/10 bg-white/5 text-slate-300 hover:border-violet-400/30"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">
                                {entry.emotion} {entry.title}
                              </span>
                              {/* "꿈일기" 탭은 해몽 유무와 무관하게 전부 보여주므로, 아직 AI
                                  해몽이 없는 기록(예: 꿈해몽 사전 연계 저장)은 배지로 구분한다. */}
                              {dreamContentType === "dream" && entry.interpretation === null && (
                                <span className="shrink-0 rounded-full border border-slate-500/30 bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                                  해몽 없음
                                </span>
                              )}
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
                    {dreamContentType === "dream" && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        🔮 &quot;꿈일기&quot; 탭은 게시 시 AI 해몽을 자동으로 함께 받아요 (리포트는 비공개로 보관돼요).
                      </p>
                    )}
                  </div>
                )}

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
