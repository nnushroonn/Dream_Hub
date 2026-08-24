"use client";

import { useCallback, useEffect, useState } from "react";

import {
  deleteAdminUser,
  forceChangeNickname,
  getAdminUsers,
  toggleSuspendUser,
  type AdminUserItem,
} from "@/api/admin";
import AdminGuard from "@/components/AdminGuard";
import AdminNav from "@/components/AdminNav";
import NavBar from "@/components/NavBar";
import Paginator from "@/components/Paginator";

function NicknameEditRow({ user, onSaved }: { user: AdminUserItem; onSaved: () => void }) {
  const [value, setValue] = useState(user.nickname);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="text-left text-sm font-medium text-white transition-colors hover:text-indigo-300"
      >
        {user.nickname}
      </button>
    );
  }

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === user.nickname) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await forceChangeNickname(user.id, trimmed);
      setIsEditing(false);
      onSaved();
    } catch {
      setError("변경 실패(중복된 닉네임일 수 있어요)");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={isSaving}
        className="w-28 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-indigo-400/60"
      />
      <button type="button" onClick={save} disabled={isSaving} className="text-xs text-indigo-300 hover:text-indigo-200">
        저장
      </button>
      <button type="button" onClick={() => setIsEditing(false)} className="text-xs text-slate-500 hover:text-slate-300">
        취소
      </button>
      {error && <span className="text-[11px] text-rose-400">{error}</span>}
    </div>
  );
}

function AdminUsersContent() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAdminUsers(search, page)
      .then((res) => {
        setItems(res.items);
        setTotalPages(res.total_pages);
        setTotalCount(res.total_count);
      })
      .catch(() => setError("유저 목록을 불러오지 못했어요."));
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSuspend = async (id: number) => {
    try {
      await toggleSuspendUser(id);
      load();
    } catch {
      setError("처리에 실패했어요.");
    }
  };

  const handleDelete = async (id: number, nickname: string) => {
    if (!window.confirm(`정말 "${nickname}" 계정을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteAdminUser(id);
      load();
    } catch {
      setError("삭제에 실패했어요.");
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-xl font-semibold text-white">👤 유저 관리</h1>
      <p className="mt-1.5 text-sm text-slate-400">전체 {totalCount.toLocaleString("ko-KR")}명</p>

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="이메일 또는 닉네임 검색"
        className="mt-6 w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-400/60"
      />

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-slate-500">
              <th className="py-2 pr-3 font-medium">닉네임</th>
              <th className="py-2 pr-3 font-medium">이메일</th>
              <th className="py-2 pr-3 font-medium">가입일</th>
              <th className="py-2 pr-3 font-medium">상태</th>
              <th className="py-2 pr-3 font-medium">조치</th>
            </tr>
          </thead>
          <tbody>
            {items.map((user) => (
              <tr key={user.id} className="border-b border-white/5">
                <td className="py-3 pr-3">
                  <NicknameEditRow user={user} onSaved={load} />
                </td>
                <td className="py-3 pr-3 text-slate-400">{user.email}</td>
                <td className="py-3 pr-3 text-slate-500">{new Date(user.created_at).toLocaleDateString("ko-KR")}</td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {user.is_admin && (
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-300">관리자</span>
                    )}
                    {!user.is_verified && (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">미인증</span>
                    )}
                    {user.is_suspended && (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300">정지됨</span>
                    )}
                  </div>
                </td>
                <td className="py-3 pr-3">
                  {user.is_admin ? (
                    <span className="text-xs text-slate-600">-</span>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleSuspend(user.id)}
                        className="text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline"
                      >
                        {user.is_suspended ? "정지 해제" : "정지"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(user.id, user.nickname)}
                        className="text-xs text-rose-400 underline-offset-2 hover:text-rose-300 hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="py-12 text-center text-sm text-slate-500">검색 결과가 없어요.</p>}
      </div>

      <Paginator page={page} totalPages={totalPages} onChange={setPage} />
    </main>
  );
}

export default function AdminUsersPage() {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950">
        <NavBar />
        <AdminNav />
        <AdminUsersContent />
      </div>
    </AdminGuard>
  );
}
