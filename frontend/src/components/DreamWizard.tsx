"use client";

import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";

import type { ControlLevel, DreamSurvey, LucidLevel } from "@/api/dream";
import MoodTagGrid from "@/components/MoodTagGrid";

interface ChipOption {
  emoji: string;
  label: string;
}

const TOTAL_STEPS = 7;

const STEP_META = [
  { key: "mood", label: "분위기" },
  { key: "light", label: "조도" },
  { key: "space", label: "공간" },
  { key: "target", label: "대상" },
  { key: "dynamics", label: "역동성" },
  { key: "reality", label: "현실 공명" },
  { key: "dimension", label: "마무리" },
];

// 각 보기는 프로이트(억압/욕구)·융(원형/신화)·아들러(열등감/현실목표)·게슈탈트(미해결 과제)
// 전문가 동적 매칭 매트릭스와 현대 트렌드 심리(도시, 디지털, SNS 등)를 함께 겨냥해 설계했다.
// 그래도 딱 들어맞지 않는 경우를 위해 각 단계 끝에 "기타" 직접입력 카드를 별도로 붙여둔다.
// 백엔드는 이 라벨 문자열을 그대로 받아 EXPERT_MATRIX 힌트로 쓰므로, 표현을 임의로 바꾸지 않는다.
const LIGHT_OPTIONS: ChipOption[] = [
  { emoji: "☀️", label: "햇살이 눈부시고 엄청 맑았어요" },
  { emoji: "🏡", label: "늘 보던 일상 풍경처럼 평범했어요" },
  { emoji: "🌑", label: "눈앞이 캄캄하고 아주 어두웠어요" },
  { emoji: "🌫️", label: "안개가 낀 것처럼 흐릿하고 답답했어요" },
  { emoji: "🏚️", label: "황량하고 쓸쓸한 폐허 같은 느낌이었어요" },
  { emoji: "🔮", label: "화려한 조명이나 네온사인이 반짝였어요" },
  { emoji: "🌅", label: "새벽녘이나 노을빛처럼 은은했어요" },
  { emoji: "🎨", label: "색깔이 없는 흑백 영화 같았어요" },
  { emoji: "🌀", label: "주변 배경이랑 빛이 시시각각 변했어요" },
];

const SPACE_OPTIONS: ChipOption[] = [
  { emoji: "🏠", label: "집, 학교, 회사처럼 매일 가는 익숙한 곳이요" },
  { emoji: "🗺️", label: "태어나서 처음 보는 낯선 장소였어요" },
  // 🫁(폐) 이모지는 일부 환경에서 깨져 보여 🔒로 대체한다.
  { emoji: "🔒", label: "방이나 엘리베이터처럼 꽉 막혀 답답한 곳이요" },
  { emoji: "🏞️", label: "바다나 벌판처럼 탁 트인 야외였어요" },
  { emoji: "🌀", label: "탈출구 없는 미로처럼 끝없이 얽힌 곳이요" },
  { emoji: "🌌", label: "우주나 가상현실처럼 현실적인 느낌이 아니었어요" },
  { emoji: "🎢", label: "높은 곳에 아슬아슬하게 매달려 있는 공간이었어요" },
];

const PROJECTION_OPTIONS: ChipOption[] = [
  { emoji: "👤", label: "가족, 연인, 절친처럼 가장 가까운 사람요" },
  { emoji: "👥", label: "직장 동료, 학교 친구 같은 사회적 지인이요" },
  { emoji: "🎤", label: "평소에 좋아하는 연예인이나 아이돌이요" },
  { emoji: "👻", label: "정체불명의 낯선 사람이나 검은 그림자요" },
  { emoji: "🦁", label: "강아지, 고양이, 뱀 같은 실제 동물이요" },
  { emoji: "🐉", label: "용, 유령, 괴물 같은 상상 속 존재요" },
  { emoji: "🤖", label: "로봇, AI, 스마트폰 같은 기계나 사물이요" },
  { emoji: "❌", label: "아무도 없이 저 혼자만 덩그러니 있었어요" },
];

const DYNAMICS_OPTIONS: ChipOption[] = [
  { emoji: "🏃", label: "누군가에게 필사적으로 쫓기거나 도망쳤어요" },
  { emoji: "⚔️", label: "상대방한테 격렬하게 맞서 싸우거나 저항했어요" },
  { emoji: "🦅", label: "하늘을 자유롭게 날아다니거나 붕 떠 있었어요" },
  { emoji: "🕳️", label: "바닥이 없는 낭떠러지로 끝없이 떨어졌어요" },
  { emoji: "🧍", label: "가위눌린 것처럼 몸이 굳어 꼼짝도 못 했어요" },
  { emoji: "🔍", label: "뭔가를 찾으려고 계속 헤매고 다녔어요" },
  { emoji: "📺", label: "난 아무것도 안 하고 그 상황을 구경만 했어요" },
  { emoji: "🍲", label: "음식을 먹거나 물건을 사는 일상적인 행동이었어요" },
];

const REALITY_OPTIONS: ChipOption[] = [
  { emoji: "💼", label: "시험, 업무, 과제 등 마감 압박이 심해요" },
  { emoji: "👥", label: "직장이나 가족, 친구 간의 인간관계가 힘들어요" },
  { emoji: "📈", label: "돈 문제나 취업, 미래에 대한 불안감이 커요" },
  { emoji: "🔋", label: "몸과 마음이 다 지쳐서 번아웃이 온 것 같아요" },
  { emoji: "🎯", label: "이직, 독립 등 인생의 큰 변화나 도전을 앞두고 있어요" },
  { emoji: "🧘", label: "특별한 걱정거리 없이 비교적 평온하게 지내고 있어요" },
];

