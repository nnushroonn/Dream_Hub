import { categoryForWord, EMOTION_CATEGORIES, emotionBadgeStyle, type EmotionCategory, type EmotionCategoryKey } from "@/lib/emotionWordbook";
import type { GuidedEmotionJournalValue } from "@/components/GuidedEmotionJournal";

// 마음 기록장(깊이 모드) 7단계 질문-답변을 한 번 정의해 두 곳에서 재사용한다:
// (1) 일기 상세 페이지의 "마음 기록 전체보기" 아코디언(journal/page.tsx의 EmotionJourneyView,
//     mode="accordion" - 서술형 5개만, 빈 항목은 조용히 숨긴다, 기존 동작 그대로)
// (2) 저장 직후 뜨는 "씨앗 심기 완료" 리캡 화면(mode="recap" - 감정 선택 2개 포함 7개 전부,
//     펼쳐진 상태로, 건너뛴 질문은 "이 질문은 건너뛰었어요"로 담백하게 표시)
// 새로 만들지 않고 같은 렌더링 컴포넌트를 표시 모드만 바꿔 재사용해야 한다는 요구에 따라,
// "질문 목록을 그린다"는 로직 자체를 이 파일 하나로 모았다.
export interface GuidedJournalStep {
  key: keyof GuidedEmotionJournalValue;
  emoji: string;
  question: string;
  kind: "text" | "emotion";
  // kind === "emotion"일 때만 있다 - "실제로 어느 대분류에서 골랐는지" 힌트가 저장된 필드명
  // (initialEmotionCategory/closingEmotionCategory). 같은 단어가 여러 대분류에 겹칠 때
  // (예: "구역질나는") 이 힌트 없이는 정확한 색을 되살릴 수 없다.
  categoryKey?: keyof GuidedEmotionJournalValue;
}

// 이모지는 성장 단계를 은유한다 - 초기 감정/사건=🌿(막 돋아난 새싹), 욕구/표현/듣고싶은말=🌱
// (자라나는 중), 자기위로=❤️(마음을 보듬는 순간), 종료 감정=😇(다 자란 뒤의 평온).
export const GUIDED_JOURNAL_STEPS: GuidedJournalStep[] = [
  { key: "initialEmotion", emoji: "🌿", question: "지금 기분이 어때?", kind: "emotion", categoryKey: "initialEmotionCategory" },
  { key: "triggerEvent", emoji: "🌿", question: "무엇 때문에 그런 감정이 들었나요?", kind: "text" },
  { key: "desire", emoji: "🌱", question: "그 상대(또는 상황)에게 진짜 바랐던 건 무엇이었을까요?", kind: "text" },
  { key: "messageToOther", emoji: "🌱", question: "그 사람에게(또는 나 자신에게) 하고 싶은 말이 있다면?", kind: "text" },
  { key: "desiredMessage", emoji: "🌱", question: "반대로, 그 사람에게 듣고 싶었던 말은?", kind: "text" },
  { key: "selfCompassion", emoji: "❤️", question: "나 자신에게 해주고 싶은 말은?", kind: "text" },
  { key: "closingEmotion", emoji: "😇", question: "지금은 기분이 좀 어떤가요?", kind: "emotion", categoryKey: "closingEmotionCategory" },
];

function chipStyleForWord(word: string, explicitCategory?: EmotionCategoryKey | null): EmotionCategory | null {
  const key = explicitCategory ?? categoryForWord(word);
  return key ? (EMOTION_CATEGORIES.find((category) => category.key === key) ?? null) : null;
}

function EmotionChip({ word, category }: { word: string; category?: EmotionCategoryKey | null }) {
  const badge = emotionBadgeStyle(chipStyleForWord(word, category));
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm ${badge.className}`} style={badge.style}>
      {word}
    </span>
  );
}

interface GuidedJournalRecapListProps {
  data: GuidedEmotionJournalValue;
  // true면 감정 선택 2단계(초기/종료 감정)까지 전부 포함하고, 빈 항목도 "건너뛰었어요"로
  // 표시한다(저장 완료 리캡 화면용). false(기본)면 서술형 5개만, 빈 항목은 조용히 숨긴다
  // (일기 상세 페이지 아코디언의 기존 동작 그대로 - 감정 2개는 그 화면이 이미 별도 칩
  // 헤더로 보여주고 있어 여기서 중복 표시하지 않는다).
  includeEmotions?: boolean;
}

export function GuidedJournalRecapList({ data, includeEmotions = false }: GuidedJournalRecapListProps) {
  const steps = includeEmotions ? GUIDED_JOURNAL_STEPS : GUIDED_JOURNAL_STEPS.filter((step) => step.kind === "text");

  return (
    <div className="space-y-5">
      {steps.map((step) => {
        const rawValue = data[step.key];
        const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
        const isEmpty = !value;
        if (isEmpty && !includeEmotions) return null;
        return (
          <div key={step.key}>
            <p className="flex items-start gap-2 text-sm font-medium text-indigo-200/90">
              <span aria-hidden>{step.emoji}</span>
              <span>{step.question}</span>
            </p>
            <div className="mt-1.5 pl-6">
              {isEmpty ? (
                <p className="text-xs text-slate-400 italic">이 질문은 건너뛰었어요</p>
              ) : step.kind === "emotion" ? (
                <EmotionChip word={value as string} category={step.categoryKey ? (data[step.categoryKey] as EmotionCategoryKey | null) : null} />
              ) : (
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{value}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
