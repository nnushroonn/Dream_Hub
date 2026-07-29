"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { buildDreamOriginalContent, getPublicDream, type DreamEntryRecord } from "@/api/dream";
import CounselingStoryView from "@/components/CounselingStoryView";
import DreamOriginalQuote from "@/components/DreamOriginalQuote";
import NavBar from "@/components/NavBar";
import { consumeBackNavOrigin } from "@/lib/communityBackNav";

// AI 해몽 본문(description)은 빈 줄(\n\n)로 문단이 구분된 산문이다 - 문단마다 mb-4 여백을 줘
// 통글로 뭉쳐 보이지 않게 하고, 혹시 문단이 "**소제목**"처럼 마크다운 굵게 표시된 짧은 줄이면
// 헤딩(font-bold text-slate-200 mt-6 mb-2)으로 승격해 글의 호흡을 나눠준다.
function FormattedDreamText({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return (
    <>
      {paragraphs.map((paragraph, index) => {
        const headingMatch = paragraph.match(/^\*\*(.+)\*\*$/);
        if (headingMatch) {
          return (
            <h3 key={index} className="mb-2 mt-6 font-bold text-slate-200 first:mt-0">
              {headingMatch[1]}
            </h3>
          );
        }
        return (
          <p key={index} className="mb-4 whitespace-pre-line text-sm leading-relaxed text-slate-300 last:mb-0">
            {paragraph}
          </p>
        );
      })}
    </>
  );
}

// 커뮤니티 상세 페이지에 임베드된 AttachedDreamViewer가 요약 카드로 축소되면서, 원래 그 안에서
// 보여주던 장문 해몽/전문가 시선/행운 정보/상담 리포트를 옮겨 담은 전용 "전체 보기" 페이지.
// 이 프로젝트는 정적 export라 동적 세그먼트를 못 쓰므로 다른 상세 페이지들과 동일하게
// ?id= 쿼리 파라미터로 대상 꿈을 넘긴다.
export default function DreamArchivePage() {
  const router = useRouter();
  const [entry, setEntry] = useState<DreamEntryRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // AttachedDreamViewer의 "전체 해몽 결과 확인하기"를 통해 들어온 경우에만 router.back()으로
  // 되돌아간다 - 고정 경로로 새로 push하면 상세 페이지의 자체 back() 판단이 실제 history 깊이와
  // 어긋나 엉뚱한 단계에 멈추는 문제가 생긴다([community/back-nav 참고]).
  const handleBack = () => {
    if (consumeBackNavOrigin("post-detail")) {
      router.back();
    } else {
      router.push(entry ? `/community/post?id=${entry.id}` : "/community");
    }
  };

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
  }, []);

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-2xl px-6 py-16">
        <button
          type="button"
          onClick={handleBack}
          className="text-xs text-violet-300/70 underline-offset-2 hover:text-violet-200 hover:underline"
        >
          ← 돌아가기
        </button>

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
            <p className="text-xs tracking-widest text-indigo-300/70">🔮 전체 해몽 결과</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">
              {entry.emotion} {entry.title}
            </h1>
            <p className="mt-1 text-xs text-slate-500">{entry.dream_date}</p>

            <div className="mt-5">
              <DreamOriginalQuote content={buildDreamOriginalContent(entry.survey)} />
            </div>

            {entry.interpretation ? (
              <>
                {entry.interpretation.tags.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-x-2 gap-y-1">
                    {entry.interpretation.tags.map((tag) => (
                      <span key={tag} className="text-xs text-violet-300/70">
                        {tag.startsWith("#") ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>
                )}

                <FormattedDreamText text={entry.interpretation.description} />

                <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-200">
                      {entry.interpretation.expert_badge}
                    </span>
                    <span className="text-xs text-violet-300/80">{entry.interpretation.selected_expert}의 시선</span>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{entry.interpretation.expert_insight}</p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-center text-xs text-indigo-300/70">행운의 아이템</p>
                    <p className="mt-1.5 text-center font-medium text-white">{entry.interpretation.lucky_item}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-center text-xs text-indigo-300/70">행운의 숫자</p>
                    <p className="mt-1.5 text-center font-medium text-white">{entry.interpretation.lucky_number}</p>
                  </div>
                </div>

                {/* 이 기능 이전에 저장된 기록은 counseling_report가 없을 수 있어 있을 때만 렌더링한다. */}
                {entry.interpretation.counseling_report && (
                  <div className="mt-6">
                    <CounselingStoryView report={entry.interpretation.counseling_report} tags={entry.interpretation.tags} />
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-xs leading-relaxed text-slate-400">
                이 꿈은 AI 해몽 없이 직접 작성되어, 공개된 해몽 결과가 없어요.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
