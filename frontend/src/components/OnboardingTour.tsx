"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { driver, type Config, type DriveStep, type Driver } from "driver.js";

import { completeOnboarding } from "@/api/auth";
import { useAuthStore } from "@/store/useAuthStore";
import { useLoginModalStore } from "@/store/useLoginModalStore";
import { useMobileNavStore } from "@/store/useMobileNavStore";
import { useOnboardingTourStore } from "@/store/useOnboardingTourStore";
import { useSeedMorningCheckStore } from "@/store/useSeedMorningCheckStore";

// NavBar.tsx가 "md" 브레이크포인트(768px)에서 데스크톱 nav를 보여주지만, "🔮 AI 해몽" 헤더
// 버튼은 "sm"(640px)부터 보여진다 - 두 기준이 달라 단일 매체 쿼리로는 "지금 어느 변형이
// 보이는가"를 안정적으로 판단할 수 없다. 그래서 매체 쿼리로 미리 추측하는 대신, 데스크톱/
// 모바일 두 변형에 같은 data-tour 값을 붙여 두고 실제로 화면에 보이는(offsetParent가 있는)
// 쪽을 그때그때 골라 쓴다.
function resolveVisibleElement(tourKey: string): Element | undefined {
  const candidates = document.querySelectorAll(`[data-tour="${tourKey}"]`);
  for (const candidate of Array.from(candidates)) {
    if ((candidate as HTMLElement).offsetParent !== null) return candidate;
  }
  return undefined;
}

