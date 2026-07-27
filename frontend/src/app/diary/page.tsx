"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  createDream,
  deleteDream,
  requestAiInterpretation,
  requestQuickAiInterpretation,
  updateDream,
  type AiInterpretation,
  type DreamEntryRecord,
  type DreamMood,
  type DreamSurvey,
} from "@/api/dream";
import CounselingStoryView, { shareCounselingReport } from "@/components/CounselingStoryView";
import DiaryCalendarPanel from "@/components/DiaryCalendarPanel";
import DreamAnalyzerLoading from "@/components/DreamAnalyzerLoading";
import DreamGuidePanel from "@/components/DreamGuidePanel";
import DreamWizard from "@/components/DreamWizard";
import IdentitySwitch from "@/components/IdentitySwitch";
import NavBar from "@/components/NavBar";
import { emojiForMoodBucket, MOOD_OPTIONS } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";
import { useUnsavedChangesStore } from "@/store/useUnsavedChangesStore";

function todayDateInputValue(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 실시간 자동 임시 저장(Auto-Save)이 쓰는 localStorage 키와 디바운스 간격.
const DRAFT_STORAGE_KEY = "dream_hub_draft";
const AUTOSAVE_DEBOUNCE_MS = 600;

interface DreamDraft {
  savedAt: number;
  recordMode: "quick" | "precise";
  quickTitle: string;
  quickText: string;
  precise: DreamSurvey | null;
  meta: { selectedDate: string; mood: string; isPublic: boolean };
}

// 복구 모달의 데이터 프리뷰 박스에 쓰는 요약 정보.
interface DraftPreview {
  savedAt: number;
  title: string;
  content: string;
}

function formatDraftSavedAt(savedAt: number): string {
  const formatted = new Date(savedAt).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatted}에 저장된 조각`;
}

// 7단계 위저드 초안에 실제로 뭔가 채워졌는지 - 전부 빈 값이면 "작성 중"으로 치지 않는다.
function isWizardDraftDirty(draft: DreamSurvey | null): boolean {
  if (!draft) return false;
  return Boolean(
    draft.title ||
      draft.brightness ||
      draft.space_depth ||
      draft.space_detail ||
      draft.identity_factor ||
      draft.target_detail ||
      draft.action_physics ||
      draft.action_detail ||
      draft.reality_link ||
      draft.reality_detail ||
      draft.final_memo
  );
}

// ⚡ 10초 미니멀로 작성된 기록 판별: 백엔드 스키마엔 별도의 type/content 필드가 없고
// 항상 같은 DreamSurvey 구조라서, 7단계 구조화 항목이 전부 비어 있고 자유 서술
// (action_detail)만 채워져 있으면 미니멀 기록으로 간주한다.
function isMinimalEntry(survey: DreamSurvey): boolean {
  const hasStructuredAnswers = Boolean(
    survey.brightness ||
      survey.space_depth ||
      survey.space_detail ||
      survey.identity_factor ||
      survey.target_detail ||
      survey.action_physics ||
      survey.reality_link ||
      survey.reality_detail
  );
  return !hasStructuredAnswers && Boolean(survey.action_detail);
}

export default function DiaryPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUser = useAuthStore((state) => state.user);
  const upsertEntry = useSavedDreamsStore((state) => state.upsertEntry);
  const removeEntry = useSavedDreamsStore((state) => state.removeEntry);
  const nickname = authUser?.nickname ?? "탐험가";

  // 날짜는 서버/클라이언트 렌더 결과가 달라지는 걸 피하려고 마운트 이후에만 오늘 날짜로 채운다.
  const [selectedDate, setSelectedDate] = useState("");
  const [mood, setMood] = useState(MOOD_OPTIONS[3].emoji);
  const [isPublic, setIsPublic] = useState(false);
  // 무의식 피드 기본값은 프라이버시를 보수적으로 잡아 익명, AI 리포트 공유는 기본 비공개.
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [shareWithAiAnalysis, setShareWithAiAnalysis] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [interpretation, setInterpretation] = useState<AiInterpretation | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSurvey, setLastSurvey] = useState<DreamSurvey | null>(null);

  // 수정 모드: 캘린더에서 기존 기록을 골라 "수정하기"를 누르면 채워진다.
  const [editingEntry, setEditingEntry] = useState<DreamEntryRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 상세 보기 모달: 하루에 여러 꿈이 있으면 탭으로 전환해서 본다.
  const [detailEntries, setDetailEntries] = useState<DreamEntryRecord[] | null>(null);
  const [activeDetailIndex, setActiveDetailIndex] = useState(0);
  const [detailVisible, setDetailVisible] = useState(true);
  const [detailShareCopied, setDetailShareCopied] = useState(false);
  const activeDetail = detailEntries?.[activeDetailIndex] ?? null;

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<DreamEntryRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 꿈해몽 사전의 "이 상징을 바탕으로 꿈 기록하기"에서 ?title=고래 형태로 넘어온 경우,
  // Step 1 제목을 미리 채워 넣는다. ⚡ 빠른 기록에서 정밀 모드로 업그레이드할 때도 재사용한다.
  const [initialTitle, setInitialTitle] = useState<string | undefined>(undefined);
  const [initialActionDetail, setInitialActionDetail] = useState<string | undefined>(undefined);
  const [initialTargetChip, setInitialTargetChip] = useState<string | undefined>(undefined);
  const [initialTargetOther, setInitialTargetOther] = useState<string | undefined>(undefined);
  const [initialDynamicsChip, setInitialDynamicsChip] = useState<string | undefined>(undefined);

  // 사전의 "내 꿈일기에 이 상징 기록하기"에서 넘어온 경우에만 채워지는 배지 정보(배너 표시용)와,
  // 저장 완료 후 홈으로 리다이렉트할지 여부를 함께 추적한다.
  const [dictionaryBridge, setDictionaryBridge] = useState<{ badge: string; expert: string } | null>(null);
  const [cameFromDictionary, setCameFromDictionary] = useState(false);

  // 투트랙 기록 모드: 기본값은 진입 장벽이 낮은 ⚡ 10초 미니멀 빠른 기록.
  const [recordMode, setRecordMode] = useState<"quick" | "precise">("quick");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickText, setQuickText] = useState("");

  // 7단계 위저드가 onDraftChange로 매번 올려보내는 "지금까지 입력한 값 전체" 스냅샷.
  // 이탈 방지 가드의 dirty 판단과 자동 임시 저장 둘 다 이 값을 데이터 소스로 쓴다.
  const [wizardDraft, setWizardDraft] = useState<DreamSurvey | null>(null);
  // localStorage에서 "불러오기"로 복원한 7단계 응답 - DreamWizard의 initialData로 그대로 흘려보낸다.
  const [restoredWizardDraft, setRestoredWizardDraft] = useState<DreamSurvey | undefined>(undefined);
  // 마운트 시 복원 가능한 임시 저장 기록이 있으면 켜지는 복구 모달 표시 여부와, 그 안의 프리뷰 박스에 쓸 요약.
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);

  const setGlobalDirty = useUnsavedChangesStore((state) => state.setDirty);

  // 새로 작성 중인 내용이 있는지 - 이미 저장된 기록을 다듬는 수정 모드는 별도 흐름이라 제외한다.
  const isDirty =
    !editingEntry && (quickTitle.trim() !== "" || quickText.trim() !== "" || isWizardDraftDirty(wizardDraft));

  useEffect(() => {
    setSelectedDate(todayDateInputValue());
  }, []);

  // 마운트 시 localStorage에 복원할 만한 임시 저장 초안이 있는지 한 번만 확인하고,
  // 복구 모달의 데이터 프리뷰 박스에 쓸 제목/본문 요약도 함께 뽑아둔다.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as DreamDraft;
      const hasContent = Boolean(draft.quickTitle?.trim() || draft.quickText?.trim()) || isWizardDraftDirty(draft.precise);
      if (!hasContent) return;

      setHasSavedDraft(true);
      const isQuick = draft.recordMode === "quick";
      const title = (isQuick ? draft.quickTitle : draft.precise?.title)?.trim() || "제목 없는 꿈";
      const content = isQuick ? draft.quickText?.trim() ?? "" : draft.precise ? buildDreamOneLineSummary(draft.precise) : "";
      setDraftPreview({ savedAt: draft.savedAt, title, content });
    } catch {
      // 손상된 초안은 조용히 무시한다.
    }
  }, []);

  // 브라우저 새로고침/탭 닫기 시도를 막는 기본 이탈 경고창. 실제 화면에 남길 문구는
  // 최신 브라우저 대부분이 자체 문구로 대체하므로 returnValue는 형식적으로만 채운다.
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // 헤더 내비게이션(NavBar)이 앱 내부 이동을 가로챌 수 있도록 dirty 여부를 전역 상태로 공유한다.
  // 페이지를 벗어나면(정상적인 언마운트) 가드가 계속 살아있지 않도록 함께 정리한다.
  useEffect(() => {
    setGlobalDirty(isDirty);
  }, [isDirty, setGlobalDirty]);

  useEffect(() => {
    return () => setGlobalDirty(false);
  }, [setGlobalDirty]);

  // 실시간 자동 임시 저장: 입력이 바뀔 때마다 곧바로 쓰지 않고, 타이핑이 잠시 멈춘 뒤
  // (디바운스) localStorage에 반영해 매 키 입력마다 쓰기 I/O가 발생하지 않게 한다.
  useEffect(() => {
    if (!isDirty) return;
    const timer = window.setTimeout(() => {
      const draft: DreamDraft = {
        savedAt: Date.now(),
        recordMode,
        quickTitle,
        quickText,
        precise: wizardDraft,
        meta: { selectedDate, mood, isPublic },
      };
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // 저장 공간 부족 등은 조용히 무시한다 - 자동 저장은 부가 기능이라 화면 흐름을 막지 않는다.
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isDirty, recordMode, quickTitle, quickText, wizardDraft, selectedDate, mood, isPublic]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as DreamDraft;
      setEditingEntry(null);
      setDictionaryBridge(null);
      setCameFromDictionary(false);
      setSelectedDate(draft.meta?.selectedDate || todayDateInputValue());
      setMood(draft.meta?.mood || MOOD_OPTIONS[3].emoji);
      setIsPublic(draft.meta?.isPublic ?? false);
      setRecordMode(draft.recordMode ?? "quick");
      setQuickTitle(draft.quickTitle ?? "");
      setQuickText(draft.quickText ?? "");
      setRestoredWizardDraft(draft.precise ?? undefined);
      setWizardKey((key) => key + 1);
      setHasSavedDraft(false);
      setDraftPreview(null);
    } catch {
      setHasSavedDraft(false);
      setDraftPreview(null);
    }
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setHasSavedDraft(false);
    setDraftPreview(null);
  };

  // 꿈해몽 사전의 "🔮 내 꿈일기에 이 상징 기록하기"에서 title(+mood/badge/expert/targetChip/dynamicsChip)이
  // 함께 넘어온 경우, 미니멀/정밀 모드 양쪽을 모두 프리필해 유저가 어느 모드로 진입해도 이어서 쓸 수 있게 한다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const titleParam = params.get("title");
    if (!titleParam) return;

    setInitialTitle(titleParam);
    setWizardKey((key) => key + 1);

    const moodParam = params.get("mood");
    const badgeParam = params.get("badge");
    const expertParam = params.get("expert");
    const targetChipParam = params.get("targetChip");
    const targetOtherParam = params.get("targetOther");
    const dynamicsChipParam = params.get("dynamicsChip");

    if (targetChipParam || dynamicsChipParam) {
      setQuickTitle(titleParam);
      setQuickText(`[사전 기반 기록] ${titleParam}`);
      setInitialActionDetail(titleParam);
      if (targetChipParam) setInitialTargetChip(targetChipParam);
      if (targetOtherParam) setInitialTargetOther(targetOtherParam);
      if (dynamicsChipParam) setInitialDynamicsChip(dynamicsChipParam);
      if (badgeParam && expertParam) setDictionaryBridge({ badge: badgeParam, expert: expertParam });
      if (moodParam === "good" || moodParam === "neutral" || moodParam === "nightmare") {
        setMood(emojiForMoodBucket(moodParam as DreamMood));
      }
      setCameFromDictionary(true);
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // 로그인 상태에 맞춘 savedDreams 동기화는 모든 화면에 공통으로 떠 있는 NavBar가 담당한다
  // (홈 캘린더와 꿈 기록소 캘린더가 항상 같은 전역 상태를 바라보게 하기 위함).

  useEffect(() => {
    if (!isModalOpen && !detailEntries && !deleteTarget) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deleteTarget) setDeleteTarget(null);
      else if (detailEntries) setDetailEntries(null);
      else setIsModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, detailEntries, deleteTarget]);

  // 결과 모달은 AI 응답을 기다리지 않고 즉시 연다 - 제목/요약처럼 이미 가진 가벼운 데이터는
  // 곧바로 보여주고, 무거운 AI 리포트 영역만 <DreamAnalyzerLoading />으로 채워 체감 대기를 줄인다.
  const handleWizardComplete = async (survey: DreamSurvey) => {
    if (isLoading) return;

    setLastSurvey(survey);
    setInterpretation(null);
    setErrorMessage(null);
    setIsModalOpen(true);
    setIsLoading(true);
    try {
      const result = await requestAiInterpretation({ date: selectedDate, emotion: mood, is_public: isPublic, survey });
      setInterpretation(result);
    } catch (error) {
      // 서버가 502로 알려주는 실제 실패 사유(getAuthErrorMessage가 response.data.detail을 그대로
      // 뽑아온다)를 감성적인 문구로 덮지 않고 그대로 보여준다 - 유저가 일시적 오류임을 인지하고
      // 같은 버튼을 다시 눌러 재시도할 수 있어야 한다.
      setErrorMessage(getAuthErrorMessage(error));
      setIsModalOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  // ⚡ 10초 미니멀 빠른 기록: 7단계 문답 없이 자유 서술 한 편만 AI 해몽 백엔드로 보낸다.
  // 저장 시에는 기존 CRUD 흐름을 그대로 재사용하기 위해, 구조화된 7단계 항목 중
  // 실제로 값이 있는 action_detail 자리에만 서술 원문을 담고 나머지는 비워 둔다
  // (선택하지 않은 항목을 지어내지 않고 정직하게 빈 상태로 남긴다).
  const handleQuickSubmit = async () => {
    if (isLoading) return;

    const title = quickTitle.trim();
    const text = quickText.trim();
    if (!title || !text) {
      setErrorMessage("제목과 꿈 내용을 모두 적어주세요.");
      return;
    }

    setErrorMessage(null);
    setLastSurvey({
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
    });
    setInterpretation(null);
    setIsModalOpen(true);
    setIsLoading(true);
    try {
      const result = await requestQuickAiInterpretation(title, text);
      setInterpretation(result);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setIsModalOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  // 미니멀 모드에 적어둔 내용을 그대로 들고 정밀 위저드로 전환한다: 제목은 Step 1로,
  // 서술은 Step 4(행동 묘사)로 프리필된다.
  const upgradeToPreciseMode = () => {
    setInitialTitle(quickTitle.trim() || undefined);
    setInitialActionDetail(quickText.trim() || undefined);
    setRecordMode("precise");
    setWizardKey((key) => key + 1);
  };

  const resetWizard = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
    setWizardKey((key) => key + 1);
    setRecordMode("quick");
    setQuickTitle("");
    setQuickText("");
    setInitialActionDetail(undefined);
    setInitialTargetChip(undefined);
    setInitialTargetOther(undefined);
    setInitialDynamicsChip(undefined);
    setDictionaryBridge(null);
    setCameFromDictionary(false);
    // 저장이 끝났으니 더 이상 "작성 중"이 아니다 - 임시 저장 초안도 함께 정리한다.
    setWizardDraft(null);
    setRestoredWizardDraft(undefined);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setHasSavedDraft(false);
  };

  const handleSave = async () => {
    if (!lastSurvey || !interpretation || !selectedDate || isSaving) return;

    setSaveError(null);
    setIsSaving(true);
    try {
      const payload = {
        dream_date: selectedDate,
        title: lastSurvey.title,
        emotion: mood,
        summary: buildDreamOneLineSummary(lastSurvey),
        is_public: isPublic,
        is_anonymous: isAnonymous,
        share_with_ai_analysis: shareWithAiAnalysis,
        survey: lastSurvey,
        interpretation,
      };
      const saved = editingEntry ? await updateDream(editingEntry.id, payload) : await createDream(payload);
      upsertEntry(saved);
      // 저장이 끝났으니 더 이상 "작성 중"이 아니다 - 임시 저장 초안도 함께 정리한다.
      setWizardDraft(null);
      setRestoredWizardDraft(undefined);
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setHasSavedDraft(false);
      // 사전에서 넘어온 기록은 저장과 동시에 홈으로 돌아가, 오늘 날짜 노드가 캘린더에
      // 실시간으로 점등되는 것을 바로 보여준다. 그 외에는 계속 기록소에 머문다(연속 기록용).
      if (cameFromDictionary) {
        setIsModalOpen(false);
        router.push("/");
        return;
      }
      resetWizard();
    } catch (error) {
      setSaveError(getAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (entry: DreamEntryRecord) => {
    setDetailEntries(null);
    setEditingEntry(entry);
    setSelectedDate(entry.dream_date);
    setMood(entry.emotion);
    setIsPublic(entry.is_public);
    setIsAnonymous(entry.is_anonymous);
    setShareWithAiAnalysis(entry.share_with_ai_analysis);
    setInterpretation(null);
    setErrorMessage(null);
    setSaveError(null);
    setWizardKey((key) => key + 1);
    // ⚡ 10초 미니멀로 쓴 기록은 구조화된 7단계 데이터가 애초에 없으므로, 수정할 때도
    // 원래 작성했던 미니멀 자유 서술 UI 그대로 열어준다. 그 외에는 정밀 위저드로 연다.
    const minimal = isMinimalEntry(entry.survey);
    setRecordMode(minimal ? "quick" : "precise");
    setQuickTitle(minimal ? entry.title : "");
    setQuickText(minimal ? entry.survey.action_detail : "");
    setDictionaryBridge(null);
    setCameFromDictionary(false);
    setWizardDraft(null);
    setRestoredWizardDraft(undefined);
  };

  // 수정 모드 취소, 그리고 "오늘 다른 꿈 추가 기록" 버튼이 공유하는 초기화 로직 -
  // 편집 상태를 비우고 오늘 날짜의 새 빈 세션으로 되돌린다.
  const startNewToday = () => {
    setEditingEntry(null);
    setSelectedDate(todayDateInputValue());
    setMood(MOOD_OPTIONS[3].emoji);
    setIsPublic(false);
    setIsAnonymous(true);
    setShareWithAiAnalysis(false);
    setInterpretation(null);
    setErrorMessage(null);
    setSaveError(null);
    setWizardKey((key) => key + 1);
    setRecordMode("quick");
    setQuickTitle("");
    setQuickText("");
    setInitialActionDetail(undefined);
    setInitialTargetChip(undefined);
    setInitialTargetOther(undefined);
    setInitialDynamicsChip(undefined);
    setDictionaryBridge(null);
    setCameFromDictionary(false);
    // 새로 시작하기로 한 것이므로, 남아있던 임시 저장 초안도 함께 정리한다.
    setWizardDraft(null);
    setRestoredWizardDraft(undefined);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setHasSavedDraft(false);
  };

  const handleSelectDay = (dayEntries: DreamEntryRecord[]) => {
    if (dayEntries.length === 0) return;
    setDetailEntries([...dayEntries].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setActiveDetailIndex(0);
    setDetailVisible(true);
  };

  // 캘린더의 "오늘의 무의식 기록하기" 유도 문구를 누르면, 모바일에서 아래에 있는
  // 작성 에디터로 부드럽게 스크롤해 준다 (데스크톱은 이미 나란히 보이므로 체감 효과는 적다).
  const scrollToEditor = () => {
    document.getElementById("dream-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 탭/화살표로 다른 꿈을 볼 때 짧게 페이드 아웃-인 시켜 전환이 부드럽게 느껴지게 한다.
  const switchDetailTab = (index: number) => {
    if (!detailEntries || index === activeDetailIndex || index < 0 || index >= detailEntries.length) return;
    setDetailVisible(false);
    window.setTimeout(() => {
      setActiveDetailIndex(index);
      setDetailVisible(true);
    }, 150);
  };

  // 상세 보기 액션 바의 공유하기 - 카드 안이 아니라 수정/삭제와 나란한 위치에서 4개 항목 전체를 공유한다.
  const handleShareDetail = async (entry: DreamEntryRecord) => {
    if (!entry.interpretation.counseling_report) return;
    const result = await shareCounselingReport(entry.interpretation.counseling_report, `${entry.emotion} ${entry.title}`);
    if (result === "copied") {
      setDetailShareCopied(true);
      window.setTimeout(() => setDetailShareCopied(false), 1600);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;

    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteDream(deleteTarget.id);
      removeEntry(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(getAuthErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* 오로라 블러 배경 (홈 화면과 동일한 무드) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-700/30 blur-[110px] animate-aurora" />
        <div
          className="absolute top-1/4 -right-32 h-80 w-80 rounded-full bg-indigo-600/25 blur-[110px] animate-aurora"
          style={{ animationDelay: "4s" }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-700/20 blur-[110px] animate-aurora"
          style={{ animationDelay: "8s" }}
        />
      </div>

      <NavBar />

      <main className="relative mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-white">꿈 기록소</h1>
        <p className="mt-1 text-sm text-slate-400">지난밤의 꿈을 기록하고, AI에게 해몽을 받아보세요.</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr] lg:items-start">
          {/* 좌측: 꿈 별자리 캘린더 & 출석 체크 */}
          <DiaryCalendarPanel onSelectDay={handleSelectDay} onRequestWrite={scrollToEditor} />

          {/* 우측: 꿈 작성 에디터 - 저장/수정/삭제는 유저 소유 데이터라 로그인이 필요하다 */}
          <div
            id="dream-editor"
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              {editingEntry ? (
                <div className="flex flex-1 items-center justify-between rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-xs text-violet-200">
                  <span>✏️ {editingEntry.dream_date} 기록을 수정하는 중이에요</span>
                  <button type="button" onClick={startNewToday} className="text-violet-300/70 underline-offset-2 hover:text-white hover:underline">
                    수정 취소
                  </button>
                </div>
              ) : dictionaryBridge ? (
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-2.5 text-xs text-purple-200">
                  <span className="shrink-0 rounded-full border border-purple-400/40 bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium">
                    {dictionaryBridge.badge}
                  </span>
                  <span>🔮 사전에서 {dictionaryBridge.expert}의 시선으로 살펴본 상징을 기록하는 중이에요</span>
                </div>
              ) : (
                <span className="text-xs text-slate-500">오늘의 무의식을 하나씩 기록해 보세요.</span>
              )}
              <button
                type="button"
                onClick={startNewToday}
                className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/10 px-3.5 py-2 text-xs font-medium text-violet-200 transition-colors hover:border-violet-400/60 hover:bg-violet-500/20"
              >
                ➕ 오늘 다른 꿈 추가 기록
              </button>
            </div>


            {/* 고정형 메타 정보: 날짜 · 공개 범위. 꿈의 분위기는 정밀 기록 위저드의 Step 1로
                옮겨졌다 - ⚡ 빠른 기록 모드에는 위저드가 없어 아래 빠른 기록 영역에 따로 둔다. */}
            <div className="space-y-5">
              <div>
                <label className="text-xs text-indigo-300/70">날짜</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-slate-100 [color-scheme:dark] focus:border-violet-400/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-indigo-300/70">공개 범위</label>
                <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5">
                  <button
                    type="button"
                    onClick={() => setIsPublic(false)}
                    className={`rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 ${
                      !isPublic
                        ? "bg-violet-500/30 text-white shadow-[0_0_12px_rgba(167,139,250,0.3)]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    🔒 나만 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPublic(true)}
                    className={`rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 ${
                      isPublic
                        ? "bg-violet-500/30 text-white shadow-[0_0_12px_rgba(167,139,250,0.3)]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    🌐 커뮤니티에 공유
                  </button>
                </div>

                {/* 공개로 공유할 때만 의미 있는 두 가지 세부 설정: 어떤 이름으로 낼지, AI 리포트도 함께 낼지 */}
                {isPublic && (
                  <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div>
                      <label className="text-xs text-indigo-300/70">어떤 이름으로 공유할까요?</label>
                      <div className="mt-2">
                        <IdentitySwitch isAnonymous={isAnonymous} onChange={setIsAnonymous} nickname={nickname} />
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="text-xs leading-relaxed text-slate-300">
                        체크 시 AI 해몽 결과도 피드에 함께 공개합니다
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={shareWithAiAnalysis}
                        onClick={() => setShareWithAiAnalysis((prev) => !prev)}
                        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                          shareWithAiAnalysis ? "bg-violet-500" : "bg-white/15"
                        }`}
                      >
                        <span
                          className={`ml-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                            shareWithAiAnalysis ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="my-7 h-px bg-white/10" />

            {/* 투트랙 기록 모드 탭: 기존 기록을 다듬는 수정 모드에서는 원래 작성했던 모드(quick/precise)로 고정된다 */}
            {!editingEntry && (
              <div className="mb-6 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setRecordMode("quick")}
                  className={`rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 ${
                    recordMode === "quick"
                      ? "bg-violet-500/30 text-white shadow-[0_0_12px_rgba(167,139,250,0.3)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  ⚡ 10초 미니멀 빠른 기록
                </button>
                <button
                  type="button"
                  onClick={() => setRecordMode("precise")}
                  className={`rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 ${
                    recordMode === "precise"
                      ? "bg-violet-500/30 text-white shadow-[0_0_12px_rgba(167,139,250,0.3)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🔮 7단계 정밀 분석 기록
                </button>
              </div>
            )}

            {recordMode === "quick" ? (
              /* ⚡ 10초 미니멀 빠른 기록: 제목 + 자유 서술 하나만으로 즉시 AI 해몽 요청 */
              <div>
                <label className="text-xs text-indigo-300/70">오늘의 꿈 제목</label>
                <input
                  type="text"
                  value={quickTitle}
                  onChange={(event) => setQuickTitle(event.target.value)}
                  placeholder="예: 황금 고래와 함께한 하늘 비행"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-slate-500/80 focus:border-violet-400/60 focus:outline-none"
                />

                <div className="mt-5">
                  <label className="text-xs text-indigo-300/70">꿈의 분위기</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MOOD_OPTIONS.map((option) => (
                      <button
                        key={option.emoji}
                        type="button"
                        onClick={() => setMood(option.emoji)}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs backdrop-blur-md transition-all duration-200 ${
                          mood === option.emoji
                            ? "border-violet-400/70 bg-violet-500/25 text-white shadow-[0_0_16px_rgba(167,139,250,0.35)]"
                            : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/30 hover:text-slate-200"
                        }`}
                      >
                        <span className="text-sm">{option.emoji}</span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <label className="text-xs text-indigo-300/70">지난밤 꾼 꿈을 자유롭게 적어주세요</label>

                  <div className="mt-1.5">
                    <DreamGuidePanel />
                  </div>

                  <textarea
                    value={quickText}
                    onChange={(event) => setQuickText(event.target.value)}
                    placeholder="위 가이드를 참고하여 탐험가님의 꿈 조각을 자유롭게 적어보세요..."
                    rows={7}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-slate-500/60 focus:border-violet-400/60 focus:outline-none"
                  />

                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={upgradeToPreciseMode}
                      className="text-xs text-violet-300/70 underline-offset-2 transition-colors hover:text-violet-200 hover:underline"
                    >
                      💡 더 정밀한 7단계 분석으로 전환
                    </button>
                  </div>
                </div>

                <div className="group relative mt-6">
                  <div className="absolute inset-0 rounded-full bg-violet-500 opacity-40 blur-xl transition-all duration-300 ease-out group-hover:opacity-90 group-hover:blur-2xl" />
                  <button
                    type="button"
                    onClick={handleQuickSubmit}
                    disabled={isLoading || !quickTitle.trim() || !quickText.trim()}
                    className="relative w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 group-hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {editingEntry ? "💾 수정 완료 및 재분석" : "⚡ 10초 만에 AI 해몽 받기"}
                  </button>
                </div>
              </div>
            ) : (
              /* 🔮 7단계 정밀 분석 기록: 칩 선택 + 주관식 가이드 위저드 */
              <DreamWizard
                key={wizardKey}
                onComplete={handleWizardComplete}
                isSubmitting={isLoading}
                mood={mood}
                onMoodChange={setMood}
                initialData={editingEntry?.survey ?? restoredWizardDraft}
                initialTitle={editingEntry ? undefined : initialTitle}
                initialActionDetail={editingEntry ? undefined : initialActionDetail}
                initialTargetChip={editingEntry ? undefined : initialTargetChip}
                initialTargetOther={editingEntry ? undefined : initialTargetOther}
                initialDynamicsChip={editingEntry ? undefined : initialDynamicsChip}
                onDraftChange={editingEntry ? undefined : setWizardDraft}
                submitLabel={editingEntry ? "💾 수정 완료 및 재분석" : "🔮 내 꿈 분석결과 확인하기"}
              />
            )}

            {errorMessage && (
              <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-300">
                {errorMessage}
              </p>
            )}

            {/* 로그인 게이트: 저장/수정/삭제는 유저 소유 데이터라 로그인이 필요하다 */}
            {!isAuthenticated && (
              <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-slate-950/80 backdrop-blur-md">
                <Link
                  href="/login"
                  className="rounded-full border border-violet-400/40 bg-white/5 px-5 py-2.5 text-sm text-violet-200 shadow-[0_0_20px_rgba(167,139,250,0.3)] transition-colors hover:border-violet-300/60 hover:text-white"
                >
                  로그인하고 나만의 꿈 일기를 기록해보세요 ✨
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 임시 저장 데이터 복구 모달: 마운트 시 복원 가능한 초안이 있으면 전체 화면을 덮는
          모달로 강하게 안내한다 - 예전에는 은은한 배너였지만, 데이터 유실을 막으려면 그냥
          지나치기 쉬운 배너보다 확실히 눈에 띄는 편이 낫다. */}
      {hasSavedDraft && !editingEntry && draftPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-purple-500/30 bg-slate-950 p-7 shadow-[0_0_50px_rgba(139,92,246,0.3)]">
            <p className="text-center text-xs tracking-widest text-indigo-300/70 uppercase">Draft Recovery</p>
            <h2 className="mt-1.5 text-center text-lg font-semibold text-white">💡 작성 중이던 꿈의 조각이 남아있어요</h2>
            <p className="mt-2 text-center text-sm text-slate-400">이어서 기록할까요, 아니면 새로 시작할까요?</p>

            <div className="my-4 rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <p className="text-xs text-violet-300/70">{formatDraftSavedAt(draftPreview.savedAt)}</p>
              <p className="mt-1.5 text-sm font-medium text-slate-200">{draftPreview.title}</p>
              {draftPreview.content && (
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {draftPreview.content.slice(0, 40)}
                  {draftPreview.content.length > 40 ? "..." : ""}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discardDraft}
                className="px-4 py-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
              >
                새로 쓰기
              </button>
              <button
                type="button"
                onClick={restoreDraft}
                className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 font-medium text-white shadow-lg transition-transform hover:from-purple-500 hover:to-indigo-500 active:scale-95"
              >
                🔮 이어서 기록하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 해몽 결과 모달: AI 응답을 기다리지 않고 즉시 연다 - 제목/요약(가벼운 데이터)은 곧바로
          보여주고, 무거운 리포트 영역만 interpretation이 도착할 때까지 로딩으로 채운다. */}
      {isModalOpen && lastSurvey && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-300 ${
            isModalOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />

          <div
            className={`relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl transition-all duration-500 ease-out ${
              isModalOpen ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              aria-label="닫기"
              className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
            >
              ✕
            </button>

            {/* 즉시 렌더링 영역: 유저가 이미 입력한 제목/선택 칩 요약이라 AI 응답을 기다릴 필요가 없다 */}
            <div className="text-center">
              <p className="text-xs tracking-widest text-indigo-300/70 uppercase">AI Dream Interpretation</p>
              <h3 className="mt-1 text-2xl font-semibold text-white">
                {mood} {lastSurvey.title || "제목 없는 꿈"}
              </h3>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xs leading-relaxed text-slate-400">
              {buildDreamOneLineSummary(lastSurvey)}
            </div>

            {!interpretation ? (
              <DreamAnalyzerLoading />
            ) : (
              <>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {interpretation.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1 text-xs text-violet-200"
                    >
                      {tag.startsWith("#") ? tag : `#${tag}`}
                    </span>
                  ))}
                </div>

                <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-300">
                  {interpretation.description}
                </p>

                {/* 전문가의 시선: 모든 학파를 나열하지 않고, 이 꿈과 가장 찰떡궁합인 전문가 1~2명만 깊이 있게 */}
                <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-200">
                      {interpretation.expert_badge}
                    </span>
                    <span className="text-xs text-violet-300/80">{interpretation.selected_expert}의 시선</span>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{interpretation.expert_insight}</p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-center text-xs text-indigo-300/70">행운의 아이템</p>
                    <p className="mt-1.5 text-center font-medium text-white">{interpretation.lucky_item}</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{interpretation.lucky_item_reason}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-center text-xs text-indigo-300/70">행운의 숫자</p>
                    <p className="mt-1.5 text-center font-medium text-white">{interpretation.lucky_number}</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{interpretation.lucky_number_reason}</p>
                  </div>
                </div>

                {/* 무의식 상담 리포트: 해몽 본문과는 별개로, 공감/분석/경고/행동 4가지 관점을 인스타그램 스토리
                    형태의 4컷 스와이프 카드로 보여준다. 저장 전 상태라 카드 하단 액션 바가 저장까지 겸한다.
                    이 기능 이전에 저장된 기록은 counseling_report가 없을 수 있어 있을 때만 렌더링한다. */}
                {interpretation.counseling_report ? (
                  <>
                    <div className="mt-6">
                      <CounselingStoryView
                        report={interpretation.counseling_report}
                        tags={interpretation.tags}
                        onSave={handleSave}
                        isSaving={isSaving}
                        saveLabel={editingEntry ? "수정 내용 저장하고 확인" : "캘린더에 저장하고 확인"}
                      />
                    </div>

                    {saveError && (
                      <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-300">
                        {saveError}
                      </p>
                    )}
                    {!isAuthenticated && (
                      <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-200">
                        저장하려면 로그인이 필요해요.
                      </p>
                    )}

                    <div className="mt-4 text-center">
                      <Link
                        href="/community"
                        className="text-xs text-slate-400 underline-offset-2 transition-colors hover:text-violet-200 hover:underline"
                      >
                        커뮤니티로 이동
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    {saveError && (
                      <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-300">
                        {saveError}
                      </p>
                    )}
                    {!isAuthenticated && (
                      <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-200">
                        저장하려면 로그인이 필요해요.
                      </p>
                    )}

                    <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={!isAuthenticated || isSaving}
                        className="flex-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? "저장 중..." : editingEntry ? "수정 내용 저장하고 확인" : "캘린더에 저장하고 확인"}
                      </button>
                      <Link
                        href="/community"
                        className="flex-1 rounded-full border border-white/10 px-5 py-2.5 text-center text-sm text-slate-300 transition-colors hover:border-violet-400/40 hover:text-violet-200"
                      >
                        커뮤니티로 이동
                      </Link>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 상세 보기 모달: 캘린더의 불 켜진 노드를 클릭하면 열린다. 하루에 꿈이 여러 개면 탭으로 넘나든다 */}
      {detailEntries && activeDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDetailEntries(null)} />

          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl">
            <button
              type="button"
              onClick={() => setDetailEntries(null)}
              aria-label="닫기"
              className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
            >
              ✕
            </button>

            <p className="text-center text-xs tracking-widest text-indigo-300/70 uppercase">
              {activeDetail.dream_date}
              {detailEntries.length > 1 && ` · ${activeDetailIndex + 1} / ${detailEntries.length}`}
            </p>

            {/* 탭 + 좌우 화살표: 같은 날짜에 기록된 여러 꿈 사이를 오간다 */}
            {detailEntries.length > 1 && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => switchDetailTab(activeDetailIndex - 1)}
                  disabled={activeDetailIndex === 0}
                  aria-label="이전 꿈"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ◀
                </button>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {detailEntries.map((entry, index) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => switchDetailTab(index)}
                      className={`max-w-[9rem] truncate rounded-full border px-3 py-1 text-xs transition-all duration-200 ${
                        index === activeDetailIndex
                          ? "border-violet-400/70 bg-violet-500/25 text-white shadow-[0_0_12px_rgba(167,139,250,0.35)]"
                          : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/30 hover:text-slate-200"
                      }`}
                    >
                      {entry.emotion} {entry.title}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => switchDetailTab(activeDetailIndex + 1)}
                  disabled={activeDetailIndex === detailEntries.length - 1}
                  aria-label="다음 꿈"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ▶
                </button>
              </div>
            )}

            <div className={`transition-opacity duration-300 ${detailVisible ? "opacity-100" : "opacity-0"}`}>
              <h3 className="mt-4 text-center text-2xl font-semibold text-white">
                {activeDetail.emotion} {activeDetail.title}
              </h3>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {activeDetail.interpretation.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1 text-xs text-violet-200"
                  >
                    {tag.startsWith("#") ? tag : `#${tag}`}
                  </span>
                ))}
              </div>

              <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-300">
                {activeDetail.interpretation.description}
              </p>

              {/* 전문가의 시선: 모든 학파를 나열하지 않고, 이 꿈과 가장 찰떡궁합인 전문가 1~2명만 깊이 있게 */}
              <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-200">
                    {activeDetail.interpretation.expert_badge}
                  </span>
                  <span className="text-xs text-violet-300/80">{activeDetail.interpretation.selected_expert}의 시선</span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{activeDetail.interpretation.expert_insight}</p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-center text-xs text-indigo-300/70">행운의 아이템</p>
                  <p className="mt-1.5 text-center font-medium text-white">{activeDetail.interpretation.lucky_item}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-center text-xs text-indigo-300/70">행운의 숫자</p>
                  <p className="mt-1.5 text-center font-medium text-white">{activeDetail.interpretation.lucky_number}</p>
                </div>
              </div>

              {/* 무의식 상담 리포트: 인스타그램 스토리 형태의 4컷 스와이프 카드 (읽기 전용 - 저장 액션 없음).
                  이 기능 이전에 저장된 기록은 counseling_report가 없을 수 있어 있을 때만 렌더링한다. */}
              {activeDetail.interpretation.counseling_report && (
                <div className="mt-6">
                  <CounselingStoryView
                    report={activeDetail.interpretation.counseling_report}
                    tags={activeDetail.interpretation.tags}
                  />
                </div>
              )}
            </div>

            <div className="mt-7 flex flex-row gap-2">
              {activeDetail.interpretation.counseling_report && (
                <button
                  type="button"
                  onClick={() => handleShareDetail(activeDetail)}
                  className="flex-1 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-transform hover:-translate-y-0.5"
                >
                  {detailShareCopied ? "✅ 복사 완료" : "🔗 공유하기"}
                </button>
              )}
              <button
                type="button"
                onClick={() => startEdit(activeDetail)}
                className="flex-1 rounded-full border border-violet-400/40 bg-violet-500/15 px-5 py-2.5 text-sm font-semibold text-violet-100 transition-transform hover:-translate-y-0.5"
              >
                ✏️ 수정하기
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(activeDetail);
                  setDetailEntries(null);
                }}
                className="flex-1 rounded-full border border-red-400/40 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-200 transition-transform hover:-translate-y-0.5"
              >
                🗑️ 삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteTarget(null)} />

          <div className="relative w-full max-w-sm rounded-3xl border border-red-400/30 bg-white/10 p-7 text-center shadow-[0_0_60px_rgba(239,68,68,0.25)] backdrop-blur-2xl">
            <p className="text-lg font-semibold text-white">이 꿈 기록을 삭제할까요?</p>
            <p className="mt-2 text-sm text-slate-400">
              {deleteTarget.dream_date} · {deleteTarget.title}
            </p>
            <p className="mt-1 text-xs text-slate-500">삭제하면 되돌릴 수 없어요.</p>

            {deleteError && <p className="mt-3 text-xs text-red-300">{deleteError}</p>}

            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 rounded-full border border-white/10 px-5 py-2.5 text-sm text-slate-300 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 rounded-full bg-gradient-to-r from-red-600 to-rose-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "삭제 중..." : "삭제하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
