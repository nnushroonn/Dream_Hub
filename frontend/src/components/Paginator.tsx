"use client";

interface PaginatorProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

type PageToken = number | "ellipsis";

// 페이지가 많아져도 번호가 한 줄을 넘어가지 않도록, 현재 페이지 주변 + 처음/끝만 보여주고
// 나머지는 "…"으로 접는다.
function buildPageWindow(current: number, total: number): PageToken[] {
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);

  const tokens: PageToken[] = [1];
  if (left > 2) tokens.push("ellipsis");
  for (let page = left; page <= right; page++) tokens.push(page);
  if (right < total - 1) tokens.push("ellipsis");
  if (total > 1) tokens.push(total);
  return tokens;
}

export default function Paginator({ page, totalPages, onChange }: PaginatorProps) {
  if (totalPages <= 1) return null;
  const tokens = buildPageWindow(page, totalPages);

  return (
    <nav className="mt-6 flex items-center justify-center gap-1" aria-label="페이지 이동">
      <button
        type="button"
        onClick={() => onChange(Math.max(page - 1, 1))}
        disabled={page === 1}
        aria-label="이전 페이지"
        className="rounded-full px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
      >
        ‹
      </button>

      {tokens.map((token, index) =>
        token === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="px-1.5 text-sm text-slate-600">
            …
          </span>
        ) : (
          <button
            key={token}
            type="button"
            onClick={() => onChange(token)}
            aria-current={token === page ? "page" : undefined}
            className={`min-w-[2.25rem] rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors ${
              token === page ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {token}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(Math.min(page + 1, totalPages))}
        disabled={page === totalPages}
        aria-label="다음 페이지"
        className="rounded-full px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
      >
        ›
      </button>
    </nav>
  );
}
