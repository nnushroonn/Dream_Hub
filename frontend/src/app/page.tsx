"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { decodeAccessToken } from "@/api/auth";
import {
  getBestDreams,
  getExplorerCount,
  getMoonPhase,
  getTrends,
  type BestDream,
  type MoonPhase,
  type Trend,
} from "@/api/dream";
import DreamCalendarWidget from "@/components/DreamCalendarWidget";
import LiveTicker from "@/components/LiveTicker";
import MoonIcon from "@/components/MoonIcon";
import NavBar from "@/components/NavBar";
import { DICTIONARY_CATEGORIES } from "@/lib/dictionaryCategories";
import { useAuthStore } from "@/store/useAuthStore";

const EXPLORER_COUNT_POLL_MS = 5000;

// 사전 포털 보드의 미니 카테고리 숏컷 - 표시용 라벨/이모지는 좀 더 짧게 다듬되,
// 실제 라우팅 값(label)은 DICTIONARY_CATEGORIES의 진짜 카테고리명과 정확히 일치시켜
// /dictionary?category= 필터가 그대로 맞물리게 한다.
interface PortalCategoryShortcut {
  label: string;
  display: string;
  emoji: string;
}

const PORTAL_CATEGORY_SHORTCUTS: PortalCategoryShortcut[] = [
  { label: "사람/인물", display: "인물", emoji: "👥" },
  { label: "동물/식물", display: "동물", emoji: "🦁" },
  { label: "자연/장소", display: "자연", emoji: "🏙️" },
];

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

const CARD_BANNERS = [
  "from-violet-600/40 via-fuchsia-500/25 to-indigo-600/40",
  "from-indigo-600/40 via-purple-500/25 to-pink-500/30",
  "from-fuchsia-600/30 via-violet-500/25 to-blue-600/40",
  "from-blue-600/30 via-indigo-500/25 to-fuchsia-600/30",
];

// 1~3위는 골드/실버/브론즈 네온 톤으로 순위 숫자와 카드 호버 글로우를 특별하게 강조한다.
function rankStyle(index: number): { number: string; row: string } {
  switch (index) {
    case 0:
      return {
        number: "text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.85)]",
        row: "hover:border-amber-300/60 hover:shadow-[0_0_30px_rgba(252,211,77,0.35)]",
      };
    case 1:
      return {
        number: "text-slate-200 drop-shadow-[0_0_10px_rgba(226,232,240,0.75)]",
        row: "hover:border-slate-200/50 hover:shadow-[0_0_25px_rgba(226,232,240,0.25)]",
      };
    case 2:
      return {
        number: "text-orange-300 drop-shadow-[0_0_10px_rgba(253,186,116,0.7)]",
        row: "hover:border-orange-300/50 hover:shadow-[0_0_25px_rgba(253,186,116,0.3)]",
      };
    default:
      return {
        number: "text-violet-400/70",
        row: "hover:border-violet-300/40 hover:shadow-[0_0_20px_rgba(167,139,250,0.25)]",
      };
  }
}