function isMobileViewport(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

// 이 스텝(0-based)들은 모바일 햄버거 드로어 "안"의 항목을 가리킨다 - 드로어가 열려 있어야
// 실제 DOM에 해당 요소가 존재한다(NavBar.tsx의 {isMobileMenuOpen && (...)} 조건부 렌더링).
const MOBILE_DRAWER_STEP_INDICES = new Set([1, 3, 4, 5]);

function syncMobileDrawerForStepIndex(index: number | undefined): void {
  if (index === undefined || !isMobileViewport()) return;
  const { open, close } = useMobileNavStore.getState();
  if (MOBILE_DRAWER_STEP_INDICES.has(index)) open();
  else close();
}

const STEPS: DriveStep[] = [
  {
    element: () => resolveVisibleElement("nav-all-desktop") ?? resolveVisibleElement("nav-all-mobile") ?? document.body,
    popover: {
      title: "🧭 둘러보기",
      description: "여기서 일기장, 무의식의 정원, 꿈해몽 사전, 커뮤니티, 마이페이지로 언제든 이동할 수 있어요.",
    },
  },
  {
    element: () => resolveVisibleElement("nav-journal") ?? document.body,
    popover: {
      title: "🌌 나만의 일기장",
      description: "밤에는 감정을, 아침에는 꿈을 기록하는 나만의 공간이에요. 기록이 쌓이면 나만의 별자리가 완성돼요.",
    },
  },
  {
    element: () => resolveVisibleElement("growth-journey") ?? document.body,
    popover: {
      title: "🌱 씨앗 성장 단계",
      description:
        "감정 기록은 씨앗을 심는 일이에요. 잠드는 동안 새싹이 자라고, 아침에 꿈을 기록하면 개화하고, AI 해몽까지 받으면 하나의 꽃으로 완성돼요.",
    },
  },
  {
    element: () => resolveVisibleElement("nav-ai-interpret") ?? document.body,
    popover: {
      title: "🔮 AI 해몽",
      description: "꾼 꿈을 AI가 분석해 드려요. 로그인하면 하루 3회, 비로그인도 1회 무료로 이용할 수 있어요.",
    },
  },
  {
    element: () => resolveVisibleElement("nav-dictionary") ?? document.body,
    popover: {
      title: "📖 꿈해몽 사전",
      description: "궁금한 상징이 있다면 여기서 검색해 뜻을 찾아볼 수 있어요.",
    },
  },
  {
    element: () => resolveVisibleElement("nav-community") ?? document.body,
    popover: {
      title: "💬 커뮤니티",
      description: "다른 사람들과 꿈이나 일상을 나누고 공감할 수 있는 공간이에요.",
    },
  },
];

// 홈 화면(page.tsx)에 전부 앵커링된 6단계 신규 사용자 온보딩 투어. NavBar 안에서 앱 전역에
// 1회만 마운트된다(LoginModal/SeedMorningCheckModal과 같은 위치) - 어느 페이지에 있든 항상
// 떠 있어야 "홈으로 이동 후 자동 시작"/"다른 페이지 도움말에서 재요청" 둘 다 처리할 수 있다.
export default function OnboardingTour() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const updateUser = useAuthStore((state) => state.updateUser);
  const isLoginModalOpen = useLoginModalStore((state) => state.isOpen);
  const isSeedCheckOpen = useSeedMorningCheckStore((state) => state.isOpen);
  const manualStartRequested = useOnboardingTourStore((state) => state.manualStartRequested);

  const driverRef = useRef<Driver | null>(null);
  const hasAutoStartedRef = useRef(false);
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  // 다른 모달이 열려 있으면 시작하지 않는다(겹쳐 뜨는 것 방지) - LoginModal/SeedMorningCheckModal
  // 둘 다 닫히고 나서야 canStart가 true가 된다. 원시값(boolean)만 의존성으로 쓰는 게 중요하다 -
  // user 객체 자체를 의존성에 넣으면, 다른 이유로 user 참조가 한 번 더 바뀔 때마다(예: 다른
  // 컴포넌트가 updateUser를 다시 호출) 이 effect가 재실행되면서 클린업이 아직 안 끝난
  // setTimeout을 취소해 버려, 투어가 시작될 기회를 영영 놓칠 수 있다.
  const canStartTour = pathname === "/" && isAuthenticated && !!user && !isLoginModalOpen && !isSeedCheckOpen;
  const wantsAutoStart = canStartTour && !user?.has_completed_onboarding;
  const wantsManualStart = canStartTour && manualStartRequested;

  function finishTour() {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    driverRef.current = null;
    useMobileNavStore.getState().close();
    completeOnboarding()
      .then(updateUser)
      .catch(() => {
        // 실패해도 화면 흐름은 막지 않는다 - 계정에 완료 여부가 안 남았을 뿐이라 다음 홈
        // 진입 때 한 번 더 자동으로 뜰 수 있다(치명적이지 않음).
      });
  }

  function startTour() {
    hasFinishedRef.current = false;
    // consumeManualStart를 여기(타이머가 실제로 발화한 뒤)에서 호출한다 - 아래 트리거
    // effect 안에서 곧장 호출하면 manualStartRequested가 그 즉시 false로 바뀌어 effect가
    // 재실행되고, 그 클린업이 방금 예약한 setTimeout을 취소해 버려 투어가 시작되기도 전에
    // 조용히 무산된다(수동 요청이 아니었을 때 호출해도 이미 false라 무해하다).
    useOnboardingTourStore.getState().consumeManualStart();

    const driverObj = driver({
      steps: STEPS,
      showProgress: true,
      progressText: "{{current}} / {{total}}",
      nextBtnText: "다음",
      prevBtnText: "이전",
      doneBtnText: "완료",
      showButtons: ["next", "previous", "close"],
      allowClose: true,
      smoothScroll: true,
      overlayColor: "#0b0518",
      overlayOpacity: 0.7,
      stagePadding: 6,
      popoverClass: "dreamhub-onboarding-popover",
      // 데스크톱 nav 밑에 mobileNavItems 드로어가 새로 열리는 등, 타겟 요소가 이 스텝으로
      // 넘어오는 순간엔 아직 DOM에 없을 수 있다(아래 onNextClick 참고) - 그 사이를 최대
      // 500ms까지 기다려 준다(driver.js가 내부적으로 element 함수를 재시도한다).
      waitForElement: 500,
      onPopoverRender: (popoverDom) => {
        popoverDom.closeButton.textContent = "건너뛰기";
        popoverDom.closeButton.setAttribute("aria-label", "투어 건너뛰기");
      },
      onNextClick: (_element, _step, opts) => {
        const nextIndex = (opts.state.activeIndex ?? -1) + 1;
        syncMobileDrawerForStepIndex(nextIndex);
        driverObj.moveNext();
      },
      onPrevClick: (_element, _step, opts) => {
        const prevIndex = (opts.state.activeIndex ?? 0) - 1;
        syncMobileDrawerForStepIndex(prevIndex);
        driverObj.movePrevious();
      },
      onCloseClick: () => {
        finishTour();
        driverObj.destroy();
      },
      onDoneClick: () => {
        finishTour();
        driverObj.destroy();
      },
      // ESC 등 위 두 경로를 거치지 않고 닫히는 경우의 안전망 - finishTour는 멱등이라 위
      // 경로와 겹쳐 호출돼도 API가 중복 호출되지 않는다.
      onDestroyStarted: () => {
        finishTour();
      },
    } satisfies Config);

    driverRef.current = driverObj;
    syncMobileDrawerForStepIndex(0);
    driverObj.drive();
  }

  useEffect(() => {
    if (driverRef.current) return;

    const shouldAutoStart = wantsAutoStart && !hasAutoStartedRef.current;
    const shouldManualStart = wantsManualStart;
    if (!shouldAutoStart && !shouldManualStart) return;

    // 로그인 직후 다른 초기화 효과(예: SeedMorningCheckModal의 비동기 조회)와 겹치지 않게
    // 짧게 늦춰 시작한다 - HelpButton의 첫 방문 하이라이트(4초)와 비슷한 여유를 둔다.
    //
    // hasAutoStartedRef는 타이머를 "예약하는" 시점이 아니라 실제로 "발화하는" 시점에만
    // true로 커밋한다 - 예약 시점에 커밋하면, 그 사이(600ms 안)에 다른 모달이 열려
    // wantsAutoStart가 false로 바뀌어 이 effect가 재실행→클린업으로 타이머가 취소돼도
    // 플래그는 이미 true로 남아, 모달이 닫힌 뒤 다시 조건이 맞아져도 영영 재시도되지 않는
    // 버그가 있었다(라이브 테스트로 재현/확인). 타이머가 취소되지 않고 실제로 실행됐다는
    // 것 자체가 "그 사이 조건이 바뀌지 않았다"는 보장이라 콜백 안의 shouldAutoStart 값은
    // 항상 최신이다.
    const timer = window.setTimeout(() => {
      if (shouldAutoStart) hasAutoStartedRef.current = true;
      startTour();
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAutoStart, wantsManualStart]);

  return null;
}
