"use client";

import type { TagCount } from "@/api/dream";

const TOP_TAG_DISPLAY_LIMIT = 4;

function toHashtagDisplay(tag: string): string {
  return tag.startsWith("#") ? tag : `#${tag}`;
}

interface CommunityTagFilterBarProps {
  topTags: TagCount[];
  isTagActive: (tag: string) => boolean;
  isAllActive: boolean;
  onSelectAll: () => void;
  onSelectTag: (tag: string) => void;
  onOpenMore: () => void;
}

// 꿈 게시판/자유 게시판이 함께 쓰는 상단 태그 필터 바 - [전체] + 상위 4개 태그만 먼저 보여주고,
// 그 이상은 "+ 태그 더보기"(AllTagsModal)로 넘긴다(칩이 끝없이 늘어나 UI가 지저분해지는 걸 막는다).
export default function CommunityTagFilterBar({
  topTags,
  isTagActive,
  isAllActive,
  onSelectAll,
  onSelectTag,
  onOpenMore,
}: CommunityTagFilterBarProps) {
  return (
    <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto pb-3">
      <button
        type="button"
        onClick={onSelectAll}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
          isAllActive
            ? "border-purple-500 bg-purple-600/30 text-purple-300"
            : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-500/50"
        }`}
      >
        전체
      </button>
      {topTags.slice(0, TOP_TAG_DISPLAY_LIMIT).map((item) => (
        <button
          key={item.tag}
          type="button"
          onClick={() => onSelectTag(item.tag)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
            isTagActive(item.tag)
              ? "border-purple-500 bg-purple-600/30 text-purple-300"
              : "border-white/10 bg-white/5 text-slate-400 hover:border-purple-500/50"
          }`}
        >
          {toHashtagDisplay(item.tag)} <span className="text-slate-500">{item.count}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onOpenMore}
        className="shrink-0 rounded-full border border-dashed border-white/20 bg-white/[0.02] px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-purple-500/50 hover:text-purple-300"
      >
        + 태그 더보기
      </button>
    </div>
  );
}
