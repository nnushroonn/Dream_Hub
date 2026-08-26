"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { getAuthErrorMessage, isAiInterpretRateLimited } from "@/api/auth";
import {
  buildDreamOriginalContent,
  getExplorerCount,
  getMoonPhase,
  requestQuickAiInterpretation,
  type AiInterpretation,
  type DreamSurvey,
  type MoonPhase,
} from "@/api/dream";
import { getTonightSeed } from "@/api/seeds";
import CommunityPreviewCard from "@/components/CommunityPreviewCard";
import CounselingStoryView from "@/components/CounselingStoryView";
import DreamAnalyzerLoading from "@/components/DreamAnalyzerLoading";
import DreamOriginalQuote from "@/components/DreamOriginalQuote";
import EventBannerCarousel, { type CarouselSlide } from "@/components/EventBannerCarousel";
import GrowthJourneyIntro from "@/components/GrowthJourneyIntro";
import HelpButton from "@/components/HelpButton";
import HomeBestShowcase from "@/components/HomeBestShowcase";
import LiveTicker from "@/components/LiveTicker";
import MonthlyDashboardPanel from "@/components/MonthlyDashboardPanel";
import MoonIcon from "@/components/MoonIcon";
import NavBar from "@/components/NavBar";
import PopularSymbolChips from "@/components/PopularSymbolChips";
import { todayDateInputValue } from "@/lib/dreamDate";
import { setPendingDreamResult } from "@/lib/pendingDreamResult";
import { useAuthStore } from "@/store/useAuthStore";
import { useLoginModalStore } from "@/store/useLoginModalStore";
import { useOnboardingTourStore } from "@/store/useOnboardingTourStore";

const EXPLORER_COUNT_POLL_MS = 5000;
const NIGHT_SKY_FADE_IN_MS = 1200;

// 좌측 인피드 배너 자리의 자체 콘텐츠 프로모션 슬라이드. 추후 외부 광고 SDK로 교체할 때는
// EventBannerCarousel에 넘기는 이 배열만 바꾸면 된다 - 컴포넌트/레이아웃은 그대로 재사용.
const HOME_PROMO_SLIDES: CarouselSlide[] = [
  {
    id: "dictionary",
    href: "/dictionary",
    emoji: "📖",
    title: "방대한 무의식의 도감, 꿈해몽 사전",
    subtitle: "수천 가지 상징의 숨겨진 의미를 지금 찾아보세요",
    gradientClassName: "bg-gradient-to-r from-purple-900/80 via-purple-800/60 to-slate-900/40",
  },
  {
    id: "community",
    href: "/community",
    emoji: "🌌",
    title: "무의식 광장에서 다른 탐험가의 꿈 만나기",
    subtitle: "당신과 닮은 무의식을 지금 둘러보세요",
    gradientClassName: "bg-gradient-to-r from-indigo-900/80 via-indigo-800/60 to-slate-900/40",
  },
  {
    id: "journal",
    href: "/journal",
    emoji: "🔒",
    title: "나만의 무의식 아카이브, 꿈 일기장",
    subtitle: "기록이 쌓여 나만의 별자리가 되는 공간",
    gradientClassName: "bg-gradient-to-r from-violet-900/80 via-violet-800/60 to-slate-900/40",
  },
  {
    id: "magazine",
    href: "/magazine",
    emoji: "📰",
    title: "드림허브 매거진, 꿈 심리학 읽을거리",
    subtitle: "상징 해설부터 수면 과학까지, 에디터가 쓴 깊이 있는 이야기",
    gradientClassName: "bg-gradient-to-r from-slate-800/80 via-slate-700/60 to-slate-900/40",
  },
];

