"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { WizardStepViewport, useWizardStepTransition } from "@/components/WizardStepShell";
import { categoryForWord, EMOTION_CATEGORIES, type EmotionCategoryKey } from "@/lib/emotionWordbook";

// "마음 기록장" - 씨앗 심기(감정일기)의 깊이 모드. "나를 지키는 마음 기록장" 워크시트의
// 사건 -> 욕구 -> 표현 -> 자기위로 -> 종료 감정 흐름을 그대로 따르되, 문구는 이 앱의 성인
// 대상 톤(해요체)으로 다듬었다. 꿈일기(DreamWizard)와 같은 "한 화면에 한 질문씩 넘기는"
// 단계별 마법사 패턴을 그대로 재사용한다(WizardStepShell) - 예전엔 7개 질문이 한 화면에
// 전부 이어붙어 있어 특히 감정 선택 단계의 150여 개 단어 칩이 한 번에 쏟아지는 문제가 있었다.
//
// 화면 구성은 "노트 페이지" 메타포를 따른다 - 질문/입력창(또는 감정 선택 그리드)/페이지 넘김
// 버튼을 각각 따로 떠 있는 UI 조각으로 두지 않고, NotePage 하나의 카드 안에 전부 담아 실제
// 다이어리 한 장을 펼쳐놓은 인상을 준다. 진행 상황(퍼센트 바 + "2/7 · 감정 · 라벨" 텍스트)만
// 카드 바깥의 앱 UI로 남겨 뒀다 - 그건 "페이지 내용"이 아니라 마법사 자체의 진행 안내라서다.
export interface GuidedEmotionJournalValue {
  initialEmotion: string | null;
  // 실제로 어느 대분류 아코디언에서 골랐는지 - "고통스러운"/"구역질나는"처럼 같은 단어가
  // 여러 대분류(분노/미움 등)에 겹쳐 있을 때, 단어만으로는 어느 쪽을 골랐는지 구분할 수
  // 없어 분위기 색/글로우와 실제 꽃의 속(genus)이 모두 배열 순서 우선(항상 앞쪽 대분류)
  // 규칙으로만 귀결되던 문제를 해결하기 위해 추가했다 - "단어를 지우지 말고 고른 분위기에
  // 따라 달라지게" 해달라는 요청에 따른 것. 힌트가 없는 값(레거시로 저장된 옛 기록 등)은
  // undefined/null로 두면 categoryForWord(word) 폴백으로 자연히 처리된다.
  initialEmotionCategory?: EmotionCategoryKey | null;
  triggerEvent: string;
  desire: string;
  messageToOther: string;
  desiredMessage: string;
  selfCompassion: string;
  closingEmotion: string | null;
  closingEmotionCategory?: EmotionCategoryKey | null;
}

export const EMPTY_GUIDED_JOURNAL_VALUE: GuidedEmotionJournalValue = {
  initialEmotion: null,
  initialEmotionCategory: null,
  triggerEvent: "",
  desire: "",
  messageToOther: "",
  desiredMessage: "",
  selfCompassion: "",
  closingEmotion: null,
  closingEmotionCategory: null,
};

interface GuidedEmotionJournalProps {
  value: GuidedEmotionJournalValue;
  onChange: (value: GuidedEmotionJournalValue) => void;
  // 7단계 "다 적었어요 ✨" 버튼을 눌렀을 때 - 부모(journal/page.tsx)가 이 신호로 작성 화면을
  // "마무리" 단계(무의식 씨앗/사진/저장 버튼)로 넘긴다. 이 컴포넌트 자체는 저장을 모르므로
  // (그건 항상 부모 책임이었다) 여기서는 그저 "7단계를 다 채웠다"는 사실만 알려준다.
  onComplete?: () => void;
  // 노트 페이지 카드 상단에 명조 세리프(font-serif)로 보여줄 날짜 - "2026년 8월 14일
  // 금요일"처럼 이미 사람이 읽는 문장으로 포맷된 문자열을 그대로 받는다. 날짜 자체(formDate)는
  // 부모 상태라 포맷팅도 부모(journal/page.tsx의 formatDiaryDate) 책임으로 남겨 뒀다.
  dateLabel: string;
}

const TOTAL_STEPS = 7;
const STEP_LABELS = ["초기 감정", "사건", "욕구", "표현", "듣고 싶은 말", "자기위로", "종료 감정"];

// 준비 안내 3항목 - 처음 진입 시 전체 화면(showPrep)과, 작성 도중 화면 하단에 상시 노출되는
// AmbientPrepTips가 이 배열 하나를 공유한다(문구를 두 곳에 따로 적지 않는다).
const PREP_TIPS: { emoji: string; text: string }[] = [
  { emoji: "🎵", text: "차분한 음악을 틀거나, 방해받지 않을 조용한 공간을 찾아보세요." },
  { emoji: "🌬️", text: "짧게 심호흡을 하며 몸에 힘을 빼보세요." },
  { emoji: "💭", text: "지금 이 순간, 내 마음에 집중해보세요." },
];

