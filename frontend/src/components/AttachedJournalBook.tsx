"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { buildDreamOriginalContent, type DreamEntryRecord } from "@/api/dream";
import CounselingStoryView from "@/components/CounselingStoryView";
import DreamAnalyzerLoading from "@/components/DreamAnalyzerLoading";

interface AttachedJournalBookProps {
  /** 최신순으로 이미 정렬되어 들어오는 전체 일기 목록 - 이 배열 전체를 펼쳐 넘겨본다. */
  entries: DreamEntryRecord[];
  activeIndex: number;
  onNavigate: (index: number) => void;
  moodLabel: string;
  isAnalyzing: boolean;
  analyzeError: string | null;
  onAnalyze: (entry: DreamEntryRecord) => void;
}

function formatBookDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

// 한 권의 양장본 노트를 넘겨보는 듯한 좌/우 두 페이지 스프레드. 좌측엔 그날의 메타(날짜/감정/
// 사후 AI 해몽 CTA), 우측엔 실제로 쓴 제목+본문(+해몽 결과)을 담는다. 페이지 전환은 framer-motion
// rotateY로 실제 종이가 휘어 넘어가는 느낌을 흉내 낸다(별도 3D 라이브러리 없이).
export default function AttachedJournalBook({
  entries,
  activeIndex,
  onNavigate,
  moodLabel,
  isAnalyzing,
  analyzeError,
  onAnalyze,
}: AttachedJournalBookProps) {
  const [direction, setDirection] = useState<1 | -1>(1);
  const entry = entries[activeIndex];
  if (!entry) return null;

  const goTo = (nextIndex: number, dir: 1 | -1) => {
    if (nextIndex < 0 || nextIndex >= entries.length) return;
    setDirection(dir);
    onNavigate(nextIndex);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => goTo(activeIndex - 1, -1)}
        disabled={activeIndex === 0}
        aria-label="이전 페이지"
        className="absolute left-0 top-1/2 z-20 flex h-9 w-9 -translate-x-3 -translate-y-1/2 items-center justify-center rounded-full border border-purple-800/50 bg-slate-900/90 text-purple-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-20"
      >
        ◀
      </button>
      <button
        type="button"
        onClick={() => goTo(activeIndex + 1, 1)}
        disabled={activeIndex === entries.length - 1}
        aria-label="다음 페이지"
        className="absolute right-0 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 translate-x-3 items-center justify-center rounded-full border border-purple-800/50 bg-slate-900/90 text-purple-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-20"
      >
        ▶
      </button>

      <p className="mb-2 text-center text-[11px] tracking-widest text-purple-300/60">
        {activeIndex + 1} / {entries.length}
      </p>

      <div style={{ perspective: "2000px" }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={entry.id}
            initial={{ rotateY: direction > 0 ? -100 : 100, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: direction > 0 ? 100 : -100, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.45, 0, 0.2, 1] }}
            whileHover={{ rotateY: direction > 0 ? -2 : 2 }}
            style={{ transformStyle: "preserve-3d" }}
            className="grid grid-cols-1 overflow-hidden rounded-2xl border border-purple-900/50 bg-slate-900/90 shadow-[0_0_30px_rgba(147,51,234,0.15)] sm:grid-cols-2"
          >
            {/* 좌측 페이지: 날짜 / 감정 스티커 / 사후 AI 해몽 CTA */}
            <div className="relative border-b border-purple-900/30 p-6 sm:border-b-0 sm:border-r sm:border-purple-900/30">
              <p className="font-serif text-sm text-slate-400">{formatBookDate(entry.dream_date)}</p>

              <div className="mt-6 flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-sm text-violet-100">
                  <span className="text-lg">{entry.emotion}</span>
                  {moodLabel}
                </span>
              </div>

              <div className="mt-8">
                {entry.interpretation ? (
                  <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-3 text-center text-[11px] leading-relaxed text-emerald-200">
                    ✨ 이미 무의식 분석을 마쳤어요 - 오른쪽 페이지에서 확인하세요.
                  </p>
                ) : isAnalyzing ? (
                  <DreamAnalyzerLoading />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onAnalyze(entry)}
                      className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg transition-all animate-pulse"
                    >
                      🔮 무의식 분석하기
                    </button>
                    {analyzeError && <p className="mt-2 text-center text-xs text-red-300">{analyzeError}</p>}
                  </>
                )}
              </div>

              {/* 좌우 페이지 중앙 접힘선 음영 - sm 이상(두 페이지가 나란히 보일 때)에만 의미가 있다 */}
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-8 translate-x-1/2 bg-gradient-to-r from-transparent via-black/30 to-transparent sm:block" />
            </div>

            {/* 우측 페이지: 제목 + 본문 (+ 해몽 결과가 있으면 그 아래에 이어서) */}
            <div className="max-h-[60vh] overflow-y-auto p-6">
              <h3 className="font-serif text-xl font-semibold text-slate-200">{entry.title}</h3>
              <p className="mt-4 whitespace-pre-line font-serif leading-relaxed text-slate-200">
                {buildDreamOriginalContent(entry.survey)}
              </p>

              {entry.interpretation && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="mt-6 border-t border-purple-900/30 pt-5"
                >
                  <div className="flex flex-wrap gap-2">
                    {entry.interpretation.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1 text-xs text-violet-200">
                        {tag.startsWith("#") ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>

                  <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-300">
                    {entry.interpretation.description}
                  </p>

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

                  {entry.interpretation.counseling_report && (
                    <div className="mt-6">
                      <CounselingStoryView report={entry.interpretation.counseling_report} tags={entry.interpretation.tags} />
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
