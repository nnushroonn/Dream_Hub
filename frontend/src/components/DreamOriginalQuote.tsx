"use client";

import { useState } from "react";

interface DreamOriginalQuoteProps {
  content: string;
}

// 해몽 결과(캐러셀) 바로 위에서, 유저가 직접 쓴 꿈 원문을 인용구로 보여준다.
// 기본은 2줄로 접혀 있고, "더보기"를 누르면 전체가 펼쳐진다.
export default function DreamOriginalQuote({ content }: DreamOriginalQuoteProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const trimmed = content.trim();
  if (!trimmed) return null;

  return (
    <div className="mb-4 rounded-r-xl border-l-4 border-purple-500 bg-white/5 p-3 text-sm italic text-slate-300">
      <p className={`whitespace-pre-line transition-all duration-300 ease-in-out ${isExpanded ? "" : "line-clamp-2"}`}>
        {trimmed}
      </p>
      <div className="mt-1 text-right">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="text-[11px] not-italic text-purple-300/70 transition-colors hover:text-purple-200"
        >
          {isExpanded ? "접기 ▲" : "더보기 ▼"}
        </button>
      </div>
    </div>
  );
}
