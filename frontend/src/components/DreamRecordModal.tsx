"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  buildDreamOriginalContent,
  createDream,
  requestAiInterpretation,
  requestQuickAiInterpretation,
  type AiInterpretation,
  type DreamEntryRecord,
  type DreamSurvey,
} from "@/api/dream";
import { getPendingSeedCheck, type DreamSeedRecord } from "@/api/seeds";
import CounselingStoryView from "@/components/CounselingStoryView";
import DreamDateConfirm from "@/components/DreamDateConfirm";
import DreamInterpretationLoading from "@/components/DreamInterpretationLoading";
import DreamOriginalQuote from "@/components/DreamOriginalQuote";
import DreamWizard from "@/components/DreamWizard";
import MoodTagGrid from "@/components/MoodTagGrid";
import SeedBloomResult from "@/components/SeedBloomResult";
import { resetDraftPromptCount, shouldShowDraftPrompt } from "@/lib/draftPromptLimiter";
import { defaultDreamDateInputValue, todayDateInputValue } from "@/lib/dreamDate";
import { useUnsavedChangesStore } from "@/store/useUnsavedChangesStore";

// /diary 페이지 시절과 같은 키를 그대로 쓴다 - 이미 유저 브라우저에 남아있는 초안/미저장
// 리포트도 마이그레이션 없이 그대로 이어서 복구된다.
export const DREAM_RECORD_DRAFT_KEY = "dream_hub_draft_diary";
export const DREAM_RECORD_CACHED_ANALYSIS_KEY = "cached_dream_analysis";
const AUTOSAVE_DEBOUNCE_MS = 300;

const GUIDE_ITEMS = [
  { emoji: "👤", label: "인물", text: "꿈에 등장한 사람이나 존재를 자세히 적어주세요." },
  { emoji: "📍", label: "장소", text: "꿈이 펼쳐진 장소와 주변 분위기를 묘사해 주세요." },
  { emoji: "🎬", label: "사건", text: "꿈에서 일어난 일을 기억나는 순서대로 적어주세요." },
  { emoji: "🔮", label: "상징", text: "꿈속에서 인상 깊었던 상징이나 특별한 요소를 모두 적어주세요." },
  { emoji: "❤️", label: "감정", text: "꿈을 꾸는 동안 느낀 감정과, 잠에서 깬 뒤 남아 있던 감정을 각각 표현해 주세요." },
];

interface DreamDraft {
  savedAt: number;
  recordMode: "quick" | "precise";
  quickTitle: string;
  quickText: string;
  precise: DreamSurvey | null;
  meta: { selectedDate: string; mood: string };
}

interface DraftPreview {
  savedAt: number;
  title: string;
  content: string;
}

