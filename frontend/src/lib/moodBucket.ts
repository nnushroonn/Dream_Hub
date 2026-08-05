import type { DreamMood } from "@/api/dream";

export interface MoodOption {
  emoji: string;
  label: string;
  bucket: DreamMood;
}

// 위저드에서 고르는 감정 이모지와, 캘린더 도트 색상에 쓰이는 길몽/보통/악몽 버킷의 매핑.
// 백엔드는 원본 이모지(emotion)만 저장하므로, 버킷은 항상 이 표에서 파생한다. 어떤 코드도
// 더 이상 인덱스로 특정 감정을 기본값 참조하지 않는다(선택 없음이 기본 상태) - 순서는
// 오직 UI 노출 우선순위(체감상 자주 쓰이는 감정을 앞쪽에)로만 정한다.
export const MOOD_OPTIONS: MoodOption[] = [
  { emoji: "😱", label: "무서움", bucket: "nightmare" },
  { emoji: "🤩", label: "신남", bucket: "good" },
  { emoji: "😢", label: "슬픔", bucket: "nightmare" },
  { emoji: "😌", label: "평온", bucket: "good" },
  { emoji: "🤔", label: "혼란", bucket: "neutral" },
  { emoji: "🥰", label: "행복", bucket: "good" },
  { emoji: "😰", label: "불안", bucket: "nightmare" },
  { emoji: "😠", label: "분노", bucket: "nightmare" },
  { emoji: "👁️", label: "생생함", bucket: "neutral" },
  { emoji: "😤", label: "답답함", bucket: "nightmare" },
  { emoji: "💧", label: "찝찝함", bucket: "nightmare" },
  { emoji: "😔", label: "그리움", bucket: "neutral" },
  { emoji: "💓", label: "설렘", bucket: "good" },
  { emoji: "😮", label: "놀라움", bucket: "neutral" },
  { emoji: "🌀", label: "기묘함", bucket: "neutral" },
  { emoji: "🤷", label: "황당함", bucket: "neutral" },
  { emoji: "✨", label: "경이로움", bucket: "good" },
];

export function moodBucketForEmoji(emoji: string): DreamMood {
  return MOOD_OPTIONS.find((option) => option.emoji === emoji)?.bucket ?? "neutral";
}

const BUCKET_TO_EMOJI: Record<DreamMood, string> = {
  good: "🤩",
  neutral: "🤔",
  nightmare: "😱",
};

// 꿈해몽 사전에서 넘어온 상징의 mood(good/neutral/nightmare)를 기록실의 감정 이모지로 되돌린다.
export function emojiForMoodBucket(bucket: DreamMood): string {
  return BUCKET_TO_EMOJI[bucket];
}
