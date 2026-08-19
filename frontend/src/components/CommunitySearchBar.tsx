"use client";

import type { FormEvent } from "react";

import type { CommunitySearchType } from "@/api/dream";

const SEARCH_TYPE_OPTIONS: { value: CommunitySearchType; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "title", label: "제목" },
  { value: "hashtag", label: "해시태그" },
  { value: "author", label: "작성자" },
];

interface CommunitySearchBarProps {
  searchType: CommunitySearchType;
  onSearchTypeChange: (value: CommunitySearchType) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

// 꿈 게시판/자유 게시판이 함께 쓰는 검색 바 - 드롭다운(전체/제목/해시태그/작성자)과 입력창이
// 하나로 결합된 형태. focus-within으로 인풋에 포커스가 가면 바 전체에 보라색 글로우가 뜬다.
export default function CommunitySearchBar({
  searchType,
  onSearchTypeChange,
  keyword,
  onKeywordChange,
  onSubmit,
}: CommunitySearchBarProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex items-stretch overflow-hidden rounded-xl border border-slate-700 bg-slate-900 transition-shadow focus-within:border-purple-500 focus-within:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]"
    >
      <select
        value={searchType}
        onChange={(event) => onSearchTypeChange(event.target.value as CommunitySearchType)}
        className="shrink-0 border-r border-slate-700 bg-transparent px-3 text-xs text-slate-300 outline-none"
      >
        {SEARCH_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} className="bg-slate-900">
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={keyword}
        onChange={(event) => onKeywordChange(event.target.value)}
        placeholder="검색어를 입력하세요"
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none"
      />
      <button
        type="submit"
        className="shrink-0 px-4 text-sm font-medium text-purple-300 transition-colors hover:text-purple-200"
      >
        검색
      </button>
    </form>
  );
}