// 서술형 단계에서 일정 시간 멈춰 있을 때 뜨는 유휴 힌트 - 위 PREP_TIPS 3항목을 그대로
// 옮기지 않고 훨씬 짧은 한 줄로 재구성했다(입력창을 가리지 않을 정도로). 단계 번호(2~6)를
// 이 배열 길이로 나눈 나머지로 골라 "순환" 노출한다.
const IDLE_HINT_TEXTS = ["잠깐, 천천히 숨을 골라볼까요?", "지금 이 순간에 집중해보세요", "편하게 적어도 괜찮아요, 서두르지 않아도 돼요"];
const IDLE_THRESHOLD_MS = 18000;
const IDLE_HINT_VISIBLE_MS = 6000;

// 단어 -> 대분류 키. explicitCategory(실제로 고른 아코디언)가 있으면 그걸 그대로 쓰고,
// 없으면(레거시 데이터 등) categoryForWord의 배열 순서 우선 폴백을 쓴다 - "고통스러운"/
// "구역질나는"처럼 여러 대분류에 겹치는 단어를 정확히 구분하려면 이 힌트가 필수다.
function resolveCategoryKey(word: string | null, explicitCategory?: EmotionCategoryKey | null): EmotionCategoryKey | null {
  if (!word) return null;
  return explicitCategory ?? categoryForWord(word);
}

// 노트 페이지 카드 뒤로 번지는 radial glow의 색 - 위에서 구한 대분류의 hex를 그대로 쓴다
// (EmotionCategory.color, emotionBadgeStyle과 같은 소스라 앱 전역의 "hex + 낮은 불투명도"
// 배지 규칙과 색이 어긋나지 않는다). 헤더는 감정과 무관하게 항상 고정된 어두운 톤으로 남고,
// 이 글로우는 오직 페이지 카드 주변에만 스며 나온다.
function glowColorForWord(word: string | null, explicitCategory?: EmotionCategoryKey | null): string | null {
  const key = resolveCategoryKey(word, explicitCategory);
  if (!key) return null;
  return EMOTION_CATEGORIES.find((category) => category.key === key)?.color ?? null;
}

// 페이지 카드의 종이 결 텍스처 - journal/page.tsx의 HERO_STAR_TEXTURE_STYLE과 같은 방식
// (고정 좌표 radial-gradient 점을 여러 개 겹치는 것)으로, 밝고 어두운 섬유 얼룩을 섞어 종이의
// 결 느낌을 낸다. "고급스러운 저널" 톤으로 다듬으면서 알파를 전부 거의 절반으로 낮췄다 -
// 예전엔 세피아 카드 위에서 그 정도 존재감이 필요했지만, 지금의 절제된 차콜 카드에서는 결이
// "거의 인지 안 될 정도"로만 있어야 한다는 요청에 맞춰 더 옅게 뺐다.
const PAPER_GRAIN_STYLE: CSSProperties = {
  backgroundImage: [
    "radial-gradient(1px 1px at 8% 15%, rgba(0,0,0,0.18) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 22% 60%, rgba(255,248,235,0.08) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 40% 30%, rgba(0,0,0,0.15) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 58% 78%, rgba(255,248,235,0.07) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 72% 20%, rgba(0,0,0,0.14) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 85% 55%, rgba(255,248,235,0.09) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 93% 85%, rgba(0,0,0,0.13) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 15% 90%, rgba(0,0,0,0.11) 50%, transparent 51%)",
  ].join(", "),
};

interface EmotionWordPickerProps {
  value: string | null;
  // 실제로 어느 대분류에서 골랐는지 - GuidedEmotionJournalValue.initialEmotionCategory/
  // closingEmotionCategory를 그대로 받는다. 여러 대분류에 겹치는 단어(예: "구역질나는")의
  // hasSelection/자동 펼침을 정확한 그 대분류 하나로만 표시하기 위해 필요하다.
  selectedCategory: EmotionCategoryKey | null;
  // 이미 고른 칩을 다시 누르면 선택을 취소할 수 있어야 해서(null) 문자열 하나만 받던 시그니처를
  // string | null로 넓혔다. 이번엔 어느 대분류에서 골랐는지도 함께 넘긴다(취소할 땐 둘 다 null).
  onChange: (word: string | null, category: EmotionCategoryKey | null) => void;
}

