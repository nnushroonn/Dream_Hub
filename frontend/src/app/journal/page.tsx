"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  buildDreamOriginalContent,
  createDream,
  requestPostInterpretation,
  type DreamEntryRecord,
  type DreamSurvey,
} from "@/api/dream";
import NavBar from "@/components/NavBar";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

function todayDateInputValue(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatJournalDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

// 이 페이지 전용 일상 감정 스티커 - 꿈 분위기(길몽/악몽 버킷)와는 성격이 달라 별도로 둔다.
// DreamEntry.emotion 컬럼을 그대로 재사용하므로 백엔드 변경은 필요 없다.
const JOURNAL_MOOD_OPTIONS = [
  { emoji: "😊", label: "행복" },
  { emoji: "🥰", label: "설렘" },
  { emoji: "😐", label: "평온" },
  { emoji: "🥱", label: "지침" },
  { emoji: "😢", label: "슬픔" },
  { emoji: "😡", label: "짜증" },
  { emoji: "🤔", label: "혼란" },
  { emoji: "🥳", label: "신남" },
];

function moodLabelFor(emoji: string): string {
  return JOURNAL_MOOD_OPTIONS.find((option) => option.emoji === emoji)?.label ?? "";
}

// 나만의 일기장 - 꿈 기록소(/diary)와 완전히 독립된 페이지. 이 앱엔 DB에 "일기 vs 꿈" type
// 컬럼이 따로 없어서, interpretation(AI 해몽)이 없는 기록만 "순수 일기"로 취급해 목록/조회
// 범위를 격리한다 - 해석을 받는 순간 그 기록은 더 이상 이 목록에 나타나지 않는다.
export default function DailyJournalPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const allEntries = useSavedDreamsStore((state) => state.entries);
  const upsertEntry = useSavedDreamsStore((state) => state.upsertEntry);

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  const journalEntries = useMemo(
    () =>
      [...allEntries]
        .filter((entry) => !entry.interpretation)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [allEntries]
  );

  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const selectedEntry =
    selectedId !== null && selectedId !== "new" ? (journalEntries.find((entry) => entry.id === selectedId) ?? null) : null;

  // 처음 들어오면 가장 최근 일기를 펼치고, 쓴 일기가 하나도 없으면 곧장 글쓰기 폼을 보여준다.
  useEffect(() => {
    if (selectedId !== null) return;
    setSelectedId(journalEntries.length > 0 ? journalEntries[0].id : "new");
  }, [journalEntries, selectedId]);

  const [title, setTitle] = useState("");
  const [mood, setMood] = useState(JOURNAL_MOOD_OPTIONS[0].emoji);
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  // 방금 해석을 마친 기록 - 해석이 붙는 순간 journalEntries 필터에서 빠지므로, 사라지기 전에
  // 잠깐 결과를 보여줄 스냅샷을 따로 들고 있는다.
  const [justAnalyzed, setJustAnalyzed] = useState<DreamEntryRecord | null>(null);

  const startNewEntry = () => {
    setJustAnalyzed(null);
    setSelectedId("new");
    setTitle("");
    setMood(JOURNAL_MOOD_OPTIONS[0].emoji);
    setBody("");
    setSaveError(null);
  };

  const selectEntry = (id: number) => {
    setJustAnalyzed(null);
    setSelectedId(id);
  };

  const handleSave = async () => {
    if (isSaving) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      setSaveError("제목과 내용을 모두 적어주세요.");
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      const survey: DreamSurvey = {
        title: trimmedTitle,
        brightness: "",
        space_depth: "",
        space_detail: "",
        identity_factor: "",
        target_detail: "",
        action_physics: "",
        action_detail: trimmedBody,
        reality_link: "",
        reality_detail: "",
        vividness: 50,
        is_lucid: false,
        final_memo: "",
      };
      const saved = await createDream({
        dream_date: todayDateInputValue(),
        title: trimmedTitle,
        emotion: mood,
        summary: buildDreamOneLineSummary(survey),
        // 일기장은 항상 비공개로 시작한다 - 공개 여부는 이 페이지의 관심사가 아니다.
        is_public: false,
        is_anonymous: true,
        share_with_ai_analysis: false,
        survey,
        interpretation: null,
      });
      upsertEntry(saved);
      setSelectedId(saved.id);
    } catch (error) {
      setSaveError(getAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedEntry || isAnalyzing) return;
    if (!window.confirm("AI 해석을 받아볼까요?")) return;
    setAnalyzeError(null);
    setIsAnalyzing(true);
    try {
      const updated = await requestPostInterpretation(selectedEntry.id);
      upsertEntry(updated);
      setJustAnalyzed(updated);
    } catch (error) {
      setAnalyzeError(getAuthErrorMessage(error));
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isAuthenticated) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  // AnimatePresence가 카드 내용 교체를 감지할 키 - 날짜/글이 바뀔 때마다 크로스페이드 슬라이드가 다시 재생된다.
  const contentKey = justAnalyzed ? `analyzed-${justAnalyzed.id}` : selectedId === "new" ? "new" : (selectedEntry?.id ?? "empty");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-white">📝 나만의 일기장</h1>
        <p className="mt-1 text-sm text-slate-400">오늘 하루의 일상과 감정을 편하게 남겨보세요.</p>

        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* 좌측 사이드바(30%): 지금까지 쓴 일기 타임라인 */}
          <aside className="w-full shrink-0 lg:max-w-xs lg:border-r lg:border-slate-800 lg:pr-6">
            <button
              type="button"
              onClick={startNewEntry}
              className="w-full rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-2.5 text-sm font-medium text-purple-200 transition-colors hover:border-purple-400/60 hover:bg-purple-500/20"
            >
              ✏️ 오늘 일기 쓰기
            </button>

            <div className="mt-6 flex flex-col gap-1">
              {journalEntries.length === 0 ? (
                <p className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-6 text-center text-xs leading-relaxed text-slate-500">
                  아직 쓴 일기가 없어요.
                  <br />
                  첫 하루를 기록해 보세요 ✨
                </p>
              ) : (
                journalEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectEntry(entry.id)}
                    className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                      selectedId === entry.id
                        ? "bg-purple-500/15 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span className="shrink-0">📝</span>
                      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">{entry.dream_date}</span>
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* 우측 메인(70%): 글래스모피즘 카드 - 글쓰기 폼 또는 조회 뷰어 */}
          <div className="flex flex-1 justify-center">
            <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={contentKey}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  {justAnalyzed ? (
                    // 해석이 막 끝난 순간의 잠깐짜리 확인 화면 - 이후 이 기록은 순수 일기 목록에서 사라진다.
                    <div className="py-6 text-center">
                      <p className="text-2xl">✨</p>
                      <p className="mt-3 text-sm font-medium text-slate-100">AI 해석이 도착했어요</p>
                      <p className="mt-2 text-sm leading-relaxed text-purple-200">
                        {justAnalyzed.interpretation?.description.slice(0, 80)}
                        {(justAnalyzed.interpretation?.description.length ?? 0) > 80 ? "…" : ""}
                      </p>
                      <p className="mt-4 text-xs leading-relaxed text-slate-500">
                        전체 해석 결과는 꿈 기록소에서 계속 볼 수 있어요. 이 일기는 이제 순수 일기 목록에서는 빠집니다.
                      </p>
                      <button
                        type="button"
                        onClick={startNewEntry}
                        className="mt-6 rounded-full border border-white/10 px-5 py-2 text-xs text-slate-300 transition-colors hover:border-purple-400/40 hover:text-purple-200"
                      >
                        확인
                      </button>
                    </div>
                  ) : selectedId === "new" || !selectedEntry ? (
                    // ✏️ 새 일기 작성 폼 - AI 호출 없이 제목+감정+본문만 그대로 저장한다.
                    <div>
                      <label className="text-xs text-indigo-300/70">오늘의 제목</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="예: 오랜만에 여유로웠던 하루"
                        className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-purple-400/60 focus:outline-none"
                      />

                      <div className="mt-5">
                        <label className="text-xs text-indigo-300/70">오늘 나의 감정</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {JOURNAL_MOOD_OPTIONS.map((option) => (
                            <button
                              key={option.emoji}
                              type="button"
                              onClick={() => setMood(option.emoji)}
                              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all duration-200 ${
                                mood === option.emoji
                                  ? "border-purple-400/70 bg-purple-500/25 text-white"
                                  : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-400/30 hover:text-slate-200"
                              }`}
                            >
                              <span>{option.emoji}</span>
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5">
                        <label className="text-xs text-indigo-300/70">오늘 하루는 어땠나요?</label>
                        <textarea
                          value={body}
                          onChange={(event) => setBody(event.target.value)}
                          placeholder="있었던 일, 만난 사람, 느낀 감정을 자유롭게 적어보세요."
                          rows={8}
                          className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-purple-400/60 focus:outline-none"
                        />
                      </div>

                      {saveError && <p className="mt-3 text-xs text-red-300">{saveError}</p>}

                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || !title.trim() || !body.trim()}
                        className="mt-6 w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? "저장 중..." : "💾 오늘 하루 저장하기"}
                      </button>
                    </div>
                  ) : (
                    // 저장된 일기 조회 뷰 - 좌: 메타 정보(날짜/감정/AI 해석 CTA), 우: 제목+본문.
                    <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-2">
                      <div className="sm:pr-6">
                        <p className="text-sm text-slate-400">{formatJournalDate(selectedEntry.dream_date)}</p>

                        <div className="mt-4">
                          <span className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-200">
                            <span className="text-lg">{selectedEntry.emotion}</span>
                            {moodLabelFor(selectedEntry.emotion)}
                          </span>
                        </div>

                        {/* 사후 분석 트리거 - 제한적으로, 조회 뷰의 좌측 하단에만 노출한다. */}
                        <div className="mt-10">
                          <button
                            type="button"
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isAnalyzing ? "해석하는 중..." : "🔮 이 날의 일기, AI 해석 받기"}
                          </button>
                          {analyzeError && <p className="mt-2 text-xs text-red-300">{analyzeError}</p>}
                        </div>
                      </div>

                      {/* 중앙 경계선: 물리적인 책이 아니라 은은하게 빛나는 그라데이션 라인으로 처리 */}
                      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-purple-500/30 to-transparent sm:block" />

                      <div>
                        <h2 className="text-xl font-semibold text-slate-200">{selectedEntry.title}</h2>
                        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-200">
                          {buildDreamOriginalContent(selectedEntry.survey)}
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
