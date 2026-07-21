"use client";

import { useEffect, useMemo, useState } from "react";

import { getCommunityFeed, getCommunityKeywords, type CommunityEntry } from "@/api/dream";
import NavBar from "@/components/NavBar";

export default function CommunityPage() {
  const [entries, setEntries] = useState<CommunityEntry[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);

  useEffect(() => {
    getCommunityFeed().then(setEntries).catch(() => {});
    getCommunityKeywords().then(setKeywords).catch(() => {});
  }, []);

  const filteredEntries = useMemo(() => {
    if (!activeKeyword) return entries;
    return entries.filter((entry) => entry.keywords.includes(activeKeyword));
  }, [entries, activeKeyword]);

  const toggleEmpathy = (entryId: number) => {
    // TODO: 실제 구현 시 POST /community/entries/{id}/empathy 호출 후 상태 갱신
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              is_liked_by_me: !entry.is_liked_by_me,
              empathy_count: entry.empathy_count + (entry.is_liked_by_me ? -1 : 1),
            }
          : entry
      )
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0518] via-[#170b2e] to-black text-indigo-50">
      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">커뮤니티</h1>
        <p className="mt-1 text-sm text-indigo-300/70">다른 사람들의 꿈을 둘러보고 공감을 나눠보세요.</p>

        {/* 키워드 필터링 */}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveKeyword(null)}
            className={`rounded-full px-3 py-1.5 text-xs ${
              activeKeyword === null ? "bg-violet-600 text-white" : "bg-indigo-950/60 text-indigo-300"
            }`}
          >
            전체
          </button>
          {keywords.map((keyword) => (
            <button
              key={keyword}
              type="button"
              onClick={() => setActiveKeyword(keyword)}
              className={`rounded-full px-3 py-1.5 text-xs ${
                activeKeyword === keyword ? "bg-violet-600 text-white" : "bg-indigo-950/60 text-indigo-300"
              }`}
            >
              #{keyword}
            </button>
          ))}
        </div>

        {/* 공개된 꿈 피드 */}
        <div className="mt-8 space-y-4">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-indigo-900/60 bg-indigo-950/30 p-5">
              <div className="flex items-center justify-between text-sm text-indigo-400">
                <span>{entry.author_email}</span>
                <span>{entry.emotion}</span>
              </div>
              <p className="mt-2 text-indigo-100">{entry.content}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {entry.keywords.map((keyword) => (
                  <span key={keyword} className="text-xs text-violet-300">
                    #{keyword}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => toggleEmpathy(entry.id)}
                className={`mt-4 rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  entry.is_liked_by_me
                    ? "border-violet-500 bg-violet-600/30 text-violet-200"
                    : "border-indigo-800 text-indigo-300 hover:bg-indigo-900/40"
                }`}
              >
                🙋 저도 이런 꿈 꾼 적 있어요 ({entry.empathy_count})
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
