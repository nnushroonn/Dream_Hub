"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { getAuthErrorMessage, isAiInterpretRateLimited } from "@/api/auth";
import {
  buildDreamOriginalContent,
  requestAiInterpretation,
  requestQuickAiInterpretation,
  type AiInterpretation,
  type DreamSurvey,
} from "@/api/dream";
import CounselingStoryView from "@/components/CounselingStoryView";
import DreamDateConfirm from "@/components/DreamDateConfirm";
import DreamInterpretationLoading from "@/components/DreamInterpretationLoading";
import DreamOriginalQuote from "@/components/DreamOriginalQuote";
import DreamWizard from "@/components/DreamWizard";
import { DREAM_RECORD_CACHED_ANALYSIS_KEY, type CachedAnalysis } from "@/components/DreamRecordModal";
import MoodTagGrid from "@/components/MoodTagGrid";
import { defaultDreamDateInputValue, todayDateInputValue } from "@/lib/dreamDate";
import { setPendingDreamResult } from "@/lib/pendingDreamResult";
import { useAuthStore } from "@/store/useAuthStore";
import { useLoginModalStore } from "@/store/useLoginModalStore";

interface QuickInterpretModalProps {
  onClose: () => void;
  // "modal"(기본값): NavBar "🔮 AI 해몽" 버튼이 어느 화면에서든 곧바로 띄우는 오버레이 팝업.
  // "page": /interpret 전용 페이지 안에 그대로 흐르는 일반 콘텐츠로 렌더링한다(배경 오버레이/
  // 포탈 없음 - NavBar의 스태킹 컨텍스트를 벗어나려고 쓰던 포탈이 페이지에서는 필요 없다).
  // 내부 로직(빠른/정밀 해몽, 결과, 일기장에 담기)은 완전히 동일하다.
  variant?: "modal" | "page";
}

// 일기장 기록 모달의 미니멀 탭과 같은 작성 팁 - 무엇을 적어야 AI가 더 잘 해몽하는지 감이
// 안 잡히는 유저를 위해, 서술란에 초점을 맞추면 위로 살짝 떠오르는 힌트 카드다.
const GUIDE_ITEMS = [
  { emoji: "👤", label: "인물", text: "꿈에 등장한 사람이나 존재를 자세히 적어주세요." },
  { emoji: "📍", label: "장소", text: "꿈이 펼쳐진 장소와 주변 분위기를 묘사해 주세요." },
  { emoji: "🎬", label: "사건", text: "꿈에서 일어난 일을 기억나는 순서대로 적어주세요." },
  { emoji: "🔮", label: "상징", text: "꿈속에서 인상 깊었던 상징이나 특별한 요소를 모두 적어주세요." },
  { emoji: "❤️", label: "감정", text: "꿈을 꾸는 동안 느낀 감정과, 잠에서 깬 뒤 남아 있던 감정을 각각 표현해 주세요." },
];