// 1단계/7단계 공용 감정 선택 - 7개 대분류를 아코디언으로 접어 둔다. 150여 개 단어를 한 화면에
// 다 쏟아내는 대신, 헤더를 탭해야 그 대분류의 칩이 펼쳐진다 - 이미 고른 단어가 있는 대분류는
// 처음부터 펼쳐진 채 시작하고(헤더에 고른 단어를 작은 태그로 함께 보여준다), 나머지는 접혀
// 있어 "천천히 하나씩 들여다본다"는 준비 카드의 취지와 어울린다.
//
// 색 처리는 세 번째로 다듬는다 - 처음엔 채도 높은 solid 파스텔이었고, 그다음엔 emotionBadgeStyle
// (hex 13% 배경 틴트)로 한 번 절제했는데, 그마저도 "이미 색 있는 종이 카드(세피아/차콜) 위에
// 또 다른 색 블록을 겹쳐 칠하니 두 색이 섞여 탁해진다"는 지적을 받았다. 그래서 배경 색 블록을
// 아예 없앴다 - 7개 대분류 헤더/펼친 내부/미선택 칩이 전부 카드와 같은 중립 톤 하나만 공유하고,
// 카테고리 구분은 이름 옆의 작은 색 점(dot) 하나로만 표현한다. 선택된 칩만 테두리+은은한
// 글로우(box-shadow)로 강조하고, 배경은 여전히 채우지 않는다.
function EmotionWordPicker({ value, selectedCategory, onChange }: EmotionWordPickerProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<EmotionCategoryKey>>(() => {
    const initial = new Set<EmotionCategoryKey>();
    const category = value ? resolveCategoryKey(value, selectedCategory) : null;
    if (category) initial.add(category);
    return initial;
  });

  const toggleCategory = (key: EmotionCategoryKey) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {EMOTION_CATEGORIES.map((category) => {
        const isExpanded = expandedCategories.has(category.key);
        // 이 단어가 여러 대분류에 겹칠 수 있어(예: "구역질나는") category.words.includes만으로는
        // 부족하다 - selectedCategory가 있으면(사용자가 실제로 고른 곳을 알 때) 그 대분류에서만
        // "선택됨"으로 표시한다. selectedCategory가 없는(레거시 값) 경우에만 예전처럼 단어
        // 포함 여부만으로 판단한다.
        const hasSelection =
          value !== null && category.words.includes(value) && (selectedCategory == null || selectedCategory === category.key);
        return (
          <div
            key={category.key}
            className="overflow-hidden rounded-2xl border bg-white/[0.03] transition-colors"
            style={{ borderColor: hasSelection ? `${category.color}70` : "rgba(255,255,255,0.08)" }}
          >
            {/* 대분류 헤더는 이제 배경색이 아니라 이름 옆의 작은 점(dot) 하나로만 자기 색을
                드러낸다 - 접힌 채로도 "이 대분류가 무슨 색인지"는 여전히 바로 보이지만,
                7개가 나란히 있어도 색 블록끼리 부딪히지 않는다. */}
            <button
              type="button"
              onClick={() => toggleCategory(category.key)}
              aria-expanded={isExpanded}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#d9d2c4] transition-colors hover:bg-white/[0.03]"
            >
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                {category.key}
                {hasSelection && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-normal text-[#d9d2c4]">{value}</span>}
              </span>
              <span className="text-xs text-[#9a9186] opacity-70 transition-transform duration-200" style={isExpanded ? { transform: "rotate(180deg)" } : undefined}>
                ▾
              </span>
            </button>
            {isExpanded && (
              <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] p-3">
                {category.words.map((word) => {
                  // 이 단어가 다른 대분류에도 겹칠 수 있어(예: "구역질나는") value === word만으로는
                  // 부족하다 - hasSelection과 같은 이유로 selectedCategory까지 함께 맞아야 "지금
                  // 보고 있는 이 대분류에서" 선택된 칩으로 표시한다.
                  const isSelected = value === word && (selectedCategory == null || selectedCategory === category.key);
                  return (
                    <button
                      key={word}
                      type="button"
                      // 이미 고른 칩을 다시 누르면 선택을 취소한다(null로 되돌린다) - 한 번
                      // 고르면 다른 단어로만 바꿀 수 있고 아예 취소는 못 하던 문제를 없앴다.
                      // 새로 고를 땐 어느 대분류에서 골랐는지(category.key)도 함께 알린다.
                      onClick={() => onChange(isSelected ? null : word, isSelected ? null : category.key)}
                      aria-pressed={isSelected}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        isSelected ? "text-white" : "border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:text-slate-200"
                      }`}
                      style={
                        isSelected
                          ? { borderColor: category.color, boxShadow: `0 0 10px -2px ${category.color}` }
                          : undefined
                      }
                    >
                      {word}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface NotePageProps {
  dateLabel: string;
  icon?: string;
  question: string;
  // 이 페이지에 적용할 분위기 색 - null이면(1단계처럼 아직 정해진 감정이 없을 때) 글로우 없이
  // 카드만 보인다.
  glowColor?: string | null;
  children: ReactNode;
}

// 질문 텍스트, 입력창(또는 감정 선택 그리드), 페이지 넘김 내비게이션을 하나의 "노트 페이지"
// 카드로 통합한다 - 예전엔 말풍선(QuestionBubble)+입력창+버튼바가 따로 떠 있는 3개의 UI
// 조각처럼 보였는데, 실제 다이어리는 페이지 한 장이 통째로 존재하는 느낌이어야 한다는 요청에
// 따라 하나의 표면으로 합쳤다.
//
// 톤은 두 번 다듬었다 - 처음엔 세피아 갈색 + 손글씨 폰트(font-hand, Nanum Pen Script)였는데,
// "2010년대 감성 블로그" 느낌이 촌스럽다는 지적을 받고 "잘 만들어진 책/저널"에 가깝게
// 다시 깎았다: 배경은 갈색/카키 대신 앱의 기존 남색 다크 테마와 자연스럽게 이어지는 짙은
// 차콜(살짝 따뜻한 위쪽 -> 앱 배경(#030712)에 가까운 차가운 아래쪽 3단 그라데이션)로,
// 손글씨 폰트는 완전히 걷어내고 앱이 이미 "감성적인 본문" 용도로 쓰던 명조 세리프
// (font-serif, layout.tsx의 nanumMyeongjo)를 재사용했다 - 새 폰트를 또 들여오지 않고 기존
// 컨벤션에 올라탄 선택이다(이 세리프도 한글 글리프는 OS 폴백 명조체로 렌더링되는데, "정제된
// 책" 느낌엔 오히려 자연스럽게 맞아떨어진다).
function NotePage({ dateLabel, icon, question, glowColor, children }: NotePageProps) {
  return (
    <div className="relative">
      {/* 감정별 분위기 색 (1) - 앰비언트 글로우. 헤더로는 절대 안 번지고, 카드 자체가
          불투명해서 카드 바깥(위아래 여백, 앱 배경 위)에만 번지고 카드 표면과는 섞이지 않는다 -
          "카드에 색이 겹쳐 보여야 한다"는 요청 기준으로는 이것만으론 부족했다(카드 자체는
          항상 똑같은 차콜로만 보였다는 게 실제 원인이었다). 아래 (2)가 그 간극을 메운다. */}
      {glowColor && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-8 -inset-y-10 -z-10 blur-xl"
          style={{ background: `radial-gradient(65% 60% at 50% 25%, ${glowColor}59 0%, transparent 70%)` }}
        />
      )}
      <div
        className="relative overflow-hidden rounded-[1.75rem] border border-white/[0.07] p-6 shadow-[0_25px_60px_-25px_rgba(0,0,0,0.7)] sm:p-9"
        style={{ background: "linear-gradient(180deg, #2d2924 0%, #201e21 55%, #17161c 100%)" }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0" style={PAPER_GRAIN_STYLE} />
        {/* 감정별 분위기 색 (2) - 카드 표면 위 오버레이. 위 (1)이 카드 "바깥"에서만 보이는
            것과 달리, 이건 카드 자체의 고정 톤(차콜) 위에 직접 겹쳐 그리는 낮은 불투명도
            색 레이어라 카드 표면에서도 감정색이 실제로 인지된다 - 기본 톤은 그대로 두고
            그 위에만 아주 은은하게(13%, 배지 규칙과 같은 강도) 얹는다는 요청을 그대로
            따른 것. 위에서 아래로 옅어져 "빛이 위에서 스며든다"는 카드 자체의 그라데이션
            방향과도 결을 맞췄다. */}
        {glowColor && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(120% 90% at 50% 0%, ${glowColor}22 0%, transparent 65%)` }}
          />
        )}
        <div className="relative">
          <p className="font-serif text-xs tracking-wide text-[#9a9186]">{dateLabel}</p>
          <h3 className="font-serif mt-1.5 flex items-start gap-2 text-xl leading-snug font-normal text-[#eae4d8] sm:text-2xl">
            {icon && (
              <span className="mt-1 text-lg opacity-70" aria-hidden>
                {icon}
              </span>
            )}
            <span>{question}</span>
          </h3>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface GuidedTextStepProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // 유휴 힌트 - "이번 단계를 보는 동안 이미 한 번 띄웠는지"는 이 컴포넌트가 스텝 전환마다
  // 새로 마운트되므로(WizardStepViewport의 조건부 렌더) 자체 state로는 기억할 수 없다 -
  // 부모(GuidedEmotionJournal)가 단계별로 들고 있다가 내려준다.
  idleHintText: string;
  hintAlreadyShown: boolean;
  onHintShown: () => void;
}

// 서술형 단계(2~6) 전용 입력창 - 노트 페이지 카드 안에서 종이에 바로 이어 쓰는 느낌을 주도록
// 사방 테두리 없이 밑줄 하나만, 포커스일 때만 은은한 광채가 감싼다. 높이는 rows 고정 대신
// 입력량에 맞춰 자동으로 늘어난다(oninput마다 scrollHeight로 재계산) - 빈 칸이 큰 사각
// 박스로 버티고 있을 때의 압박감을 줄이기 위해서다. 질문 텍스트/글로우는 이제 부모 NotePage가
// 담당해서, 이 컴포넌트는 순수하게 "쓰는 공간"만 그린다.
function GuidedTextStep({ value, onChange, placeholder, idleHintText, hintAlreadyShown, onHintShown }: GuidedTextStepProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showHint, setShowHint] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  // 최신 props를 ref로 미러링해 둔다 - 아래 armIdleTimer를 useCallback([])으로 고정해도
  // (매 렌더 다시 만들지 않아도) 항상 최신 hintAlreadyShown/onHintShown을 읽을 수 있게 한다.
  // 렌더 중에 직접 대입하지 않고 effect 안에서만 갱신한다(렌더 중 ref 대입은 별도로 금지된
  // 패턴이다).
  const hintAlreadyShownRef = useRef(hintAlreadyShown);
  const onHintShownRef = useRef(onHintShown);
  useEffect(() => {
    hintAlreadyShownRef.current = hintAlreadyShown;
    onHintShownRef.current = onHintShown;
  }, [hintAlreadyShown, onHintShown]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // 유휴 타이머를 (재)예약한다 - 이 단계에 처음 들어왔을 때(마운트) 한 번, 이후 타이핑할
  // 때마다(handleChange) 다시 불러 리셋한다. 이 단계에서 이미 한 번 힌트를 보여줬다면
  // (hintAlreadyShown) 더는 예약하지 않는다(한 단계당 최대 1회).
  const armIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    if (hintAlreadyShownRef.current) return;
    idleTimerRef.current = window.setTimeout(() => {
      setShowHint(true);
      onHintShownRef.current();
      // 힌트가 뜬 뒤 일정 시간 지나면 타이핑을 재개하지 않아도 스스로 사라진다.
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => setShowHint(false), IDLE_HINT_VISIBLE_MS);
    }, IDLE_THRESHOLD_MS);
  }, []);

  // 이 단계에 처음 들어왔을 때 한 번 예약하고, 언마운트(다른 단계로 이동)하면 정리한다.
  useEffect(() => {
    armIdleTimer();
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    };
  }, [armIdleTimer]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
    // 타이핑을 다시 시작하면 이미 떠 있던 힌트를 즉시 숨기고 유휴 시계를 리셋한다 - 둘 다
    // 이 이벤트 핸들러 안에서 직접 실행되므로(effect가 아니다) 별도 effect가 필요 없다.
    setShowHint(false);
    armIdleTimer();
  };

  return (
    <div>
      {/* "쓰는 공간" - 처음부터 5줄 높이로 넉넉하게 잡아 짧게 답하는 칸이 아니라 이야기를
          풀어놓는 공간처럼 보이게 한다(내용이 늘어나면 계속 커지는 오토그로우는 그대로 유지).
          배경의 옅은 가로줄은 leading-loose 줄 간격(2 x 15px = 30px)에 맞춘 노트 질감이다 -
          차콜 카드에 맞춰 아주 옅은 웜톤 아이보리 선을 얹었다(전보다 더 옅게, opacity 0.035). */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={5}
        className="w-full resize-none overflow-hidden border-0 border-b border-[#54504a]/60 bg-transparent px-1 py-2 text-[15px] leading-loose text-[#d6cfc2] transition-all duration-300 outline-none placeholder:text-sm placeholder:text-[#847a6c]/75 placeholder:italic focus:border-b-[#c7bfae]/70 focus:shadow-[0_1px_14px_-2px_rgba(199,191,174,0.3)]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent, transparent 1.85rem, rgba(255,250,240,0.035) 1.85rem, rgba(255,250,240,0.035) calc(1.85rem + 1px))",
        }}
      />
      {/* 유휴 힌트 - 입력창을 가리지 않도록 바로 아래 작은 글자로, 부드럽게 페이드인/아웃만
          한다(위치 이동 없음). 차콜 카드 톤에 맞춘 절제된 웜그레이를 쓴다. */}
      <p
        className={`mt-2 pl-1 text-xs text-[#a4998a]/85 transition-opacity duration-700 ${showHint ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden={!showHint}
      >
        {idleHintText}
      </p>
    </div>
  );
}

interface PageNavCornerProps {
  step: number;
  totalSteps: number;
  canProceed: boolean;
  onPrev: () => void;
  onNext: () => void;
  onComplete: () => void;
  isCompleteReady: boolean;
  completeLabel: string;
  skipSlot?: ReactNode;
}

// 카드 좌측 하단엔 "이전", 우측 하단엔 "다음 페이지로 →"(마지막 단계는 완료 버튼)를 붙여
// 실제 다이어리 페이지를 넘기는 인상을 준다 - 예전의 알약 모양 그라데이션 버튼
// (WizardStepShell의 WizardNavButtons, 이 컴포넌트가 유일한 소비자였다)은 "떠 있는 앱 UI"
// 느낌이 강해 종이 메타포와 안 어울려서, 종이 위에 옅게 얹힌 텍스트 링크로 대체했다. 손글씨
// 폰트(font-hand)는 카드 톤을 정제하며 함께 걷어냈다 - 내비게이션은 "일기 내용"이 아니라 UI
// 컨트롤이라 앱의 기본 산세리프가 더 어울린다.
function PageNavCorner({ step, totalSteps, canProceed, onPrev, onNext, onComplete, isCompleteReady, completeLabel, skipSlot }: PageNavCornerProps) {
  return (
    <div className="mt-8 flex items-end justify-between">
      <button
        type="button"
        onClick={onPrev}
        disabled={step === 1}
        className={`text-xs text-[#847c70] transition-colors hover:text-[#cfc7b8] ${step === 1 ? "pointer-events-none opacity-0" : ""}`}
      >
        ← 이전
      </button>
      <div className="flex items-center gap-4">
        {skipSlot}
        {step < totalSteps ? (
          <button
            type="button"
            onClick={onNext}
            disabled={!canProceed}
            className="text-sm font-medium text-[#c7bfae] transition-all hover:translate-x-0.5 hover:text-[#e6dfd0] disabled:cursor-not-allowed disabled:opacity-30"
          >
            다음 페이지로 →
          </button>
        ) : (
          <button
            type="button"
            onClick={onComplete}
            disabled={!isCompleteReady}
            className="text-sm font-medium text-[#c7bfae] transition-all hover:translate-x-0.5 hover:text-[#e6dfd0] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {completeLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// 준비 팁(PREP_TIPS) 3개를 화면 하단 여백에 상시 노출한다 - 예전엔 탭해야 여는 팝업이었는데,
// 클릭 없이 항상 보이면 좋겠다는 요청으로 바꿨다. 화면 폭이 넉넉할 때는 이제 SidePrepTips가
// 대신 3개를 한 번에 옆에 늘어놓아 주므로, 이 컴포넌트는 xl 미만(사이드에 둘 여백이 없는
// 좁은 화면)에서만 보인다 - 그때는 여전히 하나씩 부드럽게 크로스페이드하며 순환시킨다(세
// 줄을 한 화면에 다 펼치기엔 좁은 화면에서 공간이 빠듯해서). "너무 작아서 안 보인다"는
// 지적에 따라 글씨 크기(11px -> 14px, placeholder 문구 수준)와 대비(slate-500/80 ->
// slate-400)를 올리고, 이모지에도 옅은 원형 배경을 둘러 텍스트 덩어리가 아니라 정돈된
// 항목처럼 보이게 했다 - 다만 메인 질문 텍스트(카드 안, 훨씬 밝은 크림색)보다는 여전히 옅게
// 남겨 둔다.
function AmbientPrepTips() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % PREP_TIPS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const tip = PREP_TIPS[index];
  return (
    <div className="mt-8 flex justify-center xl:hidden">
      <p key={index} className="flex animate-tip-fade items-center gap-2 text-sm text-slate-400">
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-sm">
          {tip.emoji}
        </span>
        <span>{tip.text}</span>
      </p>
    </div>
  );
}

// 준비 팁 사이드 패널 - 화면 폭이 넉넉할 때(xl 이상, 1280px+)만 렌더한다. 3개를 순환하지
// 않고 한 번에 세로로 늘어놓는다(위 AmbientPrepTips와 달리 옆 여백은 넓어서 다 펼쳐도
// 답답하지 않다).
//
// 처음엔 뷰포트 기준 고정(position: fixed, right-6 등)으로 뒀었는데, 화면 가장자리의 고정
// 좌표라 카드가 스크롤/단계 전환으로 오르내려도 패널은 늘 제자리라 "카드와 무관하게 뚝
// 떨어져 붕 떠 보인다"는 지적을 받았다. 지금은 카드 기준 absolute로 바꿨다 - 부모
// (GuidedEmotionJournal의 최상위 relative 래퍼, 이 컴포넌트 자체의 너비 == 카드 너비)의
// 오른쪽 끝에 정확히 이어 붙이고(left-full + 여백만큼의 ml), 세로 중앙도 뷰포트가 아니라
// 그 래퍼(≈카드) 기준으로 맞춘다 - 스크롤해도 카드와 같이 움직여 항상 같은 상대 위치를
// 지킨다. 카드와 "같은 세트"로 읽히도록 옅은 테두리+배경도 둘러 작은 동반 카드처럼 보이게
// 했다(요청한 "연결선 또는 여백 균형" 중 후자 - 카드에 딱 붙는 여백과 같은 톤의 테두리로
// 연결감을 표현했다).
function SidePrepTips() {
  return (
    <div className="absolute top-1/2 left-full z-[2] ml-6 hidden w-52 -translate-y-1/2 flex-col xl:flex rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      {/* 눈에 잘 안 띈다는 지적을 받은 뒤로도 "그냥 문구 나열"처럼 보인다는 얘기가 이어져,
          Draft Recovery 팝업 등 앱 전역이 이미 쓰는 작은 대문자 이거브로우 라벨 관례를 그대로
          가져왔다 - 팁 목록이 "여기서부터 팁 섹션"이라는 걸 텍스트 없이도 바로 알아보게. */}
      <p className="px-1 text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase">Tip</p>
      <div className="mt-3 flex flex-col gap-4 border-t border-white/[0.06] pt-3">
        {PREP_TIPS.map((tip) => (
          <div key={tip.text} className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-base"
            >
              {tip.emoji}
            </span>
            <span className="pt-1.5 text-sm leading-snug text-slate-400">{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GuidedEmotionJournal({ value, onChange, onComplete, dateLabel }: GuidedEmotionJournalProps) {
  const set = <K extends keyof GuidedEmotionJournalValue>(key: K, next: GuidedEmotionJournalValue[K]) => {
    onChange({ ...value, [key]: next });
  };

  // 1/7단계 감정 선택은 단어와 함께 "실제로 어느 대분류에서 골랐는지"도 같이 저장해야 한다 -
  // 일반 set()은 필드 하나만 바꾸는데, 여기는 단어(initialEmotion/closingEmotion)와 카테고리
  // (initialEmotionCategory/closingEmotionCategory) 두 필드를 항상 함께 바꿔야 해서 전용
  // 핸들러를 둔다.
  const setInitialEmotion = (word: string | null, category: EmotionCategoryKey | null) => {
    onChange({ ...value, initialEmotion: word, initialEmotionCategory: category });
  };
  const setClosingEmotion = (word: string | null, category: EmotionCategoryKey | null) => {
    onChange({ ...value, closingEmotion: word, closingEmotionCategory: category });
  };

  // 준비 안내 화면 - 매번 새 기록을 시작할 때마다(이 컴포넌트가 key로 다시 마운트될 때마다)
  // 항상 먼저 보여준다. 예전엔 localStorage로 "다시 보지 않기"를 영구히 기억했지만, 그
  // 기능은 없앴다 - 대신 작성 도중에는 AmbientPrepTips가 같은 팁을 화면 하단에 상시
  // 노출해줘서 굳이 한 번 본 뒤 영영 숨길 필요가 없다. 한 번 시작하면(showPrep=false) 이전
  // 버튼으로도 다시 돌아오지 않는다 - 진행 단계 카운트(1~7)에도 안 끼워 넣는게 "Step N/7"
  // 표시를 더 단순하고 정확하게 유지한다. 이 준비 화면은 "7개 페이지" 중 하나가 아니라
  // 온보딩이라 노트 페이지 재구성 대상에서 제외했다 - 기존 보라 톤 카드 그대로다.
  const [showPrep, setShowPrep] = useState(true);
  // 서술형 단계(2~6)별 "이미 유휴 힌트를 한 번 보여줬는지" - 각 GuidedTextStep 인스턴스는
  // 단계가 바뀔 때마다 새로 마운트되므로(WizardStepViewport 조건부 렌더) 이 기록은 반드시
  // 부모가 들고 있어야 한 단계당 최대 1회 제한이 실제로 지켜진다.
  const [hintShownSteps, setHintShownSteps] = useState<Set<number>>(new Set());
  const markHintShown = (stepNumber: number) => {
    setHintShownSteps((prev) => {
      if (prev.has(stepNumber)) return prev;
      const next = new Set(prev);
      next.add(stepNumber);
      return next;
    });
  };

  const { step, slideClass, goNext, goPrev } = useWizardStepTransition(TOTAL_STEPS);

  // 감정 선택 단계(1, 7)만 반드시 하나를 골라야 다음으로 넘어간다 - 서술형 단계(2~6)는
  // 강제하지 않는다(아래 건너뛰기 링크 참고).
  const canProceed = step === 1 ? value.initialEmotion !== null : step === TOTAL_STEPS ? value.closingEmotion !== null : true;

  const currentTextValue =
    step === 2
      ? value.triggerEvent
      : step === 3
        ? value.desire
        : step === 4
          ? value.messageToOther
          : step === 5
            ? value.desiredMessage
            : step === 6
              ? value.selfCompassion
              : "";

  // 노트 페이지 카드 뒤 radial glow 색 - 1단계에서 고른 초기 감정 기준으로 한 번만 계산해
  // 2~7단계 전부가 같은 색을 공유한다(1단계 자신은 아직 고르는 중이라 글로우 없이 시작한다).
  // initialEmotionCategory가 있으면(실제로 고른 대분류를 알 때) 그 힌트를 우선한다.
  const glowColor = glowColorForWord(value.initialEmotion, value.initialEmotionCategory);

  // 페이지 넘김 내비게이션 - 7단계 전부 같은 로직(이전/다음/완료/건너뛰기)을 공유하므로 한 번만
  // 만들어서 아래 각 단계의 NotePage 카드 안에 그대로 끼워 넣는다.
  const navElement = (
    <PageNavCorner
      step={step}
      totalSteps={TOTAL_STEPS}
      canProceed={canProceed}
      onPrev={goPrev}
      onNext={() => goNext(canProceed)}
      onComplete={() => onComplete?.()}
      isCompleteReady={canProceed}
      completeLabel="다 적었어요 ✨"
      skipSlot={
        step >= 2 && step <= 6 && currentTextValue.trim() === "" ? (
          <button
            type="button"
            onClick={() => goNext(true)}
            className="text-xs text-[#7d7568] underline-offset-4 transition-colors hover:text-[#b3ab9c] hover:underline"
          >
            건너뛰기
          </button>
        ) : null
      }
    />
  );

  if (showPrep) {
    // 집중 모드가 화면 전체를 세로로도 가운데 두도록 바뀌면서, 이 카드가 그 넓은 공간을 혼자
    // 채워야 하는 첫 화면이 됐다 - 예전보다 한 단계 크게(패딩/폰트/자체 max-width) 잡고,
    // 상단에 숨쉬는 달 아이콘(앰비언트 신호)도 여기부터 이미 보이게 한다(예전엔 이 화면을
    // 지나야만 나타났다).
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-purple-400/20 bg-purple-500/[0.06] p-8 sm:p-10">
        <div className="flex justify-center">
          <span
            aria-hidden
            className="flex h-9 w-9 animate-breathe-slow items-center justify-center rounded-full bg-purple-400/10 text-lg shadow-[0_0_14px_rgba(168,85,247,0.35)]"
          >
            🌙
          </span>
        </div>
        <p className="mt-4 text-center text-lg font-semibold text-purple-200">🕯️ 작성 전에 준비해보세요</p>
        <div className="mt-5 space-y-3">
          {PREP_TIPS.map((tip) => (
            <p key={tip.text} className="flex items-start gap-3 text-sm leading-relaxed text-purple-100/80">
              <span className="text-base">{tip.emoji}</span>
              <span>{tip.text}</span>
            </p>
          ))}
        </div>
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={() => setShowPrep(false)}
            className="rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-[0_0_15px_rgba(147,51,234,0.35)] transition-transform hover:-translate-y-0.5"
          >
            시작하기 →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* relative는 SidePrepTips(absolute, left-full)가 뷰포트가 아니라 이 컴포넌트 자체의
          오른쪽 끝/세로 중앙을 기준으로 카드 옆에 자연스럽게 붙도록 하기 위한 위치 기준점이다. */}
      {/* 상단 진행 표시 - 노트 페이지 카드 바깥의 앱 UI로 남겨 둔다. 몇 번째 페이지인지 같은
          진행 안내는 "페이지 내용"이 아니라 마법사 자체의 부가 정보라, 이번 페이지 카드
          재구성 대상에서 제외했다. */}
      <div>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-500 ease-out"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-end">
          {/* 1단계에서 고른 초기 감정을 그 뒤 단계에서도 계속 보여준다(1단계 본인 화면에서는
              아직 고르는 중이라 생략) - 색 있는 칩 대신 이 구석 텍스트에 자연스럽게 녹여서,
              튀지 않으면서도 "내가 무슨 감정으로 시작했는지" 다시 안 열어봐도 보이게 한다. */}
          <p className="text-xs tracking-wide text-slate-400">
            {step}/{TOTAL_STEPS}
            {step > 1 && value.initialEmotion ? ` · ${value.initialEmotion}` : ""} · {STEP_LABELS[step - 1]}
          </p>
        </div>
      </div>

      <WizardStepViewport slideClass={slideClass}>
        {step === 1 && (
          <NotePage dateLabel={dateLabel} question="지금 기분이 어떤가요?" glowColor={null}>
            <EmotionWordPicker value={value.initialEmotion} selectedCategory={value.initialEmotionCategory ?? null} onChange={setInitialEmotion} />
            {navElement}
          </NotePage>
        )}

        {step === 2 && (
          <NotePage dateLabel={dateLabel} icon="💭" question="무엇 때문에 그런 감정이 들었나요?" glowColor={glowColor}>
            <GuidedTextStep
              value={value.triggerEvent}
              onChange={(next) => set("triggerEvent", next)}
              placeholder="예: 밤늦게까지 미디어를 보다가 마음이 복잡해졌어."
              idleHintText={IDLE_HINT_TEXTS[0]}
              hintAlreadyShown={hintShownSteps.has(2)}
              onHintShown={() => markHintShown(2)}
            />
            {navElement}
          </NotePage>
        )}

        {step === 3 && (
          <NotePage dateLabel={dateLabel} icon="💗" question="그 사람(또는 상황)에게 진짜 바랐던 건 무엇이었을까요?" glowColor={glowColor}>
            <GuidedTextStep
              value={value.desire}
              onChange={(next) => set("desire", next)}
              placeholder="예: 그냥 아무 생각 없이 편해지고 싶었어."
              idleHintText={IDLE_HINT_TEXTS[1]}
              hintAlreadyShown={hintShownSteps.has(3)}
              onHintShown={() => markHintShown(3)}
            />
            {navElement}
          </NotePage>
        )}

        {step === 4 && (
          <NotePage dateLabel={dateLabel} icon="💬" question="그 사람에게(또는 나 자신에게) 하고 싶은 말이 있다면?" glowColor={glowColor}>
            <GuidedTextStep
              value={value.messageToOther}
              onChange={(next) => set("messageToOther", next)}
              placeholder="예: 내일을 위해서 오늘은 일찍 쉬어야겠다."
              idleHintText={IDLE_HINT_TEXTS[2]}
              hintAlreadyShown={hintShownSteps.has(4)}
              onHintShown={() => markHintShown(4)}
            />
            {navElement}
          </NotePage>
        )}

        {step === 5 && (
          <NotePage dateLabel={dateLabel} icon="👂" question="반대로, 그 사람에게 듣고 싶었던 말은 무엇인가요?" glowColor={glowColor}>
            <GuidedTextStep
              value={value.desiredMessage}
              onChange={(next) => set("desiredMessage", next)}
              placeholder="예: 오늘 하루도 애썼어, 잠깐 쉬어가도 괜찮아."
              idleHintText={IDLE_HINT_TEXTS[0]}
              hintAlreadyShown={hintShownSteps.has(5)}
              onHintShown={() => markHintShown(5)}
            />
            {navElement}
          </NotePage>
        )}

        {step === 6 && (
          <NotePage dateLabel={dateLabel} icon="❤️" question="나 자신에게 해주고 싶은 말은?" glowColor={glowColor}>
            <GuidedTextStep
              value={value.selfCompassion}
              onChange={(next) => set("selfCompassion", next)}
              placeholder="예: 많이 힘들었지, 나는 항상 네 편이야."
              idleHintText={IDLE_HINT_TEXTS[1]}
              hintAlreadyShown={hintShownSteps.has(6)}
              onHintShown={() => markHintShown(6)}
            />
            {navElement}
          </NotePage>
        )}

        {step === 7 && (
          <>
            <NotePage dateLabel={dateLabel} question="지금은 기분이 좀 어떤가요?" glowColor={glowColor}>
              <EmotionWordPicker value={value.closingEmotion} selectedCategory={value.closingEmotionCategory ?? null} onChange={setClosingEmotion} />
              {navElement}
            </NotePage>
            {canProceed && (
              <p className="mt-3 text-center text-[11px] text-slate-500">다 적었으면 카드 안의 버튼을 눌러 마무리 단계로 넘어가요.</p>
            )}
          </>
        )}
      </WizardStepViewport>

      <AmbientPrepTips />
      <SidePrepTips />
    </div>
  );
}
