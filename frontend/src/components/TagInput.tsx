"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
}

const DEFAULT_MAX_TAGS = 5;
const MAX_TAG_TOAST_DURATION_MS = 2000;

// AI가 자동으로 붙여주던 해시태그를 대신해, 유저가 직접 타이핑한 태그만 커뮤니티 노출/필터링에
// 쓰인다. Enter 또는 쉼표를 누르면 입력 중이던 텍스트가 칩으로 확정된다.
export default function TagInput({ tags, onChange, maxTags = DEFAULT_MAX_TAGS }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [showMaxToast, setShowMaxToast] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFull = tags.length >= maxTags;

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const commitDraft = () => {
    const value = draft.trim().replace(/^#+/, "");
    setDraft("");
    if (!value) return;
    if (isFull) {
      setShowMaxToast(true);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setShowMaxToast(false), MAX_TAG_TOAST_DURATION_MS);
      return;
    }
    if (tags.includes(value)) return;
    onChange([...tags, value]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
    }
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className="relative mt-3">
      <div
        className={`pointer-events-none absolute -top-9 left-0 z-10 whitespace-nowrap rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-slate-900 shadow-lg transition-opacity duration-300 ${
          showMaxToast ? "opacity-100" : "opacity-0"
        }`}
      >
        태그는 최대 {maxTags}개까지 입력할 수 있어요!
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        {tags.map((tag, index) => (
          <span key={tag} className="bg-slate-800 text-purple-300 px-3 py-1 rounded-full text-sm flex items-center gap-1">
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              aria-label={`${tag} 태그 삭제`}
              className="text-purple-300/70 transition-colors hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          disabled={isFull}
          placeholder={isFull ? "" : `#태그 입력 후 엔터 (최대 ${maxTags}개, 선택)`}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none disabled:cursor-not-allowed"
        />
      </div>
      {isFull && <p className="mt-1 text-[11px] text-amber-400/80">태그는 최대 {maxTags}개까지 등록할 수 있어요.</p>}
    </div>
  );
}
