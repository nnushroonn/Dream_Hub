"use client";

import { useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";

import type { CounselingReport } from "@/api/dream";

const TOTAL_STEPS = 4;
const DRAG_THRESHOLD_PX = 80;

const STEP_THEMES = [
  "bg-gradient-to-b from-indigo-900 to-purple-800",
  "bg-gradient-to-b from-slate-900 to-indigo-950",
  "bg-gradient-to-b from-gray-900 to-red-950/40",
  "bg-gradient-to-b from-purple-900 to-pink-900/50",
];

const STEP_LABELS = ["🛋️ 마음 읽기", "🔍 무의식의 무대", "⚠️ 현실 점검", "💡 당신을 위한 라이프 코칭"];

// 스태거드 연출용으로 문장 단위로 쪼갠다. 마지막 문장에 종결부호가 없어도 그대로 살린다.
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

  // 개조식 체크리스트가 아니라, 단호한 카리스마 멘토가 쓴 한 편의 편지처럼 이어지는 산문으로 보여준다.
  return (
    <div className="space-y-2.5 border-l-2 border-pink-300/40 pl-4 text-left">
      {splitSentences(report.action_plan).map((sentence, i) => (
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.15, duration: 0.5, ease: "easeOut" }}
          className="text-base font-medium leading-relaxed text-white"
        >
          {sentence}
        </motion.p>
      ))}
    </div>
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

// 🎠 인스타그램 다중 이미지 게시물 형태의 수동 캐러셀: 무의식 상담 리포트(counseling_report) 전용 뷰어.
// 자동 전환 없이, 좌우 드래그 스와이프 또는 화살표 버튼 클릭으로만 컷이 넘어간다.
export default function CounselingStoryView({ report, tags, onSave, isSaving, saveLabel }: CounselingStoryViewProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [shareCopied, setShareCopied] = useState(false);

  const goTo = (next: number, dir: 1 | -1) => {
    if (next < 0 || next >= TOTAL_STEPS) return;
    setDirection(dir);
    setStep(next);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x <= -DRAG_THRESHOLD_PX) goTo(step + 1, 1);
    else if (info.offset.x >= DRAG_THRESHOLD_PX) goTo(step - 1, -1);
  };

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
      className={`relative mx-auto flex w-full max-w-sm flex-col overflow-hidden rounded-3xl transition-colors duration-500 ${STEP_THEMES[step]}`}
    >
      <p className="pt-6 text-center text-xs font-medium tracking-wide text-white/80">{STEP_LABELS[step]}</p>

      {/* 좌우 화살표: 클릭 시에만 컷이 넘어간다. 첫/마지막 컷에서는 비활성화. */}
      <button
        type="button"
        aria-label="이전 컷"
        onClick={() => goTo(step - 1, -1)}
        disabled={step === 0}
        className="absolute left-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition-opacity disabled:pointer-events-none disabled:opacity-0"
      >
        ◀
      </button>
      <button
        type="button"
        aria-label="다음 컷"
        onClick={() => goTo(step + 1, 1)}
        disabled={step === TOTAL_STEPS - 1}
        className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition-opacity disabled:pointer-events-none disabled:opacity-0"
      >
        ▶
      </button>

      {/* 슬라이드 콘텐츠: 드래그 스와이프로도 컷을 넘길 수 있다. 텍스트 길이가 달라도
          뷰포트가 덜컹거리지 않도록 min-h를 고정한다. */}
      <div className="relative flex min-h-[400px] flex-1 items-center overflow-hidden px-6 py-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            initial={{ x: direction > 0 ? 100 : -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction > 0 ? -100 : 100, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="w-full cursor-grab active:cursor-grabbing"
          >
            <StepContent step={step} report={report} tags={tags} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단: Dot 인디케이터 + 고정 액션 바 */}
      <div className="relative z-20 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-8">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) =>
            i === step ? (
              <span key={i} className="h-1.5 w-4 rounded-full bg-white transition-all" />
            ) : (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-white/30 transition-all" />
            )
          )}
        </div>

        <div className="flex w-full gap-2">
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
    </div>
  );
}
