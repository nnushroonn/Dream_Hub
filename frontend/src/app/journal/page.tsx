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
  updateDream,
  type DreamEntryRecord,
  type DreamSurvey,
} from "@/api/dream";
import NavBar from "@/components/NavBar";
import { DREAM_SEEDS, isDreamSeed } from "@/lib/dreamSeeds";
import { moodBucketForEmoji } from "@/lib/moodBucket";
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

const BUCKET_CHIP: Record<string, string> = {
  good: "🌙 길몽",
  neutral: "🌀 보통",
  nightmare: "😨 악몽",
};

// 본문 길이(최대 60%)와 꿈 씨앗 선택 여부(40%)로 계산하는 "무의식 준비도" - 저장 가능 여부와는
// 무관한 리추얼 지표라, 100%가 안 돼도 저장 버튼은 그대로 눌린다.
function dreamReadiness(bodyLength: number, hasSeed: boolean): number {
  const bodyProgress = Math.min(bodyLength / 150, 1) * 60;
  return Math.round(bodyProgress + (hasSeed ? 40 : 0));
}

function ReadinessRing({ percent }: { percent: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="relative h-10 w-10 shrink-0">
      <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="url(#journal-readiness-gradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient id="journal-readiness-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-purple-200">
        {percent}%
      </span>
    </div>
  );
}

// 같은 날짜의 기록을 "꿈(해몽 완료)"과 "일기(해몽 없음)" 두 갈래로 묶는다. DB에 type 컬럼이
// 따로 없어서, interpretation 유무만으로 갈래를 나눈다 - 한 날짜에 둘 다 있으면 "통합"이다.
interface DateGroup {
  date: string;
  dreamEntry: DreamEntryRecord | null;
  diaryEntry: DreamEntryRecord | null;
}

function badgeFor(group: DateGroup): string {
  if (group.dreamEntry && group.diaryEntry) return "✨ 통합";
  if (group.dreamEntry) return "🔮 꿈";
  return "📝 일기";
}