// 기존 단순 on/off 토글을 대신하는 자각 정도 3카드 - "일반 꿈"으로 돌아가면 그 아래 통제력
// 선택(CONTROL_LEVEL_OPTIONS)은 다시 숨겨지고 값도 함께 비워진다.
const LUCID_LEVEL_OPTIONS: { value: LucidLevel; emoji: string; label: string }[] = [
  { value: "none", emoji: "😴", label: "일반 꿈" },
  { value: "momentary", emoji: "💫", label: "순간적 자각" },
  { value: "full", emoji: "✨", label: "완벽한 자각몽" },
];

// lucidLevel이 momentary/full일 때만 노출되는 통제력 3카드.
const CONTROL_LEVEL_OPTIONS: { value: ControlLevel; emoji: string; label: string }[] = [
  { value: "director", emoji: "🎬", label: "감독 모드" },
  { value: "observer", emoji: "👁️", label: "관찰자/참여자" },
  { value: "lost_control", emoji: "🌀", label: "통제 상실" },
];

function lucidCardClass(selected: boolean): string {
  return `flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 py-4 text-center transition-all duration-200 ${
    selected
      ? "border-purple-500 bg-purple-950/30 text-white font-semibold shadow-[inset_0_0_12px_rgba(168,85,247,0.15)]"
      : "border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/30 hover:bg-purple-500/10"
  }`;
}

const TRANSITION_MS = 250;
const CUSTOM_CHIP_MAX_LENGTH = 10;

type SlidePhase = "idle" | "leaving" | "entering";

interface DreamWizardProps {
  onComplete: (survey: DreamSurvey) => void;
  isSubmitting: boolean;
  /** Step 1(분위기)의 감정 이모지 - survey에 포함되지 않는 별도 필드라 부모(꿈 기록소 페이지)가
   * 소유한 상태를 그대로 내려받아 컨트롤드 컴포넌트로 쓴다 (날짜/공개범위와 같은 위치의 메타 정보). */
  mood: string;
  onMoodChange: (emoji: string) => void;
  /** 수정 모드에서 기존에 저장된 응답을 그대로 채워 넣기 위한 원본 데이터 */
  initialData?: DreamSurvey;
  /** 꿈해몽 사전에서 "이 상징을 바탕으로 기록하기"로 넘어온 경우, Step 7 제목만 미리 채운다 (initialData가 있으면 무시됨) */
  initialTitle?: string;
  /** ⚡ 30초 미니멀 빠른 기록에서 "정밀 분석으로 전환"한 경우, 적어둔 서술을 Step 6의 몰입 서술란에 미리 채운다 (initialData가 있으면 무시됨) */
  initialActionDetail?: string;
  /** 꿈해몽 사전의 "내 꿈일기에 이 상징 기록하기"에서 넘어온 경우, 상징의 카테고리로 유추한
   * Step 4(대상) 칩을 미리 선택한다. PROJECTION_OPTIONS 라벨과 일치해야 하며, 일치하지 않으면
   * 그 문자열 자체가 커스텀 칩으로 취급된다 (initialData가 있으면 무시됨) */
  initialTargetChip?: string;
  initialTargetOther?: string;
  /** 같은 브릿지에서, 시나리오 제목/무드로 유추한 Step 5(역동성) 칩을 미리 선택한다.
   * DYNAMICS_OPTIONS 라벨과 일치해야 한다 (initialData가 있으면 무시됨) */
  initialDynamicsChip?: string;
  initialDynamicsOther?: string;
  /** 입력값이 하나라도 바뀔 때마다 현재까지의 응답을 통째로 올려보낸다. 부모(꿈 기록소 페이지)가
   * 이걸로 이탈 방지 가드의 "작성 중" 여부를 판단하고, 자동 임시 저장(localStorage)에도 쓴다. */
  onDraftChange?: (draft: DreamSurvey) => void;
  /** 최종 제출 버튼 라벨. 수정 모드에서는 "💾 수정 완료 및 재분석"으로 바뀐다 */
  submitLabel?: string;
}

/**
 * survey에 저장된(또는 브릿지로 넘어온) 최종 문자열이 프리셋 칩 라벨과 일치하면 그 칩을
 * 선택한 상태로, 일치하지 않으면 그 문자열 자체를 커스텀 칩 값으로 복원한다. 더 이상 "기타"
 * 센티널을 배열에 끼워 넣지 않고, chip 필드에 실제로 선택된 문자열(프리셋이든 커스텀이든)을 그대로 담는다.
 */
function resolveChipState(options: ChipOption[], value: string): { chip: string | null; other: string } {
  if (!value) return { chip: null, other: "" };
  const matched = options.find((opt) => opt.label === value);
  return matched ? { chip: matched.label, other: "" } : { chip: value, other: value };
}

/** Step 2 전용: 최대 2개까지 고를 수 있어, brightness 문자열을 " · "로 합쳐 저장하고
 * 불러올 때는 다시 분리해 최대 2개의 칩(프리셋 또는 커스텀 문자열 그대로)으로 복원한다. */
