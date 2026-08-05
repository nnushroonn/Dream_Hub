"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Image as ImageIcon, X } from "lucide-react";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  buildDreamOriginalContent,
  createDream,
  updateDream,
  uploadCommunityImage,
  type DreamEntryRecord,
  type DreamSurvey,
} from "@/api/dream";
import NavBar from "@/components/NavBar";
import PreviewGateway from "@/components/PreviewGateway";
import { DREAM_SEEDS, isDreamSeed } from "@/lib/dreamSeeds";
import { moodBucketForEmoji } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";
import { useUnsavedChangesStore } from "@/store/useUnsavedChangesStore";

// 실시간 자동 임시 저장(Auto-Save)이 쓰는 localStorage 키와 디바운스 간격 - /diary와 같은
// 패턴이지만 페이지별로 초안이 섞이지 않도록 키를 분리한다.
const JOURNAL_DRAFT_KEY = "dream_hub_draft_journal";
const AUTOSAVE_DEBOUNCE_MS = 300;

// /diary의 AI 해몽 결과 모달이 저장 전 캐싱해 두는 키 - 이 페이지에서도 미저장 리포트가
// 있는지 확인해, 있으면 다시 /diary로 이어서 확인하러 갈 수 있는 다리를 놔준다.
const CACHED_ANALYSIS_KEY = "cached_dream_analysis";

