"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { DreamMood } from "@/api/dream";
import {
  getDictionaryScenarios,
  getRecentPublicDreams,
  getScenarioDetail,
  getTrendingKeywords,
  searchDictionary,
} from "@/api/dictionary";
import type { DictionaryEntry, DreamScenario, RecentDreamTitle, ScenarioDetail, TrendingKeyword } from "@/api/dictionary";
import NavBar from "@/components/NavBar";
import { ALL_DICTIONARY_WORDS, BASIC_CHOSEONG, DICTIONARY_CATEGORIES } from "@/lib/dictionaryCategories";
import { getChoseong } from "@/lib/hangul";

// 홈/꿈 기록소와 완전히 분리된 페이지 - 여기서 쓰는 모든 상태(검색어, 결과, 트렌드 등)는
// 이 컴포넌트 트리 밖으로 절대 새어나가지 않는다.

const MOOD_BADGE: Record<DreamMood, { label: string; className: string }> = {
  good: { label: "길몽", className: "border-amber-400/30 bg-amber-400/15 text-amber-300" },
  neutral: { label: "평몽", className: "border-white/20 bg-white/10 text-slate-200" },
  nightmare: { label: "흉몽", className: "border-purple-400/30 bg-purple-500/15 text-purple-300" },
};

function rankAccent(index: number): string {
  if (index === 0) return "text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.85)]";
  if (index === 1) return "text-slate-200 drop-shadow-[0_0_10px_rgba(226,232,240,0.75)]";
  if (index === 2) return "text-orange-300 drop-shadow-[0_0_10px_rgba(253,186,116,0.7)]";
  return "text-violet-400/70";
}

/** 매일 조금씩 바뀌는 "오늘의 추천 상징" - 실제 유저 데이터가 아닌 큐레이션 목록에서
 * 날짜를 시드로 결정적으로 골라내는 것이라, 새로고침해도 하루 동안은 같은 결과를 보여준다. */
function pickDailyWords(words: string[], count: number, seed: number): string[] {
  if (words.length === 0) return [];
  const start = seed % words.length;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(words[(start + i * 7) % words.length]);
  }
  return Array.from(new Set(picked));
}

function findCategoryLabel(word: string): string {
  const found = DICTIONARY_CATEGORIES.find((category) => category.words.includes(word));
  return found ? found.label : "자유 검색";
}

/** 시나리오 제목 안에서 검색 키워드 부분만 포인트 컬러로 하이라이트한다. */
function HighlightedTitle({ title, keyword }: { title: string; keyword: string }) {
  if (!keyword) return <>{title}</>;
  const parts = title.split(keyword);
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && <span className="font-semibold text-purple-400">{keyword}</span>}
        </span>
      ))}
    </>
  );
}

