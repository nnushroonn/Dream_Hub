"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getMyLikedDreams, type DreamFeedEntry } from "@/api/dream";
import AuraToggle from "@/components/AuraToggle";
import DreamClusterChart from "@/components/DreamClusterChart";
import GalaxyVisibilityToggle from "@/components/GalaxyVisibilityToggle";
import LevelBadgeBoard from "@/components/LevelBadgeBoard";
import MyActivityTabs from "@/components/MyActivityTabs";
import NavBar from "@/components/NavBar";
import NicknameEditor from "@/components/NicknameEditor";
import { DREAM_SEEDS, isDreamSeed } from "@/lib/dreamSeeds";
import { moodBucketForEmoji } from "@/lib/moodBucket";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

function todayDateInputValue(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 가장 최근 일기 날짜가 오늘/어제가 아니면 스트릭이 끊긴 것으로 본다. 그 다음부터는 하루씩
// 거슬러 올라가며 빈 날 없이 이어지는 구간의 길이를 센다.
function computeDiaryStreak(dates: string[]): number {
  const sorted = Array.from(new Set(dates)).sort((a, b) => b.localeCompare(a));
  if (sorted.length === 0) return 0;

  const oneDayMs = 86400000;
  const today = new Date(`${todayDateInputValue()}T00:00:00`);
  const mostRecent = new Date(`${sorted[0]}T00:00:00`);
  if (Math.round((today.getTime() - mostRecent.getTime()) / oneDayMs) > 1) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    const curr = new Date(`${sorted[i]}T00:00:00`);
    if (Math.round((prev.getTime() - curr.getTime()) / oneDayMs) === 1) streak++;
    else break;
  }
  return streak;
}

const STREAK_GOAL_DAYS = 7;
const CARD_CLASS = "rounded-3xl border border-purple-900/30 bg-slate-900/40 p-6 backdrop-blur-md";