function resolveLightChips(value: string): { chips: string[]; other: string } {
  if (!value) return { chips: [], other: "" };
  const parts = value.split(" · ").map((part) => part.trim()).filter(Boolean).slice(0, 2);
  const chips: string[] = [];
  let other = "";
  for (const part of parts) {
    const matched = LIGHT_OPTIONS.find((opt) => opt.label === part);
    if (matched) {
      if (!chips.includes(matched.label)) chips.push(matched.label);
    } else {
      if (!chips.includes(part)) chips.push(part);
      other = part;
    }
  }
  return { chips, other };
}

// 가로형 와이드 미니 카드 - 세로로 긴 3:4 카드 대신 좌측 이모지 + 우측 라벨을 한 줄에
// 나란히 배치해 세로 높이를 대폭 압축한다(뷰포트 스크롤 유발 방지).
// min-h로 물리적 하한을 둬, 라벨이 짧아 한 줄로 끝나는 칩과 line-clamp-2로 두 줄까지 차는 칩이
// 같은 행에 있어도(그리드 기본값 align-items: stretch가 키를 맞춰주긴 하지만) 시각적으로
// 너무 얇아 보이지 않게 한다. items-center는 flex-row 안에서 세로 중앙 정렬을 담당한다.
const CHIP_CARD_BASE =
  "relative flex h-auto w-full min-h-[64px] flex-row items-center justify-start rounded-2xl border px-4 py-4 text-left backdrop-blur-md transition-all duration-200";

// Step 2~6은 문장형 옵션이라 Step 1(짧은 키워드)과 같은 grid-cols-4로는 텍스트가 심하게
// 잘린다 - 전용 그리드/라벨 템플릿을 분리해 공통으로 쓴다. Step 1만 기존 4열을 그대로 유지한다.
const SENTENCE_OPTION_GRID_CLASS = "mt-4 grid grid-cols-1 items-stretch gap-y-3 gap-x-4 sm:grid-cols-2";
const SENTENCE_OPTION_LABEL_CLASS = "whitespace-normal break-keep text-sm font-medium leading-snug";

function chipClass(selected: boolean): string {
  return `${CHIP_CARD_BASE} ${
    selected
      ? "border-purple-500 bg-purple-950/30 text-white font-semibold shadow-[inset_0_0_12px_rgba(168,85,247,0.15)]"
      : "border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/30 hover:bg-purple-500/10"
  }`;
}

// 직접 입력해 새로 생긴 커스텀 칩 전용 스타일 - "각인" 느낌을 주려고 미선택 상태에서도 옅은
// 보라 톤을 유지하되, 실제 선택 시에는 다른 칩과 동일한 강한 액티브 피드백으로 스위칭한다.
function customChipClass(selected: boolean): string {
  return `${CHIP_CARD_BASE} ${
    selected
      ? "border-purple-500 bg-purple-950/30 text-white font-semibold shadow-[inset_0_0_12px_rgba(168,85,247,0.15)]"
      : "border-purple-500/50 bg-purple-950/30 text-purple-300"
  }`;
}

// Step 2 카드의 아이콘 성격별 은은한 포인트 컬러 - 텍스트를 다시 읽지 않아도 첫인상을 색으로 구분할 수 있게 한다.
type LightTheme = "amber" | "slate" | "neon" | "neutral";

const LIGHT_THEME: Record<string, LightTheme> = {
  "햇살이 눈부시고 엄청 맑았어요": "amber",
  "새벽녘이나 노을빛처럼 은은했어요": "amber",
  "눈앞이 캄캄하고 아주 어두웠어요": "slate",
  "안개가 낀 것처럼 흐릿하고 답답했어요": "slate",
  "화려한 조명이나 네온사인이 반짝였어요": "neon",
  "주변 배경이랑 빛이 시시각각 변했어요": "neon",
};

/** Step 2 전용 칩 스타일: 선택되면 테마와 무관하게 동일한 강조색(퍼플)으로, 선택 전에는
 * 카드 성격별 은은한 글로우로, 최대 선택(2개) 도달 후 남은 미선택 카드는 흐릿하게 비활성화한다. */
function lightChipClass(label: string, selected: boolean, limitReached: boolean): string {
  if (selected) {
    return `${CHIP_CARD_BASE} border-purple-500 bg-purple-950/30 text-white font-semibold shadow-[inset_0_0_12px_rgba(168,85,247,0.15)]`;
  }
  if (limitReached) {
    return `${CHIP_CARD_BASE} cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-400 opacity-50`;
  }

  const theme = LIGHT_THEME[label] ?? "neutral";
  switch (theme) {
    case "amber":
      return `${CHIP_CARD_BASE} border-amber-400/20 bg-amber-500/[0.04] text-slate-300 shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:border-amber-400/40 hover:bg-amber-500/10`;
    case "slate":
      return `${CHIP_CARD_BASE} border-slate-400/25 bg-slate-500/[0.06] text-slate-300 shadow-[0_0_15px_rgba(100,116,139,0.18)] hover:border-slate-400/45 hover:bg-slate-500/10`;
    case "neon":
      return `${CHIP_CARD_BASE} border-purple-400/25 bg-purple-500/[0.04] text-slate-300 shadow-[0_0_15px_rgba(168,85,247,0.2)] hover:border-purple-400/50 hover:bg-purple-500/10`;
    default:
      return `${CHIP_CARD_BASE} border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/30 hover:bg-purple-500/20`;
  }
}

