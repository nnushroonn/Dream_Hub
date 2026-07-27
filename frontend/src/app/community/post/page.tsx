"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { buildDreamOriginalContent, getPublicDream, type DreamEntryRecord } from "@/api/dream";
import CounselingStoryView from "@/components/CounselingStoryView";
import DreamOriginalQuote from "@/components/DreamOriginalQuote";
import NavBar from "@/components/NavBar";

// 홈 화면 우측 하단 실시간 토스트(LiveTicker)를 클릭했을 때 도착하는 익명 공개 상세 페이지.
// 이 프로젝트는 Cloudflare Pages 정적 export(next.config.mjs output: "export")라 [id] 같은
// 동적 경로 세그먼트를 쓸 수 없다 (빌드 시점에 미래에 생길 id를 알 수 없어 generateStaticParams가
// 불가능) - 그래서 사전 검색(/dictionary?search=)과 동일하게 쿼리 파라미터(?id=)로 넘긴다.
// 로그인 여부와 무관하게 누구나 볼 수 있고, 작성자 정보는 응답에 아예 담겨 있지 않다
// (백엔드 GET /api/dreams/public/{id}가 PUBLIC 상태의 실제 DreamEntry만 내려준다).
export default function CommunityPostPage() {
  const [entry, setEntry] = useState<DreamEntryRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }
    getPublicDream(id)
      .then(setEntry)
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/community" className="text-xs text-violet-300/70 underline-offset-2 hover:text-violet-200 hover:underline">
          ← 커뮤니티로 돌아가기
        </Link>

        {isLoading ? (
          <div className="mt-6 animate-pulse rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="mx-auto h-6 w-2/3 rounded-full bg-white/10" />
            <div className="mt-6 h-3 w-full rounded-full bg-white/10" />
            <div className="mt-3 h-3 w-5/6 rounded-full bg-white/10" />
          </div>
        ) : notFound || !entry ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-sm text-slate-300">이 꿈 기록을 찾을 수 없어요.</p>
            <p className="mt-1.5 text-xs text-slate-500">삭제되었거나, 더 이상 공개 상태가 아닌 것 같아요.</p>
            <Link
              href="/community"
              className="mt-5 inline-block rounded-full border border-violet-400/40 bg-violet-500/15 px-5 py-2 text-xs text-violet-200 transition-colors hover:border-violet-300/60 hover:text-white"
            >
              커뮤니티로 이동
            </Link>
          </div>
        ) : (
          <div className="relative mt-6 rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.2)] backdrop-blur-2xl">
            <p className="text-xs tracking-widest text-indigo-300/70 uppercase">Anonymous Dreamer</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">
              {entry.emotion} {entry.title}
            </h1>
            <p className="mt-1 text-xs text-slate-500">{entry.dream_date}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              {entry.interpretation.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1 text-xs text-violet-200"
                >
                  {tag.startsWith("#") ? tag : `#${tag}`}
                </span>
              ))}
            </div>

            <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-300">
              {entry.interpretation.description}
            </p>

            <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-200">
                  {entry.interpretation.expert_badge}
                </span>
                <span className="text-xs text-violet-300/80">{entry.interpretation.selected_expert}의 시선</span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{entry.interpretation.expert_insight}</p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-center text-xs text-indigo-300/70">행운의 아이템</p>
                <p className="mt-1.5 text-center font-medium text-white">{entry.interpretation.lucky_item}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-center text-xs text-indigo-300/70">행운의 숫자</p>
                <p className="mt-1.5 text-center font-medium text-white">{entry.interpretation.lucky_number}</p>
              </div>
            </div>

            {/* 무의식 상담 리포트: 인스타그램 스토리 형태의 4컷 스와이프 카드 (읽기 전용 - 저장 액션 없음).
                이 기능 이전에 저장된 기록은 counseling_report가 없을 수 있어 있을 때만 렌더링한다. */}
            {entry.interpretation.counseling_report && (
              <div className="mt-6">
                <DreamOriginalQuote content={buildDreamOriginalContent(entry.survey)} />
                <CounselingStoryView
                  report={entry.interpretation.counseling_report}
                  tags={entry.interpretation.tags}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
