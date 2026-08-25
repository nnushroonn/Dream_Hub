"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flower2,
  Image as ImageIcon,
  Leaf,
  MoonStar,
  Pencil,
  Sparkles,
  Sprout,
  X,
} from "lucide-react";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  buildDreamOriginalContent,
  createDream,
  deleteDream,
  getMyGarden,
  pinGardenFlower,
  unpinGardenFlower,
  updateDream,
  uploadCommunityImage,
  type DreamEntryRecord,
  type DreamMood,
  type DreamSurvey,
  type GardenBloomEntry,
  type GardenProfile,
} from "@/api/dream";
import { getMySeeds, getTonightSeed, markDreamForgotten, plantSeed, type DreamSeedRecord } from "@/api/seeds";
import CardMoreMenu from "@/components/CardMoreMenu";
import CounselingStoryView from "@/components/CounselingStoryView";
import DreamRecordModal, {
  DREAM_RECORD_CACHED_ANALYSIS_KEY,
  type DreamRecordPrefill,
} from "@/components/DreamRecordModal";
import ExpandableText from "@/components/ExpandableText";
import FlowerDetailModal from "@/components/FlowerDetailModal";
import FlowerIcon from "@/components/FlowerIcon";
import GrowthTimeline, { STATUS_STYLES, type GrowthNodeStatus } from "@/components/GrowthTimeline";
import GuidedEmotionJournal, {
  EMPTY_GUIDED_JOURNAL_VALUE,
  type GuidedEmotionJournalValue,
} from "@/components/GuidedEmotionJournal";
import GuidedJournalCompletionScreen from "@/components/GuidedJournalCompletionScreen";
import { GuidedJournalRecapList } from "@/components/GuidedJournalRecap";
import HelpButton from "@/components/HelpButton";
import JournalHelpModal from "@/components/JournalHelpModal";
import NavBar from "@/components/NavBar";
import PreviewGateway from "@/components/PreviewGateway";
import SeedIcon from "@/components/SeedIcon";
import UnsavedChangesGuardModal from "@/components/UnsavedChangesGuardModal";
import { resetDraftPromptCount, shouldShowDraftPrompt } from "@/lib/draftPromptLimiter";
import { yesterdayDateInputValue } from "@/lib/dreamDate";
import { getSeedDefinition, SEED_DEFINITION_LIST, type SeedType } from "@/lib/dreamSeeds";
import {
  categoryForWord,
  EMOTION_CATEGORIES,
  emotionBadgeStyle,
  representativeEmojiForWord,
  type EmotionCategory,
  type EmotionCategoryKey,
} from "@/lib/emotionWordbook";
import { auraGlowShadow, colorForGenus, GENERAL_SPECIES_TOTAL, LEGENDARY_TOTAL, MOOD_AURA } from "@/lib/flowerTaxonomy";
import { withIga } from "@/lib/korean";
import { emojiForMoodBucket, moodBucketForEmoji } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";
import { useUnsavedChangesStore } from "@/store/useUnsavedChangesStore";

// 실시간 자동 임시 저장(Auto-Save)이 쓰는 localStorage 키와 디바운스 간격 - /diary와 같은
// 패턴이지만 페이지별로 초안이 섞이지 않도록 키를 분리한다.
const JOURNAL_DRAFT_KEY = "dream_hub_draft_journal";
const AUTOSAVE_DEBOUNCE_MS = 300;

// "오늘의 현실"/"개화"/"꽃" 섹션의 마지막 펼침 상태 - 세션 내에서만 기억하면 되므로
// sessionStorage에 저장한다(날짜를 옮겨 다녀도 같은 펼침 상태를 유지).
const DIARY_CARD_EXPANDED_KEY = "dream_hub_journal_diary_card_expanded";
const BLOOM_SECTION_EXPANDED_KEY = "dream_hub_journal_bloom_section_expanded";
const FLOWER_SECTION_EXPANDED_KEY = "dream_hub_journal_flower_section_expanded";
// 지하철 노선도식 진행선 전체(씨앗 심기~꽃 4단계)의 show/hide 스위치 - 압축 타임라인/오늘의
// 요약 카드와 정보가 겹치므로 기본은 접힘(false)이다.
const STAGE_LIST_EXPANDED_KEY = "dream_hub_journal_stage_list_expanded";

// 씨앗 심기 리추얼 엔딩 - 저장 직후 씨앗이 반짝이다(GLOW) 화면이 밤하늘처럼 어두워지고
// (BLACKOUT) 홈으로 조용히 라우팅된다. 홈 화면은 sessionStorage 플래그를 보고 그 어둠에서
// 서서히 밝아지는 페이드인을 이어받는다(구현: frontend/src/app/page.tsx).
const RITUAL_GLOW_MS = 1500;
const RITUAL_FADE_MS = 2000;
const RITUAL_HOME_FADE_IN_KEY = "dream_hub_ritual_fade_in";


interface JournalDraft {
  savedAt: number;
  formDate: string;
  title: string;
  mood: string;
  body: string;
  photoUrl: string | null;
  // 씨앗 심기 깊이 모드("마음 기록장") 진행 상황 - 없으면(예: 이전 버전에서 저장된 초안)
  // 간단 모드로 취급한다.
  journalMode?: "simple" | "guided";
  guidedData?: GuidedEmotionJournalValue;
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

// 마음 기록장 노트 페이지 카드 상단에 손글씨풍으로 보여줄 날짜 - "2026년 8월 14일 금요일"처럼
// 요일을 완전히 풀어 쓴다(위 formatJournalDate는 헤더 바의 작은 유틸리티 라벨용이라 "금"처럼
// 축약하는데, 여기선 일기 첫머리에 적는 날짜 느낌을 살려야 해서 weekday만 long으로 바꿨다).
function formatDiaryDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

// 감정일기(간단/마음 기록장)는 제목 입력란이 없다 - 저장 시 실제로 쓴 내용에서 자동으로
// 짧은 제목을 만든다. 깊이 모드는 "사건"(triggerEvent) 답변을, 그마저 비어 있으면 1단계에서
// 고른 감정 단어를 쓴다(둘 다 비어 있는 상태로는 애초에 저장 자체가 막힌다 - isValid 참고).
// 간단 모드는 본문 첫 줄을 쓴다. 어느 쪽이든 텅 비어 있을 극히 예외적인 경우(레거시 데이터
// 등)에만 날짜 기반 문구로 최종 폴백한다.
function deriveEntryTitle(params: { isGuided: boolean; guidedData: GuidedEmotionJournalValue; body: string; formDate: string }): string {
  const source = params.isGuided ? params.guidedData.triggerEvent.trim() || params.guidedData.initialEmotion || "" : params.body.trim();
  const firstLine = source.split(/\r?\n/)[0].trim();
  if (firstLine) return firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
  return `${formatJournalDate(params.formDate)}의 기록`;
}

// 각 포스트 노드 상단에 붙는 작성 시각 - "오후 03:40" 형태로, 유저가 스크롤 흐름을 시간순으로 읽을 수 있게 한다.
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// 작성 시각(시간대)에 따라 일기 카드의 배경 톤을 다르게 입혀, 하단 꿈 카드의 획일적인 보라
// 톤과 대비를 준다 - 같은 "현실" 영역 안에서도 낮/저녁 기록임이 한눈에 읽힌다. 박스 속의 박스
// 문제를 피하려고 테두리는 쓰지 않고, 배경 그라데이션 농도 차이만으로 시간대를 구분한다.
function diaryTimeThemeClass(isoString: string): string {
  const hour = new Date(isoString).getHours();
  if (hour >= 6 && hour < 17) return "bg-gradient-to-br from-amber-500/[0.07] to-transparent";
  if (hour >= 17 && hour < 21) return "bg-gradient-to-br from-rose-500/[0.07] to-transparent";
  // 심야(21시~06시) 작성분은 두 테마 어디에도 속하지 않아 중립 톤으로 남긴다.
  return "bg-white/[0.02]";
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

// 마음 기록장(깊이 모드)의 속별 대표 이모지(GENUS_REPRESENTATIVE_EMOJI) 중 격동=😠, 생동=🤩는
// 위 8개 피커 버튼 목록에는 없다 - moodBucketForEmoji(lib/moodBucket.ts)의 길몽/보통/악몽
// 버킷 표에는 이미 등록돼 있어 색상 로직은 문제없지만, 이 페이지 전용 라벨 조회
// (moodLabelFor)만 놓치고 있었다. 피커 버튼으로는 노출하지 않고(간단 모드의 기존 8개
// 선택지를 그대로 유지) 라벨 조회에서만 인식되도록 별도로 둔다.
const GUIDED_MODE_ONLY_MOOD_LABELS = [
  { emoji: "😠", label: "분노" },
  { emoji: "🤩", label: "황홀" },
  // 동경(속 5->8 확장으로 신규 분리)의 대표 이모지 - lib/moodBucket.ts의 MOOD_OPTIONS에서도
  // 같은 이모지를 "그리움"으로 쓰고 있어 라벨을 맞췄다.
  { emoji: "😔", label: "그리움" },
];

function moodLabelFor(emoji: string): string {
  return (
    JOURNAL_MOOD_OPTIONS.find((option) => option.emoji === emoji)?.label ??
    GUIDED_MODE_ONLY_MOOD_LABELS.find((option) => option.emoji === emoji)?.label ??
    ""
  );
}

const BUCKET_CHIP: Record<string, string> = {
  good: "🌙 길몽",
  neutral: "🌀 보통",
  nightmare: "😨 악몽",
};

// 같은 날짜에 작성된 모든 기록(일기+꿈 혼합)을 작성 시각 오름차순으로 묶는다. entry_type
// 필드로 일기/꿈을 갈래짓는다 - AI 해몽 유무로 유추하지 않는다.
interface DateGroup {
  date: string;
  entries: DreamEntryRecord[];
}

// "8월 7일 아침에 꿈 일기를 써도, 그 기록은 8월 6일(씨앗을 심은 날) 카드에 귀속된다" - 꿈 기록
// (entry_type==="dream")은 자기 dream_date가 아니라, 자신을 개화시킨 씨앗의 planted_at을
// 카드 날짜로 쓴다. 연결된 씨앗이 없으면(레거시 데이터 등) 기존처럼 자기 dream_date를 그대로 쓴다.
// 일반 일기(Top)는 애초에 날짜 이동 대상이 아니라 항상 자기 dream_date를 그대로 쓴다.
function cardDateFor(entry: DreamEntryRecord, seedByDreamEntryId: Map<number, DreamSeedRecord>): string {
  if (entry.entry_type === "dream") {
    const seed = seedByDreamEntryId.get(entry.id);
    if (seed) return seed.planted_at;
  }
  return entry.dream_date;
}

// "YYYY-MM-DD" -> 날짜 배지에 쓸 { month: "07", day: "28" }.
function dateBadgeParts(dateStr: string): { month: string; day: string } {
  const [, month, day] = dateStr.split("-");
  return { month: month ?? "--", day: day ?? "--" };
}

// 그 날의 4단계 성장 여정 진행도 - 캘린더 점과 "최근 기록" 목록이 같은 판정 기준을 쓰도록
// 공통 헬퍼로 뺐다. entry_type==="dream"이 하나라도 있으면 곧 "완주"(AI 해몽 유무는 무관).
function journeyStatus(entries: DreamEntryRecord[], hasSeed: boolean): "full" | "partial" | "none" {
  const dreamCount = entries.filter((entry) => entry.entry_type === "dream").length;
  const diaryCount = entries.filter((entry) => entry.entry_type === "emotion").length;
  // "완료"는 감정일기+꿈일기가 둘 다 있어야 한다(성장 여정 전체 - growthStages와 같은 기준).
  // 예전엔 꿈일기 하나만 있어도(감정일기 없이) "완료"로 잡혀서, 달력 점/최근 기록 아이콘이
  // 상세 패널의 실제 진행 상태(씨앗 심기는 아직 안 됨)와 어긋나는 버그가 있었다.
  if (dreamCount > 0 && diaryCount > 0) return "full";
  if (dreamCount > 0 || diaryCount > 0 || hasSeed) return "partial";
  return "none";
}

// explicitCategory - 저장 시점에 "실제로 어느 대분류에서 골랐는지" 함께 저장해 둔 힌트
// (DreamSurvey.initial_emotion_category/closing_emotion_category). "고통스러운"/"구역질나는"
// 처럼 같은 단어가 여러 대분류에 겹칠 때, 이 힌트가 있으면 그대로 쓰고 없으면(레거시 기록)
// categoryForWord의 배열 순서 우선 폴백을 쓴다.
function chipStyleForWord(word: string | null | undefined, explicitCategory?: string | null): EmotionCategory | null {
  if (!word) return null;
  const key = explicitCategory ? (explicitCategory as EmotionCategoryKey) : categoryForWord(word);
  return key ? (EMOTION_CATEGORIES.find((category) => category.key === key) ?? null) : null;
}

// "오늘의 요약" 카드처럼 아주 좁은 자리(감정일기 칼럼)에 초기/종료 감정 칩을 나란히 두 개
// 넣어야 할 때 쓰는 축소판 - EmotionJourneyView의 칩(px-2.5 py-1)보다 한 단계 더 작다.
function MiniEmotionChip({ word, category }: { word: string; category?: string | null }) {
  const badge = emotionBadgeStyle(chipStyleForWord(word, category));
  return (
    <span className={`rounded-full px-1.5 py-0.5 ${badge.className}`} style={badge.style}>
      {word}
    </span>
  );
}

interface EmotionJourneyViewProps {
  survey: DreamSurvey;
}

// "마음 기록장"(깊이 모드)으로 남긴 감정일기 전용 표시 - 자유 서술 대신 초기 감정 -> 종료
// 감정의 "여정" 칩과, 그 사이를 채운 4개 서술형 답변(사건/욕구/표현/자기위로 + 듣고 싶은 말)을
// 접힌 아코디언 안에 담는다. 간단 모드 카드(ExpandableText로 본문을 바로 보여줌)와는 전혀
// 다른 표현이라 별도 컴포넌트로 분리했다.
function EmotionJourneyView({ survey }: EmotionJourneyViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const initial = survey.initial_emotion ?? null;
  const closing = survey.closing_emotion ?? null;
  const initialBadge = emotionBadgeStyle(chipStyleForWord(initial, survey.initial_emotion_category));
  const closingBadge = emotionBadgeStyle(chipStyleForWord(closing, survey.closing_emotion_category));
  const moved = Boolean(initial && closing && initial !== closing);

  const hasAnyText = Boolean(
    survey.trigger_event?.trim() ||
      survey.desire?.trim() ||
      survey.message_to_other?.trim() ||
      survey.desired_message?.trim() ||
      survey.self_compassion?.trim()
  );
  // 저장 완료 리캡 화면(GuidedJournalCompletionScreen)과 같은 렌더링 컴포넌트
  // (GuidedJournalRecapList)를 재사용한다 - 여기서는 서술형 5개만(includeEmotions 기본값
  // false), 감정 선택 2개는 위 칩 헤더가 이미 보여주고 있어 중복 표시하지 않는다.
  const recapData: GuidedEmotionJournalValue = {
    initialEmotion: initial,
    triggerEvent: survey.trigger_event ?? "",
    desire: survey.desire ?? "",
    messageToOther: survey.message_to_other ?? "",
    desiredMessage: survey.desired_message ?? "",
    selfCompassion: survey.self_compassion ?? "",
    closingEmotion: closing,
  };

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">감정의 여정</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {initial && (
          <span className={`rounded-full px-2.5 py-1 text-xs ${initialBadge.className}`} style={initialBadge.style}>
            {initial}
          </span>
        )}
        {initial && closing && <span className="text-slate-600">→</span>}
        {closing && (
          <span className={`rounded-full px-2.5 py-1 text-xs ${closingBadge.className}`} style={closingBadge.style}>
            {closing}
          </span>
        )}
      </div>
      {moved && <p className="mt-1.5 text-[11px] text-slate-500">오늘 마음이 이렇게 움직였어요</p>}