interface Star {
  id: number;
  top: string;
  left: string;
  size: number;
  delay: string;
}

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const openLoginModal = useLoginModalStore((state) => state.open);
  const requestOnboardingTourStart = useOnboardingTourStore((state) => state.requestManualStart);

  const [stars, setStars] = useState<Star[]>([]);
  const [moonPhase, setMoonPhase] = useState<MoonPhase | null>(null);
  const [isMoonModalOpen, setIsMoonModalOpen] = useState(false);
  const [explorerCount, setExplorerCount] = useState<number | null>(null);
  const [heroSearchQuery, setHeroSearchQuery] = useState("");
  // AI 전체 해몽 폼과 완전히 분리된 보조 상징 검색창 전용 입력 - 서로 다른 입력을 공유하지 않는다.
  const [heroSymbolSearchQuery, setHeroSymbolSearchQuery] = useState("");

  // 히어로에서 곧바로 트리거하는 즉시 해몽 모달 - 페이지 이동 없이 이 자리에서 로딩→결과를 보여준다.
  const [isHeroModalOpen, setIsHeroModalOpen] = useState(false);
  const [isHeroLoading, setIsHeroLoading] = useState(false);
  const [heroSurvey, setHeroSurvey] = useState<DreamSurvey | null>(null);
  const [heroInterpretation, setHeroInterpretation] = useState<AiInterpretation | null>(null);
  const [heroErrorMessage, setHeroErrorMessage] = useState<string | null>(null);

  // 저널의 "씨앗 심기" 리추얼(반짝임 -> 밤하늘 페이드아웃)이 화면이 완전히 어두워진 채로 이
  // 페이지로 조용히 라우팅해 둔 상태를 이어받는다 - sessionStorage 플래그가 있으면 처음엔 화면
  // 전체를 검게 덮은 채 시작해, 마운트 직후 서서히 밝아지며(fade-in) 그 어둠을 자연스럽게 이어간다.
  const [nightSkyRevealing, setNightSkyRevealing] = useState(false);
  const [isNightSkyVisible, setIsNightSkyVisible] = useState(false);

  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem("dream_hub_ritual_fade_in") === "1";
      if (flagged) sessionStorage.removeItem("dream_hub_ritual_fade_in");
    } catch {
      // 세션 스토리지를 못 읽으면 그냥 평소처럼 밝은 화면으로 시작한다.
    }
    if (!flagged) return;
    // sessionStorage는 브라우저 전용 외부 시스템이라 마운트 이후 effect에서만 읽을 수 있고,
    // 그 결과(flagged)에 반응하는 setState도 자연히 여기서만 가능하다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage(외부 시스템) 조회 결과에 반응
    setNightSkyRevealing(true);
    setIsNightSkyVisible(true);
    const revealTimer = window.setTimeout(() => setIsNightSkyVisible(false), 30);
    // onTransitionEnd만 믿고 오버레이를 걷어내면, 그 이벤트가 씹히는 경우(트랜지션이 시작되기도
    // 전에 언마운트/리렌더가 끼어들거나, 브라우저가 이벤트를 못 쏘는 드문 케이스) 화면이 검게
    // 멈춰버린다 - 트랜지션 시간(NIGHT_SKY_FADE_IN_MS)보다 넉넉히 여유를 둔 강제 해제 타이머를
    // 항상 함께 걸어, 최악의 경우에도 반드시 화면이 밝아지도록 이중 안전장치를 둔다.
    const fallbackTimer = window.setTimeout(() => setNightSkyRevealing(false), 30 + NIGHT_SKY_FADE_IN_MS + 300);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  // 구글 로그인 콜백은 이제 httpOnly 쿠키를 직접 심고 ?token=... 없이 "/"로 돌아온다(백엔드
  // routers/auth.py의 google_callback 참고) - 그 쿠키를 실제로 읽어 로그인 상태를 채우는
  // 일과, 로그인 직전에 하려던 동작으로 이어서 보내는 일 둘 다 components/AuthHydrator.tsx
  // 로 옮겼다(루트 레이아웃에서 앱 로드마다 한 번 실행되므로 페이지별로 중복 처리할 필요가
  // 없다).

  useEffect(() => {
    getMoonPhase().then(setMoonPhase).catch(() => {});
  }, []);

  // "감정에서 꽃이 피기까지" 소개 섹션의 CTA는 정적 일러스트 자체와 달리 실제 오늘의 진행
  // 상태를 반영한다 - 이미 오늘 밤 씨앗을 심었다면 "다시 심자"고 안내하는 대신 진행 상황을
  // 보러 가도록 문구를 바꾼다. 섹션 자체는 이 값과 무관하게 즉시 렌더링되고, 이 값은 로그인
  // 상태일 때만 조회해 도착하는 대로 버튼 문구만 조용히 바뀐다(초기 렌더를 막지 않는다).
  const [hasTonightSeed, setHasTonightSeed] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getTonightSeed()
      .then((seed) => {
        if (!cancelled) setHasTonightSeed(seed !== null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // 무의식 탐험가 실시간 카운터: 주기적으로 다시 조회해 자연스러운 흔들림을 보여준다.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getExplorerCount()
        .then((count) => {
          if (!cancelled) setExplorerCount(count);
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, EXPLORER_COUNT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // 별 입자는 서버/클라이언트 렌더 결과가 달라지는 걸 피하려고 마운트 이후에만 생성한다 -
  // Math.random()도 Date와 마찬가지로 빌드 시점과 하이드레이션 시점에 서로 다른 값이 나와,
  // 렌더 중 바로 계산하면 정적 export HTML과 어긋난다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 하이드레이션 불일치 방지용, 렌더 중 계산 불가
    setStars(
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() * 2 + 1,
        delay: `${Math.random() * 4}s`,
      }))
    );
  }, []);

  // 페이지 이동 없이 이 자리에서 곧장 해몽을 돌린다 - 진단 페이지(/diary)의 ⚡ 30초 빠른 기록과
  // 같은 백엔드(dream-interpretation-quick)를 쓰되, 결과는 홈 위에 뜨는 모달로만 보여준다.
  // 로딩 중 닫기 확인 다이얼로그에서 "취소할게요"를 누르면 실제로 이 요청을 abort한다.
  const heroAbortControllerRef = useRef<AbortController | null>(null);

  const runHeroAiInterpretation = async (text: string) => {
    if (isHeroLoading) return;

    // 홈 훅에는 별도 제목 입력칸이 없어, 서술 첫 줄을 짧게 잘라 제목으로 대신한다.
    const firstLine = text.split(/\r?\n/)[0].trim();
    const title = firstLine.length > 0 ? firstLine.slice(0, 24) : "제목 없는 꿈";

    setHeroSurvey({
      title,
      brightness: "",
      space_depth: "",
      space_detail: "",
      identity_factor: "",
      target_detail: "",
      action_physics: "",
      action_detail: text,
      reality_link: "",
      reality_detail: "",
      vividness: 50,
      lucid_level: "none",
      control_level: null,
      final_memo: "",
    });
    setHeroInterpretation(null);
    setHeroErrorMessage(null);
    setIsHeroModalOpen(true);
    setIsHeroLoading(true);
    const controller = new AbortController();
    heroAbortControllerRef.current = controller;
    try {
      // 홈 화면 히어로 데모는 로그인 전에도 써볼 수 있는 즉석 체험이라 특정 날짜(취침일)
      // 개념이 없다 - date는 그냥 생략한다(서버가 감정일기 연동 없이 기존 방식으로 처리).
      const result = await requestQuickAiInterpretation(title, text, undefined, controller.signal);
      setHeroInterpretation(result);
    } catch (error) {
      // 유저가 닫기 확인 다이얼로그에서 취소를 선택해 abort한 요청이면, 이미 모달을 닫고
      // 로딩도 끝낸 상태라 에러 메시지를 띄우거나 모달을 다시 여는 등의 후처리가 필요 없다.
      const isAborted = error instanceof Error && error.name === "CanceledError";
      if (!isAborted) {
        setIsHeroModalOpen(false);
        // 비로그인 유저가 하루 무료 한도(1회)를 다 쓴 경우 - 일반 에러 문구 대신 로그인하면
        // 하루 3회로 늘어난다는 걸 안내하는 모달로 자연스럽게 이어간다.
        if (!isAuthenticated && isAiInterpretRateLimited(error)) {
          openLoginModal({ triggerSource: "ai_limit" });
        } else {
          setHeroErrorMessage(getAuthErrorMessage(error));
        }
      }
    } finally {
      setIsHeroLoading(false);
    }
  };

  // AI 전체 해몽 폼 제출 - 탭이 사라지고 이 폼이 히어로의 유일한 주 컴포넌트라, 길이와 무관하게
  // 항상 AI 해몽으로 넘긴다.
  const handleHeroQuickRecord = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = heroSearchQuery.trim();
    if (!trimmed) return;
    void runHeroAiInterpretation(trimmed);
  };

  // 보조 상징 검색창 제출 - AI 폼과 완전히 분리된 별도 입력이라 항상 사전 검색으로만 라우팅한다.
  const handleHeroSymbolSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = heroSymbolSearchQuery.trim();
    router.push(trimmed ? `/dictionary?search=${encodeURIComponent(trimmed)}` : "/dictionary");
  };

  // 분석이 진행 중일 때(X 버튼/배경 클릭/Esc) 곧장 닫지 않고 확인부터 받는다 - 확인하면
  // 실제로 진행 중인 요청을 abort하고 닫는다("이탈 방지"). useCallback으로 감싸 Esc 키
  // 이펙트가 isHeroLoading이 바뀔 때만(매 렌더마다가 아니라) 리스너를 다시 붙이게 한다.
  const closeHeroModal = useCallback(() => {
    if (isHeroLoading) {
      if (!window.confirm("분석을 취소하시겠어요?")) return;
      heroAbortControllerRef.current?.abort();
    }
    setIsHeroModalOpen(false);
  }, [isHeroLoading]);

  // 비로그인 유저의 해몽 결과는 로그인(특히 구글 OAuth의 전체 페이지 리다이렉트)을 거치면
  // 리액트 상태가 통째로 날아간다 - 결과가 뜨는 즉시 sessionStorage에 백업해 두면, 로그인 후
  // NavBar의 자동 동기화 로직이 이 백업을 찾아 대신 저장을 이어갈 수 있다.
  useEffect(() => {
    if (isAuthenticated || !heroSurvey || !heroInterpretation) return;
    setPendingDreamResult({ survey: heroSurvey, interpretation: heroInterpretation, rawText: heroSearchQuery });
  }, [isAuthenticated, heroSurvey, heroInterpretation, heroSearchQuery]);

  // 저장은 날짜/기분/씨앗 선택을 고르는 정식 흐름이 필요해 홈에서 곧바로 처리하지 않고,
  // 이미 적은 내용을 그대로 들고 일기장의 AI 해몽 기록 모달로 이어간다(정식 프리필 파라미터를 재사용).
  const continueToFullRecord = () => {
    setIsHeroModalOpen(false);
    router.push(`/journal?quickText=${encodeURIComponent(heroSearchQuery.trim())}`);
  };

  // 모달이 열려 있을 때 Esc로도 닫을 수 있도록 처리
  useEffect(() => {
    if (!isMoonModalOpen && !isHeroModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMoonModalOpen(false);
      closeHeroModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoonModalOpen, isHeroModalOpen, closeHeroModal]);

  const growthJourneyCtaLabel =
    isAuthenticated && hasTonightSeed ? "오늘의 진행 상황 보러가기 →" : "지금 오늘의 씨앗 심기 →";
  const handleGrowthJourneyCtaClick = () => {
    // "취침일 기준 오늘" 날짜를 명시적으로 넘긴다 - 일기장이 이 날짜 파라미터가 없으면 자체
    // 캐시에 남아있는 "가장 최근 기록이 있는 날짜"(이미 완료된 과거 날짜일 수 있다)를 기본값
    // 으로 골라버리는 문제가 있었다(이미 수정했지만, 이 CTA는 항상 명시적으로 넘겨 그 기본값
    // 로직에 의존하지 않는다).
    const journalUrl = `/journal?date=${todayDateInputValue()}`;
    if (isAuthenticated) {
      router.push(journalUrl);
    } else {
      openLoginModal({ onSuccess: () => router.push(journalUrl), triggerSource: "diary" });
    }
  };

  return (
    // overflow-hidden을 여기 두면 어떤 자식이든 position: sticky가 조용히 깨진다(사이드바 광고
    // 포함). 배경의 오로라 블러/별 입자는 아래의 fixed 배경 레이어 자체가 이미 overflow-hidden으로
    // 스스로를 클리핑하고 있어, 이 바깥쪽 wrapper에는 더 이상 필요 없다.
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      {/* 저널의 씨앗 심기 리추얼에서 이어지는 밤하늘 페이드인 - 팝업/시스템 메시지 없이, 화면이
          검게 덮인 채로 도착해 조용히 밝아진다. 전환 연출 전용 티어(z-[150])로, 일반 모달
          (z-[100]/[110])보다는 위지만 로그인/이탈방지 같은 시스템 모달(z-[9999])보다는 아래다. */}
      {nightSkyRevealing && (
        <div
          className="pointer-events-none fixed inset-0 z-[150] bg-gray-950 ease-in-out"
          style={{
            transitionProperty: "opacity",
            transitionDuration: `${NIGHT_SKY_FADE_IN_MS}ms`,
            opacity: isNightSkyVisible ? 1 : 0,
          }}
          onTransitionEnd={() => setNightSkyRevealing(false)}
        />
      )}

      {/* 오로라 블러 + 별 입자 배경 (화면 전체 고정) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-700/30 blur-[110px] animate-aurora" />
        <div
          className="absolute top-1/4 -right-32 h-80 w-80 rounded-full bg-indigo-600/25 blur-[110px] animate-aurora"
          style={{ animationDelay: "4s" }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-700/20 blur-[110px] animate-aurora"
          style={{ animationDelay: "8s" }}
        />
        {stars.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white animate-twinkle"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              animationDelay: star.delay,
            }}
          />
        ))}
      </div>

      <NavBar />

      {/* 히어로 섹션 - 예전엔 100vh 가까이 채워 아래 콘텐츠가 완전히 접혀 있었다. 이제는 콘텐츠
          높이만큼만 차지하도록 강제 min-height를 걷어내고 여백(py)만 남겨, 스크롤 없이도 바로
          아래 "핵심 기능 홍보 카드"(꿈해몽 사전) 상단이 화면 하단에 살짝 걸쳐 보이게 한다. */}
      <section className="relative flex flex-col items-center px-6 py-14 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(129,90,255,0.2),transparent_60%)]" />
        <div className="relative flex flex-col items-center">
          {/* 실시간 활성도 뱃지 */}
          <div className="inline-flex items-center gap-2 rounded-full border-none bg-white/5 px-4 py-1.5 text-xs text-emerald-400 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
            </span>
            {explorerCount !== null ? (
              <span>
                지금{" "}
                <span className="font-semibold tabular-nums text-emerald-300">
                  {explorerCount.toLocaleString()}
                </span>
                명의 탐험가가 무의식을 기록 중
              </span>
            ) : (
              <span>✨ 현재 전 세계 수많은 무의식이 기록되고 있어요</span>
            )}
          </div>

          {/* 오늘의 달 기운 캡슐: 프리미엄 존재감을 주는 확대된 배너, 히어로 타이틀 바로 위에 배치 */}
          {moonPhase && (
            <div className="group relative mt-5">
              {/* 호버 시 사방으로 퍼지는 네온 빛 확산 */}
              <div className="absolute inset-0 rounded-full bg-violet-500/40 opacity-60 blur-xl transition-all duration-500 ease-out group-hover:scale-125 group-hover:opacity-100 group-hover:blur-2xl" />
              <button
                type="button"
                onClick={() => setIsMoonModalOpen(true)}
                className="relative inline-flex items-center gap-3 rounded-full border border-violet-400/50 bg-white/5 px-6 py-3 text-sm text-indigo-100 shadow-[0_0_30px_rgba(167,139,250,0.35)] backdrop-blur-md transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-violet-300/70"
              >
                <span className="relative flex h-9 w-9 items-center justify-center">
                  <span className="absolute inset-0 -z-10 rounded-full bg-violet-300/50 blur-md" />
                  <MoonIcon illumination={moonPhase.illumination} isWaxing={moonPhase.is_waxing} size={30} />
                </span>
                <span className="font-medium">
                  ✨ 오늘의 달 기운: <span className="text-violet-200">길몽 확률 {moonPhase.luck_percent}%</span>{" "}
                  ({moonPhase.phase_name})
                </span>
              </button>

              {/* 호버 툴팁 */}
              <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-violet-400/30 bg-black/80 px-3 py-1.5 text-xs text-violet-200 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                ✨ 달의 에너지가 요동칩니다. 클릭하여 확인하세요
              </div>
            </div>
          )}

          <h1 className="mt-9 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            어젯밤 꿈, 무슨 뜻인지 궁금하신가요?
          </h1>
          <p className="mt-4 text-slate-400">상징을 검색하거나, 꿈 전체를 적으면 AI가 30초 만에 풀어드려요.</p>

          {/* 통합 검색/탭 방식을 폐기하고, AI 전체 해몽과 상징 사전 검색을 시각적 계층으로
              완전히 분리했다: AI 폼이 항상 최상단 주(Primary) 컴포넌트, 사전 검색은 그 아래
              보조(Secondary) 영역이다. */}
          <div className="mt-8 w-full max-w-4xl">
            {/* Primary: AI 전체 해몽 - 꿈해몽 작성란(텍스트박스) 바로 아래에 팁 박스를 둔다. */}
            <form onSubmit={handleHeroQuickRecord} className="w-full">
              <textarea
                value={heroSearchQuery}
                onChange={(event) => setHeroSearchQuery(event.target.value)}
                placeholder="예: 하늘을 나는 꿈을 꿨어요. 갑자기 발밑이 사라지면서..."
                rows={4}
                className="min-h-[120px] w-full resize-none rounded-2xl border border-slate-700/50 bg-slate-900/50 px-6 py-4 text-base text-white placeholder:text-slate-500 backdrop-blur-md outline-none transition-colors hover:border-purple-500/50 focus:ring-2 focus:ring-purple-500/30"
              />

              {/* 보랏빛 네온 글로우로 본문과 분리된 '도우미' 가이드임을 드러낸다. */}
              <div className="mt-4 rounded-xl border border-purple-500/40 bg-purple-900/20 p-4 text-left text-sm shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                <p className="mb-2 font-bold text-purple-300">💡 이렇게 작성해 보세요</p>
                <ul className="space-y-1.5 text-slate-300">
                  <li className="flex items-start gap-1.5">
                    <span>👤</span>
                    <span>
                      <span className="font-semibold text-purple-200">인물</span>: 꿈에 등장한 사람이나 존재를 자세히 적어주세요.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span>📍</span>
                    <span>
                      <span className="font-semibold text-purple-200">장소</span>: 꿈이 펼쳐진 장소와 주변 분위기를 묘사해 주세요.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span>🎬</span>
                    <span>
                      <span className="font-semibold text-purple-200">사건</span>: 꿈에서 일어난 일을 기억나는 순서대로 적어주세요.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span>🔮</span>
                    <span>
                      <span className="font-semibold text-purple-200">상징</span>: 꿈속에서 인상 깊었던 상징이나 특별한 요소를 모두 적어주세요.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span>❤️</span>
                    <span>
                      <span className="font-semibold text-purple-200">감정</span>: 꿈을 꾸는 동안 느낀 감정과, 잠에서 깬 뒤 남아있는 감정을 각각 표현해 주세요.
                    </span>
                  </li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={isHeroLoading}
                className="mt-4 h-14 w-full rounded-xl bg-purple-600 font-bold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isHeroLoading ? "해몽 중..." : "✨ 30초 AI 해몽 시작하기"}
              </button>

              {heroErrorMessage && <p className="mt-2 text-center text-xs text-red-300">{heroErrorMessage}</p>}
            </form>

            {/* Secondary: 상징 사전 검색 - AI 폼과 완전히 분리된 얇고 작은 보조 탐색 영역. */}
            <div className="mx-auto mt-8 w-full max-w-xl text-center">
              <p className="text-lg font-semibold text-slate-200">특정 꿈 상징만 빠르게 찾고 싶다면?</p>
              <form onSubmit={handleHeroSymbolSearchSubmit} className="relative mt-3">
                <input
                  type="text"
                  value={heroSymbolSearchQuery}
                  onChange={(event) => setHeroSymbolSearchQuery(event.target.value)}
                  placeholder="어제 꾼 꿈의 상징이나 단어를 검색해 보세요 (예: 뱀, 이빨, 날아다님)"
                  className="h-16 w-full rounded-full border border-gray-600/50 bg-gray-800/80 pl-6 pr-[4.5rem] text-base text-white placeholder:text-gray-400 outline-none transition-colors hover:border-purple-500/50 focus:ring-2 focus:ring-purple-500/30"
                />
                <button
                  type="submit"
                  aria-label="상징 검색"
                  className="absolute right-2.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-purple-600 text-white transition-colors hover:bg-purple-500"
                >
                  <Search className="h-5 w-5" />
                </button>
              </form>

              {/* 실시간 인기 검색어 가로 칩 - 예전 원형 아이콘 숏컷과 기능이 겹쳐 이 자리를
                  대신한다. 세로 랭킹 위젯 대신 가벼운 태그 칩으로 같은 데이터를 보여준다. */}
              <PopularSymbolChips />
            </div>

            {/* 프로모션 캐러셀 - 숏컷 모듈 바로 아래. 보조 검색 블록(max-w-md)보다 넓게, 위쪽
                AI 폼과 같은 폭(max-w-4xl 래퍼 전체)으로 키웠다. */}
            <div className="mt-8 w-full">
              <EventBannerCarousel slides={HOME_PROMO_SLIDES} />
            </div>
          </div>
        </div>
      </section>

      {/* 신규 가입 온보딩 투어(OnboardingTour.tsx)를 나중에 다시 보고 싶을 때의 진입점 -
          저널/정원 페이지의 기존 "도움말" 버튼과 같은 컴포넌트를 재사용한다. 홈은 투어 자체가
          펼쳐지는 화면이라 별도 정적 설명 모달 없이 버튼을 누르면 바로 투어가 시작된다. */}
      <div className="mx-auto flex max-w-5xl justify-end px-6">
        <HelpButton
          onClick={requestOnboardingTourStart}
          label="서비스 둘러보기"
          firstVisitStorageKey="home_help_hint_shown_v1"
        />
      </div>

      {/* 감정에서 꽃이 피기까지 - Dream Hub의 핵심 컨셉(씨앗 심기 -> 새싹 -> 개화 -> 꽃)을
          처음 보는(또는 오랜만에 돌아온) 사용자에게 소개하는 정적 일러스트레이션. 아래
          "무의식 광장/꿈 일기장" 2카드보다 먼저 나와, 컨셉을 먼저 설명하고 그 카드들이
          실제 진입점 역할을 하도록 자연스럽게 이어지게 한다. */}
      <GrowthJourneyIntro ctaLabel={growthJourneyCtaLabel} onCtaClick={handleGrowthJourneyCtaClick} />

      {/* 핵심 기능 홍보 카드 - 사전/일기장으로 흩어져 있던 텍스트 링크를 이 2열 카드로 통합했다 */}
      {/* 히어로 높이를 줄인 만큼, 이 섹션 상단부가 첫 화면 하단에 살짝 걸쳐 보이도록(peeking)
          위쪽 여백도 함께 줄였다. */}
      <section className="relative mx-auto max-w-5xl px-6">
        <div className="mt-4 mb-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 상단 히어로에 보조 사전 검색창이 생기면서 이 자리의 "꿈해몽 사전" 카드는 기능이
              중복됐다 - 실시간 인기 게시글을 보여주는 커뮤니티 프리뷰 카드로 대체했다. */}
          <CommunityPreviewCard />

          <div className="rounded-2xl border border-purple-500/30 bg-slate-900/80 p-6 shadow-lg backdrop-blur-md transition-all hover:border-purple-500/60">
            <h3 className="text-lg font-semibold text-white">🔒 나만의 무의식 아카이브, 꿈 일기장</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              기록이 쌓여 나만의 별자리가 되는 프라이빗한 공간을 경험하세요.
            </p>
            <button
              type="button"
              onClick={() => openLoginModal({ onSuccess: () => router.push("/journal"), triggerSource: "diary" })}
              className="mt-5 inline-block rounded-full bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500"
            >
              일기장 시작하기
            </button>
          </div>
        </div>
      </section>

      <div className="relative mx-auto h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

      {/* 개인 분석 대시보드: 인기 검색어가 히어로 우측 사이드바로 옮겨가며, 이 자리는 풀 위드
          캘린더+월간 무드 통계 대시보드가 이어받았다. 커뮤니티 베스트 쇼케이스는 그 아래에 이어진다. */}
      <main className="relative mx-auto max-w-6xl px-6 py-16">
        <MonthlyDashboardPanel />

        <HomeBestShowcase />
      </main>

      {/* 오늘의 무의식 위상 상세 운세 모달 - 일반 모달 티어(z-[100], 앱 전체 공통). */}
      {moonPhase && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center px-4 transition-opacity duration-300 ${
            isMoonModalOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMoonModalOpen(false)}
          />

          <div
            className={`relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl transition-all duration-500 ease-out ${
              isMoonModalOpen ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={() => setIsMoonModalOpen(false)}
              aria-label="닫기"
              className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
            >
              ✕
            </button>

            <div className="text-center">
              <span className="relative inline-flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 -z-10 rounded-full bg-violet-300/40 blur-xl" />
                <MoonIcon illumination={moonPhase.illumination} isWaxing={moonPhase.is_waxing} size={56} />
              </span>
              <p className="mt-3 text-xs tracking-widest text-indigo-300/70 uppercase">오늘의 무의식 위상</p>
              <h3 className="mt-1 text-2xl font-semibold text-white">오늘의 {moonPhase.phase_name}</h3>
              <p className="mt-2 text-lg font-medium text-violet-200">
                길몽 확률 {moonPhase.luck_percent}% · {moonPhase.summary}
              </p>
            </div>

            <p className="mt-6 text-sm leading-relaxed text-slate-300">{moonPhase.description}</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <p className="text-xs text-indigo-300/70">행운의 아이템</p>
                <div className="mt-1 flex items-center justify-center gap-1.5">
                  <span className="text-base leading-none">{moonPhase.lucky_item_emoji}</span>
                  <p className="font-medium text-white">{moonPhase.lucky_item}</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed tracking-wide text-slate-400">
                  {moonPhase.lucky_item_reason}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <p className="text-xs text-indigo-300/70">행운의 컬러</p>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-white/40 shadow-[0_0_10px_rgba(255,255,255,0.25)]"
                    style={{ backgroundColor: moonPhase.lucky_color_hex }}
                  />
                  <p className="font-medium text-white">{moonPhase.lucky_color}</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed tracking-wide text-slate-400">
                  {moonPhase.lucky_color_reason}
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
              길몽 확률은 당일 밤하늘 달의 에너지 파장과 전 세계 무의식 기록 데이터를 바탕으로 AI가 실시간으로
              측정합니다.
            </p>
          </div>
        </div>
      )}

      {/* 히어로 즉시 해몽 결과 모달 - 클릭 즉시 열리고, interpretation이 도착하기 전까지는
          로딩 화면을, 도착하면 곧바로 같은 자리에서 결과 카드로 바뀐다(별도 라우팅 없음). */}
      {isHeroModalOpen && heroSurvey && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeHeroModal} />

          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl">
            <button
              type="button"
              onClick={closeHeroModal}
              aria-label="닫기"
              className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
            >
              ✕
            </button>

            <div className="text-center">
              <p className="text-xs tracking-widest text-indigo-300/70 uppercase">AI Dream Interpretation</p>
              <h3 className="mt-1 text-2xl font-semibold text-white">{heroSurvey.title || "제목 없는 꿈"}</h3>
            </div>
            <div className="mt-4">
              <DreamOriginalQuote content={buildDreamOriginalContent(heroSurvey)} />
            </div>

            {!heroInterpretation ? (
              // 라이트 유저(로그인 여부와 무관하게 홈 히어로 진입)는 항상 씨앗 컨텍스트가 없는
              // State A(3장 튜토리얼) - 대기 시간을 씨앗 시스템 온보딩으로 그대로 활용한다.
              <DreamAnalyzerLoading />
            ) : (
              // 로딩 중 이미 씨앗 시스템 온보딩이 끝났지만, 유저가 "결과를 전부 보고 싶다"고
              // 요청해 태그/전문가 시선/행운 아이템/마음 읽기까지 다시 전부 노출한다 - 홈의 30초
              // 체험은 결과를 티저로 가리지 않고 전부 공개하고, "저장"이라는 다음 행동에서만
              // 로그인을 요구해 가입 전환을 유도하는 기존 방침으로 되돌아간다.
              <>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {heroInterpretation.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1 text-xs text-violet-200"
                    >
                      {tag.startsWith("#") ? tag : `#${tag}`}
                    </span>
                  ))}
                </div>

                <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-300">
                  {heroInterpretation.description}
                </p>

                <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-200">
                      {heroInterpretation.expert_badge}
                    </span>
                    <span className="text-xs text-violet-300/80">{heroInterpretation.selected_expert}의 시선</span>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{heroInterpretation.expert_insight}</p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-center text-xs text-indigo-300/70">행운의 아이템</p>
                    <p className="mt-1.5 text-center font-medium text-white">{heroInterpretation.lucky_item}</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{heroInterpretation.lucky_item_reason}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-center text-xs text-indigo-300/70">행운의 숫자</p>
                    <p className="mt-1.5 text-center font-medium text-white">{heroInterpretation.lucky_number}</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{heroInterpretation.lucky_number_reason}</p>
                  </div>
                </div>

                {heroInterpretation.counseling_report && (
                  <div className="mt-6">
                    <CounselingStoryView report={heroInterpretation.counseling_report} tags={heroInterpretation.tags} />
                  </div>
                )}

                <div className="mt-7 text-center">
                  {isAuthenticated ? (
                    <button
                      type="button"
                      onClick={continueToFullRecord}
                      className="w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
                    >
                      🌱 이 꿈 일기장에 보관하고 첫 씨앗 심기
                    </button>
                  ) : (
                    <button
                      type="button"
                      // 로그인 모달만 그 위에 띄우고 이 결과 모달은 그대로 유지한다 - 결과는 이미
                      // sessionStorage에 백업돼 있어, 로그인만 끝나면(이메일/비밀번호든 구글 OAuth로
                      // 리다이렉트됐다 돌아오든) NavBar의 자동 동기화 효과가 곧장 저장을 이어간다.
                      onClick={() => openLoginModal({ triggerSource: "save" })}
                      className="w-full rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-transform hover:-translate-y-0.5"
                    >
                      🔒 이 꿈 일기장에 보관하고 첫 씨앗 심기
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <LiveTicker />
    </div>
  );
}
