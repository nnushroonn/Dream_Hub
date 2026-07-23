"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getAuthErrorMessage } from "@/api/auth";
import {
  createDream,
  deleteDream,
  requestAiInterpretation,
  updateDream,
  type AiInterpretation,
  type DreamEntryRecord,
  type DreamSurvey,
} from "@/api/dream";
import DiaryCalendarPanel from "@/components/DiaryCalendarPanel";
import DreamWizard from "@/components/DreamWizard";
import NavBar from "@/components/NavBar";
import { MOOD_OPTIONS } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

function todayDateInputValue(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function DiaryPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const upsertEntry = useSavedDreamsStore((state) => state.upsertEntry);
  const removeEntry = useSavedDreamsStore((state) => state.removeEntry);

  // 날짜는 서버/클라이언트 렌더 결과가 달라지는 걸 피하려고 마운트 이후에만 오늘 날짜로 채운다.
  const [selectedDate, setSelectedDate] = useState("");
  const [mood, setMood] = useState(MOOD_OPTIONS[3].emoji);
  const [isPublic, setIsPublic] = useState(false);

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
  const activeDetail = detailEntries?.[activeDetailIndex] ?? null;

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<DreamEntryRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 꿈해몽 사전의 "이 상징을 바탕으로 꿈 기록하기"에서 ?title=고래 형태로 넘어온 경우,
  // Step 1 제목을 미리 채워 넣는다.
  const [initialTitle, setInitialTitle] = useState<string | undefined>(undefined);

  useEffect(() => {
    setSelectedDate(todayDateInputValue());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const titleParam = params.get("title");
    if (!titleParam) return;
    setInitialTitle(titleParam);
    setWizardKey((key) => key + 1);
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

  const resetWizard = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
    setWizardKey((key) => key + 1);
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
        is_public: isPublic,
        survey: lastSurvey,
        interpretation,
      };
      const saved = editingEntry ? await updateDream(editingEntry.id, payload) : await createDream(payload);
      upsertEntry(saved);
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
    setInterpretation(null);
    setErrorMessage(null);
    setSaveError(null);
    setWizardKey((key) => key + 1);
  };

  // 수정 모드 취소, 그리고 "오늘 다른 꿈 추가 기록" 버튼이 공유하는 초기화 로직 -
  // 편집 상태를 비우고 오늘 날짜의 새 빈 세션으로 되돌린다.
  const startNewToday = () => {
    setEditingEntry(null);
    setSelectedDate(todayDateInputValue());
    setMood(MOOD_OPTIONS[3].emoji);
    setIsPublic(false);
    setInterpretation(null);
    setErrorMessage(null);
    setSaveError(null);
    setWizardKey((key) => key + 1);
  };

  const handleSelectDay = (dayEntries: DreamEntryRecord[]) => {
    if (dayEntries.length === 0) return;
    setDetailEntries([...dayEntries].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setActiveDetailIndex(0);
    setDetailVisible(true);
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
          <DiaryCalendarPanel onSelectDay={handleSelectDay} />

          {/* 우측: 꿈 작성 에디터 - 저장/수정/삭제는 유저 소유 데이터라 로그인이 필요하다 */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              {editingEntry ? (
                <div className="flex flex-1 items-center justify-between rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-xs text-violet-200">
                  <span>✏️ {editingEntry.dream_date} 기록을 수정하는 중이에요</span>
                  <button type="button" onClick={startNewToday} className="text-violet-300/70 underline-offset-2 hover:text-white hover:underline">
                    수정 취소
                  </button>
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
                  {MOOD_OPTIONS.map((option) => (
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
            <DreamWizard
              key={wizardKey}
              onComplete={handleWizardComplete}
              isSubmitting={isLoading}
              initialData={editingEntry?.survey}
              initialTitle={editingEntry ? undefined : initialTitle}
              submitLabel={editingEntry ? "💾 수정 완료 및 재분석" : "✨ AI 무의식 해몽 요청하기"}
            />

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
            </div>

            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
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