// 선명도 슬라이더 값을 친구에게 말하듯 담백한 구어체 한 줄로 풀어준다.
function vividnessDescription(value: number): string {
  if (value <= 25) return "🌫️ 꿈인 건 알겠는데, 장면들이 뿌옇고 흐릿했어요";
  if (value <= 50) return "📺 그냥 평범한 영화를 보는 것처럼 무난했어요";
  if (value <= 75) return "🎨 색깔이나 소리가 평소보다 쨍하고 생생했어요";
  return "👁️ 깨고 나서도 현실인가 싶을 정도로 생생했어요";
}

// 다크 모드 가독성: 실제 입력 글자는 선명한 화이트, placeholder는 은은한 서브 톤으로 구분한다.
function otherInputClass(): string {
  return "mt-3 w-full rounded-xl border border-violet-400/30 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-slate-500/80 focus:border-violet-400/60 focus:outline-none";
}

// Step 6~7 전용 몰입형 서술 박스 - 넉넉한 높이와 명조체로 "한 번에 쭉 써내려가는" 느낌을 준다.
function bigTextareaClass(): string {
  return "mt-3 h-64 w-full resize-none rounded-xl border border-violet-400/30 bg-black/30 px-4 py-3 font-serif text-sm leading-relaxed text-white placeholder:text-slate-500/70 focus:border-violet-400/60 focus:outline-none scrollbar-thin scrollbar-thumb-purple-900/30 scrollbar-track-transparent";
}

// 사이드 배지에 쓸 라벨 - 문장형 라벨을 통째로 붙이면 줄바꿈이 지저분해져 짧게 잘라 보여준다.
function truncateLabel(label: string, max = 12): string {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}

interface CustomChipSlotProps {
  /** 이미 확정(커밋)된 커스텀 칩의 라벨 - 아직 하나도 만든 적 없으면 null */
  committedLabel: string | null;
  /** 확정된 커스텀 칩이 현재 선택된 상태인지 */
  isSelected: boolean;
  /** 지금 텍스트 입력 모드인지 */
  isEntering: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onStartEntering: () => void;
  onSelectCommitted: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

// 고정 객관식 배열 맨 끝에 항상 붙는 "기타" 슬롯. 기본 상태는 안내 카드 -> 클릭하면 카드 자리
// 그대로 인풋으로 바뀌고 -> Enter나 블러로 커밋하면 그 텍스트가 진짜 칩으로 각인된다.
// 빈 값으로 커밋하면 원래의 기본 카드로 조용히 롤백한다.
function CustomChipSlot({
  committedLabel,
  isSelected,
  isEntering,
  draft,
  onDraftChange,
  onStartEntering,
  onSelectCommitted,
  onCommit,
  onCancel,
}: CustomChipSlotProps) {
  const commit = () => {
    const trimmed = draft.trim().slice(0, CUSTOM_CHIP_MAX_LENGTH);
    if (trimmed) onCommit(trimmed);
    else onCancel();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      onCancel();
    }
  };

  if (isEntering) {
    return (
      <input
        type="text"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        maxLength={CUSTOM_CHIP_MAX_LENGTH}
        autoFocus
        placeholder="직접 입력"
        className={`${CHIP_CARD_BASE} border-purple-400/60 bg-purple-950/30 text-white placeholder:text-slate-500 focus:outline-none`}
      />
    );
  }

  if (committedLabel) {
    return (
      <button type="button" onClick={onSelectCommitted} className={customChipClass(isSelected)}>
        <span className="mr-3 shrink-0 text-2xl">✏️</span>
        <span className="line-clamp-2 text-sm font-medium leading-snug">{committedLabel}</span>
      </button>
    );
  }

  return (
    <button type="button" onClick={onStartEntering} className={chipClass(false)}>
      <span className="mr-3 shrink-0 text-2xl">✍️</span>
      <span className="text-sm font-medium leading-snug">기타 (직접 입력)</span>
    </button>
  );
}

