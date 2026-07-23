import type { DreamMood } from "@/api/dream";

export interface MoodOption {
  emoji: string;
  label: string;
  bucket: DreamMood;
}

// 위저드에서 고르는 감정 이모지와, 캘린더 도트 색상에 쓰이는 길몽/보통/악몽 버킷의 매핑.
// 백엔드는 원본 이모지(emotion)만 저장하므로, 버킷은 항상 이 표에서 파생한다.
export const MOOD_OPTIONS: MoodOption[] = [
  { emoji: "😱", label: "무서움", bucket: "nightmare" },
  { emoji: "🤩", label: "신남", bucket: "good" },
  { emoji: "😢", label: "슬픔", bucket: "nightmare" },
  { emoji: "😌", label: "평온", bucket: "good" },
  { emoji: "🤔", label: "혼란", bucket: "neutral" },
];

export function moodBucketForEmoji(emoji: string): DreamMood {
  return MOOD_OPTIONS.find((option) => option.emoji === emoji)?.bucket ?? "neutral";
}
