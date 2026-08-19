"use client";

import type { CommunityPeriod, CommunitySort } from "@/api/dream";

const SORT_OPTIONS: { value: CommunitySort; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "likes", label: "공감순" },
  { value: "views", label: "조회순" },
];

const PERIOD_OPTIONS: { value: CommunityPeriod; label: string }[] = [
  { value: "weekly", label: "주간" },
  { value: "monthly", label: "월간" },
  { value: "all", label: "역대" },
];

interface CommunitySortChipsProps {
  sort: CommunitySort;
  onSortChange: (value: CommunitySort) => void;
  period: CommunityPeriod;
  onPeriodChange: (value: CommunityPeriod) => void;
}

// 꿈 게시판/자유 게시판이 함께 쓰는 정렬 토글 - 공감순/조회순을 고르면 그 아래로 기간 서브
// 필터가 나타난다(기본값 주간). 최신순으로 돌아가면 기간 필터는 다시 숨겨진다.
export default function CommunitySortChips({ sort, onSortChange, period, onPeriodChange }: CommunitySortChipsProps) {
  return (
    <div className="mt-3 flex flex-col items-end gap-2">
      <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSortChange(option.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              sort === option.value ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {sort !== "latest" && (
        <div className="flex gap-1.5">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onPeriodChange(option.value)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                period === option.value
                  ? "border-purple-500 bg-purple-600/30 text-purple-300"
                  : "border-white/10 bg-white/5 text-slate-500 hover:border-purple-500/40"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
