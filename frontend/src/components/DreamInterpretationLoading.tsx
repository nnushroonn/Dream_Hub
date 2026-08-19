"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// AI 해몽 대기(10~30초) 동안 단순 스피너 대신 띄우는 공용 로딩 화면 - 일기장의 꿈일기 제출
// 로딩과 AI 해몽 빠른 진입 모달의 로딩 양쪽에서 그대로 재사용한다(홈 히어로/커뮤니티 글쓰기의
// 기존 DreamAnalyzerLoading은 이 작업 범위 밖이라 건드리지 않는다). 분위기용 문구와 정원
// 시스템 도움말 문구를 섞어 순환시켜, 대기 시간을 지루하지 않게 하면서 도움말도 자연스럽게
// 노출한다. 실제 해몽 응답이 도착하면 호출부가 이 컴포넌트를 곧바로 언마운트하므로(interpretation
// 상태로 분기), 문구 순환 타이머와 무관하게 즉시 종료된다 - 이 컴포넌트 안에는 별도의 "종료"
// 로직이 필요 없다.
const MOOD_PHRASES = [
  "당신의 무의식이 실을 잣고 있어요…",
  "감정과 꿈이 만나 하나의 색을 고르고 있어요…",
  "씨앗이 어떤 꽃이 될지 정해지는 중이에요…",
];

const INFO_PHRASES = [
  "그날 밤 남긴 감정과 꾼 꿈이 합쳐져서, 매번 다른 꽃이 피어나요.",
  "흔한 조합일수록 자주 보는 꽃이 되고, 드문 조합일수록 귀한 꽃이 돼요.",
  "아주 특별한 순간에만 몰래 피어나는 전설의 꽃도 있어요.",
  "모은 꽃은 도감에서 한눈에 볼 수 있어요.",
];

const PHRASE_CYCLE_MS = 3600;

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 매 라운드를 새로 섞을 때, 이전 라운드의 마지막 문구가 다음 라운드 맨 앞에 다시 나오면
// "연속 두 번"이 되어버린다 - 그 경계에서만 앞의 두 자리를 바꿔 피한다.
function shuffleAvoidingBoundaryRepeat(items: string[], previousLast: string | null): string[] {
  const next = shuffle(items);
  if (previousLast !== null && next.length > 1 && next[0] === previousLast) {
    [next[0], next[1]] = [next[1], next[0]];
  }
  return next;
}

const ALL_PHRASES = [...MOOD_PHRASES, ...INFO_PHRASES];

interface CycleState {
  round: string[];
  index: number;
}

function advanceCycle(prev: CycleState): CycleState {
  if (prev.index + 1 < prev.round.length) return { round: prev.round, index: prev.index + 1 };
  return { round: shuffleAvoidingBoundaryRepeat(ALL_PHRASES, prev.round[prev.round.length - 1]), index: 0 };
}

export default function DreamInterpretationLoading() {
  const prefersReducedMotion = useReducedMotion();
  // round+index를 하나의 상태로 묶어서, setInterval 콜백이 항상 setState의 함수형 업데이터
  // (prev)로만 최신값을 읽게 한다 - ref로 최신 round를 따로 들고 있으면 렌더 중에 ref.current를
  // 대입하는 셈이 되어 react-hooks/refs 규칙에 걸린다.
  const [cycle, setCycle] = useState<CycleState>(() => ({ round: shuffle(ALL_PHRASES), index: 0 }));

  useEffect(() => {
    const timer = setInterval(() => setCycle(advanceCycle), PHRASE_CYCLE_MS);
    return () => clearInterval(timer);
  }, []);

  const phrase = cycle.round[cycle.index];

  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-7 py-8 text-center">
      <motion.div
        className="flex h-20 w-20 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 text-4xl"
        style={{ boxShadow: "0 0 30px rgba(167,139,250,0.45)" }}
        animate={prefersReducedMotion ? { opacity: [0.85, 1, 0.85] } : { scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      >
        ✨
      </motion.div>

      <div className="flex h-12 max-w-xs items-start justify-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={phrase}
            className="text-sm leading-relaxed text-violet-200"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: prefersReducedMotion ? 0.15 : 0.4, ease: "easeInOut" }}
          >
            {phrase}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
