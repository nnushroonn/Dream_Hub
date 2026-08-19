"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { logoutUser } from "@/api/auth";
import { buildDreamOneLineSummary, createDream, listDreams } from "@/api/dream";
import { consumePendingDreamResult, setPendingDreamResult } from "@/lib/pendingDreamResult";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";
import { useUnsavedChangesStore } from "@/store/useUnsavedChangesStore";
import LoginModal from "./LoginModal";
import NotificationBell from "./NotificationBell";
import SeedMorningCheckModal from "./SeedMorningCheckModal";
import UnsavedChangesGuardModal from "./UnsavedChangesGuardModal";

const NAV_ITEMS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/journal", label: "나만의 일기장", icon: "🌌" },
  { href: "/garden", label: "무의식의 정원", icon: "🌱" },
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

  // 홈 히어로/AI 해몽 페이지에서 비로그인으로 완료한 30초 AI 해몽 결과가 sessionStorage에
  // 남아있다면, 로그인이 끝나는 즉시(이메일/비밀번호 로그인이든, 구글 OAuth 전체 페이지
  // 리다이렉트로 돌아온 뒤든) 여기서 대신 저장을 이어간다. NavBar는 모든 페이지에서 항상
  // 렌더링되므로 로그인이 어느 화면에서 끝나든 이 효과가 놓치지 않고 걸린다. 날짜/기분 선택
  // UI가 있는 진입점(AI 해몽 페이지)은 유저가 고른 값을 그대로 쓰고, 그런 화면이 없었던
  // 자리(홈 히어로)만 오늘 날짜·평온(기본값)으로 채워 저장한다 - 공개 여부는 항상 비공개이며
  // 나만의 일기장에서 언제든 고쳐 쓸 수 있다.
  useEffect(() => {
    if (!isAuthenticated) return;
    const pending = consumePendingDreamResult();
    if (!pending) return;

    const today = new Date().toISOString().slice(0, 10);
    createDream({
      dream_date: pending.selectedDate || today,
      title: pending.survey.title,
      entry_type: "dream",
      emotion: pending.mood || "😌",
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
        // 자동 저장이 실패해도 유저가 이미 확인한 해몽 결과를 완전히 잃지 않도록 다시
        // 채워 넣는다(re-arm) - 다음 로그인 확인이나 새로고침 때 자동으로 재시도된다.
        setPendingDreamResult(pending);
      });
  }, [isAuthenticated, router, upsertSavedDream]);

  const guardedNavigate = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!isDirty || href === pathname) return;
    event.preventDefault();
    setPendingHref(href);
  };

  // httpOnly 쿠키는 JS가 직접 못 지우므로, 로그아웃은 이제 반드시 서버에 Set-Cookie(만료된
  // 값)를 요청하는 왕복을 거쳐야 진짜로 지워진다. 네트워크가 실패해도(오프라인 등) 클라이언트
  // 쪽 상태는 그대로 정리한다 - 화면상 "로그아웃"은 항상 성공한 것처럼 보여야 하고, 실제
  // 쿠키는 어차피 곧 만료(60분)되므로 최악의 경우도 크게 위험하지 않다.
  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // 무시 - 아래에서 클라이언트 상태는 항상 정리한다.
    } finally {
      logout();
    }
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
      <div className="mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          onClick={(event) => guardedNavigate(event, "/")}
          className="shrink-0 whitespace-nowrap text-lg font-semibold tracking-wide text-indigo-50"
        >
          🌙 Dream Hub
        </Link>

        {/* 아이템이 6개로 늘어난 뒤로 좁은 화면에서 글자가 중간에 꺾이던 버그 - 각 링크가
            줄어들지 않도록(shrink-0) 막고 텍스트도 절대 줄바꿈되지 않게(whitespace-nowrap)
            고정한다. 그래도 폭이 모자라면 깨지는 대신 이 nav만 가로 스크롤된다. */}
        <nav className="flex flex-nowrap items-center gap-0.5 overflow-x-auto no-scrollbar">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => guardedNavigate(event, item.href)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm transition-colors ${
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

        <div className="flex shrink-0 flex-nowrap items-center gap-3 text-sm">
          {/* 순수 해몽 유저를 위한 지름길 - 팝업 대신 전용 페이지(/interpret)로 이동한다. */}
          <button
            type="button"
            onClick={() => router.push("/interpret")}
            className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-3 py-1.5 text-white shadow-[0_2px_10px_rgba(139,92,246,0.4)] transition-transform hover:-translate-y-0.5 sm:flex"
          >
            🔮 AI 해몽
          </button>

          {isAuthenticated && user ? (
            <>
              <NotificationBell />
              <span className="hidden whitespace-nowrap text-indigo-300/70 sm:inline">{user.nickname}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="whitespace-nowrap rounded-full border border-indigo-800 px-3 py-1.5 text-indigo-200 transition-colors hover:bg-indigo-900/40"
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full bg-indigo-500/90 px-3 py-1.5 text-white transition-colors hover:bg-indigo-400"
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
      <SeedMorningCheckModal />
    </header>
  );
}