export interface CachedAnalysis {
  savedAt: number;
  selectedDate: string;
  mood: string;
  lastSurvey: DreamSurvey;
  interpretation: AiInterpretation;
  // "quick_interpret"이면 AI 해몽 빠른 진입 모달에서 넘어온 결과라는 뜻 - 저장 시 정원의 꽃
  // 대신 표본으로 남기도록 서버에 그대로 전달한다. 이 모달 자체(정밀/미니멀 모드)에서 만든
  // 결과는 항상 정식 루틴이라 origin을 생략하면(undefined) "normal"로 취급한다.
  origin?: "normal" | "quick_interpret";
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

export interface DreamRecordPrefill {
  quickText?: string;
  title?: string;
  mood?: string;
  actionDetail?: string;
  targetChip?: string;
  targetOther?: string;
  dynamicsChip?: string;
  dictionaryBadge?: string;
  dictionaryExpert?: string;
  cameFromDictionary?: boolean;
}

interface DreamRecordModalProps {
  onClose: () => void;
  onSaved: (entry: DreamEntryRecord) => void;
  prefill?: DreamRecordPrefill;
  // "이어서 확인하기" 토스트를 눌러 열렸으면, 로컬에 캐시된 미저장 리포트를 곧바로 복원한다.
  resumeFromCache?: boolean;
  // 이 날짜의 기록을 남기려고 들어온 경우(예: 일기장 과거 카드의 "이 날의 꿈 기록하기") 날짜
  // 입력을 오늘로 초기화하지 않고 곧장 그 날짜로 채워 둔다.
  initialDate?: string;
  // "modal"(기본값): 기존처럼 배경을 덮는 오버레이 팝업. "page": /journal/record 같은 전용
  // 페이지 안에 그대로 흐르는 일반 콘텐츠로 렌더링한다(배경 오버레이/클릭-닫기 없음, 스크롤도
  // 내부 스크롤 대신 페이지 전체 스크롤을 따른다). 내부 로직(초안/AI 해몽/저장)은 완전히 동일하고
  // 바깥 감싸는 레이아웃만 갈린다 - 뜨는 서브 모달(초안 복구/해몽 결과)은 두 모드 모두 오버레이로 남는다.
  variant?: "modal" | "page";
}

// /diary(꿈 기록소) 페이지에 있던 AI 해몽 기록 흐름을 그대로 포팅한 모달 - 일기장(/journal)을
// 벗어나지 않고 이 모달 안에서 기록+AI 해몽+저장까지 전부 끝낼 수 있다. 캘린더/상세보기/발행
// 설정/삭제처럼 "저장된 기록을 다시 들여다보는" 기능은 이미 저널 타임라인이 대신하므로 옮기지
// 않았다 - 이 모달은 순수하게 "새 꿈을 기록하는" 흐름만 담당한다.
export default function DreamRecordModal({
  onClose,
  onSaved,
  prefill,
  resumeFromCache,
  initialDate,
  variant = "modal",
}: DreamRecordModalProps) {
  // "꿈 날짜 = 취침일" 규칙 - initialDate가 없으면 자정~정오는 어제(전날 밤), 그 외 시간대는
  // 오늘로 스스로 추정해 채운다(defaultDreamDateInputValue).
  const [selectedDate, setSelectedDate] = useState(initialDate ?? defaultDreamDateInputValue());
  // 날짜가 조용히 미리 채워져 있으면 확인 없이 지나칠 수 있어, 명시적으로 답해야만 기록
  // 입력으로 넘어가게 한다. 다만 날짜가 이미
  // 다른 화면에서 결정되고 넘어온 경우(과거 카드의 "이 날의 꿈 기록하기" -> initialDate,
  // AI 해몽 빠른 진입에서 "일기장에 담기"로 넘어온 경우 -> resumeFromCache)까지 다시 묻는 건
  // 중복 확인이라 그런 경로는 처음부터 확정된 것으로 취급한다.
  const [isDateConfirmed, setIsDateConfirmed] = useState(Boolean(initialDate) || Boolean(resumeFromCache));
  // 이 모달 자체(빠른/정밀 모드)에서 만든 결과는 항상 정식 루틴("normal")이고, AI 해몽 빠른
  // 진입 모달에서 "일기장에 담기"로 넘어온 캐시를 재개할 때만 "quick_interpret"로 바뀐다 -
  // 저장 시 서버가 이 값으로 정원의 꽃 대신 표본을 남길지 정한다.
  const [saveOrigin, setSaveOrigin] = useState<"normal" | "quick_interpret">("normal");
  const isPageVariant = variant === "page";
  const [mood, setMood] = useState(prefill?.mood ?? "");
  const [moodError, setMoodError] = useState(false);
  const quickTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [interpretation, setInterpretation] = useState<AiInterpretation | null>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSurvey, setLastSurvey] = useState<DreamSurvey | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 무의식 씨앗 개화 미리보기 - 결과 화면(SeedBloomResult)이 어떤 씨앗이 피었는지 보여줘야
  // 하므로, 결과 모달이 열리는 즉시(AI 응답을 기다리지 않고) 조회해 둔다.
  const [pendingSeedForBloom, setPendingSeedForBloom] = useState<DreamSeedRecord | null>(null);
  useEffect(() => {
    if (!isResultOpen) return;
    getPendingSeedCheck()
      .then((seed) => setPendingSeedForBloom(seed))
      .catch(() => {});
  }, [isResultOpen]);
  // 결과 화면이 닫히면 이전에 조회해둔 씨앗 정보를 더 이상 쓰지 않는다 - effect 안에서
  // 별도로 null 리셋할 필요 없이, 렌더에 쓰는 값 자체를 isResultOpen으로 파생시킨다.
  const effectivePendingSeedForBloom = isResultOpen ? pendingSeedForBloom : null;

