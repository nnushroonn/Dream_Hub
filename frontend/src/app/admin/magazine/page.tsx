"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { deleteMagazineArticle, getAdminMagazineList } from "@/api/admin";
import type { MagazineArticleSummary } from "@/api/magazine";
import AdminGuard from "@/components/AdminGuard";
import AdminNav from "@/components/AdminNav";
import NavBar from "@/components/NavBar";

function AdminMagazineContent() {
  const [items, setItems] = useState<MagazineArticleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAdminMagazineList()
      .then((res) => setItems(res.items))
      .catch(() => setError("목록을 불러오지 못했어요."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`"${title}" 글을 삭제할까요?`)) return;
    try {
      await deleteMagazineArticle(id);
      load();
    } catch {
      setError("삭제에 실패했어요.");
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">📰 매거진 관리</h1>
          <p className="mt-1.5 text-sm text-slate-400">Dream Hub 에디토리얼 콘텐츠를 작성하고 관리하세요.</p>
        </div>
        <Link
          href="/admin/magazine/write"
          className="shrink-0 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
        >
          + 새 글
        </Link>
      </div>

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

      <div className="mt-6 space-y-2">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">아직 등록된 글이 없어요.</p>
        ) : (
          items.map((article) => (
            <div
              key={article.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{article.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {article.category} · 조회 {article.view_count.toLocaleString("ko-KR")} ·{" "}
                  {new Date(article.created_at).toLocaleDateString("ko-KR")}
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <Link
                  href={`/admin/magazine/write?id=${article.id}`}
                  className="text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline"
                >
                  수정
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(article.id, article.title)}
                  className="text-xs text-rose-400 underline-offset-2 hover:text-rose-300 hover:underline"
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}

export default function AdminMagazinePage() {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950">
        <NavBar />
        <AdminNav />
        <AdminMagazineContent />
      </div>
    </AdminGuard>
  );
}
