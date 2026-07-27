import type { DreamMood } from "@/api/dream";

export interface MoodOption {
  emoji: string;
  label: string;
  bucket: DreamMood;
}

// 위저드에서 고르는 감정 이모지와, 캘린더 도트 색상에 쓰이는 길몽/보통/악몽 버킷의 매핑.
// 백엔드는 원본 이모지(emotion)만 저장하므로, 버킷은 항상 이 표에서 파생한다.
// 기존 5개는 순서를 그대로 유지한다 - MOOD_OPTIONS[3](평온)을 기본값으로 참조하는 코드가 있다.
export const MOOD_OPTIONS: MoodOption[] = [
  { emoji: "😱", label: "무서움", bucket: "nightmare" },
  { emoji: "🤩", label: "신남", bucket: "good" },
  { emoji: "😢", label: "슬픔", bucket: "nightmare" },
  { emoji: "😌", label: "평온", bucket: "good" },
  { emoji: "🤔", label: "혼란", bucket: "neutral" },
  { emoji: "🥰", label: "행복", bucket: "good" },
  { emoji: "😰", label: "불안", bucket: "nightmare" },
  { emoji: "😠", label: "분노", bucket: "nightmare" },
  { emoji: "🥹", label: "그리움", bucket: "neutral" },
  { emoji: "💓", label: "설렘", bucket: "good" },
  { emoji: "😮", label: "놀라움", bucket: "neutral" },
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
