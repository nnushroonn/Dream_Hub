"use client";

import { useEffect, useMemo, useState } from "react";

import { getTopCommunityTags, type TagCount } from "@/api/dream";

interface AllTagsModalProps {
  onClose: () => void;
  onSelectTag: (tag: string) => void;
  // 자유 광장(board, 기본값)/꿈 게시판(dream) 중 어느 태그를 검색할지 - 두 탭이 이 모달을 공유한다.
  source?: "board" | "dream";
}

// 상단 필터 바는 "최근 인기 태그" Top 4만 보여주고, 이 모달이 서비스 전체 기간에 걸쳐 쓰인
// 모든 해시태그를 검색할 수 있는 자리를 맡는다 - 열릴 때만 지연 로드한다(?days=0=기간 제한 없음).
export default function AllTagsModal({ onClose, onSelectTag, source = "board" }: AllTagsModalProps) {
  const [tags, setTags] = useState<TagCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getTopCommunityTags({ days: 0, limit: 200, source })
      .then(setTags)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [source]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filteredTags = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return tags;
    return tags.filter((item) => item.tag.toLowerCase().includes(trimmed));
  }, [tags, search]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-purple-500/30 bg-slate-900 p-6 shadow-[0_0_40px_rgba(168,85,247,0.15)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">🏷️ 전체 태그</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-slate-400 transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="태그 검색"
          autoFocus
          className="mt-4 w-full shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-purple-500"
        />

        <div className="mt-4 flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="py-8 text-center text-xs text-slate-500">불러오는 중...</p>
          ) : filteredTags.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              {search ? "일치하는 태그가 없어요." : "아직 등록된 태그가 없어요."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 pb-1">
              {filteredTags.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => onSelectTag(item.tag)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-purple-500/50 hover:bg-purple-600/20 hover:text-purple-200"
                >
                  {item.tag.startsWith("#") ? item.tag : `#${item.tag}`} <span className="text-slate-500">{item.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
