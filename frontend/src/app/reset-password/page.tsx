"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getAuthErrorMessage, resetPassword } from "@/api/auth";

type ResetStatus = "form" | "submitting" | "success" | "error";

// /verify 페이지(이메일 인증)와 같은 셸을 쓰지만, 여긴 토큰 확인만으로 끝나지 않고 새
// 비밀번호를 직접 입력받아야 해서 상태 하나("loading")가 아니라 폼("form") 단계가 필요하다.
function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<ResetStatus>(token ? "form" : "error");
  const [message, setMessage] = useState(token ? "" : "재설정 링크가 올바르지 않습니다. 이메일의 링크를 다시 확인해 주세요.");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setFormError(null);

    if (newPassword !== newPasswordConfirm) {
      setFormError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setStatus("submitting");
    try {
      const res = await resetPassword(token, newPassword, newPasswordConfirm);
      setStatus("success");
      setMessage(res.message);
      setTimeout(() => router.push("/"), 2500);
    } catch (err) {
      setStatus("error");
      setMessage(getAuthErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {(status === "form" || status === "submitting") && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">새 비밀번호 설정</h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">새로 사용할 비밀번호를 입력해 주세요.</p>
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 text-left">
              <div>
                <label htmlFor="reset-new-password" className="text-xs text-zinc-500 dark:text-zinc-400">
                  새 비밀번호
                </label>
                <input
                  id="reset-new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="영문+숫자 포함 8자 이상"
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>
              <div>
                <label htmlFor="reset-new-password-confirm" className="text-xs text-zinc-500 dark:text-zinc-400">
                  새 비밀번호 확인
                </label>
                <input
                  id="reset-new-password-confirm"
                  type="password"
                  required
                  value={newPasswordConfirm}
                  onChange={(event) => setNewPasswordConfirm(event.target.value)}
                  placeholder="한 번 더 입력해 주세요"
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>
              {formError && <p className="text-sm text-rose-600 dark:text-rose-400">{formError}</p>}
              <button
                type="submit"
                disabled={status === "submitting"}
                className="mt-2 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "submitting" ? "변경하는 중..." : "비밀번호 변경"}
              </button>
            </form>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">비밀번호 변경 완료</h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
            <p className="mt-1 text-xs text-zinc-400">잠시 후 홈 화면으로 이동합니다.</p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">링크를 사용할 수 없어요</h1>
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{message}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
