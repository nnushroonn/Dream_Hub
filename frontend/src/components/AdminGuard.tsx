"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { useAuthStore } from "@/store/useAuthStore";

interface AdminGuardProps {
  children: ReactNode;
}

// /admin 아래 모든 화면이 공유하는 접근 가드 - 실제 권한 검증은 언제나 백엔드
// (get_current_admin_user)가 다시 하므로, 이건 어디까지나 UI 분기다(비관리자에게 화면
// 자체를 안 그려 보여주는 정도). AuthHydrator가 GET /auth/me를 마치기 전까지는 다른
// 인증 게이트(PreviewGateway 등)와 동일하게 isAuthenticated가 잠깐 false로 보일 수 있다 -
// 이 프로젝트의 기존 관례대로 별도 로딩 상태 없이 짧은 깜빡임을 그대로 받아들인다.
export default function AdminGuard({ children }: AdminGuardProps) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated || !user?.is_admin) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-950 px-4 py-24 text-slate-100">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-3xl">🔒</p>
          <h1 className="mt-3 text-lg font-semibold text-white">관리자만 볼 수 있어요</h1>
          <p className="mt-2 text-sm text-slate-400">
            이 화면은 관리자 계정으로 로그인해야 접근할 수 있습니다.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-indigo-500/90 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
