"use client";

import { useState, type KeyboardEvent } from "react";

import { MOOD_OPTIONS } from "@/lib/moodBucket";

const CUSTOM_MOOD_MAX_LENGTH = 10;

interface MoodTagGridProps {
  mood: string;
  onMoodChange: (mood: string) => void;
}

const CHIP_BASE =
  "flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs backdrop-blur-md transition-all duration-200";

function chipClass(selected: boolean): string {
  return `${CHIP_BASE} ${
    selected
      ? "border-violet-400/70 bg-violet-500/25 text-white shadow-[0_0_16px_rgba(167,139,250,0.35)]"
      : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/30 hover:text-slate-200"
  }`;
}

// "30초 미니멀 빠른 기록"과 "7단계 정밀 분석 기록" 두 탭이 예전엔 감정 태그 그리드를 각자
// 따로 구현했다 - 정밀 탭 쪽은 4열 고정 + 큰 폰트(text-sm) + line-clamp-2 조합이라, 미니멀
// 탭에선 멀쩡하던 "생생함" 같은 두 글자 라벨도 셀 너비가 부족해 글자가 세로로 쪼개지고,
// "기타 (직접 입력)"은 아예 읽을 수 없는 상태가 됐다. 이제 두 탭 모두 이 컴포넌트 하나만
// 쓴다 - 열 개수/셀 크기/폰트가 탭 전환과 무관하게 항상 동일하다.
export default function MoodTagGrid({ mood, onMoodChange }: MoodTagGridProps) {
  // 커스텀(직접 입력) 라벨은 mood와 별개로 기억해 둔다 - 프리셋 감정을 눌러봤다가 다시
  // 커스텀으로 돌아와도 이미 적었던 문구가 사라지지 않게 하기 위함.
  const [customLabel, setCustomLabel] = useState(() =>
    mood && !MOOD_OPTIONS.some((option) => option.emoji === mood) ? mood : ""
  );
  const [isEntering, setIsEntering] = useState(false);
  const [draft, setDraft] = useState("");
  const isCustomSelected = customLabel !== "" && mood === customLabel;

  const commit = () => {
    const trimmed = draft.trim().slice(0, CUSTOM_MOOD_MAX_LENGTH);
    if (trimmed) {
      setCustomLabel(trimmed);
      onMoodChange(trimmed);
    }
    setIsEntering(false);
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      setIsEntering(false);
      setDraft("");
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {MOOD_OPTIONS.map((option) => (
        <button key={option.emoji} type="button" onClick={() => onMoodChange(option.emoji)} className={chipClass(mood === option.emoji)}>
          <span className="shrink-0 text-sm">{option.emoji}</span>
          <span className="truncate">{option.label}</span>
        </button>
      ))}

      {isEntering ? (
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          maxLength={CUSTOM_MOOD_MAX_LENGTH}
          autoFocus
          placeholder="직접 입력"
          className={`${CHIP_BASE} border-violet-400/60 bg-violet-950/30 text-center text-white placeholder:text-slate-500 focus:outline-none`}
        />
      ) : customLabel ? (
        <button type="button" onClick={() => onMoodChange(customLabel)} title={customLabel} className={chipClass(isCustomSelected)}>
          <span className="shrink-0 text-sm">✏️</span>
          <span className="truncate">{customLabel}</span>
        </button>
      ) : (
        // "기타(직접입력)"은 한 줄로는 어느 폭에서도 빠듯하다 - 처음부터 두 줄(주요 라벨
        // "기타" + 작은 보조 텍스트 "직접입력")로 나눠 애초에 잘릴 여지를 없앤다.
        <button
          type="button"
          onClick={() => setIsEntering(true)}
          className={`flex min-w-0 flex-col items-center justify-center gap-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-400 backdrop-blur-md transition-all duration-200 hover:border-violet-400/30 hover:text-slate-200`}
        >
          <span className="flex items-center gap-1 text-xs">
            <span className="text-sm">✍️</span>기타
          </span>
          <span className="text-[9px] leading-tight text-slate-500">직접입력</span>
        </button>
      )}
    </div>
  );
}
