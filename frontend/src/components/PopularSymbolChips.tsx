"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getSearchTrendRanking, type SearchTrendRankingItem } from "@/api/dream";

const CHIP_LIMIT = 5;

// 우측 세로 랭킹 위젯이 메인 폼과 레이아웃 충돌을 일으켜 제거하고, 같은 인기 검색어 데이터를
// 훨씬 가벼운 가로 태그 칩으로 간소화했다 - 순위 숫자·변동 뱃지 없이 키워드 숏컷만 남긴다.
// 자주 찾는 꿈 상징 원형 아이콘 숏컷과 기능이 겹쳐, 그 자리를 이 실시간 칩이 대신한다.
export default function PopularSymbolChips() {
  const router = useRouter();
  const [items, setItems] = useState<SearchTrendRankingItem[]>([]);

  useEffect(() => {
    getSearchTrendRanking("daily")
      .then((data) => setItems(data.slice(0, CHIP_LIMIT)))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
      <span className="font-semibold text-slate-300">🔥 인기 상징</span>
      {items.map((item) => (
        <button
          key={item.keyword}
          type="button"
          onClick={() => router.push(`/dictionary?search=${encodeURIComponent(item.keyword)}`)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300 transition-colors hover:border-purple-400/40 hover:bg-purple-500/10 hover:text-purple-200"
        >
          #{item.keyword}
        </button>
      ))}
    </div>
  );
}