interface JournalDraft {
  savedAt: number;
  formDate: string;
  title: string;
  mood: string;
  moodTouched: boolean;
  body: string;
  dreamSeed: string | null;
  photoUrl: string | null;
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

// 각 포스트 노드 상단에 붙는 작성 시각 - "오후 03:40" 형태로, 유저가 스크롤 흐름을 시간순으로 읽을 수 있게 한다.
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// 작성 시각(시간대)에 따라 일기 카드의 테두리/배경 톤을 다르게 입혀, 하단 꿈 카드의 획일적인
// 보라 톤과 대비를 준다 - 같은 "현실" 영역 안에서도 낮/저녁 기록임이 한눈에 읽힌다.
function diaryTimeThemeClass(isoString: string): string {
  const hour = new Date(isoString).getHours();
  if (hour >= 6 && hour < 17) return "border-amber-500/20 bg-gradient-to-br from-amber-950/5 to-transparent";
  if (hour >= 17 && hour < 21) return "border-rose-500/20 bg-gradient-to-br from-rose-950/5 to-transparent";
  // 심야(21시~06시) 작성분은 두 테마 어디에도 속하지 않아 중립 톤으로 남긴다.
  return "border-slate-800 bg-transparent";
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

// 제목/본문을 뺀 3가지 선택적 인터랙션(감정 확정/사진/꿈 씨앗)의 완료 개수 - 저장 가능 여부와는
// 무관한 리추얼 카운터라, 3/3이 안 돼도 저장 버튼은 그대로 눌린다.
const TOTAL_MISSIONS = 3;

// 같은 날짜에 작성된 모든 기록(일기+꿈 혼합)을 작성 시각 오름차순으로 묶는다. DB에 type 컬럼이
// 따로 없어서, entry별 interpretation 유무만으로 일기/꿈을 갈래짓는다.
interface DateGroup {
  date: string;
  entries: DreamEntryRecord[];
}

// "+N" 같은 무의미한 숫자 대신, 그 날짜에 일기/꿈이 각각 몇 편씩 쌓였는지 아이콘으로 바로
// 읽히게 한다 - 설명 없이도 "☀️ 1  🔮 1"만 보고 그날의 기록 구성을 예측할 수 있다.
function countsFor(group: DateGroup): { diaryCount: number; dreamCount: number } {
  let diaryCount = 0;
  let dreamCount = 0;
  for (const entry of group.entries) {
    if (entry.interpretation !== null) dreamCount += 1;
    else diaryCount += 1;
  }
  return { diaryCount, dreamCount };
}

// "YYYY-MM-DD" -> 날짜 배지에 쓸 { month: "07", day: "28" }.
function dateBadgeParts(dateStr: string): { month: string; day: string } {
  const [, month, day] = dateStr.split("-");
  return { month: month ?? "--", day: day ?? "--" };
}

interface DiaryCarouselProps {
  entries: DreamEntryRecord[];
  onEdit: (entry: DreamEntryRecord) => void;
  // 방금 저장된 편으로 캐러셀이 자동으로 넘어가게 하는 포커스 대상 id.
  focusEntryId: number | null;
}

// 하루에 여러 편의 일기가 쌓여도 세로로 늘어놓지 않고, 인스타그램 다중 이미지 게시물처럼 하나의
// 가로 슬라이더로 묶는다 - 현실 영역은 언제나 이 카드 한 장(또는 캐러셀)만 최상단에 뜬다.
// 순수 기록 보관용 뷰어라 AI 해몽 관련 액션은 전혀 갖지 않는다(무의식 영역과의 기능적 위계 분리).
function DiaryCarousel({ entries, onEdit, focusEntryId }: DiaryCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex > entries.length - 1) setActiveIndex(Math.max(0, entries.length - 1));
  }, [entries.length, activeIndex]);

  useEffect(() => {
    if (focusEntryId == null) return;
    const idx = entries.findIndex((entry) => entry.id === focusEntryId);
    if (idx >= 0) setActiveIndex(idx);
  }, [focusEntryId, entries]);

  const goTo = (next: number) => {
    if (next < 0 || next >= entries.length) return;
    setActiveIndex(next);
  };

  if (entries.length === 0) return null;

  return (
    <div className="group relative mx-auto mt-6 h-auto w-full max-w-2xl">
      {entries.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="이전 일기"
            className="absolute -left-4 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-amber-300/30 bg-slate-950/80 text-amber-200 opacity-0 shadow-[0_0_12px_rgba(252,211,77,0.35)] backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => goTo(activeIndex + 1)}
            disabled={activeIndex === entries.length - 1}
            aria-label="다음 일기"
            className="absolute -right-4 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-amber-300/30 bg-slate-950/80 text-amber-200 opacity-0 shadow-[0_0_12px_rgba(252,211,77,0.35)] backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
          >
            ›
          </button>
        </>
      )}

      {/* 낮(현실) 테마 - 카드 하나하나가 자기 작성 시각(오전/오후/저녁)에 맞는 톤을 스스로 입는다.
          바깥 컨테이너는 슬라이드를 자르는 틀 역할만 하고, 색은 슬라이드마다 다르다. */}
      <div className="relative z-10 overflow-hidden rounded-3xl">
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className={`w-full shrink-0 rounded-3xl border p-6 text-left ${diaryTimeThemeClass(entry.created_at)}`}
            >
              <div className="relative">
                <span className="absolute right-0 top-0 rounded-full border border-amber-500/20 bg-amber-950/50 px-2.5 py-1 font-mono text-[11px] text-amber-400">
                  ☀️ {formatTimestamp(entry.created_at)}
                  {entries.length > 1 ? ` (${index + 1}/${entries.length})` : ""}
                </span>
                <h4 className="max-w-[70%] text-base font-semibold text-slate-100">{entry.title}</h4>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  <span>{entry.emotion}</span>
                  {moodLabelFor(entry.emotion)}
                </span>
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  className="shrink-0 text-xs text-slate-500 transition-colors hover:text-purple-400"
                >
                  수정하기
                </button>
              </div>

              {/* 사진이 있으면 '현실의 조각 박제' 컨셉대로 1:1 프레임을 본문과 나란히 배치하고,
                  없으면 예전처럼 텍스트만 꽉 채운다. */}
              <div className={entry.photo_url ? "mt-6 flex flex-row gap-4" : "mt-6"}>
                {entry.photo_url && (
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-[#141a2b]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.photo_url} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <p className="min-w-0 flex-1 whitespace-pre-line font-serif text-lg tracking-wide leading-[2.1] text-slate-200/90">
                  {buildDreamOriginalContent(entry.survey)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 도트 페이지네이션은 중앙 타임라인 축과 겹쳐 노이즈처럼 보여 제거했다 - 좌우 호버
          화살표만으로 여러 편을 넘나든다. */}
    </div>
  );
}

interface DreamCarouselProps {
  entries: DreamEntryRecord[];
  onEdit: (entry: DreamEntryRecord) => void;
  // 방금 해석되어 이 영역으로 "이동"한 편으로 캐러셀이 자동으로 넘어가게 하는 포커스 대상 id.
  focusEntryId: number | null;
}

// 현실(일기) 영역과 마찬가지로, 무의식 영역도 그날 밤 꿈이 여러 편이면 세로로 늘어놓지 않고
// 하나의 가로 슬라이더로 묶는다 - 톤만 보라/달빛으로 다를 뿐 구조는 DiaryCarousel과 동일하다.
function DreamCarousel({ entries, onEdit, focusEntryId }: DreamCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex > entries.length - 1) setActiveIndex(Math.max(0, entries.length - 1));
  }, [entries.length, activeIndex]);

  useEffect(() => {
    if (focusEntryId == null) return;
    const idx = entries.findIndex((entry) => entry.id === focusEntryId);
    if (idx >= 0) setActiveIndex(idx);
  }, [focusEntryId, entries]);

  const goTo = (next: number) => {
    if (next < 0 || next >= entries.length) return;
    setActiveIndex(next);
  };

  if (entries.length === 0) return null;

  return (
    <div className="group relative mx-auto mt-6 h-auto w-full max-w-2xl">
      {entries.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="이전 꿈"
            className="absolute -left-4 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-purple-400/30 bg-slate-950/80 text-purple-200 opacity-0 shadow-[0_0_12px_rgba(168,85,247,0.4)] backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => goTo(activeIndex + 1)}
            disabled={activeIndex === entries.length - 1}
            aria-label="다음 꿈"
            className="absolute -right-4 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-purple-400/30 bg-slate-950/80 text-purple-200 opacity-0 shadow-[0_0_12px_rgba(168,85,247,0.4)] backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
          >
            ›
          </button>
        </>
      )}

      {/* 밤(무의식) 테마 - 완전한 심연의 블랙 + 카드 후면 보라 글로우로 몽환적인 공간감을 준다. */}
      <div className="relative z-10 overflow-hidden rounded-3xl border border-purple-500/20 bg-[#050509] shadow-[0_0_35px_rgba(168,85,247,0.06)]">
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {entries.map((entry, index) => (
            <div key={entry.id} className="w-full shrink-0 p-6 text-left">
              <div className="relative">
                <span className="absolute right-0 top-0 rounded-full border border-purple-500/20 bg-purple-950/60 px-2.5 py-1 font-mono text-[11px] text-purple-300">
                  🔮 {formatTimestamp(entry.created_at)}
                  {entries.length > 1 ? ` (${index + 1}/${entries.length})` : ""}
                </span>
                <h4 className="max-w-[70%] text-base font-semibold text-purple-100">{entry.title}</h4>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                {entry.interpretation ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-200">
                    {BUCKET_CHIP[moodBucketForEmoji(entry.emotion)]}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  className="shrink-0 text-xs text-slate-500 transition-colors hover:text-purple-400"
                >
                  수정하기
                </button>
              </div>

              <p className="mt-6 whitespace-pre-line font-serif text-lg tracking-wide leading-[1.8] text-purple-100/80">
                {buildDreamOriginalContent(entry.survey)}
              </p>

              {entry.interpretation && (
                <div className="mt-6 space-y-3 border-l-2 border-l-purple-500/50 bg-purple-950/10 py-1 pl-4">
                  <p className="text-[11px] uppercase tracking-wider text-purple-400/60">AI 해몽 리포트</p>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.interpretation.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-purple-500/10 px-2.5 py-1 text-[11px] text-purple-200">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <p className="font-serif text-sm leading-loose text-slate-300/90">{entry.interpretation.description}</p>
                  <p className="text-xs text-purple-300/70">
                    {entry.interpretation.expert_badge} · {entry.interpretation.expert_insight}
                  </p>
                  <div className="flex gap-2 text-[11px] text-purple-200/70">
                    <span className="rounded-lg bg-purple-500/10 px-2.5 py-1.5">🍀 {entry.interpretation.lucky_item}</span>
                    <span className="rounded-lg bg-purple-500/10 px-2.5 py-1.5">🔢 {entry.interpretation.lucky_number}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 도트 페이지네이션은 중앙 타임라인 축과 겹쳐 노이즈처럼 보여 제거했다 - 좌우 호버
          화살표만으로 여러 편을 넘나든다. */}
    </div>
  );
}

// 나만의 일기장 - 꿈 기록소(/diary)와 완전히 독립된 라우트지만, 같은 DreamEntry 데이터를
// 공유해 날짜별로 꿈(해몽 완료) + 일기(해몽 전) 기록을 한 화면에서 오갈 수 있게 한다.
export default function DailyJournalPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const allEntries = useSavedDreamsStore((state) => state.entries);
  const upsertEntry = useSavedDreamsStore((state) => state.upsertEntry);

  const dateGroups = useMemo<DateGroup[]>(() => {
    const byDate = new Map<string, DreamEntryRecord[]>();
    for (const entry of allEntries) {
      const list = byDate.get(entry.dream_date) ?? [];
      list.push(entry);
      byDate.set(entry.dream_date, list);
    }
    return Array.from(byDate.entries())
      .map(([date, entries]) => ({
        date,
        entries: [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allEntries]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedGroup = selectedDate ? (dateGroups.find((group) => group.date === selectedDate) ?? null) : null;
  const selectedEntries = selectedGroup?.entries ?? [];
  // [1] 현실(일기) -> [3] 무의식(꿈) 고정 순서로 렌더링하기 위해, 같은 날짜의 기록을 항상 이
  // 두 갈래로 나눠 둔다. 일기가 여러 편이면 캐러셀로, 꿈은 여러 편이어도 세로로 쌓는다.
  const diaryEntries = selectedEntries.filter((entry) => entry.interpretation === null);
  const dreamEntries = selectedEntries.filter((entry) => entry.interpretation !== null);

  const [editingEntry, setEditingEntry] = useState<DreamEntryRecord | null>(null);
  const isEditingDiary = editingEntry !== null && editingEntry.interpretation === null;
  const isEditingDream = editingEntry !== null && editingEntry.interpretation !== null;
  const [isComposingNew, setIsComposingNew] = useState(false);
  const [formDate, setFormDate] = useState(todayDateInputValue());
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState(JOURNAL_MOOD_OPTIONS[0].emoji);
  // 감정 칩은 기본값이 항상 채워져 있어 "선택 여부"를 값만으로 구분할 수 없다 - 실제로
  // 유저가 칩을 클릭해 확정했는지를 별도로 추적해 미션 카운터의 재료로 쓴다.
  const [moodTouched, setMoodTouched] = useState(false);
  const [body, setBody] = useState("");
  const [dreamSeed, setDreamSeed] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 필수 조건(제목+본문)과, 그와 무관하게 도는 3대 선택 미션(감정 확정/사진/꿈 씨앗) 카운터.
  const isValid = title.trim().length > 0 && body.trim().length > 0;
  const hasEmotionInteraction = moodTouched;
  const hasPhoto = photoUrl !== null;
  const hasDreamEnergy = dreamSeed !== null;
  const completedMissions = [hasEmotionInteraction, hasPhoto, hasDreamEnergy].filter(Boolean).length;
  const missingMissionLabels = [
    !hasEmotionInteraction && "감정",
    !hasPhoto && "사진",
    !hasDreamEnergy && "무의식 기운",
  ].filter((label): label is string => Boolean(label));

  // 방금 저장된 편으로 캐러셀 포커스를 옮기기 위한 트리거.
  const [justSavedEntryId, setJustSavedEntryId] = useState<number | null>(null);
  const dreamZoneRef = useRef<HTMLDivElement | null>(null);

  // 새로 작성 중인 내용이 있는지 - 기존 노드를 다듬는 인라인 수정은 별도 흐름이라 제외한다.
  const isDirty = isComposingNew && (title.trim() !== "" || body.trim() !== "");
  const setGlobalDirty = useUnsavedChangesStore((state) => state.setDirty);

  // 마운트 시 복원 가능한 임시 저장 초안이 있으면 켜지는 복구 모달 표시 여부와, 프리뷰 박스에 쓸 요약.
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [draftPreview, setDraftPreview] = useState<{ savedAt: number; title: string; content: string } | null>(null);
  // /diary에 저장 전 캐시된 AI 해몽 리포트가 있으면, 이 페이지에서도 "이어서 확인하기" 다리를 보여준다.
  const [hasCachedAnalysis, setHasCachedAnalysis] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOURNAL_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as JournalDraft;
      const hasContent = Boolean(draft.title?.trim() || draft.body?.trim());
      if (!hasContent) return;

      setHasSavedDraft(true);
      setDraftPreview({
        savedAt: draft.savedAt,
        title: draft.title?.trim() || "제목 없는 기록",
        content: draft.body?.trim() ?? "",
      });
    } catch {
      // 손상된 초안은 조용히 무시한다.
    }
  }, []);

  useEffect(() => {
    setHasCachedAnalysis(localStorage.getItem(CACHED_ANALYSIS_KEY) !== null);
  }, []);

  // 처음 들어오면 가장 최근 날짜를 펼치고, 기록이 하나도 없으면 오늘 날짜에 곧장 새 노드를 연다.
  // 복원 가능한 초안이 있으면 그 선택은 복구 모달을 통해 유저가 직접 하게 하고 자동으로 켜지 않는다.
  useEffect(() => {
    if (selectedDate !== null || isComposingNew || hasSavedDraft) return;
    if (dateGroups.length > 0) {
      setSelectedDate(dateGroups[0].date);
    } else {
      const today = todayDateInputValue();
      setSelectedDate(today);
      setFormDate(today);
      setIsComposingNew(true);
    }
  }, [dateGroups, selectedDate, isComposingNew, hasSavedDraft]);

  // 저장/해석이 끝나 무의식 영역으로 새 편이 자리 잡으면, 그 영역까지 화면을 부드럽게 스크롤한다.
  // 현실(일기) 캐러셀은 항상 최상단이라 별도 스크롤 없이 focusEntryId로 슬라이드만 넘긴다.
  useEffect(() => {
    if (justSavedEntryId === null) return;
    const isDreamEntry = dreamEntries.some((entry) => entry.id === justSavedEntryId);
    if (isDreamEntry && dreamZoneRef.current) {
      const targetTop = dreamZoneRef.current.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top: targetTop, behavior: "smooth" });
    }
    setJustSavedEntryId(null);
  }, [justSavedEntryId, dreamEntries]);

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
      const draft: JournalDraft = { savedAt: Date.now(), formDate, title, mood, moodTouched, body, dreamSeed, photoUrl };
      try {
        localStorage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // 저장 공간 부족 등은 조용히 무시한다 - 자동 저장은 부가 기능이라 화면 흐름을 막지 않는다.
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isDirty, formDate, title, mood, moodTouched, body, dreamSeed, photoUrl]);

  const restoreJournalDraft = () => {
    try {
      const raw = localStorage.getItem(JOURNAL_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as JournalDraft;
      setEditingEntry(null);
      setIsComposingNew(true);
      const restoredDate = draft.formDate || todayDateInputValue();
      setSelectedDate(restoredDate);
      setFormDate(restoredDate);
      setTitle(draft.title ?? "");
      setMood(draft.mood || JOURNAL_MOOD_OPTIONS[0].emoji);
      setMoodTouched(draft.moodTouched ?? false);
      setBody(draft.body ?? "");
      setDreamSeed(draft.dreamSeed ?? null);
      setPhotoUrl(draft.photoUrl ?? null);
      setPhotoError(null);
      setSaveError(null);
      setHasSavedDraft(false);
      setDraftPreview(null);
    } catch {
      setHasSavedDraft(false);
      setDraftPreview(null);
    }
  };

  const discardJournalDraft = () => {
    localStorage.removeItem(JOURNAL_DRAFT_KEY);
    setHasSavedDraft(false);
    setDraftPreview(null);
  };

  const startNewEntry = (date?: string) => {
    const target = date ?? todayDateInputValue();
    setSelectedDate(target);
    setEditingEntry(null);
    setIsComposingNew(true);
    setFormDate(target);
    setTitle("");
    setMood(JOURNAL_MOOD_OPTIONS[0].emoji);
    setMoodTouched(false);
    setBody("");
    setDreamSeed(null);
    setPhotoUrl(null);
    setPhotoError(null);
    setSaveError(null);
  };

  const startEditEntry = (entry: DreamEntryRecord) => {
    setSelectedDate(entry.dream_date);
    setIsComposingNew(false);
    setEditingEntry(entry);
    setFormDate(entry.dream_date);
    setTitle(entry.title);
    setMood(entry.emotion);
    // 기존 기록은 저장될 때 이미 감정이 확정된 상태였으므로 미션 카운터에도 완료로 반영한다.
    setMoodTouched(true);
    setBody(entry.survey.action_detail);
    setDreamSeed(entry.tags.find(isDreamSeed) ?? null);
    setPhotoUrl(entry.photo_url ?? null);
    setPhotoError(null);
    setSaveError(null);
  };

  const cancelCompose = () => {
    setIsComposingNew(false);
    setEditingEntry(null);
    setSaveError(null);
    // 명시적으로 취소했으니 자동 저장된 초안도 함께 정리한다.
    localStorage.removeItem(JOURNAL_DRAFT_KEY);
  };

  // 사진 첨부: 고르는 즉시 커뮤니티 이미지 업로드와 같은 R2 엔드포인트로 올려 공개 URL만 들고 있는다.
  const handleSelectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setIsUploadingPhoto(true);
    try {
      const url = await uploadCommunityImage(file);
      setPhotoUrl(url);
    } catch (error) {
      setPhotoError(getAuthErrorMessage(error));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setIsComposingNew(false);
    setEditingEntry(null);
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
        lucid_level: "none",
        control_level: null,
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
        photo_url: photoUrl,
        survey,
        interpretation: editingEntry?.interpretation ?? null,
        tags,
      };
      const saved = editingEntry ? await updateDream(editingEntry.id, payload) : await createDream(payload);
      upsertEntry(saved);
      setSelectedDate(saved.dream_date);
      setEditingEntry(null);
      setIsComposingNew(false);
      setJustSavedEntryId(saved.id);
      // 저장이 끝났으니 더 이상 "작성 중"이 아니다 - 자동 저장된 초안도 함께 정리한다.
      localStorage.removeItem(JOURNAL_DRAFT_KEY);
    } catch (error) {
      setSaveError(getAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-100">
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-12">
          <h1 className="text-xl font-semibold text-white">📝 나만의 일기장</h1>
          <div className="mt-6">
            <PreviewGateway
              title="나만의 꿈 일기, 기록하고 모아보세요"
              subtitle="로그인하면 매일 꾼 꿈을 나만 볼 수 있는 공간에 저장하고, 날짜별로 다시 찾아볼 수 있어요."
              ctaLabel="🔒 로그인하고 일기 쓰기 시작하기"
              triggerSource="journal"
            />
          </div>
        </main>
      </div>
    );
  }

  // AnimatePresence가 내용 교체를 감지할 키 - 날짜를 바꿔 고를 때마다 fade-in-up 크로스페이드가 재생된다.
  // 같은 날짜 안에서 글쓰기/수정을 켜고 끄는 것은 타임라인 자체가 자연스럽게 이어지므로 재생하지 않는다.
  const contentKey = selectedDate ?? "empty";

  // ✍️ 작성/수정 폼 - 편집 대상 포스트가 있으면 그 자리에, 없으면(신규) 타임라인 최하단에 노드로 얹힌다.
  const composeNode = (
    <div className="mx-auto mt-6 h-auto w-full max-w-2xl px-4 text-left">
      <h2 className="text-base font-semibold text-white">{editingEntry ? "이 기록 수정하기" : "새로운 기록 남기기"}</h2>

        <div className="mt-4">
          <label className="text-xs text-indigo-300/70">날짜</label>
          <input
            type="date"
            value={formDate}
            onChange={(event) => setFormDate(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white focus:border-purple-400/60 focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <label className="text-xs text-indigo-300/70">제목</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 오랜만에 여유로웠던 하루"
            className={`mt-1.5 w-full rounded-xl border bg-black/20 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-purple-400/60 focus:outline-none ${
              title.trim() ? "border-white/10" : "border-amber-500/30"
            }`}
          />
          {!title.trim() && <p className="mt-1 text-[10px] text-amber-500/60">최소 한 글자 이상 입력해 주세요</p>}
        </div>

        <div className="mt-4">
          <label className="text-xs text-indigo-300/70">오늘 나의 감정</label>
          <div className="mt-2 flex flex-wrap gap-3">
            {JOURNAL_MOOD_OPTIONS.map((option) => (
              <button
                key={option.emoji}
                type="button"
                onClick={() => {
                  setMood(option.emoji);
                  setMoodTouched(true);
                }}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all duration-300 ${
                  mood === option.emoji
                    ? "border-purple-400/70 bg-purple-500/25 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                    : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-400/30 hover:text-slate-200"
                }`}
              >
                <span>{option.emoji}</span>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs text-indigo-300/70">오늘 하루는 어땠나요?</label>
          {/* 사방 테두리 대신 밑줄 하나만 남긴 편지지 느낌 - 포커스되면 그 밑줄만 보랏빛으로
              은은하게 밝아진다. 입력 서체도 곧장 font-serif로 바꿔, 쓰는 순간부터 감성을 더한다. */}
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="있었던 일, 만난 사람, 느낀 감정을 자유롭게 적어보세요."
            rows={6}
            className={`mt-1.5 w-full resize-none border-0 border-b bg-white/[0.02] px-1 py-3 font-serif text-lg leading-relaxed text-slate-200 placeholder:font-sans placeholder:text-sm placeholder:text-slate-500 focus:border-b-purple-400/60 focus:outline-none focus:ring-0 scrollbar-thin scrollbar-thumb-purple-900/30 scrollbar-track-transparent ${
              body.trim() ? "border-white/10" : "border-amber-500/30"
            }`}
          />
          {!body.trim() && <p className="mt-1 text-[10px] text-amber-500/60">최소 한 글자 이상 입력해 주세요</p>}
        </div>

        {/* 현실의 조각 박제 - 그 순간을 찍은 사진 한 장. 고르는 즉시 업로드해 URL만 들고 있다가
            저장 시 함께 실어 보낸다(꿈 카드에는 없는, 현실 일기만의 첨부물). */}
        <div className="mt-4">
          <label className="text-xs text-indigo-300/70">오늘의 한 장면 (선택)</label>
          <div className="mt-2 flex items-center gap-3">
            {photoUrl ? (
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-[#141a2b]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  aria-label="사진 제거"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoFileInputRef.current?.click()}
                disabled={isUploadingPhoto}
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-700 bg-white/[0.02] text-slate-500 transition-colors hover:border-purple-400/40 hover:text-purple-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ImageIcon className="h-4 w-4" />
                <span className="text-[10px]">{isUploadingPhoto ? "업로드 중..." : "사진 첨부"}</span>
              </button>
            )}
            <input
              ref={photoFileInputRef}
              type="file"
              accept="image/jpeg, image/png, image/gif"
              hidden
              onChange={handleSelectPhoto}
            />
          </div>
          {photoError && <p className="mt-1.5 text-xs text-red-300">{photoError}</p>}
        </div>

        {/* 꿈 씨앗 선택 - 저장과 무관한 리추얼. 오늘 밤 무의식에 심고 싶은 기운을 하나 고른다. 상단
            감정 칩과는 선택 시 위계가 다르다는 걸 보여주려고 더 짙은 보라 + 글로우를 준다. */}
        <div className="mt-4">
          <p className="font-serif text-xs text-purple-400/80">오늘 밤, 당신의 무의식에 어떤 기운을 심고 싶나요?</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {DREAM_SEEDS.map((seed) => (
              <button
                key={seed}
                type="button"
                onClick={() => setDreamSeed(dreamSeed === seed ? null : seed)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-all duration-300 ${
                  dreamSeed === seed
                    ? "border-purple-500 bg-purple-950/50 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                    : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-400/50 hover:bg-purple-950/30 hover:text-purple-200"
                }`}
              >
                {seed}
              </button>
            ))}
          </div>
        </div>

        {saveError && <p className="mt-3 text-xs text-red-300">{saveError}</p>}

        {/* 미션 카운터(감정 확정/사진/꿈 씨앗) - 저장 가능 여부와는 무관한 리추얼 지표라
            채우지 않아도 버튼은 그대로 눌린다. 채워지지 않은 항목이 있을 때만 힌트를 곁들인다. */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <span>📝 오늘의 조각 {completedMissions} / {TOTAL_MISSIONS}</span>
          {isValid && missingMissionLabels.length > 0 && (
            <span className="text-[11px] font-normal tracking-tight text-slate-500">
              💡 {missingMissionLabels.join(", ")}을 더 채울 수 있어요
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3">
          {(dateGroups.length > 0 || selectedEntries.length > 0) && (
            <button
              type="button"
              onClick={cancelCompose}
              className="rounded-xl px-5 py-3 text-sm text-slate-400 transition-colors hover:bg-slate-800/40 hover:text-white border border-slate-700"
            >
              돌아가기
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isUploadingPhoto || !isValid}
            className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition-all hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "저장 중..." : editingEntry ? "💾 수정 내용 저장하기" : "🔮 오늘 기록하고 밤으로 가기"}
          </button>
        </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100">
      <NavBar />

      {/* 저장 전 AI 해몽 리포트가 어딘가(/diary)에 캐시돼 있으면, 이 페이지에서도 조용히 알려주고
          이어서 확인할 수 있는 다리를 놓는다. 화면을 가리지 않는 은은한 상단 토스트다. */}
      {hasCachedAnalysis && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-purple-400/40 bg-slate-950/90 px-4 py-2.5 text-xs shadow-[0_0_30px_rgba(168,85,247,0.35)] backdrop-blur-xl">
            <span className="text-purple-200">✨ 저장되지 않은 최근 해몽 리포트가 있습니다. 이어서 확인하시겠습니까?</span>
            <Link
              href="/diary?resumeAnalysis=1"
              className="shrink-0 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-1.5 font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              이어서 확인하기
            </Link>
            <button
              type="button"
              onClick={() => setHasCachedAnalysis(false)}
              aria-label="닫기"
              className="shrink-0 text-slate-500 transition-colors hover:text-slate-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 임시 저장 데이터 복구 모달: 마운트 시 복원 가능한 초안이 있으면 전체 화면을 덮는
          모달로 강하게 안내한다. */}
      {hasSavedDraft && draftPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-purple-500/30 bg-slate-950 p-7 shadow-[0_0_50px_rgba(139,92,246,0.3)]">
            <p className="text-center text-xs tracking-widest text-indigo-300/70 uppercase">Draft Recovery</p>
            <h2 className="mt-1.5 text-center text-lg font-semibold text-white">💡 작성 중이던 기록의 조각이 남아있어요</h2>
            <p className="mt-2 text-center text-sm text-slate-400">이어서 작성할까요, 아니면 새로 시작할까요?</p>

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
                onClick={discardJournalDraft}
                className="px-4 py-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
              >
                🗑️ 새로 작성하기
              </button>
              <button
                type="button"
                onClick={restoreJournalDraft}
                className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 font-medium text-white shadow-lg transition-transform hover:from-purple-500 hover:to-indigo-500 active:scale-95"
              >
                ✨ 이어서 작성하기
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex w-full min-h-screen gap-8 px-8 py-6">
        {/* 좌측(30%): 오늘 일기 쓰기 + 꿈/일기 통합 타임라인 */}
        <aside className="flex w-[30%] shrink-0 flex-col">
          <h1 className="text-xl font-semibold text-white">📝 나만의 일기장</h1>
          <p className="mt-1 text-xs text-slate-400">일상과 꿈을 한 곳에서 되짚어 보세요.</p>

          <button
            type="button"
            // 중앙 성좌선 위에 흩어져 있던 "+ 오늘 다른 일기 추가" 버튼을 없애고, 이 버튼 하나로
            // 통합했다 - 이미 날짜를 골라 둔 상태라면 그 날짜에 새 편을 더하고, 아니면 오늘로 연다.
            onClick={() => startNewEntry(selectedDate ?? undefined)}
            className="mt-5 w-full rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-2.5 text-sm font-medium text-purple-200 transition-colors hover:border-purple-400/60 hover:bg-purple-500/20"
          >
            ✍️ 오늘 일기 쓰기
          </button>

          <div className="mt-6 flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-purple-900/40">
            <div className="flex flex-col gap-1">
              {dateGroups.length === 0 ? (
                <p className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-6 text-center text-xs leading-relaxed text-slate-500">
                  아직 남긴 기록이 없어요.
                  <br />첫 하루를 기록해 보세요 ✨
                </p>
              ) : (
                dateGroups.map((group) => {
                  const isActive = selectedDate === group.date;
                  const { month, day } = dateBadgeParts(group.date);
                  const { diaryCount, dreamCount } = countsFor(group);
                  return (
                    <button
                      key={group.date}
                      type="button"
                      onClick={() => selectDate(group.date)}
                      className={`flex items-center gap-3 rounded-xl border-l-4 px-3 py-2.5 text-left transition-all ${
                        isActive
                          ? "border-l-purple-500 bg-purple-950/20 text-white"
                          : "border-l-transparent hover:bg-white/5"
                      }`}
                    >
                      {/* 날짜 배지 - "YYYY-MM-DD" 한 줄 텍스트 대신 월/일을 수직으로 적층한 독립 블록 */}
                      <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/60">
                        <span className="font-mono text-[10px] text-slate-400">{month}월</span>
                        <span className="text-base font-bold text-white">{day}</span>
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm ${
                            isActive ? "font-semibold text-white" : "text-slate-400"
                          }`}
                        >
                          {group.entries[0]?.title}
                        </span>
                        {/* 일기/꿈 구성 - "+2" 대신 아이콘별 개수로 설명 없이도 예측 가능하게 */}
                        <span className="mt-0.5 block text-[11px] text-slate-500">
                          {diaryCount > 0 && `☀️ ${diaryCount}`}
                          {diaryCount > 0 && dreamCount > 0 && "  "}
                          {dreamCount > 0 && `🔮 ${dreamCount}`}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* 우측(70%): 단 한 장의 글래스 속지 위에 성좌 타임라인이 흐른다 */}
        <main className="flex-1">
          <div className="relative min-h-[calc(100vh-3rem)] overflow-hidden rounded-[32px] border border-white/5 bg-slate-950/40 p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={contentKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                {selectedDate === null ? (
                  <div className="flex h-full items-center justify-center py-24 text-center text-sm text-slate-500">
                    왼쪽에서 날짜를 골라보세요.
                  </div>
                ) : (
                  // 🌌 성좌 수직 타임라인 - 심리적 흐름상 항상 [1] 현실(일기) -> [2] 결합 노드 ->
                  // [3] 무의식(꿈) 순서로 고정한다. 유저가 진입했을 때 해몽이 아니라 일기 본문이
                  // 가장 먼저 눈에 들어와야 하므로, 실제 작성 시각과 무관하게 이 순서는 바뀌지 않는다.
                  <div className="mx-auto flex max-w-3xl flex-col items-center">
                    <p className="text-sm text-slate-400">{formatJournalDate(selectedDate)}</p>

                    <div className="relative mt-8 w-full">
                      {/* 중앙을 관통하던 세로선 + 결합 노드는 텍스트 카드 뒤로 선이 삐져나와 렌더링
                          버그처럼 보이는 시각적 노이즈였다 - 완전히 제거하고, 대신 두 구역 사이의
                          여백과 타이틀 위계만으로 시간의 흐름과 구역 구분을 표현한다. */}
                      <div className="flex flex-col gap-16">
                        {/* [1] 현실 일기 영역 - 항상 최상단. 여러 편이면 인스타그램 스타일 가로 캐러셀로 묶는다. */}
                        <div className="relative flex flex-col items-center px-8 text-center">
                          <h3 className="text-sm font-bold tracking-wide text-slate-300">📝 내가 딛은 오늘의 현실</h3>

                          {isComposingNew || isEditingDiary ? (
                            composeNode
                          ) : diaryEntries.length === 0 ? (
                            // 공백 상태 카드 - 상하 여백을 기존 대비 40% 압축해, 비어 있는 날엔
                            // 아래 무의식 영역이 스크롤 없이도 눈에 들어오도록 끌어올린다.
                            <div className="relative mt-3.5 w-full max-w-sm rounded-2xl border border-amber-500/10 bg-[#111625] px-4 py-3.5">
                              <p className="text-xs leading-relaxed text-slate-600">
                                아직 오늘의 현실이 기록되지 않았습니다. 마음을 정돈하고 아름다운 하루를 준비해 보세요.
                              </p>
                              <button
                                type="button"
                                onClick={() => startNewEntry(selectedDate)}
                                className="mt-2.5 w-full rounded-xl border border-slate-700 bg-transparent py-2.5 text-xs text-slate-300 transition-all hover:border-purple-500 hover:text-purple-300"
                              >
                                + 이 날짜로 일기 쓰기
                              </button>
                            </div>
                          ) : (
                            <DiaryCarousel entries={diaryEntries} onEdit={startEditEntry} focusEntryId={justSavedEntryId} />
                          )}
                        </div>

                        {/* [2] 무의식 꿈 영역 - 항상 하단. 여러 편이면 현실 영역과 같은 방식으로 가로 캐러셀로 묶는다. */}
                        <div ref={dreamZoneRef} className="relative flex flex-col items-center px-8 text-center">
                          <h3 className="text-sm font-bold tracking-wide text-purple-300">🔮 그날 밤 무의식의 우주</h3>

                          {isEditingDream ? (
                            composeNode
                          ) : dreamEntries.length === 0 ? (
                            <p className="mt-6 text-xs text-slate-600">이 날의 꿈 기록은 없어요.</p>
                          ) : (
                            <DreamCarousel entries={dreamEntries} onEdit={startEditEntry} focusEntryId={justSavedEntryId} />
                          )}
                        </div>
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
