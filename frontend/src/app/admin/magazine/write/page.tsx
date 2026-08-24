"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createMagazineArticle, getAdminMagazineArticle, updateMagazineArticle } from "@/api/admin";
import AdminGuard from "@/components/AdminGuard";
import AdminNav from "@/components/AdminNav";
import NavBar from "@/components/NavBar";

const CATEGORY_SUGGESTIONS = ["꿈 심리학", "꿈 상징", "수면 과학", "자기계발"];

// slug를 제목에서 대충 미리 채워준다 - 한글은 어차피 영문 slug로 못 옮기니(별도 로마자 변환
// 라이브러리를 새로 들이지 않는다) 영문/숫자만 남기고, 결과가 비면(제목이 순한글) 관리자가
// 직접 채우게 자리만 비워 둔다. 최종 값은 항상 직접 검토/수정 가능하다.
function slugifyGuess(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// 정적 export라 동적 라우트 세그먼트를 못 쓴다 - 기존 컨벤션(/community/post?id=...)과
// 동일하게 ?id=로 수정 대상을 넘긴다. id가 없으면 새 글 작성 모드.
function useArticleId(): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("id");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location(외부 시스템) 파싱 결과에 반응
    setId(raw ? Number(raw) : null);
  }, []);
  return id;
}

function AdminMagazineWriteContent() {
  const router = useRouter();
  const articleId = useArticleId();
  const isEditMode = articleId !== null;

  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState(CATEGORY_SUGGESTIONS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (articleId === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- articleId(URL 쿼리스트링, 외부 시스템) 변경에 반응
    setIsLoading(true);
    getAdminMagazineArticle(articleId)
      .then((article) => {
        setSlug(article.slug);
        setSlugTouched(true);
        setTitle(article.title);
        setExcerpt(article.excerpt);
        setContent(article.content);
        setCategory(article.category);
      })
      .catch(() => setError("글을 불러오지 못했어요."))
      .finally(() => setIsLoading(false));
  }, [articleId]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(slugifyGuess(value));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    const trimmedSlug = slug.trim();
    if (!trimmedSlug || !title.trim() || !excerpt.trim() || !content.trim()) {
      setError("모든 필드를 채워주세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = { slug: trimmedSlug, title: title.trim(), excerpt: excerpt.trim(), content, category };
      if (isEditMode && articleId !== null) {
        await updateMagazineArticle(articleId, payload);
      } else {
        await createMagazineArticle(payload);
      }
      router.push("/admin/magazine");
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "저장에 실패했어요.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-xl font-semibold text-white">{isEditMode ? "📝 매거진 글 수정" : "📝 새 매거진 글"}</h1>

      {isLoading ? (
        <p className="mt-8 text-center text-sm text-slate-500">불러오는 중...</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-indigo-300/70">제목</label>
            <input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-400/60"
            />
          </div>

          <div>
            <label className="text-xs text-indigo-300/70">slug (URL에 쓰일 영문/숫자/하이픈)</label>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              required
              pattern="[-a-z0-9]+"
              placeholder="예: dream-of-flying"
              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-400/60"
            />
          </div>

          <div>
            <label className="text-xs text-indigo-300/70">카테고리</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="magazine-category-suggestions"
              required
              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-400/60"
            />
            <datalist id="magazine-category-suggestions">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="text-xs text-indigo-300/70">목록 카드용 한 줄 요약</label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              required
              maxLength={300}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-400/60"
            />
          </div>

          <div>
            <label className="text-xs text-indigo-300/70">본문</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={16}
              className="mt-1.5 w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-white outline-none focus:border-violet-400/60"
            />
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : isEditMode ? "수정 저장" : "발행하기"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

export default function AdminMagazineWritePage() {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950">
        <NavBar />
        <AdminNav />
        <AdminMagazineWriteContent />
      </div>
    </AdminGuard>
  );
}
