"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getMagazineArticles, type MagazineArticleSummary } from "@/api/magazine";
import NavBar from "@/components/NavBar";
import Paginator from "@/components/Paginator";

export default function MagazinePage() {
  const [items, setItems] = useState<MagazineArticleSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // "로딩 중"을 별도 불리언으로 들지 않고, items가 지금 page의 결과인지로 파생시킨다 -
  // page가 바뀌면 loadedPage와 어긋나 자동으로 로딩 상태가 되고, fetch가 끝나면(성공/실패
  // 상관없이) loadedPage가 page를 따라잡아 자동으로 풀린다.
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const isLoading = loadedPage !== page;

  useEffect(() => {
    let ignore = false;
    getMagazineArticles({ page })
      .then((res) => {
        if (ignore) return;
        setItems(res.items);
        setTotalPages(res.total_pages);
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoadedPage(page);
      });
    return () => {
      ignore = true;
    };
  }, [page]);

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-20">
        <p className="text-xs font-semibold tracking-[0.3em] text-indigo-300/70 uppercase">Dream Hub Magazine</p>
        <h1 className="mt-4 font-serif text-3xl text-white sm:text-4xl">드림허브 매거진</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          꿈 심리학과 상징 해설을 다루는 Dream Hub 편집팀의 글 모음입니다.
        </p>

        <div className="mt-12 divide-y divide-white/5">
          {isLoading
            ? Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-24 animate-pulse py-6">
                  <div className="h-4 w-2/3 rounded bg-white/5" />
                </div>
              ))
            : items.map((article) => (
                <Link key={article.id} href={`/magazine/post?slug=${article.slug}`} className="block py-6 transition-colors hover:bg-white/[0.02]">
                  <span className="text-xs font-medium text-violet-300/80">{article.category}</span>
                  <h2 className="mt-1.5 text-lg font-semibold text-white">{article.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{article.excerpt}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {article.author} · {article.created_at.slice(0, 10)}
                  </p>
                </Link>
              ))}

          {!isLoading && items.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">아직 등록된 글이 없어요.</p>
          )}
        </div>

        <Paginator page={page} totalPages={totalPages} onChange={setPage} />
      </main>
    </div>
  );
}