  const [recordMode, setRecordMode] = useState<"quick" | "precise">("quick");

  // 날짜가 확정되는 순간 다음 입력(미니멀 모드의 서술란)으로 포커스를 옮긴다 - 정밀 모드는
  // DreamWizard 내부 첫 필드를 이 컴포넌트가 알 수 없어 포커스 이동을 시도하지 않는다.
  useEffect(() => {
    if (isDateConfirmed && recordMode === "quick") quickTextareaRef.current?.focus();
  }, [isDateConfirmed, recordMode]);
  const [quickTitle, setQuickTitle] = useState(prefill?.title ?? "");
  const [quickText, setQuickText] = useState(prefill?.quickText ?? "");

  const [initialTitle, setInitialTitle] = useState<string | undefined>(prefill?.title);
  const [initialActionDetail, setInitialActionDetail] = useState<string | undefined>(prefill?.actionDetail);
  // 아래 셋 + dictionaryBridge는 prefill로 들어온 시점 값 그대로 위저드에 한 번만 흘려보내면
  // 되고 모달 생애주기 동안 다시 바뀔 일이 없어(quick<->precise 전환도 title/actionDetail만
  // 다시 채운다) useState가 아니라 그냥 상수로 둔다.
  const initialTargetChip = prefill?.targetChip;
  const initialTargetOther = prefill?.targetOther;
  const initialDynamicsChip = prefill?.dynamicsChip;
  const dictionaryBridge =
    prefill?.dictionaryBadge && prefill?.dictionaryExpert
      ? { badge: prefill.dictionaryBadge, expert: prefill.dictionaryExpert }
      : null;

