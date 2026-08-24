"use client";

import { useCallback, useEffect, useState } from "react";

import { getAdminReports, resolveReport, type ReportItem, type ReportStatusFilter } from "@/api/admin";
import AdminGuard from "@/components/AdminGuard";
import AdminNav from "@/components/AdminNav";
import NavBar from "@/components/NavBar";
import Paginator from "@/components/Paginator";

const STATUS_TABS: { value: ReportStatusFilter; label: string }[] = [
  { value: "PENDING", label: "미검토" },
  { value: "RESOLVED", label: "처리 완료" },
  { value: "DISMISSED", label: "기각" },
  { value: "ALL", label: "전체" },
];

function ReportCard({ report, onResolve }: { report: ReportItem; onResolve: (id: number, action: "dismiss" | "delete_content") => void }) {
  const [isBusy, setIsBusy] = useState(false);

  const handle = async (action: "dismiss" | "delete_content") => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await onResolve(report.id, action);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {report.target_type === "POST" ? "💬 자유 광장" : "🔮 무의식 피드"} · #{report.target_id}
        </span>
        <span>{new Date(report.created_at).toLocaleString("ko-KR")}</span>
      </div>

      {report.target_deleted ? (
        <p className="mt-2 text-sm text-slate-500">이미 삭제되었거나 비공개로 전환된 글이에요.</p>
      ) : (
        <div className="mt-2">
          <p className="text-sm font-medium text-white">{report.target_title}</p>
          <p className="mt-1 text-sm text-slate-400">{report.target_preview}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {report.reporter_nickname && <span>신고자: {report.reporter_nickname}</span>}
        {report.reason && <span>사유: {report.reason}</span>}
      </div>

      {report.status === "PENDING" ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => handle("dismiss")}
            className="rounded-full border border-white/10 px-4 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            기각
          </button>
          <button
            type="button"
            disabled={isBusy || report.target_deleted}
            onClick={() => handle("delete_content")}
            className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-300 transition-colors hover:border-rose-400/50 hover:bg-rose-500/20 disabled:opacity-50"
          >
            콘텐츠 내리기
          </button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-500">
          {report.status === "RESOLVED" ? "✅ 처리 완료" : "➖ 기각됨"}
        </p>
      )}
    </div>
  );
}

function AdminReportsContent() {
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAdminReports(statusFilter, page)
      .then((res) => {
        setItems(res.items);
        setTotalPages(res.total_pages);
      })
      .catch(() => setError("신고 목록을 불러오지 못했어요."));
  }, [statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (id: number, action: "dismiss" | "delete_content") => {
    try {
      await resolveReport(id, action);
      load();
    } catch {
      setError("처리에 실패했어요. 다시 시도해 주세요.");
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-xl font-semibold text-white">🚨 신고 관리</h1>
      <p className="mt-1.5 text-sm text-slate-400">커뮤니티에서 접수된 신고를 검토하고 처리하세요.</p>

      <div className="mt-6 flex gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            className={`flex-1 rounded-full py-2.5 text-xs font-medium transition-colors ${
              statusFilter === tab.value ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">해당하는 신고가 없어요.</p>
        ) : (
          items.map((report) => <ReportCard key={report.id} report={report} onResolve={handleResolve} />)
        )}
      </div>

      <Paginator page={page} totalPages={totalPages} onChange={setPage} />
    </main>
  );
}

export default function AdminReportsPage() {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950">
        <NavBar />
        <AdminNav />
        <AdminReportsContent />
      </div>
    </AdminGuard>
  );
}
