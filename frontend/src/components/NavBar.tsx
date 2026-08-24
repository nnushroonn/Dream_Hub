"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
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

  // 데스크톱 메인 nav가 이제 폭이 모자라면 줄바꿈된다(아래 <nav> 참고) - 로그인 상태(오른쪽
  // 클러스터가 커짐)의 1024~1280px처럼 흔한 폭에서 실제로 2줄이 되면 sticky 헤더 자체의
  // 높이가 달라진다. journal/mypage의 sticky 사이드바·탭바가 이 헤더 바로 아래 위치를
  // top-24/top-16 같은 고정값으로 잡아 두고 있었는데, 헤더가 가변 높이가 된 이상 그 값들이
  // 더는 못 믿을 근거라 실제 렌더된 헤더 높이를 CSS 변수(--nav-height)로 노출해 그 화면들이
  // 참조하게 한다(ResizeObserver로 줄바꿈/뷰포트 변화 양쪽 다 잡는다).
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const setVar = () => {
      document.documentElement.style.setProperty("--nav-height", `${header.offsetHeight}px`);
    };
    setVar();
    const observer = new ResizeObserver(setVar);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // 작성 중인 폼(꿈 기록소 등)이 있는 상태로 헤더 메뉴를 눌렀을 때, 실제 이동 전에
  // 붙잡아 둘 목적지를 잠깐 담아두는 상태 - 커스텀 이탈 방지 모달의 확인 대상이다.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // 모바일 전용 메뉴 아코디언 열림 상태 - md: 미만에서는 6개 항목을 가로 스크롤 pill 대신
  // 햄버거 버튼으로 접어 둔다(모바일 반응형 감사 🔴 항목: 스크롤 힌트 없이 메뉴 절반이
  // 화면 밖으로 잘려 발견 자체가 안 되는 문제).
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // 관리자 계정에게만 "관리자" 항목을 덧붙인다 - 실제 접근 제어는 항상 AdminGuard/백엔드
  // get_current_admin_user가 다시 하므로, 이건 순수 진입점 노출 여부일 뿐이다. 모바일
  // 드로어는 세로 목록이라 7번째 항목이 더 붙어도 넉넉하지만, 데스크톱 가로 스크롤
  // pill row는 1280px처럼 흔한 폭에서도 기존 6개만으로 이미 꽉 차 있었다(실측: 755px
  // 콘텐츠 vs 589px 가용폭) - 여기에 7번째를 얹으면 스크롤 힌트도 없이 화면 밖으로
  // 완전히 밀려나 관리자 본인에게도 안 보이는 문제가 있었다. 그래서 데스크톱은 이
  // 목록에 얹지 않고, 아래 로그아웃 옆 항상 보이는 영역에 별도 아이콘 버튼으로 둔다.
  const mobileNavItems = user?.is_admin ? [...NAV_ITEMS, { href: "/admin", label: "관리자", icon: "🛠️" }] : NAV_ITEMS;

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

  // 라우트가 바뀌면(뒤로가기 포함) 열려 있던 모바일 메뉴를 항상 접어 둔다 - 링크 클릭 시
  // 닫는 것만으로는 브라우저 뒤로가기로 넘어온 경우를 놓친다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pathname(외부 라우터 상태) 변경에 반응
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const guardedNavigate = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!isDirty || href === pathname) return;
    event.preventDefault();
    setPendingHref(href);
  };

  // 모바일 메뉴 안의 링크 전용 - 실제 이동 여부(guardedNavigate가 이탈 방지 모달로 가로챌
  // 수도 있음)와 무관하게 메뉴부터 접어, 모달과 메뉴가 동시에 떠 있지 않게 한다.
  const handleMobileNavClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setIsMobileMenuOpen(false);
    guardedNavigate(event, href);
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
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-indigo-900/50 bg-[#0b0518]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-1">
          {/* md: 미만에서는 6개 항목이 가로 스크롤 pill로만 존재해 스크롤 힌트 없이 절반이
              화면 밖으로 잘리던 문제가 있었다 - 햄버거로 접어 아래 아코디언 패널에서 전부
              보여준다(모바일 반응형 감사 🔴 항목). */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-label={isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={isMobileMenuOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-indigo-200 transition-colors hover:bg-indigo-900/40 md:hidden"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link
            href="/"
            onClick={(event) => handleMobileNavClick(event, "/")}
            className="shrink-0 whitespace-nowrap text-lg font-semibold tracking-wide text-indigo-50"
          >
            🌙 Dream Hub
          </Link>
        </div>

        {/* md: 이상 데스크톱 전용. 로그인 상태(오른쪽 클러스터가 커짐)의 1024~1280px처럼
            흔한 폭에서는 6개 항목이 실측상 100px대 이상 모자라 - 예전엔 이 nav만 가로
            스크롤되게 했는데, 스크롤 힌트가 전혀 없어 "커뮤니티"/"마이페이지"가 화면 밖으로
            밀려나도 발견할 방법이 없었다(관리자 아이콘 작업 중 재발견된 기존 버그). 패딩을
            줄이고 아이콘을 빼 폭이 넉넉한 화면에서는 한 줄에 다 들어오게 하고, 그래도
            모자란 폭에서는 (가려지는 대신) 항목째로 다음 줄로 자연스럽게 줄바꿈한다 -
            숨겨진 항목이 하나도 없다는 게 항상 보장된다. 헤더가 그만큼 늘어난 높이는
            NavBar 상단의 ResizeObserver가 --nav-height로 내보내 다른 화면의 sticky
            요소들이 참조한다. */}
        <nav className="hidden flex-wrap items-center gap-x-1 gap-y-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => guardedNavigate(event, item.href)}
              className={`whitespace-nowrap rounded-full px-2 py-1.5 text-sm transition-colors ${
                pathname === item.href
                  ? "bg-indigo-500/20 text-indigo-100"
                  : "text-indigo-300/70 hover:text-indigo-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 flex-nowrap items-center gap-3 text-sm">
          {/* 순수 해몽 유저를 위한 지름길 - 팝업 대신 전용 페이지(/interpret)로 이동한다. */}
          <button
            type="button"
            onClick={() => router.push("/interpret")}
            className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-3 py-3 text-white shadow-[0_2px_10px_rgba(139,92,246,0.4)] transition-transform hover:-translate-y-0.5 sm:flex"
          >
            🔮 AI 해몽
          </button>

          {isAuthenticated && user ? (
            <>
              {/* 관리자 전용 진입점 - 위 md: 가로 스크롤 nav에는 안 넣는다(6개만으로도 이미
                  흔한 폭에서 꽉 차 스크롤 힌트 없이 밀려나는 문제가 있었다). 여기 shrink-0
                  영역은 항상 전부 보이므로 관리자 본인에게도 확실히 보인다. */}
              {user.is_admin && (
                <Link
                  href="/admin"
                  aria-label="관리자"
                  title="관리자"
                  className="hidden shrink-0 items-center justify-center rounded-full p-3 text-indigo-300/70 transition-colors hover:bg-indigo-900/40 hover:text-indigo-100 md:flex"
                >
                  🛠️
                </Link>
              )}
              <NotificationBell />
              <span className="hidden whitespace-nowrap text-indigo-300/70 sm:inline">{user.nickname}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="whitespace-nowrap rounded-full border border-indigo-800 px-3 py-3 text-indigo-200 transition-colors hover:bg-indigo-900/40"
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full bg-indigo-500/90 px-3 py-3 text-white transition-colors hover:bg-indigo-400"
            >
              로그인
            </Link>
          )}
        </div>
      </div>

      {isMobileMenuOpen && (
        <nav className="border-t border-indigo-900/50 bg-[#0b0518] px-4 pb-3 md:hidden">
          {mobileNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => handleMobileNavClick(event, item.href)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-base transition-colors ${
                pathname === item.href
                  ? "bg-indigo-500/20 text-indigo-100"
                  : "text-indigo-200/80 hover:bg-indigo-900/30 hover:text-indigo-100"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push("/interpret");
            }}
            className="mt-1 flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-3 py-3 text-base text-white shadow-[0_2px_10px_rgba(139,92,246,0.4)]"
          >
            🔮 AI 해몽
          </button>
        </nav>
      )}

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
