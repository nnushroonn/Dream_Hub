"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { buildDreamOneLineSummary, createDream, listDreams } from "@/api/dream";
import { consumePendingDreamResult } from "@/lib/pendingDreamResult";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";
import { useUnsavedChangesStore } from "@/store/useUnsavedChangesStore";
import LoginModal from "./LoginModal";
import NotificationBell from "./NotificationBell";
import UnsavedChangesGuardModal from "./UnsavedChangesGuardModal";

const NAV_ITEMS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/diary", label: "꿈 기록소", icon: "🔮" },
  { href: "/journal", label: "나만의 일기장", icon: "🌌" },
  { href: "/dictionary", label: "꿈해몽 사전", icon: "📖" },
  { href: "/community", label: "커뮤니티", icon: "💬" },
  { href: "/mypage", label: "마이페이지", icon: "👤" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const setSavedDreams = useSavedDreamsStore((state) => state.setEntries);
  const upsertSavedDream = useSavedDreamsStore((state) => state.upsertEntry);
  const isDirty = useUnsavedChangesStore((state) => state.isDirty);
  const dirtyMessage = useUnsavedChangesStore((state) => state.message);
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

  // 홈 히어로에서 비로그인으로 완료한 10초 AI 해몽 결과가 sessionStorage에 남아있다면, 로그인이
  // 끝나는 즉시(이메일/비밀번호 로그인이든, 구글 OAuth 전체 페이지 리다이렉트로 돌아온 뒤든)
  // 여기서 대신 저장을 이어간다. NavBar는 모든 페이지에서 항상 렌더링되므로 로그인이 어느
  // 화면에서 끝나든 이 효과가 놓치지 않고 걸린다. 날짜/기분/공개 여부를 고르는 화면이 없었던
  // 자리라, 오늘 날짜·평온(기본값)·비공개로 채워 저장하고 나만의 일기장에서 언제든 고쳐 쓸 수 있게 한다.
  useEffect(() => {
    if (!isAuthenticated) return;
    const pending = consumePendingDreamResult();
    if (!pending) return;

    const today = new Date().toISOString().slice(0, 10);
    createDream({
      dream_date: today,
      title: pending.survey.title,
      emotion: "😌",
      summary: buildDreamOneLineSummary(pending.survey),
      is_public: false,
      is_anonymous: true,
      share_with_ai_analysis: false,
      survey: pending.survey,
      interpretation: pending.interpretation,
    })
      .then((saved) => {
        upsertSavedDream(saved);
        router.push("/journal");
      })
      .catch(() => {
        // 자동 저장이 실패해도 유저가 이미 확인한 해몽 결과 자체는 사라지지 않으니 조용히 넘어간다.
      });
  }, [isAuthenticated, router, upsertSavedDream]);

  const guardedNavigate = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!isDirty || href === pathname) return;
    event.preventDefault();
    setPendingHref(href);
  };

  // 브라우저 뒤로가기 가로채기: isDirty가 켜지는 순간 지금 페이지와 동일한 더미 히스토리
  // 항목을 하나 쌓아 둔다. 뒤로가기를 누르면 그 더미 항목만 사라져 popstate가 발생하고,
  // 실제로는 여전히 이 페이지에 머무는 상태다 - 여기서 커스텀 이탈 모달을 띄운다.
  useEffect(() => {
    if (!isDirty) return;
    window.history.pushState({ dreamHubGuard: true }, "", window.location.href);
    const handlePopState = () => {
      setPendingHref("__back__");
      window.history.pushState({ dreamHubGuard: true }, "", window.location.href);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty]);

  const confirmLeave = () => {
    // 실시간 자동 임시 저장 초안은 localStorage에 이미 남아있으므로 여기서는 화면의
    // "작성 중" 플래그만 내려서 이동을 막던 가드를 해제한다 - 데이터 자체는 지우지 않는다.
    setDirty(false);
    const href = pendingHref;
    setPendingHref(null);
    if (href === "__back__") {
      // 가드용으로 쌓아둔 더미 히스토리 항목까지 함께 벗어나기 위해 두 칸 뒤로 간다.
      window.history.go(-2);
    } else if (href) {
      router.push(href);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-indigo-900/50 bg-[#0b0518]/80 backdrop-blur">
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
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                pathname === item.href
                  ? "bg-indigo-500/20 text-indigo-100"
                  : "text-indigo-300/70 hover:text-indigo-100"
              }`}
            >
              <span className="text-sm leading-none">{item.icon}</span>
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

      <UnsavedChangesGuardModal
        open={pendingHref !== null}
        message={dirtyMessage}
        onStay={() => setPendingHref(null)}
        onLeave={confirmLeave}
      />
      <LoginModal />
    </header>
  );
}
