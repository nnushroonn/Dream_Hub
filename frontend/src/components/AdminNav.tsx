"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "📊 대시보드" },
  { href: "/admin/reports", label: "🚨 신고 관리" },
  { href: "/admin/users", label: "👤 유저 관리" },
  { href: "/admin/magazine", label: "📰 매거진 관리" },
];

// /admin 아래 화면들이 공유하는 상단 서브 내비게이션. 일반 NavBar와 별개로, 관리자 화면
// 안에서만 보인다(각 페이지가 <NavBar /><AdminNav /> 순서로 함께 둔다).
export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-white/5 bg-slate-950/60">
      <div className="mx-auto flex max-w-5xl flex-nowrap items-center gap-1 overflow-x-auto px-4 py-3 no-scrollbar sm:px-6">
        {ADMIN_NAV_ITEMS.map((item) => {
          // "/admin"은 정확히 일치할 때만, 하위 경로들은 접두사 일치로 활성 표시한다
          // (예: /admin/magazine/write도 "매거진 관리" 탭이 켜져 있어야 자연스럽다).
          const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-indigo-500/20 text-indigo-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