  const [wizardDraft, setWizardDraft] = useState<DreamSurvey | null>(null);
  const [restoredWizardDraft, setRestoredWizardDraft] = useState<DreamSurvey | undefined>(undefined);
  // hasSavedDraft는 "지금 강제 복구 모달을 띄울지"(최대 2회 제한), hasDraftAvailable은
  // "초안이 존재하긴 하는지" - 한도를 넘겨 모달을 못 띄워도 수동으로 불러오는 링크는 계속 보여준다.
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [hasDraftAvailable, setHasDraftAvailable] = useState(false);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);

  const setGlobalDirty = useUnsavedChangesStore((state) => state.setDirty);

  const isDirty = quickTitle.trim() !== "" || quickText.trim() !== "" || isWizardDraftDirty(wizardDraft);
  const hasUnsavedReport = interpretation !== null && lastSurvey !== null;

  // 사전/홈 히어로에서 넘어온 프리필이 targetChip/dynamicsChip을 동반하면(=사전 연계), 미니멀/정밀
  // 모드 둘 다 프리필해 어느 모드로 진입해도 이어서 쓸 수 있게 한다 - 렌더 중 ref 접근/수정은
  // 이 프로젝트의 react-hooks/refs 규칙이 막아서(React 문서의 "렌더 중 조정" 패턴을 못 쓴다),
  // prefill 참조 변경에 반응하는 effect로 처리한다.
  useEffect(() => {
    if (!prefill?.targetChip && !prefill?.dynamicsChip) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill(외부 이벤트) 변경에 반응, ref 사용이 금지돼 effect로 처리
    setWizardKey((key) => key + 1);
  }, [prefill]);

  useEffect(() => {
    if (!resumeFromCache) return;
    // localStorage는 브라우저 전용 외부 시스템이라 마운트 이후 effect에서만 읽을 수 있다.
    try {
      const raw = localStorage.getItem(DREAM_RECORD_CACHED_ANALYSIS_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as CachedAnalysis;
      if (!cached.interpretation || !cached.lastSurvey) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage(외부 시스템) 조회 결과에 반응
      setSelectedDate(cached.selectedDate || defaultDreamDateInputValue());
      setMood(cached.mood || "");
      setLastSurvey(cached.lastSurvey);
      setInterpretation(cached.interpretation);
      setSaveOrigin(cached.origin === "quick_interpret" ? "quick_interpret" : "normal");
      setIsResultOpen(true);
    } catch {
      // 손상된 캐시는 조용히 무시한다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AI 응답이 도착해 리포트가 준비될 때마다(그리고 저장 전까지 계속) 캐시를 최신 상태로 덮어쓴다.
  useEffect(() => {
    if (!interpretation || !lastSurvey) return;
    const cache: CachedAnalysis = { savedAt: Date.now(), selectedDate, mood, lastSurvey, interpretation, origin: saveOrigin };
    try {
      localStorage.setItem(DREAM_RECORD_CACHED_ANALYSIS_KEY, JSON.stringify(cache));
    } catch {
      // 저장 공간 부족 등은 조용히 무시한다.
    }
  }, [interpretation, lastSurvey, selectedDate, mood, saveOrigin]);

  // 마운트 시 복원 가능한 임시 저장 초안이 있는지 한 번만 확인한다 - resumeFromCache로 이미 결과가
  // 복원되는 흐름이면 초안 복구 모달과 겹치지 않도록 건너뛴다.
  useEffect(() => {
    if (resumeFromCache) return;
    // localStorage는 브라우저 전용 외부 시스템이라 마운트 이후 effect에서만 읽을 수 있다.
    try {
      const raw = localStorage.getItem(DREAM_RECORD_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as DreamDraft;
      const hasContent = Boolean(draft.quickTitle?.trim() || draft.quickText?.trim()) || isWizardDraftDirty(draft.precise);
      if (!hasContent) return;

      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage(외부 시스템) 조회 결과에 반응
      setHasDraftAvailable(true);
      const isQuick = draft.recordMode === "quick";
      const title = (isQuick ? draft.quickTitle : draft.precise?.title)?.trim() || "제목 없는 꿈";
      const content = isQuick ? (draft.quickText?.trim() ?? "") : draft.precise ? buildDreamOneLineSummary(draft.precise) : "";
      setDraftPreview({ savedAt: draft.savedAt, title, content });
      // 같은 초안에 대해 강제로 뜨는 복구 모달은 최대 2번까지만 - 그 이후로는 조용히 건너뛴다.
      if (shouldShowDraftPrompt(DREAM_RECORD_DRAFT_KEY)) {
        setHasSavedDraft(true);
      }
    } catch {
      // 손상된 초안은 조용히 무시한다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty && !hasUnsavedReport) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, hasUnsavedReport]);

  useEffect(() => {
    if (hasUnsavedReport) {
      setGlobalDirty(true, "아직 해몽 리포트가 저장되지 않았습니다. 지금 나가시면 생성된 무의식 분석 결과가 사라집니다. 정말 이동하시겠습니까?");
    } else {
      setGlobalDirty(isDirty);
    }
  }, [isDirty, hasUnsavedReport, setGlobalDirty]);

  useEffect(() => {
    return () => setGlobalDirty(false);
  }, [setGlobalDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const timer = window.setTimeout(() => {
      const draft: DreamDraft = {
        savedAt: Date.now(),
        recordMode,
        quickTitle,
        quickText,
        precise: wizardDraft,
        meta: { selectedDate, mood },
      };
      try {
        localStorage.setItem(DREAM_RECORD_DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // 저장 공간 부족 등은 조용히 무시한다.
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isDirty, recordMode, quickTitle, quickText, wizardDraft, selectedDate, mood]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DREAM_RECORD_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as DreamDraft;
      setSelectedDate(draft.meta?.selectedDate || defaultDreamDateInputValue());
      // 초안에 이미 한 번 확정했던 날짜가 담겨 있으므로, 복원 시 다시 물어보지 않는다.
      setIsDateConfirmed(true);
      setMood(draft.meta?.mood || "");
      setRecordMode(draft.recordMode ?? "quick");
      setQuickTitle(draft.quickTitle ?? "");
      setQuickText(draft.quickText ?? "");
      setRestoredWizardDraft(draft.precise ?? undefined);
      setWizardKey((key) => key + 1);
      setHasSavedDraft(false);
      setHasDraftAvailable(false);
      setDraftPreview(null);
    } catch {
      setHasSavedDraft(false);
      setHasDraftAvailable(false);
      setDraftPreview(null);
    }
  };

  const discardDraft = () => {
    localStorage.removeItem(DREAM_RECORD_DRAFT_KEY);
    resetDraftPromptCount(DREAM_RECORD_DRAFT_KEY);
    setHasSavedDraft(false);
    setHasDraftAvailable(false);
    setDraftPreview(null);
  };

  const handleWizardComplete = async (survey: DreamSurvey) => {
    if (isLoading) return;
    setLastSurvey(survey);
    setInterpretation(null);
    setErrorMessage(null);
    setIsResultOpen(true);
    setIsLoading(true);
    try {
      const result = await requestAiInterpretation({
        date: selectedDate,
        emotion: mood,
        is_public: false,
        survey,
      });
      setInterpretation(result);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setIsResultOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSubmit = async () => {
    if (isLoading) return;
    const title = quickTitle.trim();
    const text = quickText.trim();
    if (!title || !text) {
      setErrorMessage("제목과 꿈 내용을 모두 적어주세요.");
      return;
    }
    if (!mood.trim()) {
      setMoodError(true);
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
      lucid_level: "none",
      control_level: null,
      final_memo: "",
    });
    setInterpretation(null);
    setIsResultOpen(true);
    setIsLoading(true);
    try {
      const result = await requestQuickAiInterpretation(title, text, selectedDate);
      setInterpretation(result);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setIsResultOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  // 사전에서 넘어온 기록은 이미 AI 해몽을 한 번 받았으므로, 중복 호출 없이 곧장 저장만 한다.
  const handleDictionarySave = async () => {
    if (isSaving) return;
    const title = quickTitle.trim();
    const text = quickText.trim();
    if (!title || !text) {
      setErrorMessage("제목과 꿈 내용을 모두 입력해 주세요.");
      return;
    }
    if (!mood.trim()) {
      setMoodError(true);
      return;
    }

    setErrorMessage(null);
    const survey: DreamSurvey = {
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
      lucid_level: "none",
      control_level: null,
      final_memo: "",
    };
    await performSave(survey, null);
  };

  const upgradeToPreciseMode = () => {
    setInitialTitle(quickTitle.trim() || undefined);
    setInitialActionDetail(quickText.trim() || undefined);
    setRecordMode("precise");
    setWizardKey((key) => key + 1);
  };

  const performSave = async (overrideSurvey?: DreamSurvey, overrideInterpretation?: AiInterpretation | null) => {
    const survey = overrideSurvey ?? lastSurvey;
    const interp = overrideInterpretation !== undefined ? overrideInterpretation : interpretation;
    if (!survey || !selectedDate || isSaving) return;

    setSaveError(null);
    setIsSaving(true);
    try {
      const payload = {
        dream_date: selectedDate,
        title: survey.title,
        // 이 모달(정밀 위저드/빠른 기록/사전 연계 저장) 전체가 "꿈 기록" 전용 진입점이라 -
        // AI 해몽이 없어도(사전 연계 저장은 interp가 null일 수 있다) 항상 dream이다.
        entry_type: "dream" as const,
        emotion: mood,
        summary: buildDreamOneLineSummary(survey),
        is_public: false,
        is_anonymous: true,
        share_with_ai_analysis: false,
        photo_url: null,
        survey,
        interpretation: interp,
        // AI 해몽 빠른 진입 모달에서 넘어온 캐시를 재개해 저장하는 경우에만 "quick_interpret" -
        // 서버가 정원의 꽃 대신 표본으로 남긴다. 이 모달 자체에서 만든 결과는 항상 "normal".
        origin: saveOrigin,
      };
      const saved = await createDream(payload);
      localStorage.removeItem(DREAM_RECORD_DRAFT_KEY);
      localStorage.removeItem(DREAM_RECORD_CACHED_ANALYSIS_KEY);
      resetDraftPromptCount(DREAM_RECORD_DRAFT_KEY);
      onSaved(saved);
      onClose();
    } catch (error) {
      setSaveError(getAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const requestClose = () => {
    if ((isDirty || hasUnsavedReport) && !window.confirm("작성 중인 내용이 사라집니다. 정말 닫으시겠어요?")) return;
    onClose();
  };

  return (
    // z-index 계층: 일반 모달은 전부 z-[100](AllTagsModal/QuickInterpretModal 등과 동일 티어) -
    // 이 모달 안에서 다시 뜨는 초안 복구/AI 결과 서브 모달만 그 위인 z-[110]을 쓴다. 예전엔
    // 모달마다 40/50/100/200/250/260/280/300처럼 제각각 숫자를 골라 쓰다 보니 어떤 모달이
    // 다른 모달 위/아래에 있어야 하는지 예측할 수 없어 겹침 버그가 났다.
    // variant="page"에서는 오버레이/배경 클릭-닫기를 걷어내고 일반 페이지 콘텐츠로 흐르게 한다 -
    // 아래 내용(초안 복구 안내/모드 선택/폼/AI 결과)은 완전히 동일하다.
    <div
      className={
        isPageVariant
          ? "mx-auto w-full max-w-lg px-4 py-10"
          : "fixed inset-0 z-[100] flex items-center justify-center px-4 py-8"
      }
    >
      {!isPageVariant && <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={requestClose} />}

      <div
        className={
          isPageVariant
            ? "relative w-full rounded-3xl border border-violet-400/30 bg-[#0b0e1a] p-6 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl sm:p-8"
            : "relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-violet-400/30 bg-[#0b0e1a] p-6 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl sm:p-8"
        }
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="닫기"
          className="absolute right-1 top-1 p-4 text-slate-400 transition-colors hover:text-white"
        >
          ✕
        </button>

        <h2 className="text-lg font-semibold text-white">🔮 꿈 기록하고 해몽받기</h2>
        <p className="mt-1 text-xs text-slate-500">지난밤의 꿈을 기록하면, AI가 해몽을 들려줘요.</p>

        {/* 강제 복구 모달은 최대 2번까지만 자동으로 뜨지만, 초안은 계속 남아있으므로 불러올
            방법은 항상 열어둔다 - 눈에 띄지 않는 조용한 텍스트 링크로만. */}
        {hasDraftAvailable && !hasSavedDraft && !isResultOpen && (
          <button
            type="button"
            onClick={restoreDraft}
            className="mt-2 text-xs text-slate-500 underline-offset-4 transition-colors hover:text-violet-300 hover:underline"
          >
            📝 작성 중이던 꿈의 조각이 남아있어요 · 불러오기
          </button>
        )}

        {dictionaryBridge && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-2.5 text-xs text-purple-200">
            <span className="shrink-0 rounded-full border border-purple-400/40 bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium">
              {dictionaryBridge.badge}
            </span>
            <span>🔮 사전에서 {dictionaryBridge.expert}의 시선으로 살펴본 상징을 기록하는 중이에요</span>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setRecordMode("quick")}
            className={`rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 ${
              recordMode === "quick" ? "bg-violet-500/30 text-white shadow-[0_0_12px_rgba(167,139,250,0.3)]" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            ⚡ 30초 미니멀 빠른 기록
          </button>
          <button
            type="button"
            onClick={() => setRecordMode("precise")}
            className={`rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 ${
              recordMode === "precise" ? "bg-violet-500/30 text-white shadow-[0_0_12px_rgba(167,139,250,0.3)]" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🔮 7단계 정밀 분석 기록
          </button>
        </div>

        <div className="mt-4">
          <DreamDateConfirm
            date={selectedDate}
            onDateChange={setSelectedDate}
            todayValue={todayDateInputValue()}
            isConfirmed={isDateConfirmed}
            onConfirm={() => setIsDateConfirmed(true)}
            onRequestChange={() => setIsDateConfirmed(false)}
          />
        </div>

        {/* 날짜를 명시적으로 확인/선택하기 전에는 나머지 입력(제목·서술·분위기·제출)을 아예
            보여주지 않는다 - 버튼만 비활성화하는 대신 진행 자체를 날짜 확인 뒤로 미뤄, 실수로
            오늘 날짜가 그대로 저장되는 사고를 원천적으로 막는다. */}
        {isDateConfirmed && (
          <>
        <div className="my-6 h-px bg-white/10" />

        {recordMode === "quick" ? (
          <div>
            <label className="text-xs text-indigo-300/70">오늘의 꿈 제목</label>
            <input
              type="text"
              value={quickTitle}
              onChange={(event) => setQuickTitle(event.target.value)}
              placeholder="예: 황금 고래와 함께한 하늘 비행"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-slate-500/80 focus:border-violet-400/60 focus:outline-none"
            />

            <div className="mt-3">
              <label className="text-xs text-indigo-300/70">지난밤 꾼 꿈을 자유롭게 적어주세요</label>
              <textarea
                ref={quickTextareaRef}
                value={quickText}
                onChange={(event) => setQuickText(event.target.value)}
                placeholder="탐험가님의 꿈 조각을 자유롭게 적어보세요...&#10;(인물 · 장소 · 사건 · 상징 · 감정이 떠오르면 함께 적어주세요)"
                rows={6}
                className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-slate-500/60 focus:border-violet-400/60 focus:outline-none scrollbar-thin scrollbar-thumb-purple-900/30 scrollbar-track-transparent"
              />
              {/* 작성 팁 - 예전엔 서술란에 포커스가 가야만 위로 떠오르는 팝업이었는데, 이제는
                  포커스 여부와 무관하게 하단에 항상 보이게 바꿨다. */}
              <div className="mt-2 space-y-1.5 rounded-xl border border-purple-500/20 bg-slate-900/60 p-3">
                {GUIDE_ITEMS.map((item) => (
                  <p key={item.label} className="flex items-start gap-1.5 text-[11px] text-slate-400">
                    <span>{item.emoji}</span>
                    <span>
                      <span className="font-semibold text-purple-300">{item.label}:</span> {item.text}
                    </span>
                  </p>
                ))}
              </div>
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

            <div
              className={`mt-5 rounded-2xl transition-shadow ${moodError ? "animate-shake ring-2 ring-red-500/50" : ""}`}
              onAnimationEnd={() => setMoodError(false)}
            >
              <label className="text-xs text-indigo-300/70">꿈의 분위기</label>
              <div className="mt-2">
                <MoodTagGrid key={wizardKey} mood={mood} onMoodChange={setMood} />
              </div>
            </div>

            <div className="group relative mt-6">
              <div className="absolute inset-0 rounded-full bg-violet-500 opacity-40 blur-xl transition-all duration-300 ease-out group-hover:opacity-90 group-hover:blur-2xl" />
              {dictionaryBridge ? (
                <button
                  type="button"
                  onClick={handleDictionarySave}
                  disabled={isSaving || !quickTitle.trim() || !quickText.trim()}
                  className="relative w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 group-hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "저장 중..." : "🌌 내 별자리에 기록 저장하기"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleQuickSubmit}
                  disabled={isLoading || !quickTitle.trim() || !quickText.trim()}
                  className="relative w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 group-hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? "분석 중..." : "⚡ 30초 만에 AI 해몽 받기"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <DreamWizard
            key={wizardKey}
            onComplete={handleWizardComplete}
            isSubmitting={isLoading}
            mood={mood}
            onMoodChange={setMood}
            initialData={restoredWizardDraft}
            initialTitle={initialTitle}
            initialActionDetail={initialActionDetail}
            initialTargetChip={initialTargetChip}
            initialTargetOther={initialTargetOther}
            initialDynamicsChip={initialDynamicsChip}
            onDraftChange={setWizardDraft}
            submitLabel="🔮 내 꿈 분석결과 확인하기"
          />
        )}
          </>
        )}

        {(errorMessage || saveError) && (
          <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-300">
            {errorMessage || saveError}
          </p>
        )}
      </div>

      {/* 임시 저장 데이터 복구 모달 - 이 모달(z-[100]) 위에 다시 뜨는 서브 모달이라 z-[110]. */}
      {hasSavedDraft && draftPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
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
              <button type="button" onClick={discardDraft} className="px-4 py-2 text-sm text-slate-500 transition-colors hover:text-slate-300">
                새로 쓰기
              </button>
              <button
                type="button"
                onClick={restoreDraft}
                className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 font-medium text-white shadow-lg transition-transform hover:from-purple-500 hover:to-indigo-500 active:scale-95"
              >
                ✨ 이어서 기록하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 해몽 결과 모달 - 이 모달(z-[100]) 위에 다시 뜨는 서브 모달이라 z-[110]. */}
      {isResultOpen && lastSurvey && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4 py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsResultOpen(false)} />

          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl">
            <button
              type="button"
              onClick={() => setIsResultOpen(false)}
              aria-label="닫기"
              className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
            >
              ✕
            </button>

            <div className="text-center">
              <p className="text-xs tracking-widest text-indigo-300/70 uppercase">AI Dream Interpretation</p>
              <h3 className="mt-1 text-2xl font-semibold text-white">
                {mood} {lastSurvey.title || "제목 없는 꿈"}
              </h3>
            </div>
            <div className="mt-4">
              <DreamOriginalQuote content={buildDreamOriginalContent(lastSurvey)} />
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xs leading-relaxed text-slate-400">
              {buildDreamOneLineSummary(lastSurvey)}
            </div>

            {!interpretation ? (
              <DreamInterpretationLoading />
            ) : (
              <>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {interpretation.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1 text-xs text-violet-200">
                      {tag.startsWith("#") ? tag : `#${tag}`}
                    </span>
                  ))}
                </div>

                <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-300">{interpretation.description}</p>

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

                {effectivePendingSeedForBloom && <SeedBloomResult seedType={effectivePendingSeedForBloom.seed_type} />}

                {interpretation.counseling_report ? (
                  <>
                    <div className="mt-6">
                      <CounselingStoryView
                        report={interpretation.counseling_report}
                        tags={interpretation.tags}
                        // CounselingStoryView 내부의 <button onClick={onSave}>가 클릭 이벤트 객체를
                        // 그대로 첫 인자로 넘긴다 - performSave를 직접 넘기면 그 이벤트 객체가
                        // overrideSurvey 자리로 새어 들어가 survey.title 등에서 TypeError가 나고,
                        // axios 에러가 아니라서 "알 수 없는 오류"로만 뭉개져 보인다. 인자 없이 감싸
                        // 호출해 이벤트가 새어 들어가지 않게 막는다.
                        onSave={() => performSave()}
                        isSaving={isSaving}
                        saveLabel="일기장에 저장하고 확인"
                      />
                    </div>
                    {saveError && (
                      <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-300">
                        {saveError}
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
                    <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => performSave()}
                        disabled={isSaving}
                        className="flex-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? "저장 중..." : "일기장에 저장하고 확인"}
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
    </div>
  );
}