export default function MyPage() {
  const router = useRouter();
  const allEntries = useSavedDreamsStore((state) => state.entries);
  const [likedDreams, setLikedDreams] = useState<DreamFeedEntry[]>([]);

  useEffect(() => {
    getMyLikedDreams()
      .then(setLikedDreams)
      .catch(() => {});
  }, []);

  // 🌌 은하계 대시보드 - /mypage/calendar, /mypage/stats는 백엔드가 하드코딩된 더미를
  // 내려줄 뿐이라(routers/mypage.py 주석 참고) 아예 쓰지 않는다. 대신 NavBar가 이미
  // 채워둔 useSavedDreamsStore 원본 기록에서 전부 실제 데이터로 계산한다.
  const seedStats = useMemo(() => {
    const counts = new Map(DREAM_SEEDS.map((seed) => [seed, 0]));
    for (const entry of allEntries) {
      if (entry.interpretation) continue; // 씨앗은 일기(해몽 전) 기록에만 심을 수 있다
      const seed = entry.tags.find(isDreamSeed);
      if (seed) counts.set(seed, (counts.get(seed) ?? 0) + 1);
    }
    return DREAM_SEEDS.map((seed) => ({ seed, count: counts.get(seed) ?? 0 }));
  }, [allEntries]);

  const diaryStats = useMemo(() => {
    const diaryDates = allEntries.filter((entry) => !entry.interpretation).map((entry) => entry.dream_date);
    return { totalCount: new Set(diaryDates).size, streak: computeDiaryStreak(diaryDates) };
  }, [allEntries]);

  const luckyDreamPercent = useMemo(() => {
    const dreamEntries = allEntries.filter((entry) => entry.interpretation);
    if (dreamEntries.length === 0) return null;
    const goodCount = dreamEntries.filter((entry) => moodBucketForEmoji(entry.emotion) === "good").length;
    return Math.round((goodCount / dreamEntries.length) * 100);
  }, [allEntries]);

  // 이번 달 꿈 달력 - AI 해몽까지 붙은 실제 꿈 기록만 대상으로, 날짜별 감정 이모지를 뽑는다.
  const dreamCalendarDays = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const emotionByDate = new Map<string, string>();
    for (const entry of allEntries) {
      if (!entry.interpretation) continue;
      if (!emotionByDate.has(entry.dream_date)) emotionByDate.set(entry.dream_date, entry.emotion);
    }
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { day, emotion: emotionByDate.get(dateStr) ?? null };
    });
  }, [allEntries]);

  // 자주 등장한 키워드 - 실제 AI 해몽 결과(interpretation.tags)를 전부 모아 빈도순으로 센다.
  const topKeywords = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of allEntries) {
      if (!entry.interpretation) continue;
      for (const tag of entry.interpretation.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [allEntries]);

  // 🌌 내 무의식 은하 공유하기 - 지금 이 대시보드의 스냅샷(내 데이터만)을 커뮤니티 자유 광장
  // 글쓰기 화면으로 넘긴다. 실제 게시 여부는 유저가 그 화면에서 직접 결정한다.
  const handleShareGalaxy = () => {
    const topSeed = [...seedStats].sort((a, b) => b.count - a.count)[0];
    const payload = {
      streak: diaryStats.streak,
      totalDiary: diaryStats.totalCount,
      luckyPercent: luckyDreamPercent,
      topSeed: topSeed && topSeed.count > 0 ? topSeed.seed : null,
      topKeywords: topKeywords.slice(0, 3).map((item) => item.keyword),
    };
    const params = new URLSearchParams({ type: "board", template: "galaxy", data: JSON.stringify(payload) });
    router.push(`/community/write?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0518] via-[#170b2e] to-black text-indigo-50">
      <NavBar />

      <main className="mx-auto max-w-6xl p-8">
        <h1 className="text-2xl font-semibold">마이페이지</h1>
        <p className="mt-1 text-sm text-indigo-300/70">나의 무의식 기록을 한눈에 확인해보세요.</p>

        {/* 1단: 유저 아이덴티티 성운 패널 */}
        <div className={`mt-6 ${CARD_CLASS}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <AuraToggle />
              <div className="min-w-0 flex-1">
                <NicknameEditor />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                type="button"
                onClick={handleShareGalaxy}
                className="rounded-full border border-purple-400/40 bg-transparent px-4 py-2 text-xs font-medium text-purple-200 transition-all hover:border-purple-400/70 hover:bg-purple-500/10"
              >
                🌌 내 무의식 은하 공유하기
              </button>
              <GalaxyVisibilityToggle />
            </div>
          </div>
          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <LevelBadgeBoard />
          </div>
        </div>

        {/* 2단: 현실 x 무의식 투트랙 그리드 스플릿 */}
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* LEFT: 현실의 발자국 아카이브 */}
          <div className="flex flex-col gap-6">
            <h2 className="text-lg font-semibold text-indigo-100">📝 현실의 발자국 아카이브</h2>

            <div className={CARD_CLASS}>
              <h3 className="text-sm font-semibold text-slate-200">연속 일기 작성</h3>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-4xl font-bold text-white">{diaryStats.streak}</span>
                <span className="pb-1 text-sm text-slate-400">일 연속 작성 중</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(diaryStats.streak / STREAK_GOAL_DAYS, 1) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">누적 {diaryStats.totalCount}개의 하루를 기록했어요.</p>
            </div>

            <div className={CARD_CLASS}>
              <h3 className="text-sm font-semibold text-slate-200">최근 심은 꿈 씨앗</h3>
              <div className="mt-5">
                <DreamClusterChart seedStats={seedStats} />
              </div>
            </div>
          </div>

          {/* RIGHT: 무의식의 우주 아카이브 */}
          <div className="flex flex-col gap-6">
            <h2 className="text-lg font-semibold text-indigo-100">🔮 무의식의 우주 아카이브</h2>

            <div className={`flex flex-1 flex-col ${CARD_CLASS}`}>
              <h3 className="text-sm font-semibold text-slate-200">이번 달 꿈 달력</h3>
              <div className="mt-4 grid h-full w-full grid-cols-7 gap-2">
                {dreamCalendarDays.map((day) => (
                  <div
                    key={day.day}
                    className="flex aspect-square w-full flex-col items-center justify-center rounded-xl border border-purple-900/40 bg-purple-950/20 text-xs"
                  >
                    <span className="text-purple-400/70">{day.day}</span>
                    <span className="mt-1 text-lg">{day.emotion ?? "·"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={CARD_CLASS}>
              <h3 className="text-sm font-semibold text-slate-200">자주 등장한 키워드</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {topKeywords.length === 0 ? (
                  <p className="text-xs text-slate-600">아직 해몽 키워드가 쌓이지 않았어요.</p>
                ) : (
                  topKeywords.map((item) => (
                    <span
                      key={item.keyword}
                      className="rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs text-purple-200"
                    >
                      #{item.keyword} <span className="text-purple-400/60">{item.count}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3단: 커뮤니티 연동 스크랩북 - 내가 공감 누른 타인의 공개 꿈 기록 타임라인 슬라이더 */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-indigo-100">💫 내가 담아둔 신비로운 순간들</h2>
          <p className="mt-1 text-xs text-indigo-300/60">커뮤니티에서 공감을 눌러 간직해둔 다른 탐험가의 꿈이에요.</p>

          {likedDreams.length === 0 ? (
            <p className="mt-4 rounded-3xl border border-purple-900/30 bg-slate-900/40 px-4 py-8 text-center text-xs text-slate-500 backdrop-blur-md">
              아직 담아둔 꿈이 없어요. 커뮤니티에서 마음에 드는 꿈에 공감을 눌러보세요.
            </p>
          ) : (
            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {likedDreams.map((dream) => (
                <div key={dream.id} className={`w-64 shrink-0 ${CARD_CLASS} p-4`}>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {dream.emotion} {dream.author_display_name ?? "익명의 탐험가"}
                    </span>
                    <span>{dream.dream_date}</span>
                  </div>
                  <h4 className="mt-2 font-serif text-sm font-semibold text-purple-100">{dream.title}</h4>
                  <p className="mt-2 line-clamp-3 font-serif text-xs leading-loose tracking-wide text-slate-400">
                    {dream.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <MyActivityTabs />
      </main>
    </div>
  );
}
