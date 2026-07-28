"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { buildDreamOriginalContent, type AiInterpretation, type DreamSurvey } from "@/api/dream";
import CounselingStoryView from "@/components/CounselingStoryView";
import DreamOriginalQuote from "@/components/DreamOriginalQuote";

interface AttachedDreamViewerProps {
  survey: DreamSurvey;
  // 무의식 광장 "직접 쓰기" 모드에서 AI 해몽 없이 게시했으면 null - 이 경우 꿈 원문은 그대로
  // 보여주되, 해몽 결과 섹션(태그/AI 본문/전문가 시선/행운 정보/상담 리포트)만 렌더링을 건너뛴다.
  interpretation: AiInterpretation | null;
}

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

// 무의식 피드 상세 페이지의 "첨부된 꿈 데이터" 임베드 카드. 유저가 직접 쓴 본문(사담)과 섞여
// 보이지 않도록 뚜렷한 테두리로 감싸고, 모바일 스크롤 피로도를 줄이기 위해 기본은 접힌
// 아코디언으로 시작한다 - 헤더의 태그만 훑어보고 필요할 때만 펼쳐서 전체 해몽을 읽는다.
export default function AttachedDreamViewer({ survey, interpretation }: AttachedDreamViewerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="my-6 rounded-xl border border-purple-500/30 bg-white/5 p-4">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-medium tracking-wide text-purple-300/80">🌙 첨부된 꿈 기록</span>
          {interpretation?.tags.map((tag) => (
            <span key={tag} className="text-xs text-violet-300/70">
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-4">
              <DreamOriginalQuote content={buildDreamOriginalContent(survey)} />

              {interpretation && (
                <>
                  <div className="mt-4">
                    <FormattedDreamText text={interpretation.description} />
                  </div>

                  <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-200">
                        {interpretation.expert_badge}
                      </span>
                      <span className="text-xs text-violet-300/80">{interpretation.selected_expert}의 시선</span>
                    </div>
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{interpretation.expert_insight}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-center text-xs text-indigo-300/70">행운의 아이템</p>
                      <p className="mt-1.5 text-center font-medium text-white">{interpretation.lucky_item}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-center text-xs text-indigo-300/70">행운의 숫자</p>
                      <p className="mt-1.5 text-center font-medium text-white">{interpretation.lucky_number}</p>
                    </div>
                  </div>

                  {/* 이 기능 이전에 저장된 기록은 counseling_report가 없을 수 있어 있을 때만 렌더링한다. */}
                  {interpretation.counseling_report && (
                    <div className="mt-4">
                      <CounselingStoryView report={interpretation.counseling_report} tags={interpretation.tags} />
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
