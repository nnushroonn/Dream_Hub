"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { decodeAccessToken, getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOneLineSummary,
  buildDreamOriginalContent,
  getExplorerCount,
  getMoonPhase,
  getTrends,
  requestQuickAiInterpretation,
  type AiInterpretation,
  type DreamSurvey,
  type MoonPhase,
  type Trend,
} from "@/api/dream";
import CounselingStoryView from "@/components/CounselingStoryView";
import DreamAnalyzerLoading from "@/components/DreamAnalyzerLoading";
import DreamCalendarWidget from "@/components/DreamCalendarWidget";
import DreamOriginalQuote from "@/components/DreamOriginalQuote";
import HomeBestShowcase from "@/components/HomeBestShowcase";
import LiveTicker from "@/components/LiveTicker";
import MoonIcon from "@/components/MoonIcon";
import NavBar from "@/components/NavBar";
import { setPendingDreamResult } from "@/lib/pendingDreamResult";
import { consumePendingRedirect } from "@/lib/pendingRedirect";
import { useAuthStore } from "@/store/useAuthStore";
import { useLoginModalStore } from "@/store/useLoginModalStore";

const EXPLORER_COUNT_POLL_MS = 5000;

interface Star {
  id: number;
  top: string;
  left: string;
  size: number;
  delay: string;
}

// 트렌드 키워드는 백엔드에서 이미 "하늘을 나는 꿈"처럼 공백이 있는 완전한 구절로 온다.
// 화면에는 해시태그처럼 보이도록 공백만 언더바로 바꿔 표시하고, 클릭 시에는 이 표시용
// 변환과 무관하게 원본 구절(trend.keyword)을 그대로 사전 검색어로 넘긴다 - 절대 단어를
// 임의로 쪼개거나 추출하지 않는다.
function toHashtagDisplay(keyword: string): string {
  return `#${keyword.trim().replace(/\s+/g, "_")}`;
}