export default function DictionaryPage() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [activeChoseong, setActiveChoseong] = useState<string | null>(null);

  // 상세 상황별 꿈 아카이브 뷰 - 단어를 클릭하면 브라우즈 화면이 이 뷰로 교체된다.
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [essence, setEssence] = useState<DictionaryEntry | null>(null);
  const [scenarios, setScenarios] = useState<DreamScenario[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // 시나리오 한 줄을 클릭하면 뜨는 최종 심층 해몽 모달
  const [scenarioModal, setScenarioModal] = useState<ScenarioDetail | null>(null);
  const [isLoadingScenario, setIsLoadingScenario] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  const [trending, setTrending] = useState<TrendingKeyword[]>([]);
  const [recentDreams, setRecentDreams] = useState<RecentDreamTitle[]>([]);
  const [dailyPicks, setDailyPicks] = useState<string[]>([]);

  useEffect(() => {
    getTrendingKeywords().then(setTrending).catch(() => {});
    getRecentPublicDreams().then(setRecentDreams).catch(() => {});
    // 날짜 기반 계산이라 서버/클라이언트 렌더 불일치를 피하려고 마운트 이후에만 채운다.
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
    );
    setDailyPicks(pickDailyWords(ALL_DICTIONARY_WORDS, 3, dayOfYear));
  }, []);

  // selectedKeyword가 바뀔 때마다 살짝 아래에서 떠오르듯 페이드인 시킨다.
  useEffect(() => {
    if (!selectedKeyword) return;
    setDetailVisible(false);
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setDetailVisible(true));
    });
    return () => cancelAnimationFrame(raf1);
  }, [selectedKeyword]);

  const openKeywordDetail = async (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed || isLoadingDetail) return;

    setQuery(trimmed);
    setActiveChoseong(null);
    setSelectedKeyword(trimmed);
    setEssence(null);
    setScenarios([]);
    setDetailError(null);
    setIsLoadingDetail(true);
    try {
      const [entryResult, scenarioResult] = await Promise.all([
        searchDictionary(trimmed),
        getDictionaryScenarios(trimmed),
      ]);
      setEssence(entryResult);
      setScenarios(scenarioResult);
      // 방금 검색한 단어가 실시간으로 트렌드 순위에도 반영되도록 다시 불러온다.
      getTrendingKeywords().then(setTrending).catch(() => {});
    } catch {
      setDetailError("사전 검색에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeKeywordDetail = () => {
    setSelectedKeyword(null);
    setEssence(null);
    setScenarios([]);
    setDetailError(null);
  };

  const openScenario = async (scenario: DreamScenario) => {
    if (!selectedKeyword || isLoadingScenario) return;
    setScenarioError(null);
    setIsLoadingScenario(true);
    try {
      const detail = await getScenarioDetail(selectedKeyword, scenario.title);
      setScenarioModal(detail);
    } catch {
      setScenarioError("세부 해몽을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoadingScenario(false);
    }
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    openKeywordDetail(query);
  };

  const choseongMatches = activeChoseong
    ? ALL_DICTIONARY_WORDS.filter((word) => getChoseong(word.charAt(0)) === activeChoseong)
    : [];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* 오로라 블러 배경 (다른 화면들과 동일한 무드) */}
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
      </div>

      <NavBar />

      <main className="relative mx-auto max-w-5xl px-6 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">🔮 꿈해몽 사전</h1>
          <p className="mt-1 text-sm text-slate-400">꿈에 나온 상징 하나를 검색하면, AI가 즉시 사전 풀이를 들려드려요.</p>
        </div>

        {/* 대형 검색창: 브라우즈/상세 화면 어디서든 항상 접근 가능 */}
        <form onSubmit={handleSearchSubmit} className="relative mx-auto mt-8 max-w-2xl">
          <div className="absolute inset-0 rounded-full bg-violet-500/20 opacity-60 blur-xl" />
          <div className="relative flex items-center gap-2 rounded-full border border-violet-400/30 bg-white/5 px-6 py-4 shadow-[0_0_40px_rgba(139,92,246,0.2)] backdrop-blur-md focus-within:border-violet-400/60">
            <span className="text-lg">🔍</span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="꿈에서 본 상징을 검색해 보세요 (예: 뱀, 이빨, 바다...)"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500/80 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!query.trim() || isLoadingDetail}
              className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingDetail ? "검색 중..." : "검색"}
            </button>
          </div>
        </form>

        {!selectedKeyword ? (
          <>
            {/* 초성 색인 바 */}
            <div className="relative mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-1.5">
              {BASIC_CHOSEONG.map((cho) => (
                <button
                  key={cho}
                  type="button"
                  onClick={() => setActiveChoseong((prev) => (prev === cho ? null : cho))}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium transition-all duration-200 ${
                    activeChoseong === cho
                      ? "border-violet-400/70 bg-violet-500/25 text-white shadow-[0_0_12px_rgba(167,139,250,0.4)]"
                      : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/30 hover:text-slate-200"
                  }`}
                >
                  {cho}
                </button>
              ))}
            </div>

            {/* 초성 클릭 시 나타나는 필터 팝오버 */}
            {activeChoseong && (
              <div className="relative mx-auto mt-4 max-w-2xl rounded-2xl border border-violet-400/20 bg-white/5 p-4 backdrop-blur-md">
                <p className="text-xs text-violet-300/70">‘{activeChoseong}’으로 시작하는 상징</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {choseongMatches.length > 0 ? (
                    choseongMatches.map((word) => (
                      <button
                        key={word}
                        type="button"
                        onClick={() => openKeywordDetail(word)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300 transition-colors hover:border-purple-400/40 hover:bg-purple-500/20 hover:text-white"
                      >
                        {word}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">이 초성으로 시작하는 큐레이션 단어가 아직 없어요.</p>
                  )}
                </div>
              </div>
            )}

            {/* 2차 카테고리 칩 그리드 */}
            <section className="mt-10 space-y-4">
              {DICTIONARY_CATEGORIES.map((category) => (
                <div
                  key={category.label}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md sm:flex-row sm:items-center"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-32">
                    <span className="text-lg">{category.emoji}</span>
                    <span className="text-sm font-medium text-slate-200">{category.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {category.words.map((word) => (
                      <button
                        key={word}
                        type="button"
                        onClick={() => openKeywordDetail(word)}
                        className="rounded-full bg-white/5 px-3 py-1 text-sm text-slate-300 transition-colors hover:bg-purple-500/20 hover:text-white"
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {/* 하단 3열 트렌드 대시보드 */}
            <section className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* 1열: 인기 검색어 랭킹 */}
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
                <h3 className="text-sm font-semibold text-slate-100">🏆 인기 검색어</h3>
                <div className="mt-4 space-y-2.5">
                  {trending.length > 0 ? (
                    trending.map((item, index) => (
                      <button
                        key={item.keyword}
                        type="button"
                        onClick={() => openKeywordDetail(item.keyword)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                      >
                        <span className={`w-5 shrink-0 text-sm font-bold ${rankAccent(index)}`}>{index + 1}</span>
                        <span className="flex-1 truncate text-sm text-slate-200">{item.keyword}</span>
                        <span className="shrink-0 text-xs text-slate-500">{item.count}회</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">아직 검색된 상징이 없어요. 첫 검색을 남겨보세요 ✨</p>
                  )}
                </div>
              </div>

              {/* 2열: 실시간 꿈 이야기 */}
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
                <h3 className="text-sm font-semibold text-slate-100">🌙 실시간 꿈 이야기</h3>
                <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                  {recentDreams.length > 0 ? (
                    recentDreams.map((dream, index) => (
                      <div key={`${dream.title}-${index}`} className="flex items-start gap-2.5 border-l-2 border-violet-400/30 pl-3">
                        <span className="mt-0.5 text-base leading-none">{dream.emotion}</span>
                        <div>
                          <p className="text-sm text-slate-200">{dream.title}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{dream.dream_date}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">아직 공개로 공유된 꿈이 없어요.</p>
                  )}
                </div>
              </div>

              {/* 3열: 오늘의 추천 상징 */}
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
                <h3 className="text-sm font-semibold text-slate-100">✨ 오늘의 추천 상징</h3>
                <div className="mt-4 space-y-2">
                  {dailyPicks.map((word) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => openKeywordDetail(word)}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:border-violet-400/30 hover:bg-purple-500/10"
                    >
                      {word}
                      <span className="text-violet-300/60">→</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : (
          /* 상황별 세부 꿈 아카이브 뷰 - 브라우즈 화면을 대체한다 */
          <section
            className={`mt-8 transition-all duration-500 ease-out ${
              detailVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            {/* 분류 경로 브레드크럼 */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <button type="button" onClick={closeKeywordDetail} className="transition-colors hover:text-violet-300">
                분류별 검색
              </button>
              <span>›</span>
              <span>{findCategoryLabel(selectedKeyword)}</span>
              <span>›</span>
              <span className="text-violet-300">{selectedKeyword}</span>
            </div>

            {isLoadingDetail && (
              <div className="mt-6 flex flex-col items-center gap-3 py-10 text-center">
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,rgba(167,139,250,0.05),rgba(167,139,250,0.9),rgba(99,102,241,0.05))] blur-[1px]" />
                  <div className="absolute inset-1.5 rounded-full bg-slate-950" />
                </div>
                <p className="text-sm text-violet-200">AI가 사전과 상황별 시나리오를 함께 준비하는 중...</p>
              </div>
            )}

            {detailError && !isLoadingDetail && (
              <p className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-300">
                {detailError}
              </p>
            )}

            {!isLoadingDetail && !detailError && essence && (
              <>
                {/* 심리학적 본질 요약 구역 */}
                <div className="relative mt-4 overflow-hidden rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-6 backdrop-blur-md">
                  <p className="text-xs tracking-widest text-indigo-300/70 uppercase">Dream Dictionary</p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">{essence.keyword}</h2>
                  <p className="mt-1 text-sm text-violet-200">{essence.summary}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{essence.psychological_meaning}</p>

                  {essence.related_keywords.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {essence.related_keywords.map((word) => (
                        <button
                          key={word}
                          type="button"
                          onClick={() => openKeywordDetail(word)}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-purple-400/40 hover:bg-purple-500/20 hover:text-white"
                        >
                          #{word}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 글래스모피즘 세부 시나리오 테이블 */}
                <div className="mt-6">
                  <p className="px-1 text-xs text-slate-500">‘{selectedKeyword}’이(가) 등장하는 상황별 꿈 {scenarios.length}가지</p>
                  <div className="mt-2 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
                    {scenarios.map((scenario) => {
                      const badge = MOOD_BADGE[scenario.mood];
                      return (
                        <button
                          key={scenario.title}
                          type="button"
                          onClick={() => openScenario(scenario)}
                          disabled={isLoadingScenario}
                          className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-all hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                        >
                          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="flex-1 text-sm text-slate-200">
                            <HighlightedTitle title={scenario.title} keyword={selectedKeyword} />
                          </span>
                          <span className="shrink-0 text-slate-600">›</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {scenarioError && (
                  <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-300">
                    {scenarioError}
                  </p>
                )}
              </>
            )}
          </section>
        )}
      </main>

      {/* 최종 상세 해몽 모달: 시나리오 한 줄을 클릭하면 뜬다 */}
      {(isLoadingScenario || scenarioModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isLoadingScenario && setScenarioModal(null)}
          />

          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-2xl">
            {!isLoadingScenario && (
              <button
                type="button"
                onClick={() => setScenarioModal(null)}
                aria-label="닫기"
                className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
              >
                ✕
              </button>
            )}

            {isLoadingScenario && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,rgba(167,139,250,0.05),rgba(167,139,250,0.9),rgba(99,102,241,0.05))] blur-[1px]" />
                  <div className="absolute inset-1.5 rounded-full bg-slate-950" />
                </div>
                <p className="text-sm text-violet-200">AI가 이 상황을 심층 해몽하는 중...</p>
              </div>
            )}

            {scenarioModal && !isLoadingScenario && (
              <div>
                <span
                  className={`inline-block rounded-full border px-2.5 py-1 text-[11px] font-medium ${MOOD_BADGE[scenarioModal.mood].className}`}
                >
                  {MOOD_BADGE[scenarioModal.mood].label}
                </span>
                <h3 className="mt-3 text-xl font-semibold text-white">{scenarioModal.title}</h3>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-medium text-violet-300/80">🔮 심층 해몽</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{scenarioModal.interpretation}</p>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-medium text-emerald-300/80">💡 현실 조언</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{scenarioModal.advice}</p>
                </div>

                <button
                  type="button"
                  onClick={() => router.push(`/diary?title=${encodeURIComponent(scenarioModal.title)}`)}
                  className="mt-6 w-full rounded-full border border-violet-400/40 bg-violet-500/15 px-5 py-2.5 text-sm font-semibold text-violet-100 transition-transform hover:-translate-y-0.5"
                >
                  📝 이 세부 상황으로 꿈 기록소 이동하기
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