      {hasAnyText && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="text-xs font-medium text-violet-300/80 transition-colors hover:text-violet-200"
          >
            {isExpanded ? "마음 기록 접기 ▴" : "마음 기록 전체보기 ▾"}
          </button>
          {isExpanded && (
            <div className="mt-3">
              <GuidedJournalRecapList data={recapData} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DiaryCarouselProps {
  entries: DreamEntryRecord[];
  onEdit: (entry: DreamEntryRecord) => void;
  onDeleteRequest: (entry: DreamEntryRecord) => void;
  onShare: (entry: DreamEntryRecord) => void;
  // 방금 저장된 편으로 캐러셀이 자동으로 넘어가게 하는 포커스 대상 id.
  focusEntryId: number | null;
}

// 하루에 여러 편의 일기가 쌓여도 세로로 늘어놓지 않고, 인스타그램 다중 이미지 게시물처럼 하나의
// 가로 슬라이더로 묶는다 - 현실 영역은 언제나 이 카드 한 장(또는 캐러셀)만 최상단에 뜬다.
// 순수 기록 보관용 뷰어라 AI 해몽 관련 액션은 전혀 갖지 않는다(무의식 영역과의 기능적 위계 분리).
function DiaryCarousel({ entries, onEdit, onDeleteRequest, onShare, focusEntryId }: DiaryCarouselProps) {
  const [rawActiveIndex, setActiveIndex] = useState(0);
  // entries가 삭제 등으로 줄어들면 이전 activeIndex가 범위를 벗어날 수 있어, 저장된 값을
  // 매번 다시 clamp하는 대신 읽는 시점에 바로 안전한 범위로 잘라서 쓴다(effect로 상태를
  // 되돌릴 필요가 없다).
  const activeIndex = entries.length === 0 ? 0 : Math.min(rawActiveIndex, entries.length - 1);

  // focusEntryId(부모가 "방금 저장된 편으로 이동해줘"라고 보내는 외부 신호)가 바뀌면 그
  // 편으로 점프한다 - 렌더 중 ref 접근/수정은 이 프로젝트의 react-hooks/refs 규칙이 막아서
  // (React 문서의 "렌더 중 조정" 패턴을 못 쓴다), effect로 처리한다.
  useEffect(() => {
    if (focusEntryId == null) return;
    const idx = entries.findIndex((entry) => entry.id === focusEntryId);
    if (idx >= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 부모의 "방금 저장된 편" 신호(외부 이벤트)에 반응, ref 사용이 금지돼 effect로 처리
      setActiveIndex(idx);
    }
  }, [focusEntryId, entries]);

  const goTo = (next: number) => {
    if (next < 0 || next >= entries.length) return;
    setActiveIndex(next);
  };

  if (entries.length === 0) return null;

  return (
    <div className="group relative mx-auto mt-6 h-auto w-full max-w-3xl">
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
              className={`w-full shrink-0 rounded-3xl p-6 text-left ${diaryTimeThemeClass(entry.created_at)}`}
            >
              <div className="relative">
                <div className="absolute right-0 top-0 flex items-center gap-1.5">
                  <span className="rounded-full border border-amber-500/20 bg-amber-950/50 px-2.5 py-1 font-mono text-[11px] text-amber-400">
                    ☀️ {formatTimestamp(entry.created_at)}
                    {entries.length > 1 ? ` (${index + 1}/${entries.length})` : ""}
                  </span>
                  <CardMoreMenu
                    onEdit={() => onEdit(entry)}
                    onDelete={() => onDeleteRequest(entry)}
                    onShare={entry.is_public ? undefined : () => onShare(entry)}
                  />
                </div>
                <h4 className="max-w-[60%] text-base font-semibold text-slate-100">{entry.title}</h4>
              </div>

              <div className="mt-2 flex items-center gap-2">
                {/* 그날 기록한 감정을 보여주기만 하는 순수 라벨 - 클릭 동작이 없어 커서도 default로 둔다. */}
                <span className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  <span>{entry.emotion}</span>
                  {moodLabelFor(entry.emotion)}
                </span>
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
                <div className="min-w-0 flex-1">
                  {entry.survey.journal_mode === "guided" ? (
                    <EmotionJourneyView survey={entry.survey} />
                  ) : (
                    <ExpandableText
                      key={entry.id}
                      className="whitespace-pre-line font-serif text-lg tracking-wide leading-[2.1] text-slate-200/90"
                      fadeFromClassName="from-slate-900"
                    >
                      {buildDreamOriginalContent(entry.survey)}
                    </ExpandableText>
                  )}
                </div>
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

interface DreamOriginalCarouselProps {
  entries: DreamEntryRecord[];
  // activeIndex는 이 컴포넌트가 아니라 부모(JournalPage)가 들고 있다 - 아래 "꽃" 섹션이
  // 같은 인덱스를 읽어 항상 같은 편의 해몽을 보여줘야 하기 때문이다(제어 컴포넌트).
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onEdit: (entry: DreamEntryRecord) => void;
  onDeleteRequest: (entry: DreamEntryRecord) => void;
  onShare: (entry: DreamEntryRecord) => void;
}

// "개화" 섹션 - 꿈일기 원문만 보여주는 캐러셀(예전 DreamCarousel에서 AI 해몽 파트를
// 떼어내고 남은 절반). 여러 편이면 좌우 화살표로 넘긴다 - 톤은 보라/달빛, 구조는
// DiaryCarousel과 동일하다.
function DreamOriginalCarousel({ entries, activeIndex, onIndexChange, onEdit, onDeleteRequest, onShare }: DreamOriginalCarouselProps) {
  if (entries.length === 0) return null;

  const goTo = (next: number) => {
    if (next < 0 || next >= entries.length) return;
    onIndexChange(next);
  };

  return (
    <div className="group relative h-auto w-full">
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

      {/* 밤(무의식) 테마 - 완전한 심연의 블랙 + 카드 후면 보라 글로우로 몽환적인 공간감을 준다.
          박스 속의 박스가 되지 않도록 테두리 없이 배경 톤 차이와 은은한 글로우만으로 분리한다. */}
      <div className="relative z-10 overflow-hidden rounded-3xl bg-[#050509]/80 shadow-[0_0_35px_rgba(168,85,247,0.06)]">
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {entries.map((entry, index) => (
            <div key={entry.id} className="w-full shrink-0 p-6 text-left">
              <div className="relative">
                <div className="absolute right-0 top-0 flex items-center gap-1.5">
                  <span className="rounded-full border border-purple-500/20 bg-purple-950/60 px-2.5 py-1 font-mono text-[11px] text-purple-300">
                    🔮 {formatTimestamp(entry.created_at)}
                    {entries.length > 1 ? ` (${index + 1}/${entries.length})` : ""}
                  </span>
                  <CardMoreMenu
                    onEdit={() => onEdit(entry)}
                    onDelete={() => onDeleteRequest(entry)}
                    onShare={entry.is_public ? undefined : () => onShare(entry)}
                  />
                </div>
                <h4 className="max-w-[60%] text-base font-semibold text-purple-100">{entry.title}</h4>
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                {/* 길몽/보통/악몽 버킷 표시 - 그날 꿈의 분위기를 보여주기만 할 뿐 클릭 동작은
                    없어 커서도 default로 둔다. 감정은 해몽 여부와 무관하게 항상 기록돼 있다. */}
                <span className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-200">
                  {BUCKET_CHIP[moodBucketForEmoji(entry.emotion)]}
                </span>
                {/* 꿈일기인데 아직 AI 해몽이 없는 경우(예: 꿈해몽 사전 연계 저장) - 배지로만
                    알려주고, 아래 "꽃" 섹션에는 자연히 안내 문구만 남는다. */}
                {!entry.interpretation && (
                  <span className="inline-flex cursor-default items-center rounded-full border border-slate-500/30 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-400">
                    해몽 없음
                  </span>
                )}
              </div>

              <div className="mt-6">
                <ExpandableText
                  key={entry.id}
                  className="whitespace-pre-line font-serif text-lg tracking-wide leading-[1.8] text-purple-100/80"
                >
                  {buildDreamOriginalContent(entry.survey)}
                </ExpandableText>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface FlowerHeroProps {
  bloom: GardenBloomEntry;
  onClick: () => void;
}

// "꽃" 섹션의 시각적 중심 - 정원 상세 관찰 모달(FlowerDetailModal)의 확대된 꽃 프레젠테이션을
// 그대로 축소 재사용한다: 큰 원형 아이콘 + 그 뒤에서만 퍼지는 아우라 글로우(카드 전체를
// 감싸는 사각형 테두리 글로우가 아니라 원 하나에만 집중된 발광) + 명패 스타일 이름표. 아래
// AI 해몽 리포트(차분한 카드)와는 배경을 공유하지 않고 완전히 분리된 자리에 떠 있어,
// "짧고 화려한 보상 모먼트"와 "길고 차분한 설명"이 한눈에 구분된다.
function FlowerHero({ bloom, onClick }: FlowerHeroProps) {
  const bucket = bloom.emotion ? moodBucketForEmoji(bloom.emotion) : "neutral";
  const tone = MOOD_AURA[bucket];
  const [genusPrimary] = colorForGenus(bloom.genus);
  const displayName = bloom.flower_name ?? getSeedDefinition(bloom.seed_type).flowerName;

  return (
    <button
      type="button"
      onClick={onClick}
      title="꽃 상세 관찰 모달에서 자세히 보기"
      className="group flex w-full flex-col items-center gap-2.5 py-2"
    >
      {/* 글로우는 이 원 하나에만 집중된다 - 뒤에 깔리는 은은한 펄스(good 무드에서만) +
          아이콘 원 자체의 아우라 그림자, 둘 다 원형이라 "알림창" 느낌이 나지 않는다. */}
      <div className="relative flex items-center justify-center py-2">
        {bucket === "good" && (
          <span
            aria-hidden
            className="pointer-events-none absolute h-28 w-28 rounded-full animate-flower-glow motion-reduce:animate-none"
            style={{
              boxShadow: bloom.is_legendary
                ? `0 0 24px 8px ${genusPrimary}55, 0 0 48px 18px ${genusPrimary}25`
                : `0 0 16px 4px ${genusPrimary}40`,
            }}
          />
        )}
        <span
          className={`flex h-24 w-24 items-center justify-center rounded-full transition-transform group-hover:scale-105 ${
            bucket === "nightmare" ? "grayscale-[0.35] brightness-75" : ""
          }`}
          style={{
            backgroundColor: `${genusPrimary}22`,
            boxShadow: auraGlowShadow(tone.color, bloom.is_legendary ? 3 : 2),
            border: bloom.is_legendary ? `2px solid ${tone.color}99` : undefined,
          }}
        >
          <FlowerIcon
            archetype={bloom.archetype}
            genus={bloom.genus}
            speciesName={bloom.species_name}
            isLegendary={bloom.is_legendary}
            sizePx={56}
          />
        </span>
      </div>

      {bloom.is_legendary && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-amber-300">
          <Sparkles className="h-3 w-3" /> 전설의 꽃
        </p>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-center transition-colors group-hover:border-white/20">
        <p className="text-sm font-semibold text-white">{displayName}</p>
        <p className="mt-0.5 text-[10px]" style={{ color: tone.color }}>
          {tone.label}
        </p>
      </div>
    </button>
  );
}

interface DreamInterpretationPanelProps {
  // 위 "개화" 섹션과 activeIndex를 공유하는 읽기 전용 패널이라 지금 보고 있는 편만 받는다 -
  // 여러 편을 넘기는 조작 자체는 개화 섹션의 화살표에서만 하고, 여기서는 몇 번째 편의
  // 해몽인지 배지로만 알려준다.
  entry: DreamEntryRecord | null;
  entryIndex: number;
  entryCount: number;
  // 이 씨앗이 실제로 피운 꽃(정원 데이터) - 지금 보고 있는 편이 그 꽃을 피운 편이 아니면
  // null이라 미리보기 자체가 생략된다.
  bloom: GardenBloomEntry | null;
  onOpenFlower: () => void;
  onTagClick: (tag: string) => void;
}

// "꽃" 섹션 - AI 해몽 리포트. 예전에는 "무의식의 수확" 카드 안에서 꿈 원문 바로 아래 이어
// 붙어 있었지만, 개화(꿈을 꾼 사실)와 꽃(AI가 그걸 해석해 피워낸 결과)은 서사적으로 다른
// 단계라 별도 섹션으로 분리했다. 하위 관점 3개(전문가 시선/행운/마음 읽기)를 고르는 탭
// 버튼은 없앴다 - 본문 "더보기"를 누르면 세 관점이 전부 한 번에 펼쳐지므로, 사실상 하나씩
// 고를 이유가 없어 알약 버튼 자체가 군더더기였다. 호출부가 key={entry.id}로 편이 바뀔
// 때마다 이 컴포넌트를 통째로 새로 마운트해 항상 접힌 상태로 되돌아간다.
function DreamInterpretationPanel({ entry, entryIndex, entryCount, bloom, onOpenFlower, onTagClick }: DreamInterpretationPanelProps) {
  // 본문 "더보기"를 눌렀는지만 기억한다 - 눌렀으면 아래 세 관점을 전부 보여준다. "접기"를
  // 눌러도 이미 펼쳐 본 관점을 도로 숨기지 않는다(계속 읽고 있을 수 있으니 굳이 닫지 않는다).
  const [showPerspectives, setShowPerspectives] = useState(false);

  if (!entry) {
    return <p className="text-xs leading-relaxed text-violet-200/50">먼저 꿈을 기록하면 이 자리에 AI 해몽이 피어나요.</p>;
  }
  if (!entry.interpretation) {
    return <p className="text-xs leading-relaxed text-violet-200/50">이 편은 아직 AI 해몽이 없어요.</p>;
  }

  const interpretation = entry.interpretation;
  // 세 관점 모두 지금은 항상 채워져 내려오지만(마음 읽기만 과거 기록엔 없을 수 있다),
  // 데이터가 비어 있는 경우까지 방어적으로 걸러서 빈 섹션이 뜨지 않게 한다.
  const hasAnyPerspective = Boolean(interpretation.expert_insight) || Boolean(interpretation.lucky_item) || Boolean(interpretation.counseling_report);

  return (
    <div className="space-y-4">
      {/* 실제 핀 꽃 - 이 섹션의 시각적 중심(짧고 화려한 보상 모먼트). 지금 보는 편이 이
          씨앗의 꽃을 피운 편일 때만(bloom !== null) 보여준다. 아래 리포트 카드와 배경을
          공유하지 않고 독립된 자리에 떠 있어 서로 섞이지 않는다. */}
      {bloom && <FlowerHero bloom={bloom} onClick={onOpenFlower} />}

      {/* AI 해몽 리포트 - 길고 차분한 설명이라, 위 꽃과 달리 은은한 톤 차이만으로 구분되는
          평범한 카드다(사각형 테두리 글로우 없음 - 글로우는 오직 위 꽃 아이콘 원에만 있다). */}
      <div className="relative z-10 overflow-hidden rounded-3xl border border-white/5 bg-[#0a0716]/80 p-6 text-left">
        {entryCount > 1 && (
          <span className="absolute right-6 top-6 rounded-full border border-violet-500/20 bg-violet-950/60 px-2.5 py-1 font-mono text-[11px] text-violet-300">
            {entryIndex + 1}/{entryCount}
          </span>
        )}

        <div className="flex flex-wrap gap-1.5">
          {/* 해시태그는 클릭 가능하다 - 누르면 오른쪽 사이드바의 "최근 기록" 목록이 이 태그를
              포함한 날짜만 걸러 보여준다. */}
          {interpretation.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              title={`${tag.startsWith("#") ? tag : `#${tag}`} 태그가 달린 날짜만 보기`}
              className="cursor-pointer rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-200 transition-colors hover:bg-violet-500/25 hover:text-white"
            >
              {tag.startsWith("#") ? tag : `#${tag}`}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <ExpandableText
            className="font-serif text-sm leading-loose text-slate-300/90"
            onToggle={(expanded) => {
              if (expanded) setShowPerspectives(true);
            }}
          >
            {interpretation.description}
          </ExpandableText>
        </div>

        {/* 본문 "더보기"를 누르면 아래 세 관점(전문가 시선/행운/마음 읽기)이 한 번에
            드러난다 - 예전엔 알약 버튼으로 하나씩 골라 열었지만, 더보기가 이미 전부 펼치는
            동작이라 버튼은 없앴다. 관점이 하나도 없으면(이론상 거의 없음) 블록 자체를 생략. */}
        {hasAnyPerspective && showPerspectives && (
          <div className="mt-4 space-y-3 border-t border-white/5 pt-3">
            {interpretation.expert_insight && (
              <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-3">
                <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-200">
                  {interpretation.expert_badge}
                </span>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{interpretation.expert_insight}</p>
              </div>
            )}

            {interpretation.lucky_item && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-violet-500/10 px-3 py-2">
                  <p className="text-[11px] text-violet-200/70">🍀 {interpretation.lucky_item}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{interpretation.lucky_item_reason}</p>
                </div>
                <div className="rounded-lg bg-violet-500/10 px-3 py-2">
                  <p className="text-[11px] text-violet-200/70">🔢 {interpretation.lucky_number}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{interpretation.lucky_number_reason}</p>
                </div>
              </div>
            )}

            {/* 상담 리포트 - 이미 저장된 기록이라 별도 저장 액션 없이 읽기 전용으로 보여준다. */}
            {interpretation.counseling_report && (
              <div>
                <CounselingStoryView report={interpretation.counseling_report} tags={interpretation.tags} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 지하철 노선도식 진행선의 세 정거장(수면은 스크롤 대상이 아니라 제외) - "어디로 스크롤할지"를
// ref 자체가 아니라 이 키로 주고받아, ref 값은 항상 effect 안에서만(렌더 중이 아니라) 읽는다.
type StageSectionKey = "diary" | "bloom" | "flower";

interface StageRowProps {
  icon: typeof Sprout;
  status: GrowthNodeStatus;
  onMarkerClick?: () => void;
  // 씨앗 심기 -> 발아 -> 개화 -> 꽃으로 갈수록 마커가 은은하게 밝아지는 "성장의 리듬"을
  // 표현하는 추가 box-shadow - status가 "done"일 때만 적용한다(아직 이루지 못한 단계를
  // 미리 화사하게 보여줄 이유가 없다). 정거장을 잇는 세로선 자체는 이 컴포넌트가 아니라
  // 부모(StageList)가 4개 마커의 실제 픽셀 좌표를 재서 단일 그라데이션 하나로 그린다 -
  // 정거장마다 선을 따로 그리면 이어붙인 계단식 밝기만 될 뿐, 진짜 연속 그라데이션이 될 수
  // 없기 때문이다.
  glowShadow?: string;
  // 부모가 이 마커의 실제 화면 좌표를 재기 위한 콜백 ref.
  markerRef?: (el: HTMLButtonElement | null) => void;
  children: ReactNode;
}

// 지하철 노선도식 진행선의 정거장 한 칸 - 위 GrowthTimeline의 STATUS_STYLES를 그대로 가져다
// 써서 아이콘/색상이 항상 같은 시각 언어를 쓴다. 마커 칸과 본문 칸이 같은 flex row 안의
// 형제라 브라우저가 기본으로(align-items: stretch) 같은 높이로 늘려주므로, 본문이 접힘/
// 펼침으로 키가 바뀌어도 마커가 항상 그 섹션 헤더 높이에 정확히 맞물린다 - 좌표를 직접
// 계산할 필요가 없다(세로선만 예외 - StageList 설명 참고).
function StageRow({ icon: Icon, status, onMarkerClick, glowShadow, markerRef, children }: StageRowProps) {
  const style = STATUS_STYLES[status];
  const extraGlow = status === "done" ? glowShadow : undefined;
  return (
    <div className="flex gap-4">
      <div className="flex shrink-0 flex-col items-center">
        <button
          ref={markerRef}
          type="button"
          onClick={onMarkerClick}
          disabled={!onMarkerClick}
          style={extraGlow ? { boxShadow: extraGlow } : undefined}
          className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 ${style.borderClass} ${
            onMarkerClick ? "cursor-pointer transition-transform hover:scale-105" : "cursor-default"
          } ${status === "in_progress" ? "animate-pulse" : ""}`}
        >
          {/* 세로 진행선(z-0, 부모 stageListRef의 첫 자식)이 마커 뒤로 완전히 가려지도록
              불투명한 배킹을 먼저 깐다 - style.bgClass만으로는 반투명(예: bg-emerald-500/15)
              이라 뒤로 지나가는 그라데이션 선이 그대로 비쳐 보인다. 배킹 위에 원래의 반투명
              틴트를 그대로 얹어 겉보기 색은 전과 동일하게 유지한다. */}
          <span className="absolute inset-0 z-0 rounded-full bg-[#030712]" />
          <span className={`absolute inset-0 z-10 rounded-full ${style.bgClass}`} />
          <Icon className={`relative z-20 h-5 w-5 ${style.icon}`} />
          {status === "done" && (
            <span className="absolute -bottom-0.5 -right-0.5 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#030712]">
              <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
            </span>
          )}
        </button>
      </div>
      <div className="min-w-0 flex-1 pb-10">{children}</div>
    </div>
  );
}

// 4개 마커(씨앗 심기/발아/개화/꽃)의 실제 화면 좌표를 재서, 첫 마커 중심부터 마지막 마커
// 중심까지 하나의 연속된 세로 그라데이션 선을 그린다. CompendiumModal의 별자리 연결선
// (useConstellationPath)과 같은 이유로 실제 픽셀을 잰다 - 정거장마다 선을 나눠 그리면
// 접힘/펼침으로 각 구간 길이가 들쭉날쭉해져도 "연속된 하나의 그라데이션"처럼 보이지
// 않고 계단식 색 경계가 생긴다. isVisible은 "단계별로 자세히 보기" 토글로 이 진행선 전체가
// 마운트/언마운트되기 때문에 필요하다 - containerRef/markerRefs는 객체 identity가 절대
// 안 바뀌는 ref라 의존성 배열에 넣어도 재마운트 시점을 감지하지 못하고, isVisible이 그
// 신호를 대신 준다(꺼져 있을 땐 값도 비워 낡은 좌표가 남지 않게 한다).
function useStageLineMetrics(
  containerRef: RefObject<HTMLDivElement | null>,
  markerRefs: MutableRefObject<(HTMLButtonElement | null)[]>,
  markerCount: number,
  isVisible: boolean
): { left: number; top: number; height: number } | null {
  const [line, setLine] = useState<{ left: number; top: number; height: number } | null>(null);

  useEffect(() => {
    // 실제 DOM 요소의 화면 좌표(getBoundingClientRect)를 재는 훅이라 렌더 중 계산이
    // 불가능하다 - 페인트 이후 effect에서만 측정할 수 있다.
    if (!isVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 접힘/언마운트 시 낡은 DOM 좌표를 정리(외부 시스템 동기화)
      setLine(null);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      const containerRect = container.getBoundingClientRect();
      const centers = markerRefs.current
        .slice(0, markerCount)
        .filter((el): el is HTMLButtonElement => el !== null)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2 - containerRect.left,
            y: rect.top + rect.height / 2 - containerRect.top,
          };
        });
      if (centers.length < 2) {
        setLine(null);
        return;
      }
      const first = centers[0];
      const last = centers[centers.length - 1];
      // 마지막 마커 중심에서 정확히 멈춰야 하므로 음수/NaN(마커가 아직 다 안 잡혔을 때의
      // 과도기 값)은 0으로 방어한다 - 그래야 잘못된 값이 그대로 그려져 마커 아래로 선이
      // 새는 일이 없다.
      setLine({ left: first.x, top: first.y, height: Math.max(0, last.y - first.y) });
    };

    recompute();
    // 컨테이너 자체의 리사이즈뿐 아니라 각 마커 버튼의 크기 변화(폰트 로딩 등으로 위치가
    // 미세하게 흔들리는 경우까지)도 잡아내도록 모든 마커도 함께 관찰한다 - 컨테이너 리사이즈
    // 관찰만으로는 놓칠 수 있는 재계산 누락이 곧 "마지막 마커 이후로 선이 새는" 것처럼
    // 보이는 원인이 될 수 있다.
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    markerRefs.current.slice(0, markerCount).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [containerRef, markerRefs, markerCount, isVisible]);

  return line;
}

// 씨앗(감정) -> 새싹(꿈) -> 꽃 세 아이콘을 잇는 넝쿨 모양 연결선 - "+"/"=" 같은 계산식 기호
// 대신 유기적으로 자라나는 느낌을 준다. 이 카드 안에서만 쓰는 고정된 3단 레이아웃(왼쪽부터
// 16.67%/50%/83.33% 지점 - 위 요약 정보의 3분할 그리드 칼럼 중심과 같은 값이라 두 줄이
// 세로로 정확히 이어진다, 라벨이 같은 바닥선에 깔리고 아이콘이 크기만큼 위로 자라나는
// 구조)이라, 지하철 진행선처럼 실제 DOM 좌표를 재는 대신 viewBox 0~100(가로) x 0~40(세로)
// 좌표를 그 비율에 맞춰 직접 잡아도 크게 어긋나지 않는다(각 아이콘 중심이 대략 y=27/25/22
// 근방이 되도록 계산). 그라데이션 색은 지하철 진행선(stageLine)과 완전히 같은 값(초록 ->
// amber)을 가로 방향으로만 재사용한다.
function VineConnector() {
  const gradientId = useId();
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(52,199,89,0.4)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0.9)" />
          </linearGradient>
        </defs>
        <path
          d="M 16.7 27 C 28 15, 38 33, 50 25 C 62 14, 72 30, 83.3 22"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      {/* 줄기 위 잎사귀 포인트 2개 - 위 곡선이 볼록/오목하게 휘는 지점 근처에 살짝 걸쳐 둔다. */}
      <Leaf
        aria-hidden
        className="pointer-events-none absolute z-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 -rotate-[20deg] text-emerald-400/70"
        style={{ left: "32%", top: "38%" }}
      />
      <Leaf
        aria-hidden
        className="pointer-events-none absolute z-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-[24deg] text-lime-300/70"
        style={{ left: "64%", top: "35%" }}
      />
    </>
  );
}

interface GrowthFormulaNodeProps {
  icon: ReactNode;
  label: string;
  sizePx: number;
  leftPercent: number;
  backgroundColor: string;
  glowColor?: string;
  onClick: () => void;
  title: string;
  delay: number;
  shouldReduceMotion: boolean | null;
  // 라벨이 길어질 수 있는 노드(꽃 이름 등)만 개별적으로 늘려 쓴다 - 기본값(72px)은 세 노드가
  // 원래 공유하던 폭 그대로다.
  labelMaxWidthPx?: number;
}

// "씨앗에서 꽃까지" 시각화의 정거장 한 칸 - 원형 아이콘(크기가 씨앗<새싹<꽃 순서로 커진다)과
// 그 아래 텍스트 라벨을 한 세트로 묶는다. 세 노드 모두 이 컴포넌트 하나를 재사용해서, 라벨
// 폰트 크기/굵기가 저절로 통일된다(따로따로 손으로 맞출 필요가 없다). 컨테이너 바닥에
// 정렬돼(bottom-2) 아이콘 크기가 달라도 라벨은 항상 같은 줄에 나란히 놓인다. 라벨이 폭을
// 넘겨 말줄임 처리돼도 title(네이티브 툴팁)로 항상 전체 텍스트를 확인할 수 있다.
function GrowthFormulaNode({
  icon,
  label,
  sizePx,
  leftPercent,
  backgroundColor,
  glowColor,
  onClick,
  title,
  delay,
  shouldReduceMotion,
  labelMaxWidthPx = 72,
}: GrowthFormulaNodeProps) {
  return (
    <motion.div
      className="absolute bottom-2 flex -translate-x-1/2 flex-col items-center gap-1.5"
      style={{ left: `${leftPercent}%` }}
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.6 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.35, delay: shouldReduceMotion ? 0 : delay, ease: "easeOut" }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        title={title}
        className="relative z-10 flex shrink-0 items-center justify-center rounded-full"
        style={{ width: sizePx, height: sizePx, boxShadow: glowColor ? scaledGlow(glowColor, sizePx) : undefined }}
        whileHover={{ scale: 1.12 }}
      >
        {/* 넝쿨 연결선(VineConnector, z-0)이 아이콘 뒤로 완전히 가려지도록 불투명한 배킹을
            먼저 깐다 - backgroundColor가 반투명(hex+alpha)이라 배킹 없이는 뒤로 지나가는
            곡선이 비쳐 보인다. 배킹 위에 원래의 반투명 틴트를 그대로 얹어 겉보기 색은
            그대로 유지한다. */}
        <span className="absolute inset-0 z-0 rounded-full bg-[#030712]" />
        <span className="absolute inset-0 z-10 rounded-full" style={{ backgroundColor }} />
        <span className="relative z-20 flex items-center justify-center">{icon}</span>
      </motion.button>
      {/* 세 노드 모두 같은 클래스라 아이콘 크기가 달라도 라벨 글자 크기/굵기는 항상 동일하다.
          title 속성은 잘렸을 때만 호버 시 자연스럽게 툴팁으로 뜬다(짧은 라벨엔 그냥 무해하다). */}
      <span
        title={label}
        className="truncate text-center text-[11px] font-semibold text-slate-300"
        style={{ maxWidth: labelMaxWidthPx }}
      >
        {label}
      </span>
    </motion.div>
  );
}

// 아이콘 원형 배경의 은은한 글로우를 아이콘 크기에 비례해 키운다 - 씨앗<꿈<꽃 순서로 커지는
// 아이콘 크기와 함께 글로우 강도도 자연스럽게 함께 커지게 한다.
function scaledGlow(color: string, sizePx: number): string {
  const blur = Math.round(sizePx * 0.45);
  const spread = Math.max(1, Math.round(sizePx * 0.08));
  return `0 0 ${blur}px ${spread}px ${color}35`;
}

// 히어로 카드의 "미세한 별 텍스처" - 다른 섹션 카드와 구분되는 존재감을 주는 장식 중 하나.
// 정원 페이지의 LegendaryAmbientBackground처럼 Math.random()으로 매번 새로 뿌리는 대신
// 고정된 좌표 6개짜리 radial-gradient로 만들었다 - 이 카드는 정원 페이지와 달리 클라이언트
// 전용 렌더(fetch 이후)가 아니라 초기 렌더에도 나타나므로, 고정 패턴이 하이드레이션 불일치
// 걱정 없이 더 간단하다.
const HERO_STAR_TEXTURE_STYLE: CSSProperties = {
  backgroundImage: [
    "radial-gradient(1.5px 1.5px at 12% 22%, rgba(255,255,255,0.5) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 32% 68%, rgba(255,255,255,0.4) 50%, transparent 51%)",
    "radial-gradient(1.5px 1.5px at 58% 15%, rgba(255,255,255,0.35) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 78% 55%, rgba(255,255,255,0.45) 50%, transparent 51%)",
    "radial-gradient(1.5px 1.5px at 90% 78%, rgba(255,255,255,0.3) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 45% 92%, rgba(255,255,255,0.35) 50%, transparent 51%)",
  ].join(", "),
};

// 집중 모드(작성 화면 전체 화면 오버레이) 배경 - 순정 검정 대신 모서리에서 중앙으로 은은하게
// 퍼지는 보라/남색 글로우를 얹는다. 존재감을 최소한으로 유지해야 해서(의식하지 않으면 안
// 보일 정도) 위 HERO_STAR_TEXTURE_STYLE보다도 옅은 불투명도로 쓴다 - 별 텍스처는 그대로
// 재사용하고(새로 만들지 않는다), 코너 글로우만 이 화면 전용으로 추가한다.
const FOCUS_MODE_GLOW_STYLE: CSSProperties = {
  backgroundImage: [
    "radial-gradient(ellipse 900px 700px at 0% 0%, rgba(139,92,246,0.10), transparent 60%)",
    "radial-gradient(ellipse 900px 700px at 100% 100%, rgba(99,102,241,0.08), transparent 60%)",
  ].join(", "),
};

interface TodaySummaryCardProps {
  // 하루에 여러 편을 기록할 수 있어도 요약은 항상 대표(첫 편) 하나만 압축해서 보여준다 -
  // 전체 목록은 아래 캐러셀에서 확인한다.
  diaryEntry: DreamEntryRecord | null;
  dreamEntry: DreamEntryRecord | null;
  // 정원에 핀 꽃 이름 - 아직 개화 전이거나 심은 씨앗이 없으면 null(그 줄 자체를 생략한다).
  flowerName: string | null;
  // 실제 정원 데이터(genus/species/아우라) - 로딩 전이거나 아직 없으면 null이라 아이콘이
  // 단순 이모지로 대체된다. 있으면 아래 "꽃" 섹션(FlowerHero)과 같은 계산으로 아이콘을 그린다.
  flowerBloom: GardenBloomEntry | null;
  // 이 밤에 심은 씨앗(무의식에 심고 싶은 기운) - 없으면(아직 안 심었거나 지난 기록) 그 줄
  // 자체를 생략한다.
  seed: DreamSeedRecord | null;
  onScrollToDiary: () => void;
  onScrollToDream: () => void;
  // 꽃 안내 줄 전용 액션 - 아래로 스크롤하는 게 아니라 정원의 꽃 상세 관찰 모달로 이동한다.
  onOpenFlower: () => void;
}

// 성장 타임라인 바로 아래, 감정일기/꿈일기/AI 해몽 카드로 이어지는 긴 스크롤을 시작하기 전에
// 그날 전체를 한 화면에서 훑어볼 수 있게 하는 압축 요약 카드. 각 줄은 아래 해당 섹션으로
// 스무스 스크롤하는 버튼이기도 하다 - 완료된 항목은 실제 내용을, 아직 기록하지 않은 항목은
// 흐리게 "아직 기록 전"만 보여준다. 꽃 개화 안내는 이 카드 안에만 있다 - 예전엔 이 아래에
// 거의 같은 문구의 독립 버튼이 또 있어 중복이었다.
function TodaySummaryCard({
  diaryEntry,
  dreamEntry,
  flowerName,
  flowerBloom,
  seed,
  onScrollToDiary,
  onScrollToDream,
  onOpenFlower,
}: TodaySummaryCardProps) {
  // "씨앗에서 꽃까지" 아이콘 3개의 등장 애니메이션을 끌지 여부 - 시스템이 감속 모션을
  // 요청했으면(prefers-reduced-motion: reduce) 애니메이션 없이 바로 최종 상태로 보여준다.
  const shouldReduceMotion = useReducedMotion();
  // 예전엔 여기 본문/제목 미리보기 한 줄이 더 있었다 - 아래 감정 칩(또는 무드 라벨)이 이미
  // "오늘 하루가 어땠는지"를 충분히 보여줘서, 일기 내용을 그대로 노출하는 대신 없앴다. 한눈에
  // 훑는 용도인 요약 카드는 항상 같은 정보(아이콘+감정)만 보여주는 편이 더 일관되고 담백하다.
  // 마음 기록장(깊이 모드)으로 쓴 날은 뭉뚱그린 무드 라벨 대신 "초기 감정 -> 종료 감정" 여정을
  // 보여준다 - 일기 상세의 "감정의 여정"(EmotionJourneyView)과 같은 정보를, 이 카드 크기에
  // 맞게 더 작은 칩으로 줄인 버전이다. 종료 감정은 저장 시 필수가 아니라(7단계까지 안 가도
  // 저장 가능) 없을 수 있다 - 그러면 초기 감정 칩 하나만 보여준다.
  const diaryJourney =
    diaryEntry && diaryEntry.survey.journal_mode === "guided" && diaryEntry.survey.initial_emotion
      ? {
          initial: diaryEntry.survey.initial_emotion,
          initialCategory: diaryEntry.survey.initial_emotion_category ?? null,
          closing: diaryEntry.survey.closing_emotion ?? null,
          closingCategory: diaryEntry.survey.closing_emotion_category ?? null,
        }
      : null;
  // 감정일기 아이콘 배경에 그날의 길흉 톤을 옅게 반영한다 - 상세 섹션과 같은 표(MOOD_AURA)를 쓴다.
  const diaryTone = diaryEntry ? MOOD_AURA[moodBucketForEmoji(diaryEntry.emotion)] : null;
  // 이 밤 심은 씨앗 - 씨앗 종류는 이제 감정일기에서 고른 감정 대분류 그 자체다(finishing
  // 단계에 별도 선택 UI가 없다). 그래도 헤더 바로 아래 짧은 캡션으로 한 번 더 확인시켜 준다.
  const seedDef = seed ? getSeedDefinition(seed.seed_type) : null;
  // 꿈일기 줄에 무드 라벨을 함께 보여준다 - dreamEntry.emotion은 유저가 직접 고른 감정이거나
  // (안 골랐으면) AI가 판정한 길흉을 서버가 이미 채워 넣은 값이라, 이 필드 하나만 읽으면
  // "선택한 감정 또는 AI가 판정한 길흉 중 있는 데이터"를 그대로 쓰는 셈이다.
  const dreamMoodLabel = dreamEntry ? moodLabelFor(dreamEntry.emotion) : null;
  // 꽃 아이콘은 아래 "꽃" 섹션(FlowerHero)과 완전히 같은 계산(genus 색 + 아우라)을 쓰는 작은
  // 버전이다 - 정원 데이터가 아직 없으면(도감 로딩 전 등) 예전처럼 단순 이모지로 대체한다.
  const flowerTone = flowerBloom ? MOOD_AURA[flowerBloom.emotion ? moodBucketForEmoji(flowerBloom.emotion) : "neutral"] : null;
  const [flowerGenusColor] = colorForGenus(flowerBloom?.genus ?? null);
  // "씨앗에서 꽃까지" - 씨앗(감정)+새싹(꿈의 대표 태그)이 합쳐져 이 꽃이 됐다는 걸 보여주는
  // 시각화. 실제로 핀 꽃이 있을 때만(diaryEntry/dreamEntry/flowerBloom 셋 다) 의미가 있어,
  // 그 전엔 생략한다. 새싹 노드의 라벨은 태그가 있으면 대표 태그를, 없으면(레거시 기록 등)
  // 꿈의 무드 단어를 대신 보여준다 - 라벨 자체가 사라지는 것보다는 낫다.
  const showFormula = Boolean(diaryEntry && dreamEntry && flowerBloom);
  const dreamRepresentativeLabel = dreamEntry?.interpretation?.tags[0]?.replace(/^#/, "") || dreamMoodLabel;

  return (
    // 히어로 카드 - 예전엔 요약 3줄 리스트와 "씨앗에서 꽃까지"가 각자 테두리를 가진 박스로
    // 나뉘어 있어(리스트는 border rounded-xl, 공식은 별도 bg 패널) 한 카드 안인데도 "박스 속
    // 박스 두 개"처럼 보였다 - 이제 안쪽 테두리를 걷어내고 옅은 구분선/여백만으로 한 흐름
    // (요약 -> 넝쿨)처럼 읽히게 했다. 다른 섹션 카드보다 존재감이 있어야 해서 은은한 초록/
    // amber 글로우(shadow, 진행선과 같은 두 색)와 고정 별 텍스처를 얹었다 - 과하지 않게
    // opacity를 낮게 유지한다.
    <div
      className="relative mx-auto mt-6 w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_0_1px_rgba(255,255,255,0.05),0_25px_60px_-15px_rgba(52,199,89,0.12),0_15px_40px_-15px_rgba(251,191,36,0.1)] sm:p-7"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35]" style={HERO_STAR_TEXTURE_STYLE} />

      <p className="relative px-1 text-xs font-semibold tracking-wide text-slate-500">📋 오늘의 요약</p>

      {/* 이 밤 심은 씨앗 - 3분할 칼럼(감정일기/꿈일기/꽃)에 끼워 넣지 않고 헤더 바로 아래
          짧은 캡션 한 줄로 별도로 보여준다. 심은 씨앗이 없으면(아직 안 심었거나 지난 기록)
          줄 자체가 생략된다. */}
      {seed && seedDef ? (
        <p className="relative mt-2 flex items-center justify-center gap-2 px-1 text-xs text-slate-500">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${seedDef.colors[0]}22` }}
          >
            <SeedIcon category={seed.seed_type} sizePx={22} />
          </span>
          이 밤 심은 씨앗 · <span className="font-medium text-slate-300">{seedDef.label}</span>
        </p>
      ) : (
        // 미완료 - 아직 어떤 감정도 정해지지 않아 특정 카테고리 색을 쓸 수 없는 상태다.
        // category=null인 SeedIcon이 기호 없는 빈 껍질만 중립 회색으로 그려 "아직 채울
        // 자리"라는 걸 보여준다.
        <p className="relative mt-2 flex items-center justify-center gap-2 px-1 text-xs text-slate-400">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.03]">
            <SeedIcon category={null} sizePx={22} />
          </span>
          이 밤엔 심어둔 씨앗이 없어요
        </p>
      )}

      {/* 감정일기/꿈일기/꽃 - 데스크톱(sm 이상)에서는 가로 3분할, 좁은 화면에서는 세로 스택으로
          자동 전환된다(divide-y -> sm:divide-x로 구분선 방향도 함께 바뀐다). 아래 "씨앗에서
          꽃까지"가 같은 16.67%/50%/83.33% 지점에 노드를 두므로, 이 3분할 grid-cols-3의 칼럼
          중심(정확히 1/6, 1/2, 5/6 지점)과 좌우로 자연스럽게 이어진다. */}
      <div className="relative mt-4 grid grid-cols-1 divide-y divide-white/5 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <button
          type="button"
          onClick={onScrollToDiary}
          className={`flex flex-col items-center gap-2 px-3 py-4 text-center transition-colors hover:bg-white/[0.04] ${
            diaryEntry ? "text-slate-200" : "text-slate-400"
          }`}
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
            style={{ backgroundColor: diaryTone ? `${diaryTone.color}22` : "rgba(255,255,255,0.05)" }}
          >
            {diaryEntry ? diaryEntry.emotion : "☀️"}
          </span>
          {diaryEntry ? (
            <span className="flex min-w-0 flex-col items-center gap-0.5">
              {diaryJourney ? (
                <span className="flex items-center gap-1 text-xs font-medium">
                  <MiniEmotionChip word={diaryJourney.initial} category={diaryJourney.initialCategory} />
                  {diaryJourney.closing && (
                    <>
                      <span className="text-slate-600">→</span>
                      <MiniEmotionChip word={diaryJourney.closing} category={diaryJourney.closingCategory} />
                    </>
                  )}
                </span>
              ) : (
                <span className="text-sm font-medium text-emerald-200/90">{moodLabelFor(diaryEntry.emotion)}</span>
              )}
            </span>
          ) : (
            <span className="text-base">감정일기: 아직 기록 전</span>
          )}
        </button>

        <button
          type="button"
          onClick={onScrollToDream}
          className={`flex flex-col items-center gap-2 px-3 py-4 text-center transition-colors hover:bg-white/[0.04] ${
            dreamEntry ? "text-slate-200" : "text-slate-400"
          }`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime-500/10 text-xl">🌙</span>
          {dreamEntry ? (
            <span className="flex min-w-0 flex-col items-center gap-0.5">
              <span className="text-sm font-medium text-lime-200/90">{dreamMoodLabel}</span>
              <span className="line-clamp-2 max-w-[10rem] text-base leading-snug">{dreamEntry.title}</span>
            </span>
          ) : (
            <span className="text-base">꿈일기: 아직 기록 전</span>
          )}
        </button>

        {flowerName && (
          <button
            type="button"
            onClick={onOpenFlower}
            title="눌러서 꽃 상세 관찰 모달 열기"
            className="group flex flex-col items-center gap-2 px-3 py-4 text-center text-amber-200 transition-colors hover:bg-amber-500/10"
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={
                flowerTone
                  ? { backgroundColor: `${flowerGenusColor}22`, boxShadow: auraGlowShadow(flowerTone.color, 1) }
                  : { backgroundColor: "rgba(16,185,129,0.12)" }
              }
            >
              <FlowerIcon
                archetype={flowerBloom?.archetype ?? null}
                genus={flowerBloom?.genus ?? null}
                speciesName={flowerBloom?.species_name ?? null}
                isLegendary={flowerBloom?.is_legendary}
                sizePx={26}
              />
            </span>
            {/* 화살표 아이콘을 텍스트 옆에 따로 띄우는 대신(다른 두 칼럼과 달리 카드 전체
                높이 기준으로 붕 떠 보이는 문제가 있었다) 지웠다 - 칼럼 전체가 버튼이라
                호버 배경(위 hover:bg-amber-500/10)만으로 클릭 가능함이 드러나고, 아주 작은
                보조 문구로 한 번 더 알려준다. 세로 스택(아이콘 -> 이름 -> 보조 문구)이라
                다른 두 칼럼과 같은 가운데 정렬 구조를 그대로 유지한다. */}
            <span className="flex min-w-0 flex-col items-center gap-0.5">
              <span className="line-clamp-2 max-w-[10rem] text-base leading-snug">{withIga(flowerName)} 피었어요</span>
              <span className="text-[10px] text-amber-300/50 transition-colors group-hover:text-amber-300/80">
                눌러서 자세히 보기
              </span>
            </span>
          </button>
        )}
      </div>

      {/* 씨앗에서 꽃까지 - 씨앗(감정)과 개화(꿈의 대표 태그)가 합쳐져 지금의 꽃이 됐다는 걸
          "+"/"=" 계산식이 아니라 넝쿨이 자라나는 모습으로 보여준다. 세 노드 모두 앱의 기존
          성장 아이콘 언어(Sprout/Flower2 - GrowthTimeline의 "씨앗 심기"/"개화"와 같은 아이콘,
          그리고 실제 꽃 아이콘)를 그대로 재사용한다 - 가운데 노드는 처음엔 "씨앗 발아"(수면)
          아이콘을 썼었는데, 그 키워드는 실제로 꿈일기(개화 단계) 내용에서 나온 것이라 "잠들
          었다"는 의미로 잘못 읽혀 "개화" 아이콘으로 바꿨다. 아이콘 아래 텍스트 라벨(감정 단어/
          대표 태그/꽃 이름)은 GrowthFormulaNode 하나를 세 번 재사용해 폰트 크기·굵기가
          저절로 통일된다. 4단계가 전부 끝나 실제로 핀 꽃이 있을 때만(showFormula) 보여준다 -
          미완료인 날은 결과(꽃) 자체가 없어 성립하지 않는다. 세 노드 모두 눌러서 각자의
          섹션/모달로 이동할 수 있다(위 세 칼럼과 같은 액션을 재사용한다). 왼쪽(씨앗)->오른쪽
          (꽃)으로 갈수록 아이콘이 28px->36px->48px로 커지고, 처음 화면에 나타날 때 그 순서
          대로 150ms 간격을 두고 커지며 나타난다. 위 3분할과 같은 16.67%/50%/83.33% 지점을
          써서 두 줄이 좌우로 어긋나지 않는다. */}
      {showFormula && diaryEntry && dreamEntry && flowerBloom && (
        <div className="relative mt-2 border-t border-white/5 pt-4">
          <p className="text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">씨앗에서 꽃까지</p>
          <div className="relative mt-1 h-24 w-full">
            <VineConnector />

            <GrowthFormulaNode
              icon={<Sprout className="h-3.5 w-3.5" style={{ color: diaryTone?.color ?? "#e2e8f0" }} />}
              label={moodLabelFor(diaryEntry.emotion)}
              sizePx={28}
              leftPercent={16.67}
              backgroundColor={diaryTone ? `${diaryTone.color}22` : "rgba(255,255,255,0.05)"}
              glowColor={diaryTone?.color}
              onClick={onScrollToDiary}
              title="오늘의 현실"
              delay={0}
              shouldReduceMotion={shouldReduceMotion}
            />

            <GrowthFormulaNode
              icon={<Flower2 className="h-4 w-4 text-slate-200" />}
              label={dreamRepresentativeLabel ?? "🌙"}
              sizePx={36}
              leftPercent={50}
              backgroundColor={`${flowerGenusColor}1f`}
              glowColor={flowerGenusColor}
              onClick={onScrollToDream}
              title="개화"
              delay={0.15}
              shouldReduceMotion={shouldReduceMotion}
            />

            <GrowthFormulaNode
              icon={
                <FlowerIcon
                  archetype={flowerBloom?.archetype ?? null}
                  genus={flowerBloom?.genus ?? null}
                  speciesName={flowerBloom?.species_name ?? null}
                  isLegendary={flowerBloom?.is_legendary}
                  sizePx={26}
                />
              }
              label={flowerName ?? "꽃"}
              sizePx={48}
              leftPercent={83.33}
              backgroundColor={`${flowerGenusColor}26`}
              glowColor={flowerTone?.color}
              onClick={onOpenFlower}
              title="꽃 상세 보기"
              delay={0.3}
              shouldReduceMotion={shouldReduceMotion}
              labelMaxWidthPx={104}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

interface CalendarPanelProps {
  dateGroups: DateGroup[];
  // 태그 필터가 걸려 있으면 그 태그가 달린 날짜만 남긴 목록(newest-first) - "최근 기록"
  // 목록 전용이고, 달력 그리드 자체는 항상 필터와 무관하게 그 달 전체를 보여준다.
  recentGroups: DateGroup[];
  activeTagFilter: string | null;
  onClearTagFilter: () => void;
  seeds: DreamSeedRecord[];
  // 완료된 날짜에 그날 핀 꽃의 이름을 함께 보여주기 위한 정원 데이터 - seedsByDate로 그
  // 날짜의 씨앗을 찾고, 그 씨앗 id로 이 목록에서 실제 핀 꽃(이름)을 찾는다.
  gardenBlooms: GardenBloomEntry[];
  selectedDate: string | null;
  // 어떤 날짜를 클릭하든(기록이 있든 없든) 일단 그 날짜를 선택 상태로 만들기만 한다 - 그
  // 날짜에 실제로 기록이 있는지 없는지에 따라 무엇을 보여줄지는 호출부(journal 본문)가
  // selectedDate만 보고 파생시킨다. 예전엔 여기서 곧바로 편집 모드로 진입시켰는데, 빈
  // 날짜를 클릭하자마자 작성 화면이 뜨는 게 원치 않는 동작이라 없앴다 - 이제는 항상 먼저
  // 선택 상태(빈 상태 화면 또는 기존 기록 보기)를 보여주고, 사용자가 명시적으로 버튼을
  // 눌러야만 편집 모드로 넘어간다.
  onPickDate: (date: string) => void;
  // lg: 미만에서 이 패널의 어느 하위 섹션(달력/최근 기록)이 활성 탭인지 - 패널 전체 표시
  // 여부와 그 안의 두 섹션 각각의 표시 여부를 정한다. lg: 이상에서는 참조되지 않는다(항상
  // 둘 다 펼쳐짐).
  mobileActiveTab: "summary" | "calendar" | "recent";
}

// 날짜 탐색을 이 패널 하나로 통합했다 - 예전에는 상단 가로 스크롤 날짜 목록과 이 오른쪽
// 캘린더가 화면 양쪽에 따로 떨어져 있어 같은 기능(날짜 이동)이 중복돼 보였다. 이제
// 달력(그 달 전체 조망) 아래에 "최근 기록"(기록 있는 날짜만 최신순) 목록을 이어 붙여
// 하나의 패널로 묶고, 날짜 탐색 기능은 이 사이드바 한 곳에만 존재한다.
function CalendarPanel({
  dateGroups,
  recentGroups,
  activeTagFilter,
  onClearTagFilter,
  seeds,
  gardenBlooms,
  selectedDate,
  onPickDate,
  mobileActiveTab,
}: CalendarPanelProps) {
  const initialMonth = selectedDate ?? todayDateInputValue();
  const [viewYear, setViewYear] = useState(Number(initialMonth.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(Number(initialMonth.slice(5, 7)) - 1);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, DateGroup>();
    for (const group of dateGroups) map.set(group.date, group);
    return map;
  }, [dateGroups]);

  const seedsByDate = useMemo(() => {
    const map = new Map<string, DreamSeedRecord>();
    for (const seed of seeds) map.set(seed.planted_at, seed);
    return map;
  }, [seeds]);

  const bloomBySeedId = useMemo(() => new Map(gardenBlooms.map((bloom) => [bloom.id, bloom])), [gardenBlooms]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const todayStr = todayDateInputValue();

  // "최근 기록" 각 항목의 날짜 표기 - 오늘/어제는 상대 표현으로, 그 외엔 기존 절대 표현
  // (MM월 DD일)을 그대로 쓴다. 홈화면 CTA/일기장 기본 날짜와 같은 "취침일 기준" 오늘/어제
  // 계산(@/lib/dreamDate)을 그대로 가져다 써서 날짜 정의가 어긋나지 않게 한다.
  const yesterdayStr = yesterdayDateInputValue();
  const dateLabelFor = (dateStr: string): string => {
    if (dateStr === todayStr) return "오늘";
    if (dateStr === yesterdayStr) return "어제";
    const { month, day } = dateBadgeParts(dateStr);
    return `${month}월 ${day}일`;
  };

  // 목록이 길어질 걸 대비해, 날짜가 다른 달로 넘어갈 때마다 그 사이에 월 구분 소제목을
  // 끼워 넣는다. recentGroups가 이미 최신순(newest-first)이라 위에서 아래로 훑으면서 월이
  // 바뀌는 지점만 잡으면 된다.
  const recentListItems = useMemo(() => {
    const items: ({ kind: "header"; key: string; label: string } | { kind: "entry"; key: string; group: DateGroup })[] = [];
    let lastMonthKey: string | null = null;
    for (const group of recentGroups) {
      const monthKey = group.date.slice(0, 7);
      if (monthKey !== lastMonthKey) {
        const [y, m] = monthKey.split("-");
        items.push({ kind: "header", key: `header-${monthKey}`, label: `${y}년 ${Number(m)}월` });
        lastMonthKey = monthKey;
      }
      items.push({ kind: "entry", key: group.date, group });
    }
    return items;
  }, [recentGroups]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div
      // top-24(96px)는 헤더가 항상 한 줄(약 77px)이라고 가정한 고정값이었다 - NavBar의
      // 데스크톱 메인 nav가 이제 폭이 모자라면 줄바꿈되어(1024~1280px 로그인 상태에서
      // 흔함) 헤더 높이가 달라지므로, NavBar가 내보내는 실측 높이(--nav-height)에 원래와
      // 같은 여백(96-77≈19px)을 더해 항상 헤더 바로 아래에 붙게 한다.
      style={{ top: "calc(var(--nav-height, 77px) + 19px)" }}
      className={`sticky w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur-xl ${
        mobileActiveTab === "summary" ? "hidden lg:block" : ""
      }`}
    >
      {/* lg: 미만에서는 이 안의 두 섹션(달력/최근 기록) 중 활성 탭 쪽만 보인다 - 각 섹션
          자체에 hidden lg:block을 개별로 건다(모바일 대시보드 탭). */}
      <div className={mobileActiveTab === "calendar" ? "" : "hidden lg:block"}>
      {/* 달력과 "최근 기록"이 하나의 패널이라는 걸 알려주는 작은 헤더 - 날짜 탐색 기능이
          이 사이드바 한 곳에만 있다는 걸 시각적으로도 분명히 한다. */}
      <p className="text-[11px] font-medium tracking-wide text-slate-500">📅 날짜 탐색</p>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevMonth}
          aria-label="이전 달"
          className="rounded-full p-3.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-medium text-white">
          {viewYear}년 {viewMonth + 1}월
        </p>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label="다음 달"
          className="rounded-full p-3.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="text-[10px] text-slate-400">
            {label}
          </span>
        ))}

        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const group = entriesByDate.get(dateStr);
          const diaryCount = group?.entries.filter((entry) => entry.entry_type === "emotion").length ?? 0;
          const dreamCount = group?.entries.filter((entry) => entry.entry_type === "dream").length ?? 0;
          const hasSeed = seedsByDate.has(dateStr);
          const isActive = selectedDate === dateStr;
          const isToday = dateStr === todayStr;
          // 미래 날짜는 클릭 자체는 막지 않는다(선택하면 "아직 오지 않은 날짜예요" 안내가
          // 뜬다) - 다만 다른 날짜들과 시각적으로 구분되게 흐리게 표시하고, 데이터가 있을 수
          // 없는 날이라 진행 상태 점(dot)도 그리지 않는다.
          const isFuture = dateStr > todayStr;
          const status = journeyStatus(group?.entries ?? [], hasSeed);

          // 점에 호버했을 때 뜨는 네이티브 툴팁 - 그 날 어디까지 진행했는지 요약한다.
          const summaryParts = [
            status === "full" ? "성장 여정 완료" : status === "partial" ? "일부만 진행" : null,
            diaryCount > 0 ? `일기 ${diaryCount}건` : null,
            dreamCount > 0 ? `꿈 ${dreamCount}건` : null,
            hasSeed && dreamCount === 0 ? "씨앗 심음" : null,
          ].filter((part): part is string => Boolean(part));

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onPickDate(dateStr)}
              title={isFuture ? "아직 오지 않은 날짜예요" : summaryParts.length > 0 ? summaryParts.join(" / ") : undefined}
              className={`flex flex-col items-center gap-1 rounded-lg border py-1.5 text-xs transition-colors ${
                isFuture
                  ? "border-white/5 text-slate-600 hover:border-white/10 hover:bg-white/[0.03]"
                  : isActive
                    ? "border-purple-400/40 bg-purple-500/20 text-white"
                    : isToday
                      ? "border-purple-400/20 text-purple-300 hover:border-purple-400/40 hover:bg-white/5"
                      : "border-white/5 text-slate-400 hover:border-white/15 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>{day}</span>
              <span className="flex h-1.5 items-center">
                {!isFuture && status === "full" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                {!isFuture && status === "partial" && <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />}
              </span>
            </button>
          );
        })}
      </div>

      {/* 점 색상 범례 - 초록/회색이 각각 무엇을 뜻하는지 한 번은 밝혀야 처음 보는 사람도
          바로 읽을 수 있다. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.06] pt-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 성장 여정 완료
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> 일부만 진행
        </span>
      </div>
      </div>
      {/* 달력 섹션 끝 */}

      {/* 최근 기록 - 예전엔 상단 가로 스크롤 목록이 담당하던 "빠르게 훑어보며 날짜 이동"
          역할을 그대로 이어받는다. 기록이 있는 날짜만 최신순으로, 내부 스크롤로 패널
          전체 높이가 뷰포트를 넘지 않게 한다. */}
      <div
        className={`mt-3 border-t border-white/[0.06] pt-3 ${mobileActiveTab === "recent" ? "" : "hidden lg:block"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium tracking-wide text-slate-500">최근 기록</p>
          {activeTagFilter && (
            <button
              type="button"
              onClick={onClearTagFilter}
              title="태그 필터 해제"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-200 transition-colors hover:bg-purple-500/20"
            >
              #{activeTagFilter} ✕
            </button>
          )}
        </div>

        <div className="mt-2 max-h-80 overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-purple-900/30 scrollbar-track-transparent">
          {recentGroups.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-slate-400">
              {activeTagFilter ? "이 태그가 달린 날짜가 없어요." : "아직 남긴 기록이 없어요."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {recentListItems.map((item) => {
                if (item.kind === "header") {
                  return (
                    <li
                      key={item.key}
                      className="px-2 pb-1 pt-3 text-[10px] font-medium tracking-wide text-slate-400 first:pt-0"
                    >
                      {item.label}
                    </li>
                  );
                }

                const { group } = item;
                const isActive = selectedDate === group.date;
                const status = journeyStatus(group.entries, seedsByDate.has(group.date));
                // 완료된 날은 그날 핀 꽃 이름을 함께 보여준다 - 씨앗 심긴 날짜 -> 그 씨앗이
                // 피운 꽃 순으로 찾는다(FlowerHero와 같은 이름 결정 규칙: 커스텀 이름이
                // 없으면 씨앗 종류의 기본 꽃 이름).
                const seed = seedsByDate.get(group.date);
                const bloom = seed ? bloomBySeedId.get(seed.id) : null;
                const flowerName =
                  status === "full" && bloom ? (bloom.flower_name ?? getSeedDefinition(bloom.seed_type).flowerName) : null;
                // 완료(4단계 다 끝남) -> 미니 꽃 아이콘(개화 전환 로직은 그대로). 그 외
                // 진행 중인데 씨앗은 심겨 있으면 -> 그날 심은 감정 색의 SeedIcon. 씨앗조차
                // 없으면 -> 중립 회색 SeedIcon(미완료, "아직 채울 자리").
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => onPickDate(group.date)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        isActive ? "bg-purple-500/20 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {status === "full" ? (
                        <Flower2 className="h-3 w-3 shrink-0 text-emerald-400" />
                      ) : (
                        <SeedIcon category={seed?.seed_type ?? null} sizePx={12} className="shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {dateLabelFor(group.date)}
                        {flowerName && (
                          <span className={isActive ? "text-purple-200/80" : "text-slate-500"}> · {flowerName}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// 로그아웃 상태의 seeds 파생값으로 매번 새 배열을 만들면 참조가 매 렌더 달라져 이걸 의존성으로
// 쓰는 useMemo들이 계속 재계산된다 - 컴포넌트 바깥의 고정 참조 하나를 공유해서 막는다.
const EMPTY_SEEDS: DreamSeedRecord[] = [];

// 나만의 일기장 - 꿈 기록소(/diary)와 완전히 독립된 라우트지만, 같은 DreamEntry 데이터를
// 공유해 날짜별로 꿈(해몽 완료) + 일기(해몽 전) 기록을 한 화면에서 오갈 수 있게 한다.
export default function DailyJournalPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const allEntries = useSavedDreamsStore((state) => state.entries);
  const upsertEntry = useSavedDreamsStore((state) => state.upsertEntry);
  const removeEntry = useSavedDreamsStore((state) => state.removeEntry);

  // 무의식 씨앗 전체 이력 - "밤에 심기 -> 아침에 확인" 카드의 [Mid] 상태와, 꿈 기록의 날짜 이동
  // 귀속(cardDateFor)에 함께 쓰인다. 일기 작성 폼과는 독립적이라 별도로 불러온다.
  // 로그아웃 이후에도 rawSeeds에 이전 세션 값이 남아있을 수 있어, 실제로 쓰는 seeds는
  // isAuthenticated로 한 번 더 걸러 파생시킨다(effect 안에서 별도로 []/null로 되돌릴 필요가 없다).
  const [rawSeeds, setSeeds] = useState<DreamSeedRecord[]>([]);
  const seeds = isAuthenticated ? rawSeeds : EMPTY_SEEDS;

  useEffect(() => {
    if (!isAuthenticated) return;
    getMySeeds()
      .then(setSeeds)
      .catch(() => {});
  }, [isAuthenticated]);

  // "꽃" 섹션 미리보기 + 이 페이지 안에서 바로 여는 꽃 상세 관찰 모달, 둘 다 정원 도감과
  // 완전히 같은 데이터(genus/종/아우라/도감 번호/고정 상태)가 필요하다 - DreamSeedRecord에는
  // 그 정보가 없어 정원 API 응답 전체(GardenProfile)를 그대로 들고 있는다.
  const [rawGardenProfile, setGardenProfile] = useState<GardenProfile | null>(null);
  const gardenProfile = isAuthenticated ? rawGardenProfile : null;
  useEffect(() => {
    if (!isAuthenticated) return;
    getMyGarden()
      .then(setGardenProfile)
      .catch(() => {});
  }, [isAuthenticated]);
  const gardenBlooms = useMemo(() => gardenProfile?.blooms ?? [], [gardenProfile]);
  const bloomBySeedId = useMemo(() => new Map(gardenBlooms.map((bloom) => [bloom.id, bloom])), [gardenBlooms]);

  // 도감 번호(개화일 오름차순) + 진행도 카운터 - 정원 페이지(garden/page.tsx)와 완전히 같은
  // 집계 방식이다. 꽃 상세 관찰 모달을 이 페이지 안에서 그대로 열기 위해 필요하다.
  const bloomedSorted = useMemo(
    () => [...gardenBlooms].filter((entry) => entry.stage === "bloom").sort((a, b) => a.bloomed_at.localeCompare(b.bloomed_at)),
    [gardenBlooms]
  );
  const dexNumberByBloomId = useMemo(
    () => new Map(bloomedSorted.map((entry, index) => [entry.id, index + 1] as const)),
    [bloomedSorted]
  );
  const myGeneralSpeciesCount = useMemo(
    () => new Set(bloomedSorted.filter((entry) => !entry.is_legendary && entry.species_name).map((entry) => entry.species_name)).size,
    [bloomedSorted]
  );
  const myLegendaryCount = useMemo(
    () => new Set(bloomedSorted.filter((entry) => entry.is_legendary && entry.legendary_key).map((entry) => entry.legendary_key)).size,
    [bloomedSorted]
  );

  // 꽃 상세 관찰 모달 - 예전엔 "정원으로 이동"(router.push)해서 봤지만, 일기장 안에서 바로
  // 확인하고 싶다는 요청에 따라 이 페이지 안에서 직접 연다(도감/정원으로 넘어가지 않는다).
  const [observedBloom, setObservedBloom] = useState<GardenBloomEntry | null>(null);
  const [isPinning, setIsPinning] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const handleTogglePin = async () => {
    if (!observedBloom || isPinning) return;
    setIsPinning(true);
    setPinError(null);
    try {
      const isCurrentlyPinned = gardenProfile?.pinned_seed_id === observedBloom.id;
      const updated = isCurrentlyPinned ? await unpinGardenFlower() : await pinGardenFlower(observedBloom.id);
      setGardenProfile(updated);
    } catch (error) {
      setPinError(getAuthErrorMessage(error));
    } finally {
      setIsPinning(false);
    }
  };

  const seedByDreamEntryId = useMemo(() => {
    const map = new Map<number, DreamSeedRecord>();
    for (const seed of seeds) {
      if (seed.bloomed_dream_entry_id != null) map.set(seed.bloomed_dream_entry_id, seed);
    }
    return map;
  }, [seeds]);

  const seedByPlantedDate = useMemo(() => {
    const map = new Map<string, DreamSeedRecord>();
    for (const seed of seeds) map.set(seed.planted_at, seed);
    return map;
  }, [seeds]);

  const dateGroups = useMemo<DateGroup[]>(() => {
    const byDate = new Map<string, DreamEntryRecord[]>();
    for (const entry of allEntries) {
      const date = cardDateFor(entry, seedByDreamEntryId);
      const list = byDate.get(date) ?? [];
      list.push(entry);
      byDate.set(date, list);
    }
    // 씨앗만 심고 아직 꿈을 기록하지 않은 밤도 "기다리는 중" 카드로 노출한다.
    for (const seed of seeds) {
      if (!byDate.has(seed.planted_at)) byDate.set(seed.planted_at, []);
    }
    return Array.from(byDate.entries())
      .map(([date, entries]) => ({
        date,
        entries: [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allEntries, seeds, seedByDreamEntryId]);

  // 예전엔 여기서 날짜별 감정일기 서술형 답변을 미리 조회용 맵으로 만들어 DreamRecordModal에
  // 넘겼다 - 이 페이지가 이미 메모리에 들고 있는 목록에서 조립하는 방식이라, 그 목록을 안
  // 들고 있는 화면(/journal/record 전용 페이지 등)에서는 조용히 빠지는 문제가 있었다. 이제는
  // 서버(POST /api/dream-interpretation*)가 요청 시점에 같은 취침일의 감정일기를 직접
  // 조회한다 - 이 페이지는 더 이상 이 맵을 만들 필요가 없다.

  // 해시태그를 누르면 그 태그가 달린 날짜만 오른쪽 사이드바의 "최근 기록" 목록에 남긴다 -
  // 실제 선택된 날짜의 본문 내용까지 걸러내지는 않는다(그 날의 기록은 그대로 전부 보여준다),
  // 어디까지나 "빠르게 훑어볼 날짜 후보를 좁혀주는" 보조 기능이다. dateGroups는 이미
  // 최신순(newest-first)이라 "최근 기록"에 그대로 쓸 수 있다.
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  // "?" 도움말 모달 - 정원 페이지(GardenHelpModal)와 같은 패턴으로, 이 페이지 구조(요약
  // 카드/4단계 자세히 보기 토글/섹션별 접기)를 짧게 설명한다.
  const [isJournalHelpOpen, setIsJournalHelpOpen] = useState(false);
  const recentGroups = useMemo(() => {
    if (!activeTagFilter) return dateGroups;
    return dateGroups.filter((group) => group.entries.some((entry) => entry.interpretation?.tags.includes(activeTagFilter)));
  }, [dateGroups, activeTagFilter]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedGroup = selectedDate ? (dateGroups.find((group) => group.date === selectedDate) ?? null) : null;
  const selectedEntries = selectedGroup?.entries ?? [];
  // [1] 현실(일기) -> [3] 무의식(꿈) 고정 순서로 렌더링하기 위해, 같은 날짜의 기록을 항상 이
  // 두 갈래로 나눠 둔다. 일기가 여러 편이면 캐러셀로, 꿈은 여러 편이어도 세로로 쌓는다.
  const diaryEntries = selectedEntries.filter((entry) => entry.entry_type === "emotion");
  const dreamEntries = selectedEntries.filter((entry) => entry.entry_type === "dream");
  // [Mid] 심어진 씨앗 - 이 카드 날짜(=planted_at)에 심긴 씨앗이 있으면 상태(대기 중/개화/휴면)를 보여준다.
  const cardSeed = selectedDate ? (seedByPlantedDate.get(selectedDate) ?? null) : null;
  const isSeedWaitingForDream = cardSeed?.status === "PLANTED" && cardSeed.bloomed_dream_entry_id === null;
  // 꿈이 기억나지 않아 명시적으로 넘어간 날 - "아직 안 씀"과 구분해서 다룬다(위로 문구를
  // 보여주고, "다음 할 일" 재촉을 멈춘다). status는 여전히 PLANTED라 isSeedWaitingForDream도
  // 여전히 true로 남는다 - "이 날의 꿈 기록하기" 버튼은 그대로 유지해 나중에 다시 쓸 수 있는
  // 문을 열어 둔다.
  const isDreamForgotten = cardSeed?.dream_recall_status === "FORGOTTEN";

  // "꿈이 기억나지 않아요" 명시적 선택 - 성공하면 seeds 배열의 해당 항목만 교체해 cardSeed가
  // 재조회 없이 즉시 새 dream_recall_status를 반영하게 한다.
  const [isMarkingDreamForgotten, setIsMarkingDreamForgotten] = useState(false);
  const handleMarkDreamForgotten = async () => {
    if (!selectedDate || isMarkingDreamForgotten) return;
    setIsMarkingDreamForgotten(true);
    try {
      const updated = await markDreamForgotten(selectedDate);
      setSeeds((prev) => prev.map((seed) => (seed.id === updated.id ? updated : seed)));
    } catch {
      // 실패해도 조용히 무시한다 - 버튼이 그대로 남아있어 다시 누르면 그만이다.
    } finally {
      setIsMarkingDreamForgotten(false);
    }
  };

  // "오늘의 현실"/"개화"/"꽃" 섹션은 위 요약 카드가 하루 전체를 이미 훑어주므로 기본 접힘
  // 상태로 시작한다 - 사용자가 마지막으로 펼쳐본 상태만 세션 내에서 기억한다(날짜를 옮겨
  // 다녀도 유지). 빈 상태(아직 기록 없음)나 작성/수정 중에는 접을 내용이 없으므로 아래
  // 렌더링에서 이 상태와 무관하게 항상 펼쳐서 보여준다. "수면" 정거장은 카드 자체가 없어
  // 접힘 상태가 필요 없다.
  const [isDiaryCardExpanded, setIsDiaryCardExpanded] = useState(false);
  const [isBloomSectionExpanded, setIsBloomSectionExpanded] = useState(false);
  const [isFlowerSectionExpanded, setIsFlowerSectionExpanded] = useState(false);
  // 지하철 노선도식 진행선 전체(씨앗 심기~꽃)를 보여줄지 - 압축 타임라인 + 오늘의 요약
  // 카드만으로 하루를 훑을 수 있으므로 기본은 접힘이다. 위 세 토글과 별개로, 이건 "4단계
  // 전체가 보이는지"만 켜고 끈다.
  const [isStageListExpanded, setIsStageListExpanded] = useState(false);
  // 모바일 전용 대시보드 탭 - 오늘의 요약/날짜 탐색/최근 기록이 세로로 전부 쌓이면 스크롤이
  // 과도하게 길어져서, lg: 미만에서는 한 번에 한 탭만 보여준다(lg: 이상은 지금처럼 전부
  // 펼쳐진 레이아웃 그대로 - 이 상태값 자체를 참조하지 않는다). 기본은 "오늘의 요약".
  const [mobileDashboardTab, setMobileDashboardTab] = useState<"summary" | "calendar" | "recent">("summary");
  // 펼침/접힘 애니메이션 중에만 overflow-hidden을 걸어둔다 - height:0->auto 트랜지션이
  // 자연스러워 보이려면 그 순간엔 내용을 잘라내야 하지만, 다 펼쳐진 뒤에도 계속 clip해
  // 두면 마커/카드의 은은한 글로우(box-shadow)가 이 컨테이너의 사각형 경계에서 잘려
  // 보인다 - 애니메이션이 끝나면 overflow를 visible로 풀어 글로우가 자유롭게 퍼지게 한다.
  const [isStageListAnimating, setIsStageListAnimating] = useState(false);
  // sessionStorage는 브라우저 전용 외부 시스템이라 마운트 이후 effect에서만 읽을 수 있다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage(외부 시스템) 조회 결과에 반응
    setIsDiaryCardExpanded(sessionStorage.getItem(DIARY_CARD_EXPANDED_KEY) === "1");
    setIsBloomSectionExpanded(sessionStorage.getItem(BLOOM_SECTION_EXPANDED_KEY) === "1");
    setIsFlowerSectionExpanded(sessionStorage.getItem(FLOWER_SECTION_EXPANDED_KEY) === "1");
    setIsStageListExpanded(sessionStorage.getItem(STAGE_LIST_EXPANDED_KEY) === "1");
  }, []);
  const toggleDiaryCardExpanded = () => {
    setIsDiaryCardExpanded((prev) => {
      const next = !prev;
      sessionStorage.setItem(DIARY_CARD_EXPANDED_KEY, next ? "1" : "0");
      return next;
    });
  };
  const toggleBloomSectionExpanded = () => {
    setIsBloomSectionExpanded((prev) => {
      const next = !prev;
      sessionStorage.setItem(BLOOM_SECTION_EXPANDED_KEY, next ? "1" : "0");
      return next;
    });
  };
  const toggleFlowerSectionExpanded = () => {
    setIsFlowerSectionExpanded((prev) => {
      const next = !prev;
      sessionStorage.setItem(FLOWER_SECTION_EXPANDED_KEY, next ? "1" : "0");
      return next;
    });
  };
  const diaryCardSummary = diaryEntries[0]
    ? `${moodLabelFor(diaryEntries[0].emotion)} · ${buildDreamOriginalContent(diaryEntries[0].survey).split(/\r?\n/)[0].trim()}`
    : null;

  // 개화/꽃 두 섹션이 같은 편을 가리키도록 캐러셀 인덱스를 여기(부모)에서 들고 있는다 -
  // 개화 섹션의 좌우 화살표로 페이지를 넘기면 꽃 섹션도 같은 편의 해몽으로 따라간다.
  const [rawDreamActiveIndex, setDreamActiveIndex] = useState(0);
  // dreamEntries가 줄어들면 이전 인덱스가 범위를 벗어날 수 있어, 저장된 값을 effect로
  // 되돌리는 대신 읽는 시점에 바로 안전한 범위로 잘라서 쓴다.
  const dreamActiveIndex = dreamEntries.length === 0 ? 0 : Math.min(rawDreamActiveIndex, dreamEntries.length - 1);
  const dreamActiveEntry = dreamEntries[dreamActiveIndex] ?? null;
  const bloomSectionSummary = dreamActiveEntry ? dreamActiveEntry.title : null;
  const flowerSectionSummary = dreamActiveEntry?.interpretation?.description?.trim().slice(0, 40) ?? null;

  // 이 밤의 씨앗이 실제로 피운 꽃(정원 데이터) - 하룻밤에 꿈을 여러 편 적어도 씨앗과 연결된
  // 편은 항상 하나뿐이라, 지금 캐러셀에서 보고 있는 편이 "그 꽃을 피운 편"일 때만 미리보기를
  // 보여준다(다른 편을 보고 있을 땐 그 편은 이 씨앗의 꽃과 무관하다).
  const cardBloom = cardSeed ? (bloomBySeedId.get(cardSeed.id) ?? null) : null;
  const isActiveEntryTheBloom = cardBloom !== null && dreamActiveEntry?.id === cardSeed?.bloomed_dream_entry_id;
  const flowerPreviewBloom = isActiveEntryTheBloom ? cardBloom : null;
  const flowerTone = flowerPreviewBloom
    ? MOOD_AURA[flowerPreviewBloom.emotion ? moodBucketForEmoji(flowerPreviewBloom.emotion) : "neutral"]
    : null;
  // "꽃" 정거장은 여정의 클라이맥스라 4단계 중 가장 화사한 톤을 쓴다 - 실제로 핀 꽃이 있으면
  // (flowerTone) 그 꽃의 실제 아우라 색(길흉)을 그대로 카드/마커에 입히고, 아직 없으면
  // 기본 바이올렛 톤으로 대체한다. 카드 자체에는 더 이상 사각형 테두리 글로우(box-shadow)를
  // 주지 않는다 - "알림창처럼 보인다"는 피드백에 따라, 발광은 오직 FlowerHero의 원형
  // 아이콘에만 집중시키고 이 셸은 배경 톤 차이만으로 화사함을 표현한다.
  const flowerAccent = flowerTone?.color ?? "#C4B5FD";
  const flowerShellStyle = {
    borderColor: `${flowerAccent}35`,
    background: `linear-gradient(to bottom right, ${flowerAccent}1f, rgba(15,23,42,0.75), rgba(15,23,42,0.75))`,
  };
  // 마커(왼쪽 진행선의 원형 아이콘)에만 쓰는 글로우 - 카드가 아니라 원이라 "알림"처럼 읽히지 않는다.
  const flowerGlowShadow = `0 0 20px 6px ${flowerAccent}80, 0 0 38px 14px ${flowerAccent}35`;

  // 성장 타임라인 4단계 상태 - 씨앗 심기(감정일기)/발아(수면, 자동)/개화(꿈일기)/꽃(AI 해몽).
  // 각 단계는 그 자신의 조건뿐 아니라 앞선 단계까지 함께 갖춰야 "완료"다(누적형 여정) -
  // 씨앗을 심지 않고는(감정일기 없이는) 발아도 개화도 있을 수 없다. 예전엔 개화/꽃이 오직
  // dreamDone(꿈일기 존재)만 보고 판단해서, 감정일기 없이 꿈일기만 있는 날에도 "개화 완료"가
  // 잘못 표시되는 버그가 있었다(씨앗 없이 핀 꽃). 이 앱은 꿈일기를 쓰는 즉시 AI 해몽까지
  // 한 번에 만들어지므로 평소엔 "개화"와 "꽃"이 같은 순간에 완료되지만, 무의식 광장의
  // "직접 쓰기"(AI 해몽 생략 가능)로 만들어진 꿈일기가 이 날짜에 걸리면 둘이 갈릴 수 있어
  // "개화"는 꿈일기 원문 존재로, "꽃"은 그 중 AI 해몽이 실제로 붙어 있는지로 따로 본다.
  // "발아"는 씨앗을 심었지만 아직 꿈으로 이어지지 않은 동안만 "자동 진행 중"으로 펄스가
  // 돈다 - 단, 그건 오늘 밤에만 뜻이 통하는 상태다. 이미 지나간 과거 날짜라면 그 밤은
  // 어차피 끝났으므로(씨앗은 심겨 있다는 전제 하에) 발아 자체는 무조건 "완료"로 본다(꿈일기를
  // 안 썼어도 밤은 지나갔다) - 과거 카드에서 "지금 자는 중" 펄스가 그대로 떠 있는 게 문제였다.
  const todayStr = todayDateInputValue();
  const isViewingToday = selectedDate === todayStr;
  // 과거/미래를 구분해야 한다 - 예전엔 "오늘이 아니면 무조건 지나간 밤"으로 취급해서
  // (!isViewingToday만 봄) 아직 오지 않은 미래 날짜를 선택해도 씨앗 발아가 "완료"로 잘못
  // 표시되는 버그가 있었다(미래의 밤은 아직 지나가지 않았다). 문자열 그대로 비교해도 안전한
  // 이유: 두 값 모두 항상 YYYY-MM-DD 포맷이라 사전식 비교가 곧 날짜 순서 비교와 같다.
  const isPastDate = selectedDate !== null && selectedDate < todayStr;
  const isFutureDate = selectedDate !== null && selectedDate > todayStr;
  // 이전엔 useMemo로 감쌌지만, 매번 다시 계산해도 세 자리 삼항연산일 뿐이라 비용이 무시할
  // 수준이고(불안정한 참조 동일성이 필요한 자식도 없다 - 아래에서 항상 .seed/.sleep 등
  // 개별 문자열 값만 props로 꺼내 쓴다), React Compiler가 자체적으로 메모이제이션해 준다.
  const growthStages: { seed: GrowthNodeStatus; sleep: GrowthNodeStatus; bloom: GrowthNodeStatus; flower: GrowthNodeStatus } = (() => {
    const seedDone = diaryEntries.length > 0;
    const dreamDone = dreamEntries.length > 0;
    const dreamInterpreted = dreamEntries.some((entry) => Boolean(entry.interpretation));
    return {
      seed: seedDone ? "done" : "pending",
      // 발아는 (1) 꿈이 실제로 기록됐으면 그 자체가 잠들었다는 직접 증거라 씨앗 유무와
      // 무관하게 완료, 아니면 (2) 씨앗이 있고(심겨 있고) 밤이 지났을 때만 완료. 씨앗도
      // 꿈도 둘 다 없으면 아무것도 시작되지 않은 것이므로 대기 그대로 둔다.
      sleep: dreamDone || (seedDone && isPastDate) ? "done" : seedDone ? "in_progress" : "pending",
      // 개화(꿈일기 원문)와 꽃(AI 해몽) 둘 다 씨앗이 먼저 있어야 하고, 꽃은 추가로 실제
      // 해몽이 붙어 있어야 한다(무의식 광장 "직접 쓰기"는 해몽 없이 저장될 수 있다).
      bloom: seedDone && dreamDone ? "done" : "pending",
      flower: seedDone && dreamDone && dreamInterpreted ? "done" : "pending",
    };
  })();

  // 수면 정거장은 별도 카드가 없어 진행선 위의 마커+짧은 문구만으로 존재감을 준다 - 이
  // 앱에는 별도로 기록되는 수면 데이터(시간/질 등)가 없어 상태에 따른 안내 문구로 대신한다.
  const sleepStageText =
    growthStages.sleep === "done"
      ? "🌙 잠들어 있었어요"
      : growthStages.sleep === "in_progress"
        ? "🌙 지금 잠들어 있어요..."
        : "🌙 아직 잠들지 않았어요";

  const [editingEntry, setEditingEntry] = useState<DreamEntryRecord | null>(null);
  const isEditingDiary = editingEntry !== null && editingEntry.entry_type === "emotion";
  const isEditingDream = editingEntry !== null && editingEntry.entry_type === "dream";
  const [isComposingNew, setIsComposingNew] = useState(false);
  const [formDate, setFormDate] = useState(todayDateInputValue());
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState(JOURNAL_MOOD_OPTIONS[0].emoji);
  const [body, setBody] = useState("");
  // 씨앗 심기(감정일기)는 마음 기록장(깊이 모드) 하나만 쓴다 - "📝 간단히 쓰기" 선택지는
  // 새 기록 작성 경로에서 없앴다(토글을 만들었다가 다시 없앴다). "simple" 값 자체는 여전히
  // 남아있는데, 예전에 간단 모드로 저장된 기록을 "수정"할 때(startEditEntry) 원본 그대로
  // 보여줘야 하기 때문이다. 깊이 모드에서 1단계(초기 감정)를 고르면 그 단어의 속(genus)에
  // 맞는 대표 이모지를 mood에도 함께 반영해, 저장 로직(handleSave)이 모드와 무관하게 그대로
  // 동작한다.
  const [journalMode, setJournalMode] = useState<"simple" | "guided">("guided");
  // 작성 화면 2단계 - "writing"(제목/입력 영역)에서 시작해, 완료 액션(마음 기록장의 "다
  // 적었어요 ✨", 예전 간단 모드 수정 중이면 "다음 →")을 눌러야 "finishing"(무의식 씨앗/
  // 사진/최종 저장 버튼)으로 넘어간다. 서로 목적이 다른 CTA(모드 진입 vs 저장)가
  // 한 화면에 같이 뜨던 문제를 이 2단계 분리로 없앴다. 꿈 기록(entry_type==="dream") 수정
  // 시에는 이 폼이 "제목/날짜만 고치는" 훨씬 단순한 용도라 단계 분리 없이 예전처럼 한 화면에
  // 다 보여준다(아래 렌더링에서 isEditingDream이면 항상 두 블록을 함께 보여주는 것으로 처리).
  const [composeStage, setComposeStage] = useState<"writing" | "finishing">("writing");
  const [guidedData, setGuidedData] = useState<GuidedEmotionJournalValue>(EMPTY_GUIDED_JOURNAL_VALUE);
  const handleGuidedDataChange = (next: GuidedEmotionJournalValue) => {
    setGuidedData(next);
    if (next.initialEmotion && next.initialEmotion !== guidedData.initialEmotion) {
      setMood(representativeEmojiForWord(next.initialEmotion));
    }
  };
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 오늘 밤 씨앗 심기 - 이미 심어둔 씨앗이 있는지 여부는 일기 작성 폼과 독립적으로 확인해 둔다.
  // 씨앗 종류를 따로 고르는 화면은 없다 - writing 단계(마음 기록장 1단계)에서 이미 고른 감정
  // 대분류(guidedData.initialEmotionCategory)가 그대로 오늘 밤 심는 씨앗이 된다. 실제
  // plantSeed 호출은 handleSave가 일기 저장과 함께 한 번에 처리한다 - 팝업 없이 인라인으로
  // "기록 저장 + 씨앗 심기"가 하나의 제출로 끝나야 하기 때문이다.
  // 로그아웃 이후에도 rawTonightSeed에 이전 세션 값이 남아있을 수 있어, 실제로 쓰는
  // tonightSeed는 isAuthenticated로 한 번 더 걸러 파생시킨다.
  const [rawTonightSeed, setTonightSeed] = useState<DreamSeedRecord | null>(null);
  const tonightSeed = isAuthenticated ? rawTonightSeed : null;
  const emotionForSeed: SeedType | null = guidedData.initialEmotionCategory ?? null;

  useEffect(() => {
    if (!isAuthenticated) return;
    getTonightSeed()
      .then(setTonightSeed)
      .catch(() => {});
  }, [isAuthenticated]);

  // 씨앗 심기 완료 리추얼 - 저장 버튼을 눌러 일기+씨앗이 함께 저장되는 순간에만 재생된다.
  // "idle"이 아니면 화면 전체를 덮는 연출 오버레이가 떠 있는 상태다.
  const [ritualSeedType, setRitualSeedType] = useState<SeedType | null>(null);
  const [ritualStage, setRitualStage] = useState<"idle" | "glow" | "blackout">("idle");
  const router = useRouter();

  const triggerPlantingRitual = (seedType: SeedType) => {
    setRitualSeedType(seedType);
    setRitualStage("glow");
    window.setTimeout(() => setRitualStage("blackout"), RITUAL_GLOW_MS);
    window.setTimeout(() => {
      try {
        sessionStorage.setItem(RITUAL_HOME_FADE_IN_KEY, "1");
      } catch {
        // 세션 스토리지를 못 쓰면 그냥 밝은 상태로 홈이 뜬다 - 연출 하나 빠지는 정도라 무시한다.
      }
      router.push("/");
    }, RITUAL_GLOW_MS + RITUAL_FADE_MS);
  };

  // 필수 조건(본문)과, 그와 무관하게 도는 2대 선택 미션(감정 확정/사진) 카운터. 제목
  // 입력란은 없앴다 - 저장 시 본문에서 자동으로 만든다(deriveEntryTitle 참고). 깊이 모드는
  // 자유 서술(body) 대신 1단계(초기 감정)+2단계(사건)를 최소 조건으로 삼는다 - 나머지 4개
  // 서술형 질문까지 전부 강제하면 가벼운 리추얼이 아니라 부담스러운 과제가 된다.
  const isValid =
    journalMode === "guided"
      ? guidedData.initialEmotion !== null && guidedData.triggerEvent.trim().length > 0
      : body.trim().length > 0;
  // 방금 저장된 편으로 캐러셀 포커스를 옮기기 위한 트리거.
  const [justSavedEntryId, setJustSavedEntryId] = useState<number | null>(null);
  // 마음 기록장(깊이 모드) 새 저장 직후에만 뜨는 완료 리캡 화면 - null이 아니면 화면 전체를
  // 덮는 오버레이로 떠 있는 상태다. 저장은 이 시점에 이미 끝난 상태라 화면을 닫아도(또는
  // 새로고침해도) 데이터 유실 위험은 없다.
  const [guidedRecapEntry, setGuidedRecapEntry] = useState<{
    dateStr: string;
    data: GuidedEmotionJournalValue;
    seedType: SeedType | null;
  } | null>(null);
  // 성장 타임라인의 "개화"/"꽃" 노드를 누르면 각각 이 두 섹션으로 스크롤한다.
  const bloomSectionRef = useRef<HTMLDivElement | null>(null);
  const flowerSectionRef = useRef<HTMLDivElement | null>(null);
  // 성장 타임라인의 "씨앗 심기" 노드를 누르면 이 카드로 스크롤한다.
  const diaryCardRef = useRef<HTMLDivElement | null>(null);

  // 지하철 노선도식 진행선 - 4개 정거장 마커의 실제 좌표를 재서 첫 마커부터 마지막 마커까지
  // 하나의 연속된 그라데이션 세로선을 그린다(useStageLineMetrics 참고).
  const stageListRef = useRef<HTMLDivElement | null>(null);
  const stageMarkerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stageLine = useStageLineMetrics(stageListRef, stageMarkerRefs, 4, isStageListExpanded);

  // 진행선 전체가 "단계별로 자세히 보기" 토글 뒤에 숨어 있어서, 위쪽 압축 타임라인/오늘의
  // 요약 카드의 각 줄이나 상단 CTA를 눌러 특정 정거장(씨앗 심기/개화/꽃)으로 이동하려 할 때
  // 그 정거장이 아직 마운트조차 안 돼 있을 수 있다. revealStageListAndScrollTo는 오직
  // setState만 하고 ref는 절대 건드리지 않는다 - 이 함수는 primaryCta 같은 렌더 중에 매번
  // 새로 만들어지는 값의 onClick 안에서도 호출되는데, 그런 자리에서 ref.current를 직접
  // 읽으면(React Compiler 기준) "렌더 중 ref 접근"으로 오탐지된다. 실제 스크롤(ref.current
  // 접근)은 아래 전용 effect 안에서만 한다 - nonce로 매번 새 객체를 넣어 같은 정거장을
  // 다시 요청해도(예: 이미 펼쳐진 상태에서 같은 카드 CTA를 다시 누름) effect가 확실히
  // 재실행되게 한다.
  const [pendingStageTarget, setPendingStageTarget] = useState<{ key: StageSectionKey; nonce: number } | null>(null);
  const revealStageListAndScrollTo = useCallback(
    (key: StageSectionKey) => {
      setPendingStageTarget({ key, nonce: Date.now() });
      if (!isStageListExpanded) {
        setIsStageListExpanded(true);
        sessionStorage.setItem(STAGE_LIST_EXPANDED_KEY, "1");
      }
    },
    [isStageListExpanded]
  );

  // 실제 ref.current 접근(스크롤)은 이 effect 안에서만 한다. 이미 펼쳐져 있었다면 곧장
  // 스크롤하고, 방금 펼쳐진 참이면(펼침 애니메이션이 막 시작된 순간 곧장 스크롤하면 아직
  // 자리 잡지 않은 위치로 튀어 보이므로) 애니메이션이 어느 정도 진행된 뒤로 살짝 늦춘다.
  useEffect(() => {
    if (!pendingStageTarget) return;
    const { key } = pendingStageTarget;
    const ref = key === "diary" ? diaryCardRef : key === "bloom" ? bloomSectionRef : flowerSectionRef;
    const timer = setTimeout(
      () => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setPendingStageTarget(null);
      },
      isStageListExpanded ? 0 : 150
    );
    return () => clearTimeout(timer);
  }, [pendingStageTarget, isStageListExpanded]);

  // 새로 작성 중인 내용이 있는지 - 기존 노드를 다듬는 인라인 수정은 별도 흐름이라 제외한다.
  const isGuidedDataDirty =
    guidedData.initialEmotion !== null ||
    guidedData.closingEmotion !== null ||
    guidedData.triggerEvent.trim() !== "" ||
    guidedData.desire.trim() !== "" ||
    guidedData.messageToOther.trim() !== "" ||
    guidedData.desiredMessage.trim() !== "" ||
    guidedData.selfCompassion.trim() !== "";
  const isDirty = isComposingNew && (body.trim() !== "" || isGuidedDataDirty);
  const setGlobalDirty = useUnsavedChangesStore((state) => state.setDirty);

  // 마운트 시 복원 가능한 임시 저장 초안이 있으면 켜지는 복구 모달 표시 여부와, 프리뷰 박스에 쓸 요약.
  // hasSavedDraft는 "지금 그 강제 모달을 띄울지"(최대 2회 제한 적용), hasDraftAvailable은
  // "초안이 존재하긴 하는지"(항상 정확) - 한도를 넘겨 모달을 못 띄워도 이 값이 true면 수동으로
  // 불러오는 링크를 계속 보여줘야 하기 때문에 둘을 분리했다.
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [hasDraftAvailable, setHasDraftAvailable] = useState(false);
  const [draftPreview, setDraftPreview] = useState<{ savedAt: number; title: string; content: string } | null>(null);
  // 저장 전 캐시된 AI 해몽 리포트가 있으면 "이어서 확인하기" 토스트를 보여준다 - DreamRecordModal이
  // 자체적으로 CACHED_ANALYSIS_KEY를 관리하므로, 여기서는 존재 여부만 확인해 모달을 열 뿐이다.
  const [hasCachedAnalysis, setHasCachedAnalysis] = useState(false);

  // 🔮 AI 해몽 기록 모달(구 /diary) - 일기장을 벗어나지 않고 이 모달에서 씨앗 기록+AI 해몽+저장을
  // 전부 끝낸다. prefill은 사전/홈 히어로에서 넘어온 프리필, resumeFromCache는 "이어서 확인하기"
  // 토스트로 열렸을 때만 true다.
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [recordPrefill, setRecordPrefill] = useState<DreamRecordPrefill | undefined>(undefined);
  const [recordResumeFromCache, setRecordResumeFromCache] = useState(false);

  const openRecordModal = (prefill?: DreamRecordPrefill, resumeFromCache?: boolean) => {
    setRecordPrefill(prefill);
    setRecordResumeFromCache(Boolean(resumeFromCache));
    setIsRecordModalOpen(true);
  };

  // URL의 ?date=가 명시적으로 날짜를 지정했는지 - 아래 "기본 날짜 선택" 효과가 이걸 덮어쓰면
  // 안 된다. state가 아니라 ref인 이유: 두 효과가 같은 마운트 커밋에서 함께 실행될 수 있는데,
  // 그 시점엔 이 효과의 setSelectedDate 호출이 아직 리렌더에 반영되지 않아(같은 flush 안에서
  // 다음 효과는 여전히 이전 렌더의 selectedDate를 보는 stale 클로저) selectedDate 값만으로는
  // 막을 수 없다 - ref는 같은 flush 안에서도 동기적으로 값이 보여 이 순서 문제를 피한다.
  const urlDateHandledRef = useRef(false);

  // 사전("이 상징으로 꿈 기록하기")/홈 히어로("이 꿈 일기장에 보관하고 첫 씨앗 심기")/아침 웰컴
  // 모달("오늘의 꿈 기록하기")에서 넘어온 쿼리 파라미터를 확인해, 있으면 이 모달을 곧장 연다.
  // window.location은 정적 export 빌드(prerender) 시점엔 존재하지 않아 렌더 중에는 읽을
  // 수 없다 - 아래 모든 setState는 마운트 이후 이 쿼리스트링 파싱 결과에 반응하는 것들이다.
  useEffect(() => {
    if (!isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const quickTextParam = params.get("quickText");
    const titleParam = params.get("title");
    const openRecordParam = params.get("openRecord");
    const resumeCacheParam = params.get("resumeCache");
    const dateParam = params.get("date");
    const justSavedParam = params.get("justSaved");

    if (titleParam) {
      const moodParam = params.get("mood");
      const badgeParam = params.get("badge");
      const expertParam = params.get("expert");
      const targetChipParam = params.get("targetChip");
      const targetOtherParam = params.get("targetOther");
      const dynamicsChipParam = params.get("dynamicsChip");
      const isValidMoodBucket = moodParam === "good" || moodParam === "neutral" || moodParam === "nightmare";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location(외부 시스템) 파싱 결과에 반응
      openRecordModal({
        title: titleParam,
        quickText: `[사전 기반 기록] ${titleParam}`,
        actionDetail: titleParam,
        mood: isValidMoodBucket ? emojiForMoodBucket(moodParam as DreamMood) : undefined,
        targetChip: targetChipParam ?? undefined,
        targetOther: targetOtherParam ?? undefined,
        dynamicsChip: dynamicsChipParam ?? undefined,
        dictionaryBadge: badgeParam ?? undefined,
        dictionaryExpert: expertParam ?? undefined,
        cameFromDictionary: true,
      });
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (quickTextParam) {
      openRecordModal({ quickText: quickTextParam });
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (openRecordParam === "1") {
      openRecordModal();
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    // GNB "AI 해몽" 팝업에서 결과를 확인하고 "일기장에 담기"를 눌러 넘어온 경우 - 이미 로컬에
    // 캐시해 둔 해몽 리포트를 곧장 이어서 확인/저장하는 화면을 연다(미니멀/정밀 모드 공통).
    if (resumeCacheParam === "1") {
      openRecordModal(undefined, true);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    // 무의식의 정원에서 식물을 클릭해 들어온 경우, /journal/record에서 막 저장하고 돌아온
    // 경우, 또는 홈화면 "오늘의 씨앗 심기" CTA처럼 특정 날짜를 명시적으로 지정해 들어온
    // 경우 - 그날의 성장 타임라인을 곧장 펼치고(justSaved가 있으면) 방금 쓴 편으로 캐러셀
    // 포커스를 맞춘다. urlDateHandledRef를 세워 아래 "기본 날짜 선택" 효과가 이 명시적
    // 지정을 "가장 최근 기록이 있는 날짜"로 덮어쓰지 못하게 막는다.
    if (dateParam) {
      urlDateHandledRef.current = true;
      setSelectedDate(dateParam);
      setIsComposingNew(false);
      setEditingEntry(null);
      if (justSavedParam) setJustSavedEntryId(Number(justSavedParam));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // localStorage는 브라우저 전용 외부 시스템이라 마운트 이후 effect에서만 읽을 수 있다.
    try {
      const raw = localStorage.getItem(JOURNAL_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as JournalDraft;
      const guidedPreviewContent = draft.guidedData?.triggerEvent?.trim() || draft.guidedData?.initialEmotion || "";
      const hasContent = Boolean(draft.title?.trim() || draft.body?.trim() || guidedPreviewContent);
      if (!hasContent) return;

      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage(외부 시스템) 조회 결과에 반응
      setHasDraftAvailable(true);
      setDraftPreview({
        savedAt: draft.savedAt,
        title: draft.title?.trim() || "제목 없는 기록",
        content: draft.body?.trim() || guidedPreviewContent,
      });
      // 같은 초안에 대해 강제로 뜨는 복구 모달은 최대 2번까지만 - 그 이후로는 조용히 건너뛰고,
      // 아래 "수동으로 불러오기" 링크만 남긴다.
      if (shouldShowDraftPrompt(JOURNAL_DRAFT_KEY)) {
        setHasSavedDraft(true);
      }
    } catch {
      // 손상된 초안은 조용히 무시한다.
    }
  }, []);

  useEffect(() => {
    // localStorage는 브라우저 전용 외부 시스템이라 마운트 이후 effect에서만 읽을 수 있다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage(외부 시스템) 조회 결과에 반응
    setHasCachedAnalysis(localStorage.getItem(DREAM_RECORD_CACHED_ANALYSIS_KEY) !== null);
  }, []);

  // 처음 들어오면 항상 "취침일 기준 오늘" 날짜를 펼친다 - 예전엔 기록이 있는 날짜 중 가장
  // 최근 날짜(dateGroups[0])를 기본값으로 골랐는데, 그러면 이미 4단계가 다 끝난 어제 화면이
  // 열리고 정작 오늘은 한 번도 안 보여주는 문제가 있었다(홈화면 CTA에서 발견된 것과 같은
  // 원인). 오늘 날짜에 기록이 없어도(빈 상태) 억지로 작성 폼을 열지 않는다 - 압축
  // 타임라인의 첫 대기 단계 펄스 + "다음 할 일" 안내 배너가 이미 다음 행동을 안내해 주므로,
  // 여기서 자동으로 폼을 띄우면 오히려 그 안내를 건너뛰게 된다. 복원 가능한 초안이 있으면
  // 그 선택은 복구 모달을 통해 유저가 직접 하게 하고 자동으로 켜지 않는다. ?date=로 명시적
  // 날짜가 지정된 경우(urlDateHandledRef)는 이 자동 선택 자체를 건너뛴다.
  useEffect(() => {
    if (urlDateHandledRef.current || selectedDate !== null || isComposingNew || hasSavedDraft) return;
    setSelectedDate(todayDateInputValue());
  }, [selectedDate, isComposingNew, hasSavedDraft]);

  // 저장/해석이 끝나 개화 섹션으로 새 편이 자리 잡으면, 그 영역까지 화면을 부드럽게 스크롤한다.
  // 현실(일기) 캐러셀은 항상 최상단이라 별도 스크롤 없이 캐러셀 인덱스만 넘긴다 - 실제 DOM
  // 스크롤(revealStageListAndScrollTo)이 페인트 이후에만 가능해 effect가 필요하고, 함께
  // 묶인 상태 갱신들도 그 스크롤과 한 덩어리로 일어나야 자연스럽다.
  useEffect(() => {
    if (justSavedEntryId === null) return;
    const dreamIdx = dreamEntries.findIndex((entry) => entry.id === justSavedEntryId);
    if (dreamIdx >= 0) {
      // 방금 저장한 편이 기본 접힘 상태에 가려지지 않도록 개화/꽃 섹션을 함께 펼치고, 두
      // 섹션이 공유하는 캐러셀 인덱스도 이 편으로 맞춘다. 이 두 섹션 자체가 "단계별로 자세히
      // 보기" 토글 뒤에 숨어 있을 수 있으니, 그 토글부터 열고 스크롤한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM 스크롤과 함께 일어나는 1회성 동작(외부 시스템 동기화)
      setDreamActiveIndex(dreamIdx);
      setIsBloomSectionExpanded(true);
      sessionStorage.setItem(BLOOM_SECTION_EXPANDED_KEY, "1");
      setIsFlowerSectionExpanded(true);
      sessionStorage.setItem(FLOWER_SECTION_EXPANDED_KEY, "1");
      revealStageListAndScrollTo("bloom");
    } else if (diaryEntries.some((entry) => entry.id === justSavedEntryId)) {
      setIsDiaryCardExpanded(true);
      sessionStorage.setItem(DIARY_CARD_EXPANDED_KEY, "1");
      revealStageListAndScrollTo("diary");
    }
    setJustSavedEntryId(null);
  }, [justSavedEntryId, dreamEntries, diaryEntries, revealStageListAndScrollTo]);

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
      const draft: JournalDraft = {
        savedAt: Date.now(),
        formDate,
        title,
        mood,
        body,
        photoUrl,
        journalMode,
        guidedData,
      };
      try {
        localStorage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // 저장 공간 부족 등은 조용히 무시한다 - 자동 저장은 부가 기능이라 화면 흐름을 막지 않는다.
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isDirty, formDate, title, mood, body, photoUrl, journalMode, guidedData]);

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
      setBody(draft.body ?? "");
      setJournalMode(draft.journalMode ?? "simple");
      setGuidedData(draft.guidedData ?? EMPTY_GUIDED_JOURNAL_VALUE);
      setPhotoUrl(draft.photoUrl ?? null);
      setPhotoError(null);
      setSaveError(null);
      setHasSavedDraft(false);
      setHasDraftAvailable(false);
      setDraftPreview(null);
    } catch {
      setHasSavedDraft(false);
      setHasDraftAvailable(false);
      setDraftPreview(null);
    }
  };

  const discardJournalDraft = () => {
    localStorage.removeItem(JOURNAL_DRAFT_KEY);
    resetDraftPromptCount(JOURNAL_DRAFT_KEY);
    setHasSavedDraft(false);
    setHasDraftAvailable(false);
    setDraftPreview(null);
  };

  const startNewEntry = (date?: string) => {
    const target = date ?? todayDateInputValue();
    // 방어선 - 화면 어디에도 미래 날짜로 이 함수를 부르는 버튼을 안 남겼지만(선택된 날짜가
    // 미래면 그 갈래 자체를 렌더링하지 않는다), 그래도 이 함수 하나가 편집 모드로 들어가는
    // 유일한 통로라 여기서 한 번 더 막는다 - 아직 꾸지 않은 밤의 꿈은 기록할 수 없다.
    if (target > todayDateInputValue()) return;
    setSelectedDate(target);
    setEditingEntry(null);
    setIsComposingNew(true);
    setFormDate(target);
    setTitle("");
    setMood(JOURNAL_MOOD_OPTIONS[0].emoji);
    setBody("");
    // 새 기록은 항상 마음 기록장(깊이 모드)으로 시작한다 - 간단히 쓰기는 새 기록 작성
    // 경로에서 고를 수 없다(토글 없음). 예전에 간단 모드로 저장된 기록을 "수정"할 때만
    // (startEditEntry) 원본 그대로 보여준다.
    setJournalMode("guided");
    setGuidedData(EMPTY_GUIDED_JOURNAL_VALUE);
    setPhotoUrl(null);
    setPhotoError(null);
    setSaveError(null);
    setComposeStage("writing");
    // 작성 폼은 "오늘의 현실" 카드 안에서만 렌더링되는데, 그 카드는 "단계별로 자세히 보기"
    // 토글 뒤에 숨어 있을 수 있다 - 토글이 닫혀 있으면 먼저 열어야 방금 켠 폼이 보인다.
    revealStageListAndScrollTo("diary");
  };

  const startEditEntry = (entry: DreamEntryRecord) => {
    setSelectedDate(entry.dream_date);
    setIsComposingNew(false);
    setEditingEntry(entry);
    setFormDate(entry.dream_date);
    setTitle(entry.title);
    setMood(entry.emotion);
    setBody(entry.survey.action_detail);
    // 마음 기록장(깊이 모드)으로 저장된 기록을 수정할 때는 그 상태를 그대로 복원한다 -
    // journal_mode가 없는 기존/간단 모드 기록은 항상 "simple"로 취급한다.
    setJournalMode(entry.survey.journal_mode === "guided" ? "guided" : "simple");
    setGuidedData({
      initialEmotion: entry.survey.initial_emotion ?? null,
      // 레거시 기록(이 힌트가 저장되기 전)은 undefined/null이라 자연히 categoryForWord
      // 폴백으로 처리된다 - GuidedEmotionJournalValue 주석 참고.
      initialEmotionCategory: (entry.survey.initial_emotion_category as EmotionCategoryKey | null | undefined) ?? null,
      triggerEvent: entry.survey.trigger_event ?? "",
      desire: entry.survey.desire ?? "",
      messageToOther: entry.survey.message_to_other ?? "",
      desiredMessage: entry.survey.desired_message ?? "",
      selfCompassion: entry.survey.self_compassion ?? "",
      closingEmotion: entry.survey.closing_emotion ?? null,
      closingEmotionCategory: (entry.survey.closing_emotion_category as EmotionCategoryKey | null | undefined) ?? null,
    });
    setPhotoUrl(entry.photo_url ?? null);
    setPhotoError(null);
    setSaveError(null);
    setComposeStage("writing");
  };

  // 무의식 광장 글쓰기로 이 기록을 미리 선택해 넘긴다 - 대상의 AI 해몽 유무에 따라 그 화면이
  // 감정일기/꿈일기 탭을 자동으로 맞춘다(interpretation 유무로 판단).
  const handleShareEntry = (entry: DreamEntryRecord) => {
    router.push(`/community/write?type=dream&dreamId=${entry.id}`);
  };

  // 꽃 상세 관찰 모달의 "일기 원문 보기" - 정원 페이지에서는 이 버튼이 /journal로 이동하지만,
  // 여기서는 이미 그 일기가 있는 화면이라 이동할 필요 없이 모달만 닫고 개화 섹션을 펼쳐
  // 스크롤해 준다.
  const handleViewDiaryFromFlowerModal = () => {
    setObservedBloom(null);
    revealStageListAndScrollTo("bloom");
  };

  // 무의식 광장 글쓰기의 "꽃" 탭으로 이 꽃을 미리 선택해 둔 채 넘긴다 - 정원 페이지와 동일한
  // 흐름(연결된 꿈 기록이 아니라 꽃(DreamSeed) 자체를 공유하므로 dreamId가 아닌 seedId를 쓴다).
  const handleShareFlower = () => {
    if (!observedBloom) return;
    router.push(`/community/write?type=dream&contentType=flower&seedId=${observedBloom.id}`);
  };

  const handleTagClickFromFlowerModal = (tag: string) => {
    setActiveTagFilter(tag);
    setObservedBloom(null);
  };

  const cancelCompose = () => {
    setIsComposingNew(false);
    setEditingEntry(null);
    setSaveError(null);
    // 명시적으로 취소했으니 자동 저장된 초안도, 리마인더 노출 횟수 카운터도 함께 정리한다.
    localStorage.removeItem(JOURNAL_DRAFT_KEY);
    resetDraftPromptCount(JOURNAL_DRAFT_KEY);
    setHasDraftAvailable(false);
  };

  // 집중 모드 상단 "나가기(×)" - 새로 작성 중(isDirty)이면 곧장 닫지 않고, 기존 이탈 방지
  // 모달(UnsavedChangesGuardModal - 헤더 내비게이션 이탈 가드와 같은 컴포넌트)로 한 번
  // 확인한다. 이미 저장된 기록을 수정하는 중이면(edit 모드) 원래도 확인 없이 곧장 닫히던
  // cancelCompose 동작을 그대로 유지한다(새로 만들지 않는다 - isDirty가 컴포즈-신규 전용
  // 플래그라 이 구분이 자연스럽게 따라온다).
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const requestExitCompose = () => {
    if (isDirty) {
      setShowExitConfirm(true);
      return;
    }
    cancelCompose();
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

  // 카드 "⋯" 메뉴의 삭제하기 - 바로 지우지 않고 확인 모달을 거친다.
  const [deleteTarget, setDeleteTarget] = useState<DreamEntryRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteDream(deleteTarget.id);
      removeEntry(deleteTarget.id);
      // 지운 기록이 지금 편집 중이던 카드였다면 폼도 함께 정리한다.
      if (editingEntry?.id === deleteTarget.id) {
        setEditingEntry(null);
        setIsComposingNew(false);
      }
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(getAuthErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  // 무의식 씨앗 심기는 "오늘 밤" 개념이라 실제 오늘 날짜를 쓸 때만 의미가 있다 - formDate를
  // 과거 날짜로 바꿔서 저장하면(예: 이미 완료된 지난 날짜에 "다른 순간도 기록하기"로 감정일기를
  // 추가하는 경우) 씨앗 선택 UI 자체가 뜨지 않아야 한다. 이걸 막지 않으면 지난 날짜 기록을
  // 저장했을 뿐인데 오늘 자정 기준 화분(tonightSeed)이 새로 생기거나(아직 없었다면) 이미
  // 있던 오늘 화분의 seed_type이 조용히 덮어써지는(POST /api/seeds가 날짜와 무관하게 항상
  // "오늘"의 화분을 대상으로 하므로) 사고로 이어진다 - 그날의 씨앗은 이미 확정된 상태를
  // 유지해야 한다는 원칙과 정면으로 어긋난다.
  const isFormForToday = formDate === todayDateInputValue();

  const handleSave = async () => {
    if (isSaving) return;
    const trimmedBody = body.trim();
    const isGuided = journalMode === "guided";
    // 제목 입력란이 없는 감정일기(!isEditingDream)는 저장 시점에 내용으로부터 자동으로
    // 만든다 - 이미 제목이 있으면(기존 기록을 수정하는 중이라 title state에 원본이 남아
    // 있으면) 그대로 보존하고, 새 기록이라 비어 있을 때만 새로 만든다. 꿈 기록을 이 폼으로
    // 편집할 때(isEditingDream)는 여전히 아래 title 입력란이 남아있어 그 값을 그대로 쓴다.
    const trimmedTitle = isEditingDream
      ? title.trim()
      : title.trim() || deriveEntryTitle({ isGuided, guidedData, body: trimmedBody, formDate });
    // 저장 완료 리캡 화면은 "방금 새로 심은" 마음 기록장 기록에만 뜨는 의식이다 - 오탈자를
    // 고치러 옛 기록을 수정하는 중이면(editingEntry가 이미 있었으면) 매번 뜨는 게 오히려
    // 소음이라 제외한다. try 블록 진입 전에 미리 캡처해 둔다 - 성공 분기에서 editingEntry를
    // null로 비우고 나면 더는 구분할 수 없기 때문이다.
    const wasEditingBeforeSave = Boolean(editingEntry);
    const showGuidedRecap = isGuided && !wasEditingBeforeSave;
    if (isEditingDream ? !trimmedTitle : isGuided ? !guidedData.initialEmotion || !guidedData.triggerEvent.trim() : !trimmedBody) {
      setSaveError(isEditingDream ? "제목을 입력해 주세요." : isGuided ? "지금 기분과 무슨 일이 있었는지는 적어주세요." : "내용을 적어주세요.");
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
        // 깊이 모드는 자유 서술(body) 대신 6단계 가이드 문답으로 채우므로, 다른 화면(최근
        // 기록 미리보기, buildDreamOriginalContent 등)이 여전히 이 필드를 읽어도 빈 텍스트가
        // 아니라 "사건/상황" 답변이 뜨도록 대체 본문으로 채운다 - 실제 "감정의 여정" 표시는
        // 일기 상세 카드가 survey.journal_mode를 보고 별도로 그린다.
        action_detail: isGuided ? guidedData.triggerEvent.trim() : trimmedBody,
        reality_link: "",
        reality_detail: "",
        vividness: 50,
        lucid_level: "none",
        control_level: null,
        final_memo: "",
        journal_mode: journalMode,
        ...(isGuided
          ? {
              initial_emotion: guidedData.initialEmotion,
              // 실제로 고른 대분류 힌트 - 백엔드가 이걸로 정확한 꽃 속(genus)을 계산한다
              // (같은 단어가 여러 대분류에 겹칠 때 필요, GuidedEmotionJournalValue 주석 참고).
              initial_emotion_category: guidedData.initialEmotionCategory ?? null,
              trigger_event: guidedData.triggerEvent.trim(),
              desire: guidedData.desire.trim(),
              message_to_other: guidedData.messageToOther.trim(),
              desired_message: guidedData.desiredMessage.trim(),
              self_compassion: guidedData.selfCompassion.trim(),
              closing_emotion: guidedData.closingEmotion,
              closing_emotion_category: guidedData.closingEmotionCategory ?? null,
            }
          : {}),
      };
      const tags = editingEntry?.tags ?? [];
      const payload = {
        dream_date: formDate,
        title: trimmedTitle,
        // 이 폼은 "오늘의 현실"(감정일기) 새로 쓰기 전용이라 새 기록은 항상 emotion이다.
        // 기존 기록을 수정할 때는(꿈일기여도 이 간단한 폼으로 제목/날짜만 고칠 수 있다)
        // 원래 타입을 그대로 보존해야 조용히 감정일기로 바뀌지 않는다.
        entry_type: editingEntry?.entry_type ?? ("emotion" as const),
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
      localStorage.removeItem(JOURNAL_DRAFT_KEY);
      resetDraftPromptCount(JOURNAL_DRAFT_KEY);
      setHasDraftAvailable(false);

      // 새 일기를 쓰면서 아직 오늘 밤 씨앗을 안 심었고, 폼에서 하나를 골라 뒀다면 일기 저장과
      // 함께 그 자리에서 심는다. 마음 기록장(깊이 모드)의 첫 저장이면 그 자리에서 씨앗 심기
      // 완료 리캡 화면(guidedRecapEntry)으로 이어지고, 그 외(간단 모드/수정)는 기존처럼
      // "기록 저장 + 씨앗 심기" 리추얼(반짝임 -> 페이드아웃 -> 홈으로 조용히 라우팅)로
      // 마무리한다 - 평소의 "타임라인에 남아있기" 흐름은 어느 쪽이든 타지 않는다.
      if (isFormForToday && !isEditingDream && !tonightSeed && emotionForSeed) {
        try {
          const seed = await plantSeed(emotionForSeed);
          setTonightSeed(seed);
          setSeeds((prev) => [seed, ...prev.filter((existing) => existing.id !== seed.id)]);
          setEditingEntry(null);
          setIsComposingNew(false);
          setJustSavedEntryId(saved.id);
          if (showGuidedRecap) {
            setGuidedRecapEntry({ dateStr: saved.dream_date, data: guidedData, seedType: emotionForSeed });
          } else {
            triggerPlantingRitual(emotionForSeed);
          }
          return;
        } catch {
          // 씨앗 심기만 실패한 것 - 일기는 이미 저장됐으니 아래의 평소 흐름으로 계속 진행한다.
        }
      }

      setSelectedDate(saved.dream_date);
      setEditingEntry(null);
      setIsComposingNew(false);
      setJustSavedEntryId(saved.id);
      if (showGuidedRecap) {
        setGuidedRecapEntry({ dateStr: saved.dream_date, data: guidedData, seedType: null });
      }
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
  // 집중 모드 - 작성/수정 폼을 페이지 레이아웃(내비게이션 바/달력 사이드바/타임라인/최근 기록
  // 리스트) 위가 아니라 document.body에 곧장 꽂는 전체 화면 오버레이로 띄운다(다른 fixed
  // 모달들과 같은 이유: 이 폼이 framer-motion의 transform이 걸린 조상 안에 있어 fixed가
  // 뷰포트가 아니라 그 조상 기준으로 갇힐 수 있다 - createPortal로 그 제약을 완전히
  // 벗어난다). 남기는 요소는 상단의 나가기(×)+날짜와 폼 본문뿐이다. 진행 단계 표시/앰비언트
  // 아이콘은 이미 GuidedEmotionJournal 내부에 있어 여기서 따로 그릴 필요가 없다.
  const composeNode = createPortal(
    <div className="journal-compose-scrollbar fixed inset-0 z-[120] overflow-y-auto bg-[#030712]">
      {/* 배경 앰비언스 - 순정 검정 대신 모서리 글로우 + 별 텍스처(오늘의 요약 카드와 같은
          패턴 재사용)를 아주 옅게 얹어, 콘텐츠가 짧을 때도 화면이 "미완성"처럼 비어 보이지
          않게 한다. pointer-events-none + fixed라 스크롤/클릭 어디에도 관여하지 않는다. */}
      <div aria-hidden className="pointer-events-none fixed inset-0" style={FOCUS_MODE_GLOW_STYLE} />
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.25]" style={HERO_STAR_TEXTURE_STYLE} />

      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur-sm sm:px-6"
        style={{ backgroundColor: "#030712f2", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <button
          type="button"
          onClick={requestExitCompose}
          aria-label="작성 취소하고 나가기"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="text-xs text-slate-500">{formatJournalDate(formDate)}</span>
        {/* 좌측 나가기 버튼과 대칭을 맞추는 자리 채움 - 날짜 라벨이 항상 정중앙에 오게 한다. */}
        <span className="w-8" aria-hidden />
      </div>

      {/* 콘텐츠를 세로로도 가운데 둔다 - min-height만 뷰포트 기준으로 잡고 max-height는 안
          씌워서, 내용이 짧으면(예: 준비 카드만 있는 첫 화면) 가운데 정렬되고 내용이 길어지면
          (7단계 위저드/마무리 단계) flex가 자연스럽게 위에서부터 채우며 넘치는 만큼 스크롤된다
          (justify-center는 남는 공간이 있을 때만 작동하고, 넘치면 그냥 위부터 흐른다). */}
      <div className="relative z-[1] flex min-h-[calc(100dvh-64px)] flex-col items-center justify-center px-4 py-12 sm:py-16">
      <div className="h-auto w-full max-w-3xl pb-8 text-left">
      <h2 className="text-base font-semibold text-white">{editingEntry ? "이 기록 수정하기" : "새로운 기록 남기기"}</h2>

        {/* 1단계: 작성("writing") - 제목/날짜와 마음 기록장(깊이 모드) 입력 영역만 보여준다
            (간단히 쓰기는 새 기록에서 고를 수 없어 토글이 없다 - 예전에 간단 모드로 저장된
            기록을 수정할 때만 그 분기가 대신 나온다). 서로 목적이 다른 CTA(모드 진입 vs
            저장)가 한 화면에 동시에 뜨는 문제를 없애려고, 저장 버튼과 부가 정보(씨앗/사진)는
            전부 아래 2단계("finishing")로 옮겼다. 꿈 기록 수정(isEditingDream)
            만은 예외 - 그 경우 이 폼은 "제목/날짜만 고치는" 훨씬 가벼운 용도라 단계를 나누지
            않고 예전처럼 한 화면에 다 보여준다. */}
        {(composeStage === "writing" || isEditingDream) && (
          <>
            <div className="mt-4">
              <label className="text-xs text-indigo-300/70">날짜</label>
              <input
                type="date"
                value={formDate}
                onChange={(event) => setFormDate(event.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-3 text-sm text-white transition-colors focus:border-purple-400/50 focus:bg-white/[0.05] focus:outline-none"
              />
            </div>

            {/* 감정일기는 제목 입력란을 없앴다 - 저장할 때 실제로 쓴 내용에서 자동으로 만든다
                (handleSave의 deriveEntryTitle 참고). 꿈 기록을 이 폼으로 편집할 때만
                (isEditingDream) 여전히 제목을 직접 고칠 수 있다 - 그 편집은 원래도 "제목/
                날짜만 고치는" 용도라 자동 생성이 맞지 않는다. */}
            {isEditingDream && (
              <div className="mt-4">
                <label className="text-xs text-indigo-300/70">제목</label>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="예: 오랜만에 여유로웠던 하루"
                  className={`mt-1.5 w-full rounded-2xl border bg-white/[0.03] px-5 py-3 text-sm text-white placeholder:text-slate-500 transition-colors focus:bg-white/[0.05] focus:outline-none ${
                    title.trim() ? "border-white/[0.06] focus:border-purple-400/50" : "border-amber-500/30"
                  }`}
                />
                {!title.trim() && <p className="mt-1 text-[10px] text-amber-500/60">최소 한 글자 이상 입력해 주세요</p>}
              </div>
            )}

            {/* 간단히 쓰기는 다시 없앴다 - 새 기록은 항상 마음 기록장(깊이 모드) 하나만 쓴다.
                이 아래 simple 분기는 예전에 간단 모드로 저장된 기록을 "수정"할 때만
                (startEditEntry가 그 기록의 실제 journal_mode를 그대로 복원) 여전히 쓰인다 -
                원본 데이터를 보여줄 방법이 이것뿐이라 남겨 둔다. 고를 수 있는 토글은 없다. */}

            {journalMode === "simple" ? (
              <>
                <div className="mt-4">
                  <label className="text-xs text-indigo-300/70">오늘 나의 감정</label>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {JOURNAL_MOOD_OPTIONS.map((option) => (
                      <button
                        key={option.emoji}
                        type="button"
                        onClick={() => setMood(option.emoji)}
                        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition-all duration-300 ${
                          mood === option.emoji
                            ? "border-purple-400/60 bg-purple-500/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]"
                            : "border-white/[0.06] bg-white/[0.03] text-slate-400 hover:border-purple-400/25 hover:text-slate-200"
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
                      은은하게 밝아진다. 입력 서체도 곧장 font-serif로 바꿔, 쓰는 순간부터 감성을 더한다.
                      여백을 넓게 잡아 타이핑할 때 화면 전체가 편지지처럼 느껴지게 한다. */}
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="있었던 일, 만난 사람, 느낀 감정을 자유롭게 적어보세요."
                    rows={6}
                    className={`mt-2 w-full resize-none rounded-2xl border-0 border-b bg-white/[0.02] px-4 py-5 font-serif text-lg leading-loose text-slate-200 placeholder:font-sans placeholder:text-sm placeholder:text-slate-500 focus:border-b-purple-400/50 focus:bg-white/[0.03] focus:outline-none focus:ring-0 scrollbar-thin scrollbar-thumb-purple-900/30 scrollbar-track-transparent ${
                      body.trim() ? "border-white/[0.08]" : "border-amber-500/30"
                    }`}
                  />
                  {!body.trim() && <p className="mt-1 text-[10px] text-amber-500/60">최소 한 글자 이상 입력해 주세요</p>}
                </div>

                {/* 꿈 기록 수정(제목/날짜만 고치는 용도)에는 "마무리" 단계 자체가 없으니
                    이 진행 버튼도 필요 없다 - 그쪽은 폼 맨 아래 저장 버튼이 항상 함께 뜬다. */}
                {!isEditingDream && (
                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setComposeStage("finishing")}
                      disabled={!body.trim()}
                      className="flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-purple-600/90 to-indigo-600/90 px-6 text-sm font-semibold text-white shadow-[0_2px_16px_rgba(147,51,234,0.25)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      다음 →
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4">
                {/* key로 "지금 어떤 기록을 작성/수정 중인지"가 바뀔 때마다 마법사를 통째로
                    새로 마운트한다 - 안 그러면 이전 기록에서 몇 단계까지 진행했었는지(내부
                    step 상태)가 그대로 남아, 예를 들어 A를 5단계까지 보다가 B를 편집하면
                    B의 데이터인데 5단계 화면이 먼저 뜨는 혼란이 생긴다. */}
                <GuidedEmotionJournal
                  key={editingEntry?.id ?? `new-${formDate}`}
                  value={guidedData}
                  onChange={handleGuidedDataChange}
                  onComplete={isEditingDream ? undefined : () => setComposeStage("finishing")}
                  dateLabel={formatDiaryDate(formDate)}
                />
              </div>
            )}
          </>
        )}

        {/* 2단계: 마무리("finishing") - 부가 정보 2종(무의식 씨앗/사진)과 최종
            저장 버튼만 남긴다. 꿈 기록 수정(isEditingDream)은 단계를 나누지 않으므로 항상
            이 블록도 함께 보여준다(위 1단계 블록과 동시에 뜬다 - 예전 한 화면 구성 그대로). */}
        {(composeStage === "finishing" || isEditingDream) && (
          <>
            {!isEditingDream && (
              <button
                type="button"
                onClick={() => setComposeStage("writing")}
                className="mt-4 flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300"
              >
                ← 이전으로
              </button>
            )}
            <div className="mt-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="text-[10px] tracking-wide text-slate-400">오늘 하루 전체에 대한 기록</span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="mt-4 rounded-2xl border border-white/[0.04] bg-white/[0.012] p-4">
        {isAuthenticated && !isEditingDream && isFormForToday && (
          <div className="">
            {tonightSeed ? (
              // 단순 텍스트 박스 대신, 씨앗 아이콘이 은은하게 숨쉬고 그 위로 보랏빛 스윕이
              // 천천히 흐르는 감성 배너 - animate-pearl-sweep은 마이페이지 XP 바에서 쓰는
              // 것과 같은 키프레임을 재사용한다.
              <div className="relative flex items-center gap-3.5 overflow-hidden rounded-2xl border border-white/[0.05] bg-gradient-to-r from-purple-950/50 via-indigo-950/35 to-purple-950/50 px-4 py-4">
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-purple-300/10 to-transparent animate-pearl-sweep" />
                </div>
                <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-lg shadow-[0_0_18px_rgba(168,85,247,0.4)]">
                  <span className="animate-pulse">🌱</span>
                </span>
                <p className="relative z-10 text-xs leading-relaxed text-purple-200">
                  오늘 밤{" "}
                  <span className="font-semibold text-purple-100">
                    {SEED_DEFINITION_LIST.find((s) => s.type === tonightSeed.seed_type)?.label}
                  </span>{" "}
                  씨앗을 심었어요.
                  <br />
                  내일 아침, 꿈을 기록하면 개화한 모습을 확인할 수 있어요.
                </p>
              </div>
            ) : emotionForSeed ? (
              // 씨앗을 고르는 별도 선택 화면은 없다 - writing 단계(마음 기록장 1단계)에서 이미
              // 고른 감정을 그대로 이어받아 "오늘 밤 이 감정으로 씨앗을 심는다"는 걸 미리
              // 보여주기만 한다. 실제로 심어지는 시점은 여전히 handleSave(저장 버튼)다.
              <div className="flex items-center gap-3.5 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${getSeedDefinition(emotionForSeed).colors[0]}22` }}
                >
                  <SeedIcon category={emotionForSeed} sizePx={28} />
                </span>
                <p className="text-xs leading-relaxed text-purple-200">
                  🌙 오늘 밤,{" "}
                  <span className="font-semibold text-purple-100">{getSeedDefinition(emotionForSeed).label}</span>{" "}
                  감정으로 씨앗을 심습니다.
                  <br />
                  <span className="text-slate-500">방금 남긴 감정일기가 그대로 오늘 밤의 씨앗이 돼요.</span>
                </p>
              </div>
            ) : null}
          </div>
        )}

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
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-slate-500 transition-colors hover:border-purple-400/40 hover:text-purple-200 disabled:cursor-not-allowed disabled:opacity-60"
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
        </div>

        {saveError && <p className="mt-3 text-xs text-red-300">{saveError}</p>}

        {/* 예전엔 여기 "돌아가기" 텍스트 버튼이 따로 있었다 - 집중 모드 상단의 나가기(×)가
            같은 역할(취소, 이탈 방지 확인 포함)을 대신하므로 중복을 없앴다. */}
        <div className="mt-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isUploadingPhoto || !isValid}
            className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition-all hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? "저장 중..."
              : isFormForToday && !isEditingDream && !tonightSeed && emotionForSeed
                ? "🌱 기록 저장 및 씨앗 심기"
                : editingEntry
                  ? "💾 수정 내용 저장하기"
                  : "🔮 오늘 기록하고 밤으로 가기"}
          </button>
        </div>
          </>
        )}
      </div>
      </div>
    </div>,
    document.body
  );

  // 상단의 두 버튼(오늘 일기 쓰기 / 꿈 기록하고 해몽받기)이 늘 나란히 떠 있으면 매번 "둘 중
  // 뭘 눌러야 하지"를 고민하게 만든다 - 지금 고른 날짜의 상태를 보고 다음에 할 일 하나만
  // 골라준다: 현실 일기가 없으면 그것부터, 있는데 꿈이 없으면 꿈 기록으로, 둘 다 있으면
  // "더 남기기"로 자연스럽게 이어간다. 작성/수정 중에는 폼 자체에 저장 버튼이 있으니 숨긴다.
  const isComposing = isComposingNew || isEditingDiary || isEditingDream;
  const primaryCta =
    isComposing || !selectedDate || isFutureDate
      ? null
      : diaryEntries.length === 0
        ? {
            label: isViewingToday ? "☀️ 오늘의 현실 기록하기" : "☀️ 이 날의 현실 기록하기",
            onClick: () => startNewEntry(selectedDate),
          }
        : dreamEntries.length === 0
          ? {
              label: isViewingToday ? "🌙 어젯밤 꿈 기록하기" : "🌙 이 날의 꿈 기록하기",
              // 팝업 대신 전용 페이지로 이동한다 - 꿈 기록+AI 해몽은 몰입이 필요한 작업이라
              // 작은 모달보다 온전한 페이지가 낫다는 판단(/journal/record).
              onClick: () => router.push(`/journal/record?date=${selectedDate}`),
            }
          : {
              // 이미 다 채운 날은 "더 기록하기"라는 톤다운된 보조 액션으로 남긴다(완료된 날에
              // 새 CTA를 강하게 밀지 않는다는 기존 방침과 동일 - isDayComplete 처리 참고).
              label: isViewingToday ? "✍️ 오늘 하루 더 기록하기" : "✍️ 이 날 하루 더 기록하기",
              onClick: () => startNewEntry(selectedDate),
            };
  // 이 날짜의 4단계가 이미 다 끝났는지 - 끝났으면 "더 기록하기" CTA를 최상단에서 가장 강한
  // 톤으로 보여줄 이유가 없다. 미완료 단계가 남아있을 때만 CTA를 최상단에서 강조하고,
  // 완료된 날에는 톤을 낮춰 타임라인/카드 아래로 내린다(렌더 위치는 아래 두 곳 참고).
  const isDayComplete = diaryEntries.length > 0 && dreamEntries.length > 0;

  // "다음 할 일" 안내 - 압축 타임라인만으로는 "지금 뭘 눌러야 하지"가 바로 안 와닿아서,
  // 진행 상태에 따라 문구가 하나씩 바뀌는 안내를 요약 카드 바로 위에 둔다. 4단계가 전부
  // 끝나면(꿈일기까지 있고 그중 하나라도 AI 해몽을 받았으면) 더 안내할 다음 단계가 없으므로
  // null을 돌려줘 아무것도 렌더링하지 않는다 - 그 자리는 원래도 "오늘의 요약" 히어로
  // 카드가 완료 상태를 보여주고 있어 중복 안내가 필요 없다. "꿈이 기억나지 않아요"를 이미
  // 선택한 날(isDreamForgotten)도 같은 이유로 null - 이미 명시적으로 포기 의사를 밝힌 날까지
  // "꿈을 기록해보세요"로 계속 재촉하지 않는다(door는 카드 안 버튼으로 여전히 열려 있다).
  const hasDreamInterpretation = dreamEntries.some((entry) => Boolean(entry.interpretation));
  const nextStepGuide = isFutureDate
    ? null
    : diaryEntries.length === 0
      ? { label: "다음 할 일: 오늘의 감정을 기록해보세요 ↓", onClick: () => revealStageListAndScrollTo("diary") }
      : dreamEntries.length === 0
        ? isDreamForgotten
          ? null
          : { label: "다음 할 일: 잠든 뒤 꿈을 기록해보세요 ↓", onClick: () => revealStageListAndScrollTo("bloom") }
        : !hasDreamInterpretation
          ? { label: "다음 할 일: AI 해몽을 받아보세요 ↓", onClick: () => revealStageListAndScrollTo("flower") }
          : null;

  // "오늘의 요약" 카드에 쓰는 꽃 이름 - 이미 개화(BLOOMING)했을 때만 채운다. 정원 실제 도감
  // 분류(속x종x변종)까지는 이 페이지가 따로 불러오지 않으므로, 페이지 상단 CTA 캡션과 같은
  // 소스(seed_type 기반 기본 이름)를 그대로 재사용한다.
  const cardSeedFlowerName = cardSeed?.status === "BLOOMING" ? getSeedDefinition(cardSeed.seed_type).flowerName : null;

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100">
      <NavBar />

      {/* 저장 전 AI 해몽 리포트가 로컬에 캐시돼 있으면, 조용히 알려주고 이어서 확인할 수 있는
          다리를 놓는다. 화면을 가리지 않는 은은한 상단 토스트다. */}
      {hasCachedAnalysis && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-[45] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-purple-400/40 bg-slate-950/90 px-4 py-2.5 text-xs shadow-[0_0_30px_rgba(168,85,247,0.35)] backdrop-blur-xl">
            <span className="text-purple-200">✨ 저장되지 않은 최근 해몽 리포트가 있습니다. 이어서 확인하시겠습니까?</span>
            <button
              type="button"
              onClick={() => {
                setHasCachedAnalysis(false);
                openRecordModal(undefined, true);
              }}
              className="shrink-0 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-1.5 font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              이어서 확인하기
            </button>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-purple-500/30 bg-slate-950 p-7 shadow-[0_0_50px_rgba(139,92,246,0.3)]">
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

      {/* 사이드바를 완전히 걷어내고, 위(헤더+툴바+날짜 인덱스) -> 아래(좌우로 펼쳐지는
          마법의 일기장)의 단일 세로 흐름으로 바꿨다. 데스크톱에서만 좌우 2페이지가 나란히
          펼쳐지고, 모바일에서는 자연스럽게 세로로 쌓인다(lg:grid-cols-2 vs grid-cols-1). 오른쪽엔
          항상 떠 있는 월간 달력 패널을 별도 컬럼으로 붙인다(lg 미만에서는 본문 아래로 쌓인다). */}
      {/* lg 컨테이너 좌우 패딩을 아래 그리드의 gap-8과 정확히 같은 값(2rem)으로 맞춰야 "본문
          좌측 여백"과 "본문-사이드바 사이 여백"이 픽셀 단위로 일치한다 - lg:px-10(2.5rem)이면
          둘이 어긋난다. */}
      {/* 하단 고정 CTA(lg: 미만)가 마지막 콘텐츠를 가리지 않도록, 그 버튼이 떠 있는 동안만
          모바일 하단 여백을 넉넉히 늘린다 - lg:는 항상 원래 값(py-10)으로 되돌아간다. */}
      <div
        className={`mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8 lg:pb-10 ${
          primaryCta && !isDayComplete ? "pb-28" : "pb-10"
        }`}
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px] lg:items-start">
        <div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-semibold text-white">📝 나만의 일기장</h1>
            <HelpButton
              onClick={() => setIsJournalHelpOpen(true)}
              label="일기장은 어떻게 보나요"
              firstVisitStorageKey="journal_help_hint_shown_v1"
            />
          </div>
          <p className="mt-1.5 text-sm text-slate-400">일상과 꿈을 한 곳에서 되짚어 보세요.</p>
        </div>

        {/* 강제 복구 모달은 최대 2번까지만 자동으로 뜨지만, 초안 자체는 계속 남아있으므로
            불러올 방법은 항상 열어둔다 - 눈에 띄지 않는 조용한 텍스트 링크로만. */}
        {hasDraftAvailable && !hasSavedDraft && !isComposing && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={restoreJournalDraft}
              className="text-xs text-slate-500 underline-offset-4 transition-colors hover:text-purple-300 hover:underline"
            >
              📝 작성 중이던 기록의 조각이 남아있어요 · 불러오기
            </button>
          </div>
        )}

        {/* 성장 타임라인 + 하위 카드 - 하루를 씨앗 심기(감정일기) -> 씨앗 발아(수면, 자동)
            -> 개화(꿈일기) -> 꽃(AI 해몽)의 성장 여정으로 보여준다. 기존 좌우 2페이지
            레이아웃 대신, 타임라인 아래로 두 카드가 세로로 이어진다. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={contentKey}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mt-10"
          >
            {selectedDate === null ? (
              <div className="flex items-center justify-center py-24 text-center text-sm text-slate-500">
                위에서 날짜를 골라보세요.
              </div>
            ) : (
              <div>
                <p className="text-center text-base text-slate-300">{formatJournalDate(selectedDate)}</p>

                {/* 미래 날짜 - 빈 상태 화면(작성 버튼 포함)조차 보여주지 않는다. 아직 지나지
                    않은 밤이라 애초에 기록할 대상 자체가 없으므로, 그 사실을 알려주는 안내만
                    남기고 아래 성장 타임라인/CTA/오늘의 요약/4단계 자세히 보기는 전부 건너뛴다
                    - startNewEntry에도 같은 방어선이 있지만, 그 버튼들 자체를 렌더링하지 않는
                    게 첫 번째 방어선이다. */}
                {isFutureDate && (
                  <div className="mt-16 flex flex-col items-center gap-2 py-16 text-center">
                    <span className="text-2xl">🌙</span>
                    <p className="text-sm text-slate-400">아직 오지 않은 밤이에요</p>
                    <p className="max-w-xs text-xs leading-relaxed text-slate-500">
                      그날의 꿈은 아직 꾸지 않았어요. 날이 밝고 그 밤이 지나면 기록할 수 있어요.
                    </p>
                  </div>
                )}

                {!isFutureDate && (
                <>
                <div className="mt-8">
                  <GrowthTimeline
                    seedStatus={growthStages.seed}
                    sleepStatus={growthStages.sleep}
                    bloomStatus={growthStages.bloom}
                    flowerStatus={growthStages.flower}
                    onScrollToDiary={() => revealStageListAndScrollTo("diary")}
                    onScrollToBloom={() => revealStageListAndScrollTo("bloom")}
                    onScrollToFlower={() => revealStageListAndScrollTo("flower")}
                  />
                </div>

                {/* 통합된 주요 액션 버튼 - 예전엔 페이지 최상단(제목 바로 아래)과 이 자리(타임라인
                    바로 아래, "🌱 씨앗 심기") 두 곳에 사실상 같은 감정일기 작성 폼으로 이어지는
                    버튼이 따로 있었다. 진행 단계에 맞춰 문구가 자동으로 바뀌는(씨앗 심기 -> 꿈
                    기록하기 -> 하루 더 기록하기) primaryCta 하나로 통합하고, 페이지에서 가장
                    눈에 띄는 1차 액션이 되도록 이 자리로 옮기며 크게 키웠다. 4단계가 모두 끝난
                    날은 이 굵은 CTA 대신 조용한 보조 링크("이 날 다른 순간도 기록하기")만
                    남긴다 - 완전히 숨기면 이미 완료된 날짜에 새 기록을 추가할 방법이 없어지므로,
                    강조만 낮추고 기능은 유지한다. */}
                {primaryCta && (
                  <div className="mt-8 flex justify-center">
                    {isDayComplete ? (
                      <button
                        type="button"
                        onClick={primaryCta.onClick}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-2 text-xs font-medium text-slate-400 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-slate-200"
                      >
                        {primaryCta.label}
                      </button>
                    ) : (
                      // lg: 미만에서는 이 버튼 대신 아래 하단 고정(sticky) 버튼을 쓴다 - 스크롤을
                      // 내려도 항상 눌리는 자리에 두기 위함(모바일 대시보드 탭 작업). 완료된 날의
                      // 조용한 보조 버튼(위 isDayComplete 분기)은 중요도가 낮아 하단 고정을 두지
                      // 않고 지금처럼 인라인으로만 둔다.
                      <button
                        type="button"
                        onClick={primaryCta.onClick}
                        className="hidden rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_6px_28px_rgba(139,92,246,0.4)] transition-all hover:-translate-y-0.5 hover:from-purple-500 hover:to-indigo-500 hover:shadow-[0_10px_34px_rgba(139,92,246,0.55)] hover:scale-[1.03] active:scale-[0.98] lg:block"
                      >
                        {primaryCta.label}
                      </button>
                    )}
                  </div>
                )}

                {/* 하단 고정(sticky) CTA - lg: 미만 전용. 위 인라인 버튼은 스크롤하면 화면
                    밖으로 사라지므로, "오늘의 현실 기록하기"만은 모바일에서 항상 한 번의
                    탭으로 닿을 수 있게 화면 하단에 고정한다. 모달(z-100+)/집중 모드
                    포털(z-[120])보다 낮은 z-30이라 그 위에 열리는 다른 화면들에는 가려진다. */}
                {primaryCta && !isDayComplete && (
                  <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#030712]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
                    <button
                      type="button"
                      onClick={primaryCta.onClick}
                      className="block w-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_6px_28px_rgba(139,92,246,0.4)] transition-all active:scale-[0.98]"
                    >
                      {primaryCta.label}
                    </button>
                  </div>
                )}

                {/* 다음 할 일 안내 - 위 주요 CTA와 별개로, "왜/어디로"에 초점을 맞춘 보조 안내다.
                    누르면 해당 단계로 스무스 스크롤한다(필요하면 "단계별로 자세히 보기" 토글도
                    함께 열어준다 - revealStageListAndScrollTo 참고). 화살표가 hover 시 오른쪽으로
                    살짝 밀리는 미세 인터랙션으로 클릭 가능함을 알린다. */}
                {nextStepGuide && (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={nextStepGuide.onClick}
                      className="group cursor-pointer rounded-full border border-indigo-400/25 bg-indigo-500/[0.08] px-4 py-2 text-xs font-medium text-indigo-200 transition-colors hover:border-indigo-400/40 hover:bg-indigo-500/[0.14] hover:text-indigo-100"
                    >
                      {nextStepGuide.label.replace(/\s*↓$/, "")}
                      <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">
                        {" "}
                        ↓
                      </span>
                    </button>
                  </div>
                )}
                </>
                )}

                {/* 모바일 전용 대시보드 탭 스위처 - lg: 이상에서는 아래 세 섹션(오늘의 요약/
                    날짜 탐색/최근 기록)이 전부 펼쳐지므로 탭 자체가 필요 없다(lg:hidden).
                    CalendarPanel에도 같은 mobileDashboardTab을 넘겨, 그 안의 달력/최근 기록
                    두 하위 섹션이 이 탭과 맞춰 각각 보이거나 숨는다. */}
                <div className="mt-8 flex justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1 lg:hidden">
                  {(
                    [
                      { key: "summary", label: "📋 오늘의 요약" },
                      { key: "calendar", label: "📅 날짜 탐색" },
                      { key: "recent", label: "최근 기록" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setMobileDashboardTab(tab.key)}
                      className={`flex-1 rounded-full px-3 py-2.5 text-xs font-medium transition-colors ${
                        mobileDashboardTab === tab.key
                          ? "bg-purple-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* "오늘의 요약" 탭 콘텐츠 - lg: 미만에서는 위 탭이 "summary"일 때만 보이고,
                    lg: 이상에서는 탭 상태와 무관하게 항상 펼쳐진다(hidden lg:block 패턴). */}
                <div className={mobileDashboardTab === "summary" ? "" : "hidden lg:block"}>
                {!isFutureDate && (
                <>
                {/* 오늘의 요약 - 압축 타임라인 바로 아래. 아래로 스크롤하지 않고도 그날 전체를
                    한눈에 훑고, 각 줄을 눌러 해당 정거장으로 곧장 이동할 수 있게 한다(토글이
                    꺼져 있어도 이 카드의 "꽃 피었어요" 줄 등은 항상 유효하다 - onScrollToDream이
                    가리키는 개화 섹션은 토글을 열어야 실제로 존재하므로, 클릭하면 먼저 토글부터
                    열어준다). */}
                <TodaySummaryCard
                  diaryEntry={diaryEntries[0] ?? null}
                  dreamEntry={dreamEntries[0] ?? null}
                  flowerName={cardSeedFlowerName}
                  flowerBloom={cardBloom}
                  seed={cardSeed}
                  onScrollToDiary={() => revealStageListAndScrollTo("diary")}
                  onScrollToDream={() => revealStageListAndScrollTo("bloom")}
                  onOpenFlower={() => {
                    if (cardBloom) setObservedBloom(cardBloom);
                  }}
                />

                {/* 꽃 개화 안내는 위 요약 카드 안에만 있다(중복 제거) - 씨앗이 꿈으로 이어지지
                    못하고 시든 경우만 여기서 짧은 캡션으로 알려준다. */}
                {cardSeed?.status === "RESTING" && (
                  <p className="mt-7 text-center text-xs text-slate-400">🥀 심어둔 씨앗이 꿈으로 이어지지 못하고 잠들었어요</p>
                )}

                {/* "4단계 여정 자세히 보기" - 아래 지하철 노선도식 진행선 전체(씨앗 심기~꽃)의
                    실제 show/hide 스위치. 요약 카드보다 아래, 시선이 자연스럽게 닿는 자리에
                    둔다. 옅은 텍스트 링크였던 예전 버전은 클릭 가능한 요소로 잘 인지되지
                    않아, 테두리+배경이 있는 pill 버튼으로 바꾸고 크기도 키웠다. */}
                <div className="mt-7 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (isStageListExpanded) {
                        setIsStageListExpanded(false);
                        sessionStorage.setItem(STAGE_LIST_EXPANDED_KEY, "0");
                      } else {
                        revealStageListAndScrollTo("diary");
                      }
                    }}
                    aria-expanded={isStageListExpanded}
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-white/40 hover:bg-white/[0.08] hover:text-white"
                  >
                    {isStageListExpanded ? "🔼 간단히 보기" : "🔍 4단계 여정 자세히 보기"}
                    <ChevronDown className={`h-4 w-4 transition-transform ${isStageListExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {/* 지하철 노선도식 진행선 - "단계별로 자세히 보기" 토글의 실제 show/hide
                    대상. 압축 타임라인/오늘의 요약 카드와 같은 정보를 다시 보여주는 큰
                    블록이라 토글이 꺼져 있으면 아예 마운트되지 않는다(AnimatePresence로
                    자연스러운 높이 트랜지션과 함께 펼쳐진다). 씨앗 심기 -> 씨앗 발아(수면)
                    -> 개화 -> 꽃, 4개 정거장을 순서대로 지난다. 각 정거장(StageRow)의
                    마커는 위 축약형 타임라인과 같은 STATUS_STYLES를 쓴다 - 마커 칸이 본문
                    칸과 같은 flex row의 형제라 브라우저가 항상 같은 높이로 맞춰주므로,
                    접힘/펼침으로 본문 키가 바뀌어도 마커가 그 섹션 헤더와 어긋나지 않는다.
                    세로선 자체는 4개 마커의 실제 좌표를 재서(stageLine) 하나의 연속된
                    초록->amber 그라데이션으로 그린다(요청 스펙 그대로). 4단계 섹션 헤더
                    색(오늘의 현실=emerald, 씨앗 발아=emerald, 개화=lime, 꽃=amber)은 그날의
                    감정/무드 데이터와 무관한 고정값이었다 - 실은 각 단계를 만들 때마다
                    그때그때 고른 색(amber/sky/purple/violet)이라 서로 이어지지 않았을 뿐,
                    의도된 동적 배색이 아니었다. 그래서 데이터 기반 로직을 추가하는 대신
                    진행선과 같은 초록->amber 계열로 고쳐 네 헤더가 하나의 흐름처럼 읽히게
                    했다(마커 글로우는 이미 이 계열로 맞춰져 있었다 - 헤더 텍스트/카드 틴트만
                    뒤늦게 따라잡은 셈이다). 꽃 섹션의 카드 틴트(flowerShellStyle)는 유일하게
                    실제 아우라 데이터로 동적으로 정해지므로 그대로 뒀다. */}
                <AnimatePresence initial={false}>
                  {isStageListExpanded && (
                    <motion.div
                      key="stage-list"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: "easeInOut" }}
                      onAnimationStart={() => setIsStageListAnimating(true)}
                      onAnimationComplete={() => setIsStageListAnimating(false)}
                      className={isStageListAnimating ? "overflow-hidden" : "overflow-visible"}
                    >
                      <div ref={stageListRef} className="relative mt-8">
                  {stageLine && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute z-0 w-px"
                      style={{
                        left: stageLine.left,
                        top: stageLine.top,
                        height: stageLine.height,
                        background: "linear-gradient(to bottom, rgba(52,199,89,0.4), rgba(251,191,36,0.9))",
                      }}
                    />
                  )}

                  {/* ☀️ 씨앗 심기 - 오늘의 현실. 4단계 중 가장 차분한 기본값 그대로(글로우 없음). */}
                  <StageRow
                    icon={Sprout}
                    status={growthStages.seed}
                    glowShadow="0 0 0px rgba(52,199,89,0)"
                    markerRef={(el) => {
                      stageMarkerRefs.current[0] = el;
                    }}
                    onMarkerClick={() => diaryCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    <div
                      ref={diaryCardRef}
                      className="relative w-full overflow-hidden rounded-[28px] border border-emerald-500/10 bg-gradient-to-br from-emerald-950/15 via-slate-900/70 to-slate-900/70 p-7 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-9"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-left text-sm font-bold tracking-wide text-emerald-200/90">☀️ 오늘의 현실</h3>
                          {/* 접힌 상태에서도 무슨 내용인지 짐작할 수 있게 감정 태그+첫 줄만 남긴다. */}
                          {!isDiaryCardExpanded && !isComposingNew && !isEditingDiary && diaryCardSummary && (
                            <p className="mt-1 truncate text-left text-xs text-emerald-100/50">{diaryCardSummary}</p>
                          )}
                        </div>
                        {diaryEntries.length > 0 && !isComposingNew && !isEditingDiary && (
                          <button
                            type="button"
                            onClick={toggleDiaryCardExpanded}
                            aria-label={isDiaryCardExpanded ? "오늘의 현실 접기" : "오늘의 현실 펼치기"}
                            className="shrink-0 rounded-full p-1.5 text-emerald-200/60 transition-colors hover:bg-white/5 hover:text-emerald-200"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${isDiaryCardExpanded ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </div>

                      <div className="mt-5">
                        {isComposingNew || isEditingDiary ? (
                          composeNode
                        ) : diaryEntries.length === 0 ? (
                          // 기록 없이 잠든 밤 - 박스도 테두리도 없이, 연필 아이콘과 문구만 조용히
                          // 떠 있다가 누르면 그 자리에서 바로 쓸 수 있다.
                          <button
                            type="button"
                            onClick={() => startNewEntry(selectedDate)}
                            className="mx-auto flex items-center gap-2 py-8 text-xs text-slate-500 transition-colors hover:text-emerald-200"
                          >
                            <Pencil className="h-3.5 w-3.5 shrink-0" />
                            기록 없이 깊고 고요하게 잠든 밤
                          </button>
                        ) : isDiaryCardExpanded ? (
                          <DiaryCarousel
                            entries={diaryEntries}
                            onEdit={startEditEntry}
                            onDeleteRequest={setDeleteTarget}
                            onShare={handleShareEntry}
                            focusEntryId={justSavedEntryId}
                          />
                        ) : null}
                      </div>
                    </div>
                  </StageRow>

                  {/* 🌙 씨앗 발아 - 수면. 별도 기록 데이터가 없어 카드 없이 마커+한 줄 문구만으로
                      구간을 채운다. 마커 글로우가 씨앗 심기보다 한 단계 밝다(요청 스펙 그대로). */}
                  <StageRow
                    icon={MoonStar}
                    status={growthStages.sleep}
                    glowShadow="0 0 6px 1px rgba(110,209,140,0.25)"
                    markerRef={(el) => {
                      stageMarkerRefs.current[1] = el;
                    }}
                  >
                    <div className="flex min-h-11 flex-col justify-center">
                      <h3 className="text-left text-sm font-bold tracking-wide text-emerald-200/80">씨앗 발아</h3>
                      <p className="mt-1 text-left text-xs text-slate-400">{sleepStageText}</p>
                    </div>
                  </StageRow>

                  {/* 🌸 개화 - 꿈일기 원문. 마커 글로우는 씨앗 발아보다 한 단계 더 밝고(요청
                      스펙 그대로), 카드 배경도 씨앗 심기 기본값보다 약 3~5% 밝게. 색 계열은
                      진행선 그라데이션(초록 -> amber)의 중간 톤인 lime로 맞췄다 - 예전엔 이
                      섹션만 보라色이라 다른 세 단계와 이어지지 않았다. */}
                  <StageRow
                    icon={Flower2}
                    status={growthStages.bloom}
                    glowShadow="0 0 10px 2px rgba(180,220,150,0.35)"
                    markerRef={(el) => {
                      stageMarkerRefs.current[2] = el;
                    }}
                    onMarkerClick={() => bloomSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    <div
                      ref={bloomSectionRef}
                      className="relative w-full overflow-hidden rounded-[28px] border border-lime-500/[0.14] bg-gradient-to-br from-lime-950/[0.19] via-slate-900/70 to-slate-900/70 p-7 shadow-[0_20px_60px_rgba(54,83,20,0.25)] backdrop-blur-xl sm:p-9"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-left text-sm font-bold tracking-wide text-lime-200">🌸 개화</h3>
                          {!isBloomSectionExpanded && !isEditingDream && bloomSectionSummary && (
                            <p className="mt-1 truncate text-left text-xs text-lime-200/50">{bloomSectionSummary}</p>
                          )}
                        </div>
                        {dreamEntries.length > 0 && !isEditingDream && (
                          <button
                            type="button"
                            onClick={toggleBloomSectionExpanded}
                            aria-label={isBloomSectionExpanded ? "개화 접기" : "개화 펼치기"}
                            className="shrink-0 rounded-full p-1.5 text-lime-200/60 transition-colors hover:bg-white/5 hover:text-lime-100"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${isBloomSectionExpanded ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </div>

                      <div className="mt-5">
                        {isEditingDream ? (
                          composeNode
                        ) : dreamEntries.length === 0 ? (
                          // 아직 피어나지 않은 무의식의 공간 - 테두리 박스 대신 은은한 오로라 글로우와
                          // 별빛 톤 위에 안내 문구만 떠 있다. 대기 중인 씨앗이 있을 때만 "기록하기"
                          // 액션이 뜨고, 없으면 조용한 문구로만 남는다. "꿈이 기억나지 않아요"를 이미
                          // 선택한 날(isDreamForgotten)은 아예 다른 톤(위로 문구 + 기억력 팁)으로
                          // 갈아끼운다 - 꿈을 기억 못 하는 건 실패가 아니라 흔한 결과라, "왜 안
                          // 적었지"가 아니라 "괜찮다"는 인상을 먼저 준다. status는 여전히 PLANTED라
                          // "이 날의 꿈 기록하기" 버튼은 이 갈래에서도 계속 남겨 나중에 다시 쓸 수
                          // 있는 문을 열어 둔다.
                          <div className="relative flex flex-col items-center gap-2.5 overflow-hidden rounded-3xl bg-white/[0.02] py-10 text-center">
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(163,230,53,0.14),transparent_70%)]" />
                            {/* 아직 개화 전 - 성장 타임라인의 "대기 중" 노드와 같은 시각 언어(점선
                                테두리 + 흐린 꽃 실루엣)를 그대로 가져와, 씨앗-새싹-개화-꽃 톤에서
                                벗어나 보이던 파란 다이아몬드형 아이콘을 대체한다. */}
                            <span className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-lime-400/30 bg-white/[0.02]">
                              {isDreamForgotten ? <span className="text-lg">🌫️</span> : <Flower2 className="h-5 w-5 text-lime-300/50" />}
                            </span>
                            {isDreamForgotten ? (
                              <>
                                <p className="relative px-6 text-xs leading-relaxed text-lime-200/70">
                                  괜찮아요, 모든 꿈이 기억나는 건 아니에요.
                                  <br />
                                  오늘 심은 씨앗은 그대로 남아있어요.
                                </p>
                                {/* 기억력 팁 1~2개 - 위로 문구 바로 아래, 훨씬 옅은 톤으로 부가 정보임을
                                    분명히 한다. */}
                                <ul className="relative space-y-1 px-6 text-[11px] leading-relaxed text-slate-500">
                                  <li>💡 눈뜨자마자 떠오르는 조각이라도 바로 메모해보세요</li>
                                  <li>💡 머리맡에 메모장을 두면 도움이 돼요</li>
                                </ul>
                              </>
                            ) : (
                              // 오늘 카드는 "아직" 뉘앙스(곧 채워질 수 있음)를, 과거 카드는 이미 지나간
                              // 날이라 왜 비어 있는지 그 이유를 그대로 알려준다.
                              <p className="relative text-xs leading-relaxed text-lime-200/70">
                                {isViewingToday ? (
                                  <>
                                    아직 피어나지 않은
                                    <br />
                                    무의식의 공간이에요
                                  </>
                                ) : (
                                  <>
                                    이 날은 꿈을
                                    <br />
                                    기록하지 않으셨어요
                                  </>
                                )}
                              </p>
                            )}
                            {isSeedWaitingForDream && (
                              <div className="relative mt-1.5 flex flex-wrap items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => router.push(`/journal/record?date=${selectedDate}`)}
                                  className="rounded-full bg-white/[0.06] px-5 py-2 text-xs font-medium text-lime-200 backdrop-blur-md transition-colors hover:bg-white/[0.1] hover:text-white"
                                >
                                  {isViewingToday ? "🔮 어젯밤 꿈 기록하기" : "🔮 이 날의 꿈 기록하기"}
                                </button>
                                {/* 이미 "기억 안 나요"를 선택한 날엔 이 버튼을 다시 보여줄 이유가 없다
                                    (선택은 한 번이면 충분하고, 위 위로 문구가 이미 그 상태를 알려준다). */}
                                {!isDreamForgotten && (
                                  <button
                                    type="button"
                                    onClick={handleMarkDreamForgotten}
                                    disabled={isMarkingDreamForgotten}
                                    className="rounded-full border border-white/[0.06] px-5 py-2 text-xs font-medium text-slate-400 backdrop-blur-md transition-colors hover:border-white/[0.1] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    🌫️ 꿈이 기억나지 않아요
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : isBloomSectionExpanded ? (
                          <DreamOriginalCarousel
                            entries={dreamEntries}
                            activeIndex={dreamActiveIndex}
                            onIndexChange={setDreamActiveIndex}
                            onEdit={startEditEntry}
                            onDeleteRequest={setDeleteTarget}
                            onShare={handleShareEntry}
                          />
                        ) : null}
                      </div>
                    </div>
                  </StageRow>

                  {/* ✨ 꽃 - AI 해몽 리포트. 개화 섹션과 dreamActiveIndex를 공유해 항상 같은
                      편의 해몽을 보여준다. 4단계 중 가장 화사한 톤 - 실제로 핀 꽃이 있으면
                      그 꽃의 아우라 색(flowerAccent)을 마커 글로우/카드 톤에 그대로 입힌다
                      (요청 스펙의 amber 글로우와 비슷해 기존 구현을 유지). */}
                  <StageRow
                    icon={Sparkles}
                    status={growthStages.flower}
                    glowShadow={flowerGlowShadow}
                    markerRef={(el) => {
                      stageMarkerRefs.current[3] = el;
                    }}
                    onMarkerClick={() => flowerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    <div
                      ref={flowerSectionRef}
                      className="relative w-full overflow-hidden rounded-[28px] border p-7 backdrop-blur-xl sm:p-9"
                      style={flowerShellStyle}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-left text-sm font-bold tracking-wide text-amber-200">✨ 꽃</h3>
                          {!isFlowerSectionExpanded && !isEditingDream && flowerSectionSummary && (
                            <p className="mt-1 truncate text-left text-xs text-amber-200/50">{flowerSectionSummary}</p>
                          )}
                        </div>
                        {dreamActiveEntry?.interpretation && !isEditingDream && (
                          <button
                            type="button"
                            onClick={toggleFlowerSectionExpanded}
                            aria-label={isFlowerSectionExpanded ? "꽃 접기" : "꽃 펼치기"}
                            className="shrink-0 rounded-full p-1.5 text-amber-200/60 transition-colors hover:bg-white/5 hover:text-amber-100"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${isFlowerSectionExpanded ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </div>

                      <div className="mt-5">
                        {isEditingDream ? null : !dreamActiveEntry || !dreamActiveEntry.interpretation || isFlowerSectionExpanded ? (
                          <DreamInterpretationPanel
                            key={dreamActiveEntry?.id ?? "empty"}
                            entry={dreamActiveEntry}
                            entryIndex={dreamActiveIndex}
                            entryCount={dreamEntries.length}
                            bloom={flowerPreviewBloom}
                            onOpenFlower={() => {
                              if (flowerPreviewBloom) setObservedBloom(flowerPreviewBloom);
                            }}
                            onTagClick={setActiveTagFilter}
                          />
                        ) : null}
                      </div>
                    </div>
                  </StageRow>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </>
                )}
                </div>
                {/* "오늘의 요약" 탭 콘텐츠 끝 */}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        </div>

        {/* 오른쪽 고정 달력 패널 - 아이콘을 눌러야만 보이던 팝오버 대신 항상 떠 있다. */}
        <CalendarPanel
          dateGroups={dateGroups}
          recentGroups={recentGroups}
          activeTagFilter={activeTagFilter}
          onClearTagFilter={() => setActiveTagFilter(null)}
          seeds={seeds}
          gardenBlooms={gardenBlooms}
          selectedDate={selectedDate}
          onPickDate={selectDate}
          mobileActiveTab={mobileDashboardTab}
        />
        </div>
      </div>

      {/* 집중 모드 상단 나가기(×) 확인 - 헤더 내비게이션 이탈 가드와 같은 컴포넌트를 그대로
          재사용한다(새로 만들지 않는다). "이동하기" = cancelCompose(초안까지 정리하고 닫기),
          "이어서 작성하기" = 그냥 닫기만. */}
      <UnsavedChangesGuardModal
        open={showExitConfirm}
        message="지금 나가면 작성 중인 내용이 사라집니다. 정말 나가시겠습니까?"
        onStay={() => setShowExitConfirm(false)}
        onLeave={() => {
          setShowExitConfirm(false);
          cancelCompose();
        }}
      />

      {/* 마음 기록장 저장 완료 리캡 화면 - 새로 심은 기록이면 홈으로 라우팅하는 대신 이 화면이
          먼저 뜬다(씨앗 심기 리추얼과 자리를 다투지 않도록, 씨앗이 함께 심어졌으면 그 반짝임
          연출 자체를 이 화면 상단에 흡수해서 보여준다 - 위 핸들러 참고). */}
      {guidedRecapEntry && (
        <GuidedJournalCompletionScreen
          dateStr={guidedRecapEntry.dateStr}
          data={guidedRecapEntry.data}
          plantedSeedType={guidedRecapEntry.seedType}
          onReturn={() => setGuidedRecapEntry(null)}
        />
      )}

      {/* 씨앗 심기 완료 리추얼 - 팝업/토스트 없이, 고른 씨앗이 화면 중앙에서 반짝이다 밤하늘처럼
          어두워지며 조용히 홈으로 이어진다. ritualStage가 "idle"이 아닐 때만 떠 있다. 전환 연출
          전용 티어(z-[150]) - 일반 모달보다는 위, 로그인 등 시스템 모달보다는 아래. */}
      {ritualStage !== "idle" && ritualSeedType && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-hidden">
          <div
            className="absolute inset-0 bg-gray-950 ease-in-out"
            style={{
              transitionProperty: "opacity",
              transitionDuration: `${RITUAL_FADE_MS}ms`,
              opacity: ritualStage === "blackout" ? 1 : 0,
            }}
          />
          <div
            className="relative flex h-24 w-24 items-center justify-center rounded-full text-5xl ease-in-out"
            style={{
              transitionProperty: "transform, opacity, box-shadow",
              transitionDuration: `${Math.min(RITUAL_GLOW_MS, RITUAL_FADE_MS)}ms`,
              transform: ritualStage === "glow" ? "scale(1.25)" : "scale(1)",
              opacity: ritualStage === "blackout" ? 0 : 1,
              backgroundColor: `${getSeedDefinition(ritualSeedType).colors[0]}22`,
              boxShadow:
                ritualStage === "glow" ? `0 0 60px ${getSeedDefinition(ritualSeedType).colors[0]}` : "0 0 0px transparent",
            }}
          >
            🌱
          </div>
        </div>
      )}

      {/* 구 /diary(꿈 기록소) 전체를 이식한 AI 해몽 기록 모달 - 씨앗 심기와 달리 여기서 만든
          기록은 이미 AI 해몽까지 끝난 상태라 별도 리추얼 없이 곧장 타임라인에 반영된다. */}
      {isRecordModalOpen && (
        <DreamRecordModal
          prefill={recordPrefill}
          resumeFromCache={recordResumeFromCache}
          onClose={() => setIsRecordModalOpen(false)}
          onSaved={(entry) => {
            upsertEntry(entry);
            getMySeeds()
              .then(setSeeds)
              .catch(() => {});
            // 방금 씨앗이 꽃으로 개화했을 수 있으니, "꽃" 섹션 미리보기가 쓸 정원 데이터도
            // 함께 새로고침한다.
            getMyGarden()
              .then(setGardenProfile)
              .catch(() => {});
            setSelectedDate(entry.dream_date);
            setJustSavedEntryId(entry.id);
          }}
        />
      )}

      {/* 삭제 확인 모달 - 카드 "⋯" 메뉴의 삭제하기는 바로 지우지 않고 이 모달을 거친다. */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-red-500/20 bg-slate-950 p-7 text-center shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="text-3xl">🌙</span>
            <h2 className="mt-3 text-lg font-semibold text-white">이 기록을 지우시겠어요?</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              &ldquo;{deleteTarget.title}&rdquo;{" "}
              {deleteTarget.interpretation ? "꿈 기록과 AI 해몽이" : "일기가"} 다시 되돌릴 수 없이 사라져요.
            </p>

            {deleteError && <p className="mt-3 text-xs text-red-300">{deleteError}</p>}

            <div className="mt-6 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-800/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-red-500 hover:to-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isJournalHelpOpen && <JournalHelpModal onClose={() => setIsJournalHelpOpen(false)} />}

      {/* 꽃 상세 관찰 모달 - "꽃" 섹션/오늘의 요약 카드에서 꽃을 누르면 정원으로 넘어가지
          않고 이 페이지 안에서 바로 연다. 정원 페이지와 완전히 같은 컴포넌트/데이터(도감
          번호·진행도·고정)를 쓴다. */}
      {observedBloom && (
        <FlowerDetailModal
          bloom={observedBloom}
          dexNumber={dexNumberByBloomId.get(observedBloom.id) ?? 0}
          generalDiscovered={myGeneralSpeciesCount}
          generalTotal={GENERAL_SPECIES_TOTAL}
          legendaryDiscovered={myLegendaryCount}
          legendaryTotal={LEGENDARY_TOTAL}
          isPinned={gardenProfile?.pinned_seed_id === observedBloom.id}
          isPinning={isPinning}
          onTogglePin={handleTogglePin}
          onViewDiary={handleViewDiaryFromFlowerModal}
          onShare={handleShareFlower}
          onTagClick={handleTagClickFromFlowerModal}
          onClose={() => {
            setObservedBloom(null);
            setPinError(null);
          }}
        />
      )}
      {pinError && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[110] flex justify-center px-4">
          <p className="pointer-events-auto rounded-full border border-red-400/30 bg-slate-950/95 px-4 py-2 text-xs text-red-300 shadow-xl backdrop-blur-md">
            {pinError}
          </p>
        </div>
      )}
    </div>
  );
}
