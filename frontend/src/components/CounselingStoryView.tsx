"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { CounselingReport } from "@/api/dream";

const STEP_DURATION_MS = 5000;
const TOTAL_STEPS = 4;

const STEP_THEMES = [
  "bg-gradient-to-b from-indigo-900 to-purple-800",
  "bg-gradient-to-b from-slate-900 to-indigo-950",
  "bg-gradient-to-b from-gray-900 to-red-950/40",
  "bg-gradient-to-b from-purple-900 to-pink-900/50",
];

const STEP_LABELS = ["🛋️ 마음 읽기", "🔍 무의식의 무대", "⚠️ 현실 점검", "💡 행동 지침"];

// 스태거드 연출/체크리스트용으로 문장 단위로 쪼갠다. 마지막 문장에 종결부호가 없어도 그대로 살린다.
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function contentFor(report: CounselingReport, step: number): string {
  return [report.empathy, report.unconscious_stage, report.reality_check, report.action_plan][step];
}

interface StepContentProps {
  step: number;
  report: CounselingReport;
  tags: string[];
}

function StepContent({ step, report, tags }: StepContentProps) {
  if (step === 0) {
    return (
      <div className="space-y-3">
        {splitSentences(report.empathy).map((sentence, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, duration: 0.5, ease: "easeOut" }}
            className="text-center text-lg font-medium leading-relaxed text-white"
          >
            {sentence}
          </motion.p>
        ))}
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="space-y-6">
        {tags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {tags.map((tag, i) => (
              <motion.span
                key={tag}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2.4 + i * 0.3, repeat: Infinity, ease: "easeInOut" }}
                className="rounded-full bg-purple-500/20 px-3 py-1.5 text-sm text-purple-100"
              >
                {tag.startsWith("#") ? tag : `#${tag}`}
              </motion.span>
            ))}
          </div>
        )}
        <p className="text-center text-base leading-relaxed text-slate-200">{report.unconscious_stage}</p>
      </div>
    );
  }

  if (step === 2) {
    return (
      <motion.div animate={{ x: [0, -8, 8, -6, 6, -3, 3, 0] }} transition={{ duration: 0.2 }}>
        <p className="text-center text-lg font-bold leading-relaxed text-white">{report.reality_check}</p>
      </motion.div>
    );
  }

  return (
    <ul className="space-y-3">
      {splitSentences(report.action_plan).map((item, i) => (
        <motion.li
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.3, duration: 0.4, ease: "easeOut" }}
          className="flex items-start gap-2 text-base leading-relaxed text-white"
        >
          <span className="shrink-0">☑️</span>
          <span>{item}</span>
        </motion.li>
      ))}
    </ul>
  );
}

interface CounselingStoryViewProps {
  report: CounselingReport;
  tags: string[];
  /** 아직 저장 전(방금 받은 해몽 결과)일 때만 넘겨준다 - 이미 저장된 기록의 상세/공개 보기에서는 생략한다. */
  onSave?: () => void;
  isSaving?: boolean;
  saveLabel?: string;
}

// 🎬 인스타그램 스토리 형태의 4컷 스와이프 카드: 무의식 상담 리포트(counseling_report) 전용 뷰어.
export default function CounselingStoryView({ report, tags, onSave, isSaving, saveLabel }: CounselingStoryViewProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [shareCopied, setShareCopied] = useState(false);

  const goTo = (next: number, dir: 1 | -1) => {
    if (next < 0 || next >= TOTAL_STEPS) return;
    setDirection(dir);
    setStep(next);
  };

  // 마지막 컷(행동 지침)은 자동으로 더 넘어가지 않고 멈춘 채로 남는다.
  useEffect(() => {
    if (step >= TOTAL_STEPS - 1) return;
    const timer = window.setTimeout(() => goTo(step + 1, 1), STEP_DURATION_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleShare = async () => {
    const text = `${STEP_LABELS[step]}\n${contentFor(report, step)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Dream_Hub 무의식 상담 리포트", text });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch {
      // 클립보드 권한이 없는 환경 - 조용히 무시한다.
    }
  };

  return (
    <div
      className={`relative mx-auto flex aspect-[9/16] max-h-[640px] w-full max-w-sm flex-col overflow-hidden rounded-3xl transition-colors duration-500 ${STEP_THEMES[step]}`}
    >
      {/* 스토리 프로그레스 바 */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-3">
        {STEP_LABELS.map((_, i) => (
          <div key={`track-${i}`} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <motion.div
              key={`bar-${i}-${step}`}
              className="h-full rounded-full bg-white"
              initial={{ width: i < step ? "100%" : "0%" }}
              animate={{ width: i <= step ? "100%" : "0%" }}
              transition={i === step ? { duration: STEP_DURATION_MS / 1000, ease: "linear" } : { duration: 0 }}
            />
          </div>
        ))}
      </div>

      <p className="absolute inset-x-0 top-6 z-20 text-center text-xs font-medium tracking-wide text-white/80">
        {STEP_LABELS[step]}
      </p>

      {/* 보이지 않는 탭 존: 좌측 30% 이전 컷, 우측 70% 다음 컷 */}
      <button
        type="button"
        aria-label="이전 컷"
        onClick={() => goTo(step - 1, -1)}
        className="absolute inset-y-0 left-0 z-10 w-[30%]"
      />
      <button
        type="button"
        aria-label="다음 컷"
        onClick={() => goTo(step + 1, 1)}
        className="absolute inset-y-0 right-0 z-10 w-[70%]"
      />

      {/* 슬라이드 콘텐츠 */}
      <div className="relative flex flex-1 items-center overflow-hidden px-6 pb-24 pt-16">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ x: direction > 0 ? "100%" : "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction > 0 ? "-100%" : "100%", opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="w-full"
          >
            <StepContent step={step} report={report} tags={tags} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 고정 액션 바 */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex gap-2 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
        <button
          type="button"
          onClick={handleShare}
          className="flex-1 rounded-full border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
        >
          {shareCopied ? "✅ 복사 완료" : "🔗 공유하기"}
        </button>
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "저장 중..." : saveLabel ?? "📖 기록장에 저장하기"}
          </button>
        )}
      </div>
    </div>
  );
}