// 나만의 일기장 - 꿈 기록소(/diary)와 완전히 독립된 라우트지만, 같은 DreamEntry 데이터를
// 공유해 날짜별로 꿈(해몽 완료) + 일기(해몽 전) 기록을 한 화면에서 오갈 수 있게 한다.
export default function DailyJournalPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const allEntries = useSavedDreamsStore((state) => state.entries);
  const upsertEntry = useSavedDreamsStore((state) => state.upsertEntry);

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  const dateGroups = useMemo<DateGroup[]>(() => {
    const byDate = new Map<string, DateGroup>();
    for (const entry of allEntries) {
      const group = byDate.get(entry.dream_date) ?? { date: entry.dream_date, dreamEntry: null, diaryEntry: null };
      if (entry.interpretation) {
        group.dreamEntry = group.dreamEntry ?? entry;
      } else {
        group.diaryEntry = group.diaryEntry ?? entry;
      }
      byDate.set(entry.dream_date, group);
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [allEntries]);

  const [viewMode, setViewMode] = useState<"write" | "view">("view");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedGroup = selectedDate ? (dateGroups.find((group) => group.date === selectedDate) ?? null) : null;

  // 처음 들어오면 가장 최근 날짜를 펼치고, 기록이 하나도 없으면 곧장 글쓰기 폼을 보여준다.
  useEffect(() => {
    if (selectedDate !== null || viewMode === "write") return;
    if (dateGroups.length > 0) setSelectedDate(dateGroups[0].date);
    else setViewMode("write");
  }, [dateGroups, selectedDate, viewMode]);

  const [editingEntry, setEditingEntry] = useState<DreamEntryRecord | null>(null);
  const [formDate, setFormDate] = useState(todayDateInputValue());
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState(JOURNAL_MOOD_OPTIONS[0].emoji);
  const [body, setBody] = useState("");
  const [dreamSeed, setDreamSeed] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const readiness = dreamReadiness(body.trim().length, dreamSeed !== null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const startNewEntry = (date?: string) => {
    setViewMode("write");
    setEditingEntry(null);
    setFormDate(date ?? todayDateInputValue());
    setTitle("");
    setMood(JOURNAL_MOOD_OPTIONS[0].emoji);
    setBody("");
    setDreamSeed(null);
    setSaveError(null);
  };

  const startEditEntry = (entry: DreamEntryRecord) => {
    setViewMode("write");
    setEditingEntry(entry);
    setFormDate(entry.dream_date);
    setTitle(entry.title);
    setMood(entry.emotion);
    setBody(entry.survey.action_detail);
    setDreamSeed(entry.tags.find(isDreamSeed) ?? null);
    setSaveError(null);
  };

  const selectDate = (date: string) => {
    setViewMode("view");
    setSelectedDate(date);
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
      // 씨앗 태그만 갈아끼운다 - /diary에서 붙인 실제 해시태그가 있는 기록을 여기서 수정해도
      // 그 태그는 지우지 않고, 이번에 고른 씨앗만 맨 앞에 얹는다(최대 5개).
      const preservedTags = (editingEntry?.tags ?? []).filter((tag) => !isDreamSeed(tag));
      const tags = dreamSeed ? [dreamSeed, ...preservedTags].slice(0, 5) : preservedTags;
      const payload = {
        dream_date: formDate,
        title: trimmedTitle,
        emotion: mood,
        summary: buildDreamOneLineSummary(survey),
        // 일기장은 항상 비공개로 시작한다 - 공개 여부는 이 페이지의 관심사가 아니다.
        is_public: false,
        is_anonymous: true,
        share_with_ai_analysis: false,
        survey,
        interpretation: editingEntry?.interpretation ?? null,
        tags,
      };
      const saved = editingEntry ? await updateDream(editingEntry.id, payload) : await createDream(payload);
      upsertEntry(saved);
      setViewMode("view");
      setSelectedDate(saved.dream_date);
      setEditingEntry(null);
    } catch (error) {
      setSaveError(getAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyze = async (entry: DreamEntryRecord) => {
    if (isAnalyzing) return;
    if (!window.confirm("이 일기를 꿈으로 해석해 볼까요?")) return;
    setAnalyzeError(null);
    setIsAnalyzing(true);
    try {
      const updated = await requestPostInterpretation(entry.id);
      upsertEntry(updated);
    } catch (error) {
      setAnalyzeError(getAuthErrorMessage(error));
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isAuthenticated) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  // AnimatePresence가 내용 교체를 감지할 키 - 모드/날짜가 바뀔 때마다 페이드 슬라이드가 재생된다.
  const contentKey = viewMode === "write" ? `write-${editingEntry?.id ?? formDate}` : `view-${selectedDate ?? "empty"}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <div className="flex w-full min-h-screen gap-8 px-8 py-6">
        {/* 좌측(30%): 오늘 일기 쓰기 + 꿈/일기 통합 타임라인 */}
        <aside className="flex w-[30%] shrink-0 flex-col">
          <h1 className="text-xl font-semibold text-white">📝 나만의 일기장</h1>
          <p className="mt-1 text-xs text-slate-400">일상과 꿈을 한 곳에서 되짚어 보세요.</p>

          <button
            type="button"
            onClick={() => startNewEntry()}
            className="mt-5 w-full rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-2.5 text-sm font-medium text-purple-200 transition-colors hover:border-purple-400/60 hover:bg-purple-500/20"
          >
            ✍️ 오늘 일기 쓰기
          </button>

          <div className="mt-6 flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1">
              {dateGroups.length === 0 ? (
                <p className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-6 text-center text-xs leading-relaxed text-slate-500">
                  아직 남긴 기록이 없어요.
                  <br />첫 하루를 기록해 보세요 ✨
                </p>
              ) : (
                dateGroups.map((group) => {
                  const primary = group.diaryEntry ?? group.dreamEntry;
                  return (
                    <button
                      key={group.date}
                      type="button"
                      onClick={() => selectDate(group.date)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                        viewMode === "view" && selectedDate === group.date
                          ? "border-purple-500/40 bg-purple-900/30 text-white shadow-[0_0_12px_rgba(168,85,247,0.35)]"
                          : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className="shrink-0 text-xs">{badgeFor(group)}</span>
                        <span className="min-w-0 flex-1 truncate">{primary?.title}</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{group.date}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* 우측(70%): 단 한 장의 글래스 속지 - 조회(스플릿) 또는 작성(단일) 모두 이 한 패널 안에서 전환된다 */}
        <main className="flex-1">
          <div className="relative min-h-[calc(100vh-3rem)] overflow-hidden rounded-[32px] border border-white/5 bg-slate-950/40 p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={contentKey}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="transition-all duration-300 ease-in-out"
              >
                {viewMode === "write" ? (
                  // ✍️ 작성/수정 폼 - 단일 그리드로 와이드하게. AI 호출 없이 제목+감정+본문만 저장한다.
                  <div className="mx-auto max-w-2xl">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold text-white">
                        {editingEntry ? "일기 수정하기" : "오늘 일기 쓰기"}
                      </h2>
                      <div className="flex flex-col items-center gap-1">
                        <ReadinessRing percent={readiness} />
                        {readiness >= 100 && (
                          <span className="w-24 text-center text-[9px] leading-tight text-purple-300">
                            ✨ 좋은 꿈을 꿀 준비가 완료되었습니다
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5">
                      <label className="text-xs text-indigo-300/70">날짜</label>
                      <input
                        type="date"
                        value={formDate}
                        onChange={(event) => setFormDate(event.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white focus:border-purple-400/60 focus:outline-none"
                      />
                    </div>

                    <div className="mt-5">
                      <label className="text-xs text-indigo-300/70">제목</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="예: 오랜만에 여유로웠던 하루"
                        className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-purple-400/60 focus:outline-none"
                      />
                    </div>

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
                        rows={10}
                        className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-purple-400/60 focus:outline-none"
                      />
                    </div>

                    {/* 꿈 씨앗 선택 - 저장과 무관한 리추얼. 오늘 밤 무의식에 심고 싶은 기운을 하나 고른다. */}
                    <div className="mt-5">
                      <p className="font-serif text-xs text-purple-400/80">
                        오늘 밤, 당신의 무의식에 어떤 기운을 심고 싶나요?
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {DREAM_SEEDS.map((seed) => (
                          <button
                            key={seed}
                            type="button"
                            onClick={() => setDreamSeed(dreamSeed === seed ? null : seed)}
                            className={`rounded-full border px-3 py-1.5 text-xs transition-all duration-300 ${
                              dreamSeed === seed
                                ? "border-purple-400/60 bg-gradient-to-r from-purple-500/25 to-indigo-500/25 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                                : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-400/30 hover:text-slate-200"
                            }`}
                          >
                            {seed}
                          </button>
                        ))}
                      </div>
                    </div>

                    {saveError && <p className="mt-3 text-xs text-red-300">{saveError}</p>}

                    <div className="mt-6 flex gap-3">
                      {dateGroups.length > 0 && (
                        <button
                          type="button"
                          onClick={() => selectDate(selectedDate ?? dateGroups[0].date)}
                          className="rounded-xl border border-white/10 px-5 py-3 text-sm text-slate-300 transition-colors hover:border-purple-400/40 hover:text-purple-200"
                        >
                          취소
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || !title.trim() || !body.trim()}
                        className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? "저장 중..." : "🌌 오늘을 갈무리하고, 좋은 꿈 씨앗 심기"}
                      </button>
                    </div>
                  </div>
                ) : !selectedGroup ? (
                  <div className="flex h-full items-center justify-center py-24 text-center text-sm text-slate-500">
                    왼쪽에서 날짜를 골라보세요.
                  </div>
                ) : (
                  // 🔀 스플릿 뷰 - 좌: 현실(일기), 우: 무의식(꿈/해몽)
                  <div>
                    <p className="text-sm text-slate-400">{formatJournalDate(selectedGroup.date)}</p>

                    <div className="relative mt-6 grid grid-cols-2 gap-10">
                      {/* 현실 영역 - 카드 테두리 없이 속지 그 자체로. justify-between으로 Null State의
                          CTA 버튼만 맨 아래에 붙인다. */}
                      <div className="flex h-full flex-col justify-between pr-2">
                        <div>
                          <h3 className="text-xs font-semibold tracking-wide text-slate-400">📝 내가 딛은 오늘의 현실</h3>

                          {selectedGroup.diaryEntry ? (
                            <div className="mt-6">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-base font-semibold text-slate-100">{selectedGroup.diaryEntry.title}</h4>
                                <button
                                  type="button"
                                  onClick={() => startEditEntry(selectedGroup.diaryEntry!)}
                                  className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-400 transition-colors hover:border-slate-300/40 hover:text-slate-100"
                                >
                                  수정하기
                                </button>
                              </div>
                              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                                <span>{selectedGroup.diaryEntry.emotion}</span>
                                {moodLabelFor(selectedGroup.diaryEntry.emotion)}
                              </span>
                              <p className="mt-6 whitespace-pre-line font-serif text-base tracking-wide leading-[1.8] text-slate-200/90">
                                {buildDreamOriginalContent(selectedGroup.diaryEntry.survey)}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-6 text-xs leading-relaxed text-slate-600">
                              아직 오늘의 현실이 기록되지 않았습니다. 마음을 정돈하고 아름다운 밤을 준비해 보세요.
                            </p>
                          )}
                        </div>

                        {!selectedGroup.diaryEntry && (
                          <button
                            type="button"
                            onClick={() => startNewEntry(selectedGroup.date)}
                            className="mx-auto mt-4 block w-full max-w-xs rounded-xl border border-slate-700 bg-transparent py-2.5 text-xs text-slate-300 transition-all hover:border-purple-500 hover:text-purple-300"
                          >
                            + 이 날짜로 일기 쓰기
                          </button>
                        )}
                      </div>

                      {/* 노트 바인딩 - 물리적인 박스 대신, 은은한 퍼플 톤의 점선 스티치 한 줄로만
                          양면 속지가 맞닿은 중앙 마감을 표현한다. */}
                      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 border-l border-dashed border-purple-500/20 sm:block" />

                      {/* 무의식 영역 - 역시 카드 테두리 없이 속지 위에 바로 얹는다. */}
                      <div className="pl-2">
                        <h3 className="text-xs font-semibold tracking-wide text-purple-300/80">🔮 그날 밤 무의식의 우주</h3>

                        {selectedGroup.dreamEntry ? (
                          <div className="mt-6">
                            <h4 className="text-base font-semibold text-purple-100">{selectedGroup.dreamEntry.title}</h4>
                            {selectedGroup.dreamEntry.interpretation && (
                              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-200">
                                {BUCKET_CHIP[moodBucketForEmoji(selectedGroup.dreamEntry.emotion)]}
                              </span>
                            )}
                            <p className="mt-6 whitespace-pre-line font-serif text-base tracking-wide leading-[1.8] text-purple-100/80">
                              {buildDreamOriginalContent(selectedGroup.dreamEntry.survey)}
                            </p>
                            {selectedGroup.dreamEntry.interpretation && (
                              <div className="mt-6 space-y-3 border-t border-purple-500/20 pt-4">
                                <p className="text-[11px] uppercase tracking-wider text-purple-400/60">AI 해몽 리포트</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedGroup.dreamEntry.interpretation.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-full bg-purple-500/10 px-2.5 py-1 text-[11px] text-purple-200"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-sm leading-relaxed text-slate-300/90">
                                  {selectedGroup.dreamEntry.interpretation.description}
                                </p>
                                <p className="text-xs text-purple-300/70">
                                  {selectedGroup.dreamEntry.interpretation.expert_badge} ·{" "}
                                  {selectedGroup.dreamEntry.interpretation.expert_insight}
                                </p>
                                <div className="flex gap-2 text-[11px] text-purple-200/70">
                                  <span className="rounded-lg bg-purple-500/10 px-2.5 py-1.5">
                                    🍀 {selectedGroup.dreamEntry.interpretation.lucky_item}
                                  </span>
                                  <span className="rounded-lg bg-purple-500/10 px-2.5 py-1.5">
                                    🔢 {selectedGroup.dreamEntry.interpretation.lucky_number}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : selectedGroup.diaryEntry ? (
                          <div className="mt-6">
                            <p className="text-xs leading-relaxed text-slate-500">
                              이 날의 일기는 아직 꿈으로 해석되지 않았어요.
                            </p>
                            <button
                              type="button"
                              onClick={() => handleAnalyze(selectedGroup.diaryEntry!)}
                              disabled={isAnalyzing}
                              className="mt-4 w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isAnalyzing ? "해석하는 중..." : "🔮 이 일기를 꿈으로 해석하기"}
                            </button>
                            {analyzeError && <p className="mt-2 text-xs text-red-300">{analyzeError}</p>}
                          </div>
                        ) : (
                          <p className="mt-6 text-xs text-slate-600">이 날의 꿈 기록은 없어요.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
