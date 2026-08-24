"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { getMagazineArticle, type MagazineArticleDetail } from "@/api/magazine";
import NavBar from "@/components/NavBar";

function MagazinePostSkeleton() {
  return (
    <div className="mt-10 animate-pulse space-y-4">
      <div className="h-4 w-1/3 rounded bg-white/5" />
      <div className="h-8 w-2/3 rounded bg-white/5" />
      <div className="h-40 w-full rounded bg-white/5" />
    </div>
  );
}

// useSearchParams()는 정적 export 프리렌더링 시 <Suspense>로 감싸지 않으면 빌드가 실패한다
// (Next.js 공식 요구사항) - slug 의존 로직을 이 컴포넌트로 분리해 아래 MagazinePostPage에서
// Suspense 경계 안에 둔다.
function MagazinePostContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");

  const [article, setArticle] = useState<MagazineArticleDetail | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  // "지금 article이 현재 slug의 결과인가"로 로딩 상태를 파생시킨다 - slug가 없는 경우는
  // 애초에 effect가 할 일이 없으므로(원격 조회 자체가 불필요) 렌더 중 바로 판정된다.
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const isLoading = !!slug && loadedSlug !== slug;
  const notFound = !slug || fetchFailed;

  useEffect(() => {
    if (!slug) return;
    let ignore = false;
    getMagazineArticle(slug)
      .then((data) => {
        if (ignore) return;
        setArticle(data);
        setFetchFailed(false);
      })
      .catch(() => {
        if (!ignore) setFetchFailed(true);
      })
      .finally(() => {
        if (!ignore) setLoadedSlug(slug);
      });
    return () => {
      ignore = true;
    };
  }, [slug]);

  if (isLoading) {
    return <MagazinePostSkeleton />;
  }

  if (notFound || !article) {
    return <p className="mt-10 text-center text-sm text-slate-500">글을 찾을 수 없어요.</p>;
  }

  return (
    <article className="mt-8">
      <span className="text-xs font-medium text-violet-300/80">{article.category}</span>
      <h1 className="mt-2 font-serif text-3xl leading-snug text-white sm:text-4xl">{article.title}</h1>
      <p className="mt-3 text-xs text-slate-500">
        {article.author} · {article.created_at.slice(0, 10)} · 조회 {article.view_count.toLocaleString()}
      </p>

      <div className="mt-10 whitespace-pre-line text-base leading-relaxed text-slate-300">{article.content}</div>
    </article>
  );
}

export default function MagazinePostPage() {
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-20">
        <Link href="/magazine" className="text-sm text-violet-300/80 underline-offset-4 hover:underline">
          ← 매거진 목록으로
        </Link>

        <Suspense fallback={<MagazinePostSkeleton />}>
          <MagazinePostContent />
        </Suspense>
      </main>
    </div>
  );
}