// GNB "🔮 AI 해몽" 진입점 - 일기장으로 이동하지 않고 어느 화면에서든 곧바로 띄울 수 있는
// 독립형 팝업이다. 홈 히어로/일기장의 꿈 기록 모달과 완전히 같은 "⚡ 30초 미니멀 빠른 기록 /
// 🔮 7단계 정밀 분석 기록" 두 갈래를 그대로 제공한다 - 둘 다 로그인 없이도 동작하는
// 해몽 전용 엔드포인트(/api/dream-interpretation, /api/dream-interpretation-quick)만 쓰고,
// 실제 저장(createDream)은 하지 않는다. "일기장에 담을지"는 강제하지 않고, 결과 하단의
// opt-in 버튼 하나로만 유저가 직접 고른다.
export default function QuickInterpretModal({ onClose, variant = "modal" }: QuickInterpretModalProps) {
  const router = useRouter();
  const isPageVariant = variant === "page";
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const openLoginModal = useLoginModalStore((state) => state.open);

  const [recordMode, setRecordMode] = useState<"quick" | "precise">("quick");
  // "꿈 날짜 = 취침일" 규칙 - 기본값은 자정~정오면 어제(전날 밤), 그 외 시간대는 오늘로
  // 스스로 추정해 채워 둔다(defaultDreamDateInputValue). 사용자가 날짜 확인 단계에서 그대로
  // 확정하거나 직접 다른 날짜를 고를 수 있다.
  const [selectedDate, setSelectedDate] = useState(defaultDreamDateInputValue());
  // 날짜가 조용히 미리 채워져 있으면 확인 없이 지나칠 수 있어, 명시적으로 "맞나요?" 질문에
  // 답해야만(또는 직접 날짜를 골라야만) 다음 단계(서술 입력)로 넘어갈 수 있게 한다.
  const [isDateConfirmed, setIsDateConfirmed] = useState(false);
  const [mood, setMood] = useState("");
  const [isMoodExpanded, setIsMoodExpanded] = useState(false);
  const [text, setText] = useState("");
  const [survey, setSurvey] = useState<DreamSurvey | null>(null);
  const [interpretation, setInterpretation] = useState<AiInterpretation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 날짜가 확정되는 순간 다음 입력(서술란)으로 자연스럽게 포커스를 옮긴다 - 정밀 모드는
  // DreamWizard 내부 첫 필드를 이 컴포넌트가 알 수 없어 포커스 이동을 시도하지 않는다. 확정
  // 직후엔 textarea가 막 마운트된 시점이라, 클릭 핸들러 안에서 곧바로 focus()를 불러도 아직
  // DOM에 없을 수 있어 effect로 다음 렌더 이후에 시도한다.
  useEffect(() => {
    if (isDateConfirmed && recordMode === "quick") textareaRef.current?.focus();
  }, [isDateConfirmed, recordMode]);

  const handleQuickSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // "30초 미니멀" 취지를 지키기 위해 별도 제목 입력칸을 두지 않는다 - 서술 첫 줄을 짧게
    // 잘라 자동으로 제목을 지어준다(홈 히어로와 동일).
    const firstLine = trimmed.split(/\r?\n/)[0].trim();
    const title = firstLine.length > 0 ? firstLine.slice(0, 24) : "제목 없는 꿈";
    const nextSurvey: DreamSurvey = {
      title,
      brightness: "",
      space_depth: "",
      space_detail: "",
      identity_factor: "",
      target_detail: "",
      action_physics: "",
      action_detail: trimmed,
      reality_link: "",
      reality_detail: "",
      vividness: 50,
      lucid_level: "none",
      control_level: null,
      final_memo: "",
    };
    setSurvey(nextSurvey);
    setInterpretation(null);
    setErrorMessage(null);
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await requestQuickAiInterpretation(title, trimmed, selectedDate, controller.signal);
      setInterpretation(result);
    } catch (error) {
      const isAborted = error instanceof Error && error.name === "CanceledError";
      if (!isAborted) {
        // survey는 이미 위에서 채워져(nextSurvey) 로딩 화면으로 넘어가 있으므로, 에러가 나면
        // 폼으로 되돌려야 한다 - 그러지 않으면 interpretation이 끝내 채워지지 않아 로딩
        // 화면에 갇힌다(정밀 모드의 handlePreciseComplete는 원래도 이렇게 되돌리고 있었다).
        setSurvey(null);
        // 비로그인 유저가 하루 무료 한도(1회)를 다 쓴 경우 - 일반 에러 문구 대신 로그인하면
        // 하루 3회로 늘어난다는 걸 안내하는 모달로 자연스럽게 이어간다.
        if (!isAuthenticated && isAiInterpretRateLimited(error)) {
          openLoginModal({ triggerSource: "ai_limit" });
        } else {
          setErrorMessage(getAuthErrorMessage(error));
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 7단계 정밀 분석 완료 - 미니멀 모드와 결과 화면을 그대로 공유하므로, 여기서도 survey/
  // interpretation만 채우면 아래 결과 렌더링은 모드와 무관하게 동일하게 동작한다.
  const handlePreciseComplete = async (completedSurvey: DreamSurvey) => {
    if (isLoading) return;
    setSurvey(completedSurvey);
    setInterpretation(null);
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await requestAiInterpretation({
        date: selectedDate,
        emotion: mood,
        is_public: false,
        survey: completedSurvey,
      });
      setInterpretation(result);
    } catch (error) {
      setSurvey(null);
      // 비로그인 유저가 하루 무료 한도(1회)를 다 쓴 경우 - 일반 에러 문구 대신 로그인하면
      // 하루 3회로 늘어난다는 걸 안내하는 모달로 자연스럽게 이어간다.
      if (!isAuthenticated && isAiInterpretRateLimited(error)) {
        openLoginModal({ triggerSource: "ai_limit" });
      } else {
        setErrorMessage(getAuthErrorMessage(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 비로그인 유저가 결과를 받고도 이 모달을 그대로 두고 로그인/회원가입만 마치면, NavBar의
  // 자동 동기화 효과가 이어서 저장을 완료한다 - 홈 히어로와 동일한 백업 지점(pendingDreamResult)을 공유한다.
  useEffect(() => {
    if (isAuthenticated || !survey || !interpretation) return;
    // 유저가 감정 태그를 직접 고르지 않았다면 AI의 추론값을 대신 담아, 로그인 후 자동 저장되는
    // 기록도 빈 감정 없이 정원의 꽃 생성 로직(속 데이터 필요)을 정상적으로 탈 수 있게 한다.
    const resolvedMood = mood || interpretation.inferred_mood_emoji || "";
    setPendingDreamResult({ survey, interpretation, rawText: text, selectedDate, mood: resolvedMood });
  }, [isAuthenticated, survey, interpretation, text, selectedDate, mood]);

  const requestClose = () => {
    if (isLoading) {
      if (!window.confirm("분석을 취소하시겠어요?")) return;
      abortControllerRef.current?.abort();
    }
    onClose();
  };

  // 결과를 일기장에 담을지는 강제하지 않는다 - 이 버튼을 눌러야만 /journal로 이어진다.
  // 미니멀/정밀 둘 다 같은 캐시(DreamRecordModal이 자체 관리하는 CACHED_ANALYSIS_KEY)에
  // 결과를 남겨두고, 일기장은 "이어서 확인하기" 흐름 그대로 열어 실제 저장을 마무리하게 한다.
  const handleSaveToJournal = () => {
    if (!isAuthenticated) {
      openLoginModal({ triggerSource: "save" });
      return;
    }
    if (!survey || !interpretation) return;
    // 유저가 감정 태그를 직접 고르지 않았다면 AI의 추론값을 대신 담는다 - 표본의 부가
    // 정보(감정)로 저장된다.
    const resolvedMood = mood || interpretation.inferred_mood_emoji || "";
    const cache: CachedAnalysis = {
      savedAt: Date.now(),
      selectedDate,
      mood: resolvedMood,
      lastSurvey: survey,
      interpretation,
      // 감정일기/수면 단계 없이 곧장 받은 결과라, 일기장이 이어서 저장할 때 정원의 꽃 대신
      // 표본으로 남기도록 서버에 알린다.
      origin: "quick_interpret",
    };
    try {
      localStorage.setItem(DREAM_RECORD_CACHED_ANALYSIS_KEY, JSON.stringify(cache));
    } catch {
      // 저장 공간 부족 등은 조용히 무시한다 - 실패해도 화면에는 이미 결과가 떠 있다.
    }
    onClose();
    router.push("/journal?resumeCache=1");
  };

  const content = (
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
            ? "relative w-full rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl"
            : "relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl"
        }
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="닫기"
          className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
        >
          ✕
        </button>

        {!survey ? (
          <div>
            <p className="text-center text-xs tracking-widest text-indigo-300/70 uppercase">AI Dream Interpretation</p>
            <h3 className="mt-1 text-center text-xl font-semibold text-white">✨ 지난밤 꾼 꿈을 들려주세요</h3>
            <p className="mt-2 text-center text-xs leading-relaxed text-slate-400">
              일기장 화면으로 이동하지 않고, 여기서 곧바로 해몽만 미리 받아볼 수 있어요. 결과는 자동으로 저장되지 않으니, 마음에 들면 결과 화면 하단에서 직접 일기장에 담아주세요.
            </p>

            <div className="mt-5">
              <DreamDateConfirm
                date={selectedDate}
                onDateChange={setSelectedDate}
                todayValue={todayDateInputValue()}
                isConfirmed={isDateConfirmed}
                onConfirm={() => setIsDateConfirmed(true)}
                onRequestChange={() => setIsDateConfirmed(false)}
              />
            </div>

            {/* 날짜를 명시적으로 확인/선택하기 전에는 나머지 입력(모드 선택·서술·제출)을
                아예 보여주지 않는다 - 버튼만 비활성화하는 대신, 진행 자체를 날짜 확인
                뒤로 미뤄 실수로 오늘 날짜가 그대로 저장되는 사고를 원천적으로 막는다. */}
            {isDateConfirmed && (
              <>
                {/* 일기장 기록 모달과 완전히 같은 두 갈래 - 짧게 자유 서술만 남기거나, 7단계
                    문답으로 더 정밀하게 분석받을 수 있다. */}
                <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-md">
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

                <div className="my-5 h-px bg-white/10" />

                {recordMode === "quick" ? (
              <form onSubmit={handleQuickSubmit}>
                <div>
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="꿈에서 본 것, 느낀 감정을 자유롭게 적어보세요..."
                    rows={10}
                    className="w-full resize-none rounded-2xl border border-white/15 bg-black/30 px-4 py-4 text-base leading-relaxed text-white placeholder:text-slate-400 focus:border-purple-400/60 focus:outline-none"
                  />
                </div>
                {/* 무엇을 적어야 할지 막막할 때 참고할 작성 팁 - 예전엔 서술란에 초점이 가 있는
                    동안만 위로 떠오르는 팝업이었는데, 이제는 포커스 여부와 무관하게 하단에
                    항상 보이게 바꿨다. */}
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

                {/* "30초 미니멀" 취지를 해치지 않도록 기본은 접어두고, 원할 때만 펼쳐 단일
                    선택으로 고르게 한다. 선택하지 않고 넘어가도 결과 화면에서 AI가 서술 내용
                    으로부터 추론한 감정이 저장 시 대신 쓰인다. */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setIsMoodExpanded((value) => !value)}
                    className="flex w-full items-center justify-between text-xs text-indigo-300/70"
                  >
                    <span>
                      꿈의 분위기 <span className="text-slate-500">(선택)</span>
                      {mood && <span className="ml-1.5 text-violet-300">· {mood} 선택됨</span>}
                    </span>
                    <span className="text-slate-500">{isMoodExpanded ? "접기 ▲" : "선택하기 ▾"}</span>
                  </button>
                  {isMoodExpanded && (
                    <div className="mt-2">
                      <MoodTagGrid mood={mood} onMoodChange={setMood} />
                      <p className="mt-1.5 text-[11px] text-slate-500">고르지 않으면 AI가 내용을 보고 분위기를 자동으로 추론해요.</p>
                    </div>
                  )}
                </div>
                {errorMessage && <p className="mt-3 text-xs text-red-300">{errorMessage}</p>}

                <button
                  type="submit"
                  disabled={!text.trim()}
                  className="mt-5 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ✨ AI 해몽 받기
                </button>
              </form>
                ) : (
                  <>
                    <DreamWizard
                      onComplete={handlePreciseComplete}
                      isSubmitting={isLoading}
                      mood={mood}
                      onMoodChange={setMood}
                      submitLabel="🔮 내 꿈 분석결과 확인하기"
                    />
                    {errorMessage && <p className="mt-3 text-xs text-red-300">{errorMessage}</p>}
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="text-xs tracking-widest text-indigo-300/70 uppercase">AI Dream Interpretation</p>
              <h3 className="mt-1 text-2xl font-semibold text-white">{survey.title}</h3>
            </div>
            <div className="mt-4">
              <DreamOriginalQuote content={buildDreamOriginalContent(survey)} />
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

                {interpretation.counseling_report && (
                  <div className="mt-6">
                    <CounselingStoryView report={interpretation.counseling_report} tags={interpretation.tags} />
                  </div>
                )}

                {/* 결과 후속 액션의 opt-in 지점 - 이 버튼을 누르지 않으면 어디에도 저장되지 않는다.
                    이 화면은 "순수 미리보기"가 확정된 산출물이라, 저장 여부를 짐작하게 두지 않고
                    바로 위에서 명시적으로 안내한다. */}
                <div className="mt-7 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-2.5 text-center text-xs text-amber-200/90">
                  이 해몽은 아직 저장되지 않았어요. 정원에 꽃으로 남기려면 아래 버튼을 눌러 일기장에 담아주세요.
                </div>
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={handleSaveToJournal}
                    className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(16,185,129,0.35)] transition-transform hover:-translate-y-0.5"
                  >
                    🌿 이 꿈을 나만의 일기장에 담기
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  // 모달 모드에서만 포탈이 필요하다(NavBar 스태킹 컨텍스트 탈출용) - 페이지 모드는 일반
  // 페이지 트리 안에서 그대로 렌더링되므로 포탈을 거치지 않는다.
  if (isPageVariant) return content;
  return createPortal(content, document.body);
}