export default function HomePage() {
  const router = useRouter();
  const { login } = useAuthStore();

  const [trends, setTrends] = useState<Trend[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(true);
  const [bestDreams, setBestDreams] = useState<BestDream[]>([]);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [stars, setStars] = useState<Star[]>([]);
  const [moonPhase, setMoonPhase] = useState<MoonPhase | null>(null);
  const [isMoonModalOpen, setIsMoonModalOpen] = useState(false);
  const [explorerCount, setExplorerCount] = useState<number | null>(null);
  const [heroSearchQuery, setHeroSearchQuery] = useState("");

  // 구글 로그인 콜백이 ?token=...으로 리다이렉트해서 돌아왔을 때 처리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return;

    const payload = decodeAccessToken(token);
    if (payload?.email) {
      login({ id: Number(payload.sub), email: payload.email }, token);
    }
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getTrends()
      .then(setTrends)
      .catch(() => {})
      .finally(() => setIsLoadingTrends(false));
    getBestDreams().then(setBestDreams).catch(() => {});
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

  const handleHeroSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = heroSearchQuery.trim();
    if (!trimmed) return;
    router.push(`/dictionary?search=${encodeURIComponent(trimmed)}`);
  };

  // 모달이 열려 있을 때 Esc로도 닫을 수 있도록 처리
  useEffect(() => {
    if (!isMoonModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMoonModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoonModalOpen]);

  const toggleEmpathy = (dreamId: number) => {
    // TODO: 실제 구현 시 공감 API 연동 (현재는 낙관적 로컬 상태만 반영)
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(dreamId)) {
        next.delete(dreamId);
      } else {
        next.add(dreamId);
      }
      return next;
    });
    setBestDreams((prev) =>
      prev.map((dream) =>
        dream.id === dreamId
          ? { ...dream, empathy_count: dream.empathy_count + (likedIds.has(dreamId) ? -1 : 1) }
          : dream
      )
    );
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
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

      {/* 히어로 섹션 */}
      <section className="relative px-6 py-28 text-center">
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
            지난밤, 어떤 꿈을 꾸셨나요?
          </h1>
          <p className="mt-4 text-slate-400">당신의 무의식이 건네는 이야기를 함께 기록해봐요.</p>

          {/* 호버 시 빛이 퍼지는 마이크로 인터랙션 */}
          <div className="group relative mt-10 inline-block">
            <div className="absolute inset-0 rounded-full bg-violet-500 opacity-40 blur-xl transition-all duration-300 ease-out group-hover:opacity-90 group-hover:blur-2xl group-hover:scale-125" />
            <Link
              href="/diary"
              className="relative inline-block rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-9 py-4 text-base font-semibold text-white transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-105"
            >
              오늘의 꿈 기록하기
            </Link>
          </div>

          {/* 꿈해몽 사전 포털 보드: 검색 + 사전 바로가기 + 카테고리 숏컷을 하나의 보드로 통합 */}
          <div className="group relative mt-8 w-full max-w-xl">
            <div className="absolute inset-0 rounded-3xl bg-purple-500/20 opacity-40 blur-2xl transition-all duration-300 ease-out group-hover:opacity-80 group-hover:blur-[48px]" />
            <div className="relative overflow-hidden rounded-3xl border border-purple-400/20 bg-white/5 p-6 text-left backdrop-blur-md transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-purple-400/50 group-hover:shadow-[0_0_45px_rgba(168,85,247,0.3)]">
              <p className="text-xs tracking-widest text-purple-300/70 uppercase">🔮 Dream Dictionary</p>

              <form onSubmit={handleHeroSearchSubmit} className="mt-3">
                <div className="flex items-center gap-2 rounded-full border border-violet-400/30 bg-black/20 px-5 py-3 transition-colors focus-within:border-violet-400/60">
                  <span className="text-base">🔍</span>
                  <input
                    type="text"
                    value={heroSearchQuery}
                    onChange={(event) => setHeroSearchQuery(event.target.value)}
                    placeholder="🔍 '하늘을 나는 꿈', '뱀에게 물리는 꿈'처럼 떠오르는 구절을 편하게 검색해 보세요."
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500/80 focus:outline-none"
                  />
                </div>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/dictionary"
                  className="rounded-full border border-purple-400/30 bg-purple-500/10 px-4 py-1.5 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:border-purple-300/60 hover:bg-purple-500/20"
                >
                  <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-purple-300 bg-clip-text text-transparent">
                    📖 꿈해몽 사전 전체 보기 ➔
                  </span>
                </Link>

                <span className="h-4 w-px bg-white/10" />

                {PORTAL_CATEGORY_SHORTCUTS.map((category) => (
                  <button
                    key={category.label}
                    type="button"
                    onClick={() => router.push(`/dictionary?category=${encodeURIComponent(category.label)}`)}
                    className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-purple-400/40 hover:bg-purple-500/10 hover:text-purple-200"
                  >
                    <span>{category.emoji}</span>
                    {category.display}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative mx-auto h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

      <main className="relative mx-auto max-w-5xl px-6 py-16">
        <DreamCalendarWidget />

        {/* 카테고리 퀵 숏컷: 사전의 대분류를 홈에서 바로 필터링해 진입 */}
        <section className="mx-auto mt-14 max-w-3xl">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {DICTIONARY_CATEGORIES.map((category) => (
              <button
                key={category.label}
                type="button"
                onClick={() => router.push(`/dictionary?category=${encodeURIComponent(category.label)}`)}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-purple-400/40 hover:bg-purple-500/10 hover:text-purple-200"
              >
                <span>{category.emoji}</span>
                {category.label}
              </button>
            ))}
          </div>
        </section>

        {/* 실시간 트렌드 키워드: 꿈 기록소(공개 글) + 꿈해몽 사전(검색어) 실제 집계, 세로형 랭킹 리스트 */}
        <section className="mx-auto mt-16 max-w-2xl">
          <h2 className="text-center text-lg font-semibold text-slate-100">✨ 실시간 트렌드 키워드</h2>
          <div className="mt-5 flex flex-col gap-3">
            {isLoadingTrends ? (
              Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="flex w-full animate-pulse items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
                >
                  <span className="h-6 w-6 shrink-0 rounded-full bg-white/10" />
                  <span className="h-4 flex-1 rounded-full bg-white/10" />
                  <span className="h-3 w-10 shrink-0 rounded-full bg-white/10" />
                </div>
              ))
            ) : trends.length > 0 ? (
              trends.map((trend, index) => {
                const style = rankStyle(index);
                return (
                  <button
                    key={trend.keyword}
                    type="button"
                    onClick={() => router.push(`/dictionary?search=${encodeURIComponent(trend.keyword)}`)}
                    className={`group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:cursor-pointer hover:bg-white/10 ${style.row}`}
                  >
                    <span className={`w-8 shrink-0 text-center text-2xl font-bold ${style.number}`}>
                      {index + 1}
                    </span>
                    <span className="flex-1 truncate font-medium text-slate-100">{toHashtagDisplay(trend.keyword)}</span>
                    <span className="shrink-0 text-sm text-violet-300/80">{trend.count}회</span>
                    <span className="ml-1 -translate-x-1 text-violet-300/0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-violet-300/90">
                      ➔
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-center text-xs text-slate-500">
                아직 트렌드로 집계된 꿈이 없어요. 첫 기록을 남겨보세요 ✨
              </p>
            )}
          </div>
        </section>

        {/* 오늘의 베스트 꿈 */}
        <section className="mt-16">
          <h2 className="text-lg font-semibold text-slate-100">🌠 오늘의 베스트 꿈</h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {bestDreams.map((dream, index) => {
              const isLiked = likedIds.has(dream.id);
              return (
                <article
                  key={dream.id}
                  className="group overflow-hidden rounded-2xl border border-violet-400/10 bg-violet-950/30 backdrop-blur-md transition-all duration-300 hover:-translate-y-2 hover:border-violet-400/40 hover:bg-violet-950/50 hover:shadow-2xl hover:shadow-violet-900/40"
                >
                  {/* 몽환적인 파스텔톤 썸네일 배너 */}
                  <div
                    className={`relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br ${
                      CARD_BANNERS[index % CARD_BANNERS.length]
                    }`}
                  >
                    <span className="text-6xl opacity-40 blur-[0.5px] transition-transform duration-300 group-hover:scale-110">
                      {dream.emotion}
                    </span>
                  </div>

                  <div className="p-6">
                    <h3 className="font-semibold text-white">{dream.title}</h3>
                    <p className="mt-3 line-clamp-2 text-sm text-slate-400">{dream.content}</p>
                    <span className="mt-4 block text-xs text-slate-500">by {dream.author}</span>
                    <button
                      type="button"
                      onClick={() => toggleEmpathy(dream.id)}
                      className={`mt-3 flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-xs transition-colors ${
                        isLiked
                          ? "border-violet-400 bg-violet-500/30 text-violet-100"
                          : "border-white/10 text-slate-400 hover:border-violet-400/40 hover:text-violet-200"
                      }`}
                    >
                      🙋 저도 이런 꿈 꾼 적 있어요 <span>{dream.empathy_count}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
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

      <LiveTicker />
    </div>
  );
}