export default function DreamWizard({
  onComplete,
  isSubmitting,
  mood,
  onMoodChange,
  initialData,
  initialTitle,
  initialActionDetail,
  initialTargetChip,
  initialTargetOther,
  initialDynamicsChip,
  initialDynamicsOther,
  onDraftChange,
  submitLabel = "🔮 내 꿈 분석결과 확인하기",
}: DreamWizardProps) {
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<SlidePhase>("idle");
  const [direction, setDirection] = useState<1 | -1>(1);

  const lightInit = resolveLightChips(initialData?.brightness ?? "");
  const [light, setLight] = useState<string[]>(lightInit.chips);
  const [lightOther, setLightOther] = useState(lightInit.other);
  const [isLightEntering, setIsLightEntering] = useState(false);
  const [lightDraft, setLightDraft] = useState("");
  const [title, setTitle] = useState(initialData?.title ?? initialTitle ?? "");

  // Step 2는 최대 2개까지 고를 수 있다 - 이미 2개 선택된 상태에서 새 카드를 누르면 조용히 무시한다.
  const toggleLight = (label: string) => {
    setLight((prev) => {
      if (prev.includes(label)) return prev.filter((item) => item !== label);
      if (prev.length >= 2) return prev;
      return [...prev, label];
    });
  };

  const spaceInit = initialData ? resolveChipState(SPACE_OPTIONS, initialData.space_depth) : null;
  const [space, setSpace] = useState<string | null>(spaceInit?.chip ?? null);
  const [spaceOther, setSpaceOther] = useState(spaceInit?.other ?? "");
  const [isSpaceEntering, setIsSpaceEntering] = useState(false);
  const [spaceDraft, setSpaceDraft] = useState("");
  // space_detail은 더 이상 Step 3에서 받지 않는다(Step 6의 몰입 서술란으로 통합) - 기존에
  // 저장된 값이 있으면(수정 모드) 그대로 보존해서 다시 제출한다.
  const [spaceDetail] = useState(initialData?.space_detail ?? "");

  const projectionInit = initialData
    ? resolveChipState(PROJECTION_OPTIONS, initialData.identity_factor)
    : initialTargetChip
      ? resolveChipState(PROJECTION_OPTIONS, initialTargetChip)
      : null;
  const [projection, setProjection] = useState<string | null>(projectionInit?.chip ?? null);
  const [projectionOther, setProjectionOther] = useState(projectionInit?.other ?? initialTargetOther ?? "");
  const [isProjectionEntering, setIsProjectionEntering] = useState(false);
  const [projectionDraft, setProjectionDraft] = useState("");
  const [targetDetail] = useState(initialData?.target_detail ?? "");

  const dynamicsInit = initialData
    ? resolveChipState(DYNAMICS_OPTIONS, initialData.action_physics)
    : initialDynamicsChip
      ? resolveChipState(DYNAMICS_OPTIONS, initialDynamicsChip)
      : null;
  const [dynamics, setDynamics] = useState<string | null>(dynamicsInit?.chip ?? null);
  const [dynamicsOther, setDynamicsOther] = useState(dynamicsInit?.other ?? initialDynamicsOther ?? "");
  const [isDynamicsEntering, setIsDynamicsEntering] = useState(false);
  const [dynamicsDraft, setDynamicsDraft] = useState("");
  const [actionDetail] = useState(initialData?.action_detail ?? initialActionDetail ?? "");

  const realityInit = initialData ? resolveChipState(REALITY_OPTIONS, initialData.reality_link) : null;
  const [reality, setReality] = useState<string | null>(realityInit?.chip ?? null);
  const [realityOther, setRealityOther] = useState(realityInit?.other ?? "");
  const [isRealityEntering, setIsRealityEntering] = useState(false);
  const [realityDraft, setRealityDraft] = useState("");
  // Step 6의 몰입 서술란 - 예전에 공간/대상/행동 각 단계에 흩어져 있던 주관식 서술을 여기 하나로
  // 모았다. buildDreamOriginalContent()는 5개 detail 필드를 공백으로 이어 붙이기만 하므로,
  // 서술이 어느 필드에 담기든 최종 "원문 인용" 결과는 동일하다 - 그래서 이 통합이 안전하다.
  const [realityDetail, setRealityDetail] = useState(initialData?.reality_detail ?? "");

  const [vividness, setVividness] = useState(initialData?.vividness ?? 50);
  const [lucidLevel, setLucidLevel] = useState<LucidLevel>(initialData?.lucid_level ?? "none");
  const [controlLevel, setControlLevel] = useState<ControlLevel | null>(initialData?.control_level ?? null);
  const [finalMemo, setFinalMemo] = useState(initialData?.final_memo ?? "");
  const [sketchPreview, setSketchPreview] = useState<string | null>(null);

  // Step 6~7 상단 뱃지 요약에 쓸, 1~5단계에서 고른 키워드 전체.
  const selectionSummary = [mood, ...light, space, projection, dynamics].filter(
    (value): value is string => Boolean(value && value.trim())
  );

  // 입력값이 바뀔 때마다 지금까지의 응답 전체를 부모에게 올려보낸다 - 이탈 방지 가드의
  // "작성 중" 판단과 자동 임시 저장(디바운스는 부모 쪽에서 건다)의 데이터 소스가 된다.
  useEffect(() => {
    onDraftChange?.({
      title: title.trim(),
      brightness: light.filter(Boolean).join(" · "),
      space_depth: space ?? "",
      space_detail: spaceDetail.trim(),
      identity_factor: projection ?? "",
      target_detail: targetDetail.trim(),
      action_physics: dynamics ?? "",
      action_detail: actionDetail.trim(),
      reality_link: reality ?? "",
      reality_detail: realityDetail.trim(),
      vividness,
      lucid_level: lucidLevel,
      control_level: controlLevel,
      final_memo: finalMemo.trim(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    light,
    space,
    spaceDetail,
    projection,
    targetDetail,
    dynamics,
    actionDetail,
    reality,
    realityDetail,
    vividness,
    lucidLevel,
    controlLevel,
    finalMemo,
  ]);

  const goToStep = (nextStep: number, dir: 1 | -1) => {
    setDirection(dir);
    setPhase("leaving");
    window.setTimeout(() => {
      setStep(nextStep);
      setPhase("entering");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("idle"));
      });
    }, TRANSITION_MS);
  };

  const handleSketchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSketchPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  // 분위기(Step 1)는 보통 항상 기본값이 있어 바로 다음으로 넘어갈 수 있지만, "기타"로 전환한
  // 뒤 아직 아무것도 적지 않은 빈 값으로는 넘어가지 못하게 막는다.
  const stepMoodReady = mood.trim() !== "";
  const step1Ready = light.length > 0;
  const step2Ready = space !== null;
  const step3Ready = projection !== null;
  const step4Ready = dynamics !== null;
  const step5Ready = reality !== null && realityDetail.trim() !== "";
  // 제목은 마지막 단계(Step 7)에서 입력받으므로, 완료 가능 여부에만 반영한다.
  const titleReady = title.trim() !== "";

  const canProceed =
    step === 1
      ? stepMoodReady
      : step === 2
        ? step1Ready
        : step === 3
          ? step2Ready
          : step === 4
            ? step3Ready
            : step === 5
              ? step4Ready
              : step === 6
                ? step5Ready
                : true;

  const isSurveyComplete = step1Ready && step2Ready && step3Ready && step4Ready && step5Ready && titleReady;

  const handleNext = () => {
    if (step < TOTAL_STEPS && canProceed) goToStep(step + 1, 1);
  };

  const handlePrev = () => {
    if (step > 1) goToStep(step - 1, -1);
  };

  const handleComplete = () => {
    if (!isSurveyComplete || isSubmitting) return;

    const survey: DreamSurvey = {
      title: title.trim(),
      brightness: light.filter(Boolean).join(" · "),
      space_depth: space ?? "",
      space_detail: spaceDetail.trim(),
      identity_factor: projection ?? "",
      target_detail: targetDetail.trim(),
      action_physics: dynamics ?? "",
      action_detail: actionDetail.trim(),
      reality_link: reality ?? "",
      reality_detail: realityDetail.trim(),
      vividness,
      lucid_level: lucidLevel,
      control_level: controlLevel,
      final_memo: finalMemo.trim(),
    };
    onComplete(survey);
  };

  const slideClass = (() => {
    if (phase === "leaving") return direction === 1 ? "-translate-x-6 opacity-0" : "translate-x-6 opacity-0";
    if (phase === "entering") return direction === 1 ? "translate-x-6 opacity-0" : "-translate-x-6 opacity-0";
    return "translate-x-0 opacity-100";
  })();

  return (
    <div>
      {/* 별자리 프로그레스 바: 활성 스텝은 빛나는 다이아몬드 노드로, [다음] 클릭 시 다음 노드로
          향하는 선이 보라 네온으로 서서히 채워지며 이어진다. */}
      <div>
        <p className="text-center text-[11px] tracking-widest text-violet-300/70 uppercase">
          Step {step} / {TOTAL_STEPS} · {STEP_META[step - 1].label}
        </p>
        <div className="mt-2 flex items-center">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((idx) => (
            <div key={idx} className="flex flex-1 items-center last:flex-none">
              <span className="relative inline-flex items-center justify-center">
                {idx === step && (
                  <span className="absolute h-4 w-4 animate-ping rounded-full bg-purple-400/50" />
                )}
                <span
                  className={`relative block h-2.5 w-2.5 rotate-45 transition-all duration-300 ${
                    idx === step
                      ? "scale-125 bg-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.8)]"
                      : idx < step
                        ? "bg-purple-400/60"
                        : "border border-slate-600 bg-transparent"
                  }`}
                />
              </span>
              {idx < TOTAL_STEPS && (
                <div className="relative mx-1 h-px flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`absolute inset-0 origin-left rounded-full bg-purple-400/80 shadow-[0_0_6px_rgba(192,132,252,0.6)] transition-all duration-500 ease-out ${
                      idx < step ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 단계별 질문 콘텐츠 (슬라이딩 전환) */}
      <div className="mt-6 overflow-hidden">
        <div className={`transition-all duration-300 ease-out ${slideClass}`}>
          {step === 1 && (
            <div>
              <h3 className="text-base font-medium text-white">이 꿈, 전체적으로 어떤 느낌이 가장 컸나요?</h3>
              <div className="mt-4">
                <MoodTagGrid mood={mood} onMoodChange={onMoodChange} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="text-base font-medium text-white">
                눈을 떴을 때 꿈속 공간의 첫인상(풍경이나 밝기)은 어땠나요?
              </h3>
              <p className="mt-1 text-xs text-slate-500">가장 가까운 느낌으로 최대 2개까지 고를 수 있어요.</p>
              <div className={SENTENCE_OPTION_GRID_CLASS}>
                {LIGHT_OPTIONS.map((opt) => {
                  const selected = light.includes(opt.label);
                  const limitReached = !selected && light.length >= 2;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => toggleLight(opt.label)}
                      disabled={limitReached}
                      className={lightChipClass(opt.label, selected, limitReached)}
                    >
                      <span className="mr-3 shrink-0 text-2xl">{opt.emoji}</span>
                      <span className={SENTENCE_OPTION_LABEL_CLASS}>{opt.label}</span>
                      {selected && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-[10px] shadow-[0_0_8px_rgba(168,85,247,0.6)]">
                          ✨
                        </span>
                      )}
                    </button>
                  );
                })}
                <CustomChipSlot
                  committedLabel={lightOther || null}
                  isSelected={lightOther !== "" && light.includes(lightOther)}
                  isEntering={isLightEntering}
                  draft={lightDraft}
                  onDraftChange={setLightDraft}
                  onStartEntering={() => setIsLightEntering(true)}
                  onSelectCommitted={() => toggleLight(lightOther)}
                  onCommit={(value) => {
                    setLightOther(value);
                    setLight((prev) => (prev.includes(value) ? prev : prev.length >= 2 ? prev : [...prev, value]));
                    setIsLightEntering(false);
                    setLightDraft("");
                  }}
                  onCancel={() => {
                    setIsLightEntering(false);
                    setLightDraft("");
                  }}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="text-base font-medium text-white">
                어떤 공간에서 일어난 일인가요?
              </h3>
              <div className={SENTENCE_OPTION_GRID_CLASS}>
                {SPACE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSpace(opt.label)}
                    className={chipClass(space === opt.label && space !== spaceOther)}
                  >
                    <span className="mr-3 shrink-0 text-2xl">{opt.emoji}</span>
                    <span className={SENTENCE_OPTION_LABEL_CLASS}>{opt.label}</span>
                  </button>
                ))}
                <CustomChipSlot
                  committedLabel={spaceOther || null}
                  isSelected={spaceOther !== "" && space === spaceOther}
                  isEntering={isSpaceEntering}
                  draft={spaceDraft}
                  onDraftChange={setSpaceDraft}
                  onStartEntering={() => setIsSpaceEntering(true)}
                  onSelectCommitted={() => setSpace(spaceOther)}
                  onCommit={(value) => {
                    setSpaceOther(value);
                    setSpace(value);
                    setIsSpaceEntering(false);
                    setSpaceDraft("");
                  }}
                  onCancel={() => {
                    setIsSpaceEntering(false);
                    setSpaceDraft("");
                  }}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 className="text-base font-medium text-white">
                꿈에 나 말고 누가 또 등장했나요?
              </h3>
              <div className={SENTENCE_OPTION_GRID_CLASS}>
                {PROJECTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setProjection(opt.label)}
                    className={chipClass(projection === opt.label && projection !== projectionOther)}
                  >
                    <span className="mr-3 shrink-0 text-2xl">{opt.emoji}</span>
                    <span className={SENTENCE_OPTION_LABEL_CLASS}>{opt.label}</span>
                  </button>
                ))}
                <CustomChipSlot
                  committedLabel={projectionOther || null}
                  isSelected={projectionOther !== "" && projection === projectionOther}
                  isEntering={isProjectionEntering}
                  draft={projectionDraft}
                  onDraftChange={setProjectionDraft}
                  onStartEntering={() => setIsProjectionEntering(true)}
                  onSelectCommitted={() => setProjection(projectionOther)}
                  onCommit={(value) => {
                    setProjectionOther(value);
                    setProjection(value);
                    setIsProjectionEntering(false);
                    setProjectionDraft("");
                  }}
                  onCancel={() => {
                    setIsProjectionEntering(false);
                    setProjectionDraft("");
                  }}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h3 className="text-base font-medium text-white">
                그 안에서 주로 어떤 행동을 하셨나요?
              </h3>
              <div className={SENTENCE_OPTION_GRID_CLASS}>
                {DYNAMICS_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setDynamics(opt.label)}
                    className={chipClass(dynamics === opt.label && dynamics !== dynamicsOther)}
                  >
                    <span className="mr-3 shrink-0 text-2xl">{opt.emoji}</span>
                    <span className={SENTENCE_OPTION_LABEL_CLASS}>{opt.label}</span>
                  </button>
                ))}
                <CustomChipSlot
                  committedLabel={dynamicsOther || null}
                  isSelected={dynamicsOther !== "" && dynamics === dynamicsOther}
                  isEntering={isDynamicsEntering}
                  draft={dynamicsDraft}
                  onDraftChange={setDynamicsDraft}
                  onStartEntering={() => setIsDynamicsEntering(true)}
                  onSelectCommitted={() => setDynamics(dynamicsOther)}
                  onCommit={(value) => {
                    setDynamicsOther(value);
                    setDynamics(value);
                    setIsDynamicsEntering(false);
                    setDynamicsDraft("");
                  }}
                  onCancel={() => {
                    setIsDynamicsEntering(false);
                    setDynamicsDraft("");
                  }}
                />
              </div>
            </div>
          )}

          {step === 6 && (
            <div>
              <h3 className="text-base font-medium text-white">
                요즘 일상에서 가장 신경 쓰이는 부분이 있나요?
              </h3>
              <div className={SENTENCE_OPTION_GRID_CLASS}>
                {REALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setReality(opt.label)}
                    className={chipClass(reality === opt.label && reality !== realityOther)}
                  >
                    <span className="mr-3 shrink-0 text-2xl">{opt.emoji}</span>
                    <span className={SENTENCE_OPTION_LABEL_CLASS}>{opt.label}</span>
                  </button>
                ))}
                <CustomChipSlot
                  committedLabel={realityOther || null}
                  isSelected={realityOther !== "" && reality === realityOther}
                  isEntering={isRealityEntering}
                  draft={realityDraft}
                  onDraftChange={setRealityDraft}
                  onStartEntering={() => setIsRealityEntering(true)}
                  onSelectCommitted={() => setReality(realityOther)}
                  onCommit={(value) => {
                    setRealityOther(value);
                    setReality(value);
                    setIsRealityEntering(false);
                    setRealityDraft("");
                  }}
                  onCancel={() => {
                    setIsRealityEntering(false);
                    setRealityDraft("");
                  }}
                />
              </div>

              <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4 backdrop-blur-md">
                <p className="text-xs leading-relaxed text-violet-300/80">
                  🧘 꿈을 꾼 전후 1~2일간 현실에서 있었던 일이나 당신의 &apos;마음의 풍경&apos;을 떠올리며, 이 꿈에서
                  있었던 일을 자유롭게 서술해 보세요.
                </p>
                <textarea
                  value={realityDetail}
                  onChange={(event) => setRealityDetail(event.target.value)}
                  placeholder="예: 내일 있을 중요한 프로젝트 발표 기한 때문에 엄청난 스트레스를 받고 있었는데, 도망치고 싶던 심리가 꿈에 고스란히 투사된 것 같다..."
                  className={bigTextareaClass()}
                />
              </div>
            </div>
          )}

          {step === 7 && (
            <div>
              <h3 className="text-base font-medium text-white">이 꿈에 제목을 붙여주세요</h3>
              <p className="mt-1 text-xs text-slate-500">
                💡 이 꿈에 등장한 가장 중요한 소재를 중심으로 신비로운 제목을 지어보세요.
              </p>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="예: 황금빛 고래와 함께한 하늘 비행 (나중에 쉽게 찾아볼 수 있도록 핵심 소재를 넣어 짧게 적어보세요.)"
                autoFocus
                className={otherInputClass()}
              />

              {selectionSummary.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-1.5 opacity-60">
                  {selectionSummary.map((label, i) => (
                    <span key={i} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                      {truncateLabel(label)}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4 backdrop-blur-md">
                <p className="text-xs leading-relaxed text-violet-300/80">
                  🎨 글 외에 뇌리에 스친 시각적인 잔상이나, 마무리로 덧붙이고 싶은 이야기가 있다면 자유롭게 적어주세요.
                </p>
                <textarea
                  value={finalMemo}
                  onChange={(event) => setFinalMemo(event.target.value)}
                  placeholder="그림/스케치 파일 업로드 또는 추가적인 무의식의 잔상을 자유롭게 메모하세요."
                  className={bigTextareaClass()}
                />
                <div className="mt-3 flex items-center gap-3">
                  <label className="cursor-pointer rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-xs text-violet-200 transition-colors hover:border-violet-400/60 hover:bg-violet-500/20">
                    📎 파일 선택
                    <input type="file" accept="image/*" onChange={handleSketchChange} className="hidden" />
                  </label>
                  {sketchPreview && (
                    <div className="relative">
                      <img src={sketchPreview} alt="꿈 스케치 미리보기" className="h-12 w-12 rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => setSketchPreview(null)}
                        aria-label="스케치 제거"
                        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[10px] text-slate-300 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <h3 className="mt-7 text-base font-medium text-white">마지막으로, 이 꿈이 전체적으로 얼마나 생생했나요?</h3>

              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-indigo-300/70">
                  <span>선명도</span>
                  <span className="font-medium text-violet-200">{vividness}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={vividness}
                  onChange={(event) => setVividness(Number(event.target.value))}
                  className="mt-2 w-full accent-violet-500"
                />
                <p className="mt-2 text-xs text-slate-400">{vividnessDescription(vividness)}</p>
              </div>

              <div className="mt-6">
                <h3 className="text-sm text-white">
                  혹시 꿈속에서 &apos;지금 이건 꿈이구나&apos; 하고 스스로 알아챘나요?
                </h3>
                <div className="mt-3 grid grid-cols-3 gap-2.5">
                  {LUCID_LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setLucidLevel(opt.value);
                        // 다시 "일반 꿈"으로 돌아가면 그 아래 통제력 선택은 의미가 없어져 함께 비운다.
                        if (opt.value === "none") setControlLevel(null);
                      }}
                      className={lucidCardClass(lucidLevel === opt.value)}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <span className="text-xs font-medium leading-snug">{opt.label}</span>
                    </button>
                  ))}
                </div>

                {/* lucidLevel이 momentary/full일 때만 부드럽게 슬라이드 다운 + 페이드인 - 조건부로
                    마운트/언마운트하면 트랜지션이 재생되지 않아, 항상 DOM에 두고 max-h/opacity만 바꾼다. */}
                <div
                  aria-hidden={lucidLevel === "none"}
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    lucidLevel === "none" ? "mt-0 max-h-0 opacity-0" : "mt-5 max-h-[220px] opacity-100"
                  }`}
                >
                  <h3 className="text-sm text-white">그 순간, 꿈에 대한 통제력은 어느 정도였나요?</h3>
                  <div className="mt-3 grid grid-cols-3 gap-2.5">
                    {CONTROL_LEVEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        tabIndex={lucidLevel === "none" ? -1 : 0}
                        onClick={() => setControlLevel(opt.value)}
                        className={lucidCardClass(controlLevel === opt.value)}
                      >
                        <span className="text-2xl">{opt.emoji}</span>
                        <span className="text-xs font-medium leading-snug">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 이전/다음 내비게이션 */}
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrev}
          disabled={step === 1}
          className="flex h-11 items-center justify-center rounded-full border border-slate-700/60 bg-transparent px-5 text-sm text-slate-400 transition-colors hover:border-violet-400/40 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ← 이전
        </button>

        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed}
            className="flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-6 text-sm font-semibold text-white shadow-[0_0_15px_rgba(147,51,234,0.4)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음 →
          </button>
        ) : (
          <div className="group relative">
            <div className="absolute inset-0 rounded-full bg-violet-500 opacity-40 blur-xl transition-all duration-300 ease-out group-hover:opacity-90 group-hover:blur-2xl" />
            <button
              type="button"
              onClick={handleComplete}
              disabled={!isSurveyComplete || isSubmitting}
              className="relative flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-6 text-sm font-semibold text-white transition-all duration-300 group-hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
