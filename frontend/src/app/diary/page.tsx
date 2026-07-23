"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { requestAiInterpretation, type AiInterpretation, type DreamMood, type DreamSurvey } from "@/api/dream";
import DiaryCalendarPanel from "@/components/DiaryCalendarPanel";
import DreamWizard from "@/components/DreamWizard";
import NavBar from "@/components/NavBar";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

interface MoodOption {
  emoji: string;
  label: string;
  bucket: DreamMood;
}

const MOODS: MoodOption[] = [
  { emoji: "😱", label: "무서움", bucket: "nightmare" },
  { emoji: "🤩", label: "신남", bucket: "good" },
  { emoji: "😢", label: "슬픔", bucket: "nightmare" },
  { emoji: "😌", label: "평온", bucket: "good" },
  { emoji: "🤔", label: "혼란", bucket: "neutral" },
];

function todayDateInputValue(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function DiaryPage() {
  // 날짜는 서버/클라이언트 렌더 결과가 달라지는 걸 피하려고 마운트 이후에만 오늘 날짜로 채운다.
  const [selectedDate, setSelectedDate] = useState("");
  const [mood, setMood] = useState(MOODS[3].emoji);
  const [isPublic, setIsPublic] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [interpretation, setInterpretation] = useState<AiInterpretation | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSurvey, setLastSurvey] = useState<DreamSurvey | null>(null);

  const addSavedDream = useSavedDreamsStore((state) => state.addEntry);

  useEffect(() => {
    setSelectedDate(todayDateInputValue());
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  const handleWizardComplete = async (survey: DreamSurvey) => {
    if (isLoading) return;

    setLastSurvey(survey);
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await requestAiInterpretation({ date: selectedDate, emotion: mood, is_public: isPublic, survey });
      setInterpretation(result);
      setIsModalOpen(true);
    } catch {
      setErrorMessage("AI 해몽 요청에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
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
          <DiaryCalendarPanel />

          {/* 우측: 꿈 작성 에디터 */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
            {/* 고정형 메타 정보: 날짜 · 감정 · 공개 범위 */}
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
                <label className="text-xs text-indigo-300/70">꿈의 분위기</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MOODS.map((option) => (
                    <button
                      key={option.emoji}
                      type="button"
                      onClick={() => setMood(option.emoji)}
                      className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm backdrop-blur-md transition-all duration-200 ${
                        mood === option.emoji
                          ? "border-violet-400/70 bg-violet-500/25 text-white shadow-[0_0_16px_rgba(167,139,250,0.35)]"
                          : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/30 hover:text-slate-200"
                      }`}
                    >
                      <span className="text-base">{option.emoji}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
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
                    🌐 커뮤니티에 익명으로 공유
                  </button>
                </div>
              </div>
            </div>

            <div className="my-7 h-px bg-white/10" />

            {/* 단계별 무의식 문답 위저드 */}
            <DreamWizard key={wizardKey} onComplete={handleWizardComplete} isSubmitting={isLoading} />

            {errorMessage && (
              <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-300">
                {errorMessage}
              </p>
            )}
          </div>
        </div>
      </main>

      {/* AI 해몽 로딩 오버레이 */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-slate-950/80 backdrop-blur-md">
          <div className="relative h-20 w-20">
            <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,rgba(167,139,250,0.05),rgba(167,139,250,0.9),rgba(99,102,241,0.05))] blur-[2px]" />
            <div className="absolute inset-2 rounded-full bg-slate-950" />
          </div>
          <p className="text-sm text-violet-200">AI가 무의식의 파동을 읽어내는 중...</p>
        </div>
      )}

      {/* AI 해몽 결과 모달 */}
      {interpretation && (
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

            <div className="text-center">
              <p className="text-xs tracking-widest text-indigo-300/70 uppercase">AI Dream Interpretation</p>
              <h3 className="mt-1 text-2xl font-semibold text-white">🔮 무의식이 전하는 메시지</h3>
            </div>

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

            <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-300">{interpretation.description}</p>

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

            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  if (lastSurvey && selectedDate) {
                    const moodBucket = MOODS.find((option) => option.emoji === mood)?.bucket ?? "neutral";
                    addSavedDream({
                      date: selectedDate,
                      mood: moodBucket,
                      title: lastSurvey.title,
                    });
                  }
                  setIsModalOpen(false);
                  setWizardKey((key) => key + 1);
                }}
                className="flex-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                캘린더에 저장하고 확인
              </button>
              <Link
                href="/community"
                className="flex-1 rounded-full border border-white/10 px-5 py-2.5 text-center text-sm text-slate-300 transition-colors hover:border-violet-400/40 hover:text-violet-200"
              >
                커뮤니티로 이동
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
