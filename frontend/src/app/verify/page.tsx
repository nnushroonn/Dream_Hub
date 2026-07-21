"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getAuthErrorMessage, verifyEmail } from "@/api/auth";

type VerifyStatus = "loading" | "success" | "error";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<VerifyStatus>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("인증 토큰이 없습니다. 이메일의 링크를 다시 확인해 주세요.");
      return;
    }

    verifyEmail(token)
      .then((res) => {
        setStatus("success");
        setMessage(res.message);
        setTimeout(() => router.push("/"), 2000);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(getAuthErrorMessage(err));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {status === "loading" && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">이메일 인증을 확인하는 중입니다...</p>
        )}

        {status === "success" && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">인증 완료</h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
            <p className="mt-1 text-xs text-zinc-400">잠시 후 로그인 화면으로 이동합니다.</p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">인증 실패</h1>
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{message}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