export default function HomePage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const openLoginModal = useLoginModalStore((state) => state.open);

  const [trends, setTrends] = useState<Trend[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(true);
  const [stars, setStars] = useState<Star[]>([]);
  const [moonPhase, setMoonPhase] = useState<MoonPhase | null>(null);
  const [isMoonModalOpen, setIsMoonModalOpen] = useState(false);
  const [explorerCount, setExplorerCount] = useState<number | null>(null);
  const [heroSearchQuery, setHeroSearchQuery] = useState("");

  // 히어로에서 곧바로 트리거하는 즉시 해몽 모달 - 페이지 이동 없이 이 자리에서 로딩→결과를 보여준다.
  const [isHeroModalOpen, setIsHeroModalOpen] = useState(false);
  const [isHeroLoading, setIsHeroLoading] = useState(false);
  const [heroSurvey, setHeroSurvey] = useState<DreamSurvey | null>(null);
  const [heroInterpretation, setHeroInterpretation] = useState<AiInterpretation | null>(null);
  const [heroErrorMessage, setHeroErrorMessage] = useState<string | null>(null);

  // 구글 로그인 콜백이 ?token=...으로 리다이렉트해서 돌아왔을 때 처리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return;

    const payload = decodeAccessToken(token);
    if (payload?.email && payload.nickname) {
      login({ id: Number(payload.sub), email: payload.email, nickname: payload.nickname }, token);
    }
    window.history.replaceState({}, "", window.location.pathname);

    // 구글 로그인 직전에 "가져오기"나 "저장하기"처럼 원래 하려던 동작이 있었다면, 로그인이
    // 끝난 지금 그 목적지로 이어서 보낸다 - 없으면 평소처럼 홈에 그대로 머문다.
    const pendingRedirect = consumePendingRedirect();
    if (pendingRedirect) router.push(pendingRedirect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getTrends()
      .then(setTrends)
      .catch(() => {})
      .finally(() => setIsLoadingTrends(false));
    getMoonPhase().then(setMoonPhase).catch(() => {});
  }, []);

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

  // 별 입자는 서버/클라이언트 렌더 결과가 달라지는 걸 피하려고 마운트 이후에만 생성한다.
  useEffect(() => {
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

  // 히어로 입력창에 뭔가 적고 Enter를 치면(또는 "✨ 10초 AI 해몽 시작하기" 버튼) 페이지 이동 없이
  // 이 자리에서 곧장 해몽을 돌린다 - 진단 페이지(/diary)의 ⚡ 10초 빠른 기록과 같은 백엔드
  // (dream-interpretation-quick)를 쓰되, 결과는 홈 위에 뜨는 모달로만 보여준다.
  const handleHeroQuickRecord = async (event: FormEvent) => {
    event.preventDefault();
    if (isHeroLoading) return;
    const trimmed = heroSearchQuery.trim();
    if (!trimmed) return;

    // 홈 훅에는 별도 제목 입력칸이 없어, 서술 첫 줄을 짧게 잘라 제목으로 대신한다.
    const firstLine = trimmed.split(/\r?\n/)[0].trim();
    const title = firstLine.length > 0 ? firstLine.slice(0, 24) : "제목 없는 꿈";

    setHeroSurvey({
      title,
      brightness: "",
      space_depth: "",
      space_detail: "",
      identity_factor: "",
      target_detail: "",
      action_physics: "",
      action_detail: trimmed,
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
    try {
      const result = await requestQuickAiInterpretation(title, trimmed);
      setHeroInterpretation(result);
    } catch (error) {
      setHeroErrorMessage(getAuthErrorMessage(error));
      setIsHeroModalOpen(false);
    } finally {
      setIsHeroLoading(false);
    }
  };

  const closeHeroModal = () => setIsHeroModalOpen(false);

  // 비로그인 유저의 해몽 결과는 로그인(특히 구글 OAuth의 전체 페이지 리다이렉트)을 거치면
  // 리액트 상태가 통째로 날아간다 - 결과가 뜨는 즉시 sessionStorage에 백업해 두면, 로그인 후
  // NavBar의 자동 동기화 로직이 이 백업을 찾아 대신 저장을 이어갈 수 있다.
  useEffect(() => {
    if (isAuthenticated || !heroSurvey || !heroInterpretation) return;
    setPendingDreamResult({ survey: heroSurvey, interpretation: heroInterpretation, rawText: heroSearchQuery });
  }, [isAuthenticated, heroSurvey, heroInterpretation, heroSearchQuery]);

  // 저장은 날짜/기분/공개 여부를 고르는 정식 흐름이 필요해 홈에서 곧바로 처리하지 않고,
  // 이미 적은 내용을 그대로 들고 꿈 기록소로 이어간다(정식 프리필 파라미터를 그대로 재사용).
  const continueToFullRecord = () => {
    setIsHeroModalOpen(false);
    router.push(`/diary?quickText=${encodeURIComponent(heroSearchQuery.trim())}`);
  };

  // 모달이 열려 있을 때 Esc로도 닫을 수 있도록 처리
  useEffect(() => {
    if (!isMoonModalOpen && !isHeroModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMoonModalOpen(false);
      setIsHeroModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoonModalOpen, isHeroModalOpen]);

  return (
    // overflow-hidden을 여기 두면 어떤 자식이든 position: sticky가 조용히 깨진다(사이드바 광고
    // 포함). 배경의 오로라 블러/별 입자는 아래의 fixed 배경 레이어 자체가 이미 overflow-hidden으로
    // 스스로를 클리핑하고 있어, 이 바깥쪽 wrapper에는 더 이상 필요 없다.
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
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

      {/* 히어로 섹션 - 화면(헤더 제외) 안에서 수직/수평 완전 중앙 정렬 */}
      <section className="relative flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center px-6 text-center">
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
          <p className="mt-4 text-slate-400">기억나는 대로 적어주시면, 10초 만에 AI가 꿈의 의미를 풀어드릴게요.</p>

          {/* 무의식 기록 보드 - 짧은 검색어보다 풍부한 서사를 적도록 큰 텍스트 보드 + 작성 팁으로 유도한다. */}
          <form onSubmit={handleHeroQuickRecord} className="mt-10 flex w-full max-w-3xl flex-col gap-4">
            <div className="relative">
              {/* top-0 + -translate-y-1/2로 뱃지 높이와 무관하게 텍스트 입력창 상단 경계선
                  정중앙에 걸치도록 고정한다(고정 픽셀 오프셋 대신 상대 위치로 계산). */}
              <span className="absolute left-6 top-0 z-10 -translate-y-1/2 rounded-full border border-purple-500/40 bg-slate-800 px-3 py-1 text-xs font-medium tracking-wide text-purple-300">
                ✏️ 꿈 내용 적어보기
              </span>
              <textarea
                value={heroSearchQuery}
                onChange={(event) => setHeroSearchQuery(event.target.value)}
                placeholder="예: 하늘을 나는 꿈을 꿨어요. 갑자기 발밑이 사라지면서..."
                rows={5}
                className="min-h-[160px] w-full resize-none rounded-2xl border border-slate-700/50 bg-slate-900/50 px-8 py-6 text-lg text-white placeholder:text-slate-500 backdrop-blur-md outline-none transition-colors hover:border-purple-500/50 focus:ring-2 focus:ring-purple-500/30"
              />
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 text-left text-sm text-slate-300">
              <p className="mb-3 font-semibold text-purple-300">💡 Tip. 꿈 내용을 이렇게 작성해 보세요!</p>
              <ul className="space-y-1.5">
                <li>👤 1. 꿈에 어떤 사람이나 동물이 등장했는지 적어주세요.</li>
                <li>📍 2. 꿈이 펼쳐진 장소와 전체적인 분위기를 묘사해 주세요.</li>
                <li>🎬 3. 어떤 일들이 벌어졌는지 시간 순서대로 차근차근 적어주세요.</li>
                <li>🔍 4. 유독 기억에 남는 물건이나 특이한 행동이 있다면 꼭 포함해 주세요.</li>
                <li>❤️ 5. 꿈을 꿀 때와 깨어났을 때의 기분이 어땠는지 자세히 알려주세요.</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={isHeroLoading}
              className="h-14 w-full rounded-xl bg-purple-600 font-bold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isHeroLoading ? "해몽 중..." : "✨ 10초 AI 해몽 시작하기"}
            </button>

            {heroErrorMessage && (
              <p className="text-center text-xs text-red-300">{heroErrorMessage}</p>
            )}

            {/* 인기 키워드 - 사전/일기장 링크는 아래 홍보 카드 섹션으로 옮겨가, 여기는 트렌드
                해시태그 칩만 남는다. */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              {isLoadingTrends
                ? Array.from({ length: 5 }, (_, index) => (
                    <span key={index} className="h-8 w-20 animate-pulse rounded-full border border-slate-700 bg-white/5" />
                  ))
                : trends.slice(0, 8).map((trend) => (
                    <button
                      key={trend.keyword}
                      type="button"
                      onClick={() => router.push(`/dictionary?search=${encodeURIComponent(trend.keyword)}`)}
                      className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-300 transition-colors hover:bg-purple-900/30 hover:text-purple-200"
                    >
                      {toHashtagDisplay(trend.keyword)}
                    </button>
                  ))}
            </div>
          </form>
        </div>
      </section>

      {/* 핵심 기능 홍보 카드 - 사전/일기장으로 흩어져 있던 텍스트 링크를 이 2열 카드로 통합했다 */}
      <section className="relative mx-auto max-w-5xl px-6">
        <div className="my-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-purple-500/30 bg-slate-900/80 p-6 shadow-lg backdrop-blur-md transition-all hover:border-purple-500/60">
            <h3 className="text-lg font-semibold text-white">📖 방대한 무의식의 도감, 꿈해몽 사전</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              수천 가지 꿈의 상징과 숨겨진 의미를 키워드로 쉽게 찾아보세요.
            </p>
            <Link
              href="/dictionary"
              className="mt-5 inline-block rounded-full bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500"
            >
              사전 둘러보기
            </Link>
          </div>

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

      {/* 2단 반응형 대시보드: 데스크톱에서는 좌(개인 데이터)/우(커뮤니티 데이터)로 나뉘고,
          모바일(lg 미만)에서는 자연스럽게 한 줄로 쌓인다. */}
      <main className="relative mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* 좌측: 개인 데이터 영역 - 나의 꿈 별자리 캘린더 + 베스트 쇼케이스
              (사전 검색/카테고리 숏컷은 히어로의 무의식 입력 훅으로 흡수됐다) */}
          <div className="lg:col-span-8">
            {/* 광고 Slot B: 좌측 인피드 가로 배너 (728x90).
                주변 보드보다 한 톤 더 은은하게(white/[0.03]) 마감해 프리미엄 스폰서 자리처럼 보이게 한다. */}
            <div
              role="complementary"
              aria-label="광고 영역"
              className="mb-6 flex h-[90px] w-full items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]"
            >
              <span className="text-[11px] tracking-wide text-slate-600">Sponsored</span>
            </div>

            <DreamCalendarWidget />

            <HomeBestShowcase />
          </div>

          {/* 우측: 커뮤니티 데이터 영역 - 실시간 트렌드 키워드는 히어로 아래 태그 칩으로 옮겼다 */}
          <div className="lg:col-span-4">
            {/* 광고 Slot A: 우측 사이드바 고정석 (300x250/600) - 좌측이 더 길어 스크롤될 때
                lg:sticky로 뷰포트에 붙어 따라오다가, 사이드바(우측 컬럼) 하단에 닿으면 자연스럽게 멈춘다. */}
            <div
              role="complementary"
              aria-label="광고 영역"
              className="relative flex w-full min-h-[250px] items-start justify-start rounded-2xl border border-white/10 bg-white/5 p-4 lg:sticky lg:top-6 lg:min-h-[450px]"
            >
              <span className="absolute left-4 top-3 text-xs text-slate-500">Sponsored</span>
            </div>
          </div>
        </div>
      </main>

      {/* 오늘의 무의식 위상 상세 운세 모달 */}
      {moonPhase && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-300 ${
            isMoonModalOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMoonModalOpen(false)}
          />

          <div
            className={`relative w-full max-w-md rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl transition-all duration-500 ease-out ${
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
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xs leading-relaxed text-slate-400">
              {buildDreamOneLineSummary(heroSurvey)}
            </div>

            {!heroInterpretation ? (
              <DreamAnalyzerLoading />
            ) : (
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

                {/* 심층 분석/행운의 아이템/마음 읽기 - 홈의 10초 체험은 결과를 티저로 가리지 않고
                    전부 공개한다. 대신 "저장"이라는 다음 행동에서만 로그인을 요구해 가입 전환을 유도한다. */}
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
                      캘린더에 저장하고 확인
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
                      🔒 이 해몽을 내 일기장에 영구 저장하기
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
