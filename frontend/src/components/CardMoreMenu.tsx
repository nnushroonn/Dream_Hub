"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";

interface CardMoreMenuProps {
  onEdit: () => void;
  onDelete: () => void;
  // 무의식 광장 글쓰기로 이 기록을 미리 선택해 넘기는 진입점 - 없으면 메뉴에서 아예 숨긴다
  // (예: 아직 비공개 상태가 아니거나 공유가 의미 없는 카드).
  onShare?: () => void;
}

// 카드 우측 상단의 미세한 "⋯" 더보기 컨트롤러 - NotificationBell과 같은 패턴(ref + mousedown
// 바깥 클릭 감지)으로 바깥을 누르면 닫힌다. 일기/꿈 카드 양쪽 캐러셀이 공유한다.
export default function CardMoreMenu({ onEdit, onDelete, onShare }: CardMoreMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-label="더보기 메뉴 (수정 · 삭제)"
        title="수정 · 삭제"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div role="menu" className="absolute right-0 top-7 z-30 w-32 overflow-hidden rounded-xl border border-white/10 bg-slate-900 py-1 shadow-xl">
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              setIsOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-white/[0.06]"
          >
            <Pencil className="h-3.5 w-3.5" /> 수정하기
          </button>
          {onShare && (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setIsOpen(false);
                onShare();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-white/[0.06]"
            >
              <Share2 className="h-3.5 w-3.5" /> 공유하기
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              setIsOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-300 transition-colors hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> 삭제하기
          </button>
        </div>
      )}
    </div>
  );
}
