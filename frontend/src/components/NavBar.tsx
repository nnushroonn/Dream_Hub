"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuthStore } from "@/store/useAuthStore";

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/diary", label: "꿈 기록소" },
  { href: "/community", label: "커뮤니티" },
  { href: "/mypage", label: "마이페이지" },
];

export default function NavBar() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();

  return (
    <header className="sticky top-0 z-10 border-b border-indigo-900/50 bg-[#0b0518]/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-wide text-indigo-50">
          🌙 Dream Hub
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                pathname === item.href
                  ? "bg-indigo-500/20 text-indigo-100"
                  : "text-indigo-300/70 hover:text-indigo-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          {isAuthenticated && user ? (
            <>
              <span className="hidden text-indigo-300/70 sm:inline">{user.email}</span>
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-indigo-800 px-3 py-1.5 text-indigo-200 transition-colors hover:bg-indigo-900/40"
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-indigo-500/90 px-3 py-1.5 text-white transition-colors hover:bg-indigo-400"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
