"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { listDreams } from "@/api/dream";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";
import { useUnsavedChangesStore } from "@/store/useUnsavedChangesStore";
import NotificationBell from "./NotificationBell";
import UnsavedChangesGuardModal from "./UnsavedChangesGuardModal";

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/diary", label: "꿈 기록소" },
  { href: "/journal", label: "나만의 일기장" },
  { href: "/dictionary", label: "꿈해몽 사전" },
  { href: "/community", label: "커뮤니티" },
  { href: "/mypage", label: "마이페이지" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const setSavedDreams = useSavedDreamsStore((state) => state.setEntries);
  const isDirty = useUnsavedChangesStore((state) => state.isDirty);
  const setDirty = useUnsavedChangesStore((state) => state.setDirty);

  // 작성 중인 폼(꿈 기록소 등)이 있는 상태로 헤더 메뉴를 눌렀을 때, 실제 이동 전에
  // 붙잡아 둘 목적지를 잠깐 담아두는 상태 - 커스텀 이탈 방지 모달의 확인 대상이다.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // 어느 화면(홈/꿈 기록소/커뮤니티/마이페이지)으로 들어오든 NavBar는 항상 렌더링되므로,
  // 여기서 로그인한 유저의 실제 꿈 기록을 동기화해 두면 홈 캘린더와 꿈 기록소 캘린더가
  // 항상 같은 savedDreams 전역 상태를 바라보게 된다.
  useEffect(() => {
    if (!isAuthenticated) {
      setSavedDreams([]);
      return;
    }
    listDreams()
      .then(setSavedDreams)
      .catch(() => {});
  }, [isAuthenticated, setSavedDreams]);

  const guardedNavigate = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!isDirty || href === pathname) return;
    event.preventDefault();
    setPendingHref(href);
  };

  const confirmLeave = () => {
    // 실시간 자동 임시 저장 초안은 localStorage에 이미 남아있으므로 여기서는 화면의
    // "작성 중" 플래그만 내려서 이동을 막던 가드를 해제한다 - 데이터 자체는 지우지 않는다.
    setDirty(false);
    const href = pendingHref;
    setPendingHref(null);
    if (href) router.push(href);
  };

  return (
    <header className="sticky top-0 z-10 border-b border-indigo-900/50 bg-[#0b0518]/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" onClick={(event) => guardedNavigate(event, "/")} className="text-lg font-semibold tracking-wide text-indigo-50">
          🌙 Dream Hub
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => guardedNavigate(event, item.href)}
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
              <NotificationBell />
              <span className="hidden text-indigo-300/70 sm:inline">{user.nickname}</span>
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

      <UnsavedChangesGuardModal open={pendingHref !== null} onStay={() => setPendingHref(null)} onLeave={confirmLeave} />
    </header>
  );
}
