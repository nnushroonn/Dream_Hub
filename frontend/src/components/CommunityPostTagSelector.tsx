"use client";

import { COMMUNITY_FREQUENCY_TAGS } from "@/lib/dreamSeeds";

interface CommunityPostTagSelectorProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

// ?template=galaxy 글쓰기 전용 - 발행할 글에 붙일 주파수 태그(단일 선택, 필수)를 고른다.
// 여기서 고른 슬러그가 곧 CommunityPost.public_tags로 저장되고, 커뮤니티 헤더의 주파수
// 필터(?tag=)는 오직 이 값만 조회한다.
export default function CommunityPostTagSelector({ value, onChange }: CommunityPostTagSelectorProps) {
  const selected = value[0] ?? null;

  return (
    <div className="mt-4">
      <p className="text-xs text-purple-300/80">
        이 글을 어떤 주파수로 내보낼까요? <span className="text-red-300">*필수</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {COMMUNITY_FREQUENCY_TAGS.map((freq) => (
          <button
            key={freq.slug}
            type="button"
            onClick={() => onChange([freq.slug])}
            className={`rounded-full border px-3 py-1.5 text-xs transition-all duration-200 ${
              selected === freq.slug
                ? "border-purple-400/70 bg-purple-500/25 text-white"
                : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-400/30 hover:text-slate-200"
            }`}
          >
            {freq.label}
          </button>
        ))}
      </div>
    </div>
  );
}
