"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getLiveTicker, type LiveTickerEntry } from "@/api/dream";

const ROTATE_INTERVAL_MS = 4000;
const TRANSITION_MS = 300;

type Phase = "visible" | "leaving" | "entering";

// phase별 위치/투명도. "entering"만 transition 없이 즉시 스냅한 뒤 다음 프레임에 "visible"로 넘어가
// 아래에서 위로 스르륵 올라오는 것처럼 보이게 한다.
const PHASE_CLASS: Record<Phase, string> = {
  visible: "translate-y-0 opacity-100 transition-all duration-300 ease-out",
  leaving: "-translate-y-2 opacity-0 transition-all duration-300 ease-out",
  entering: "translate-y-2 opacity-0",
};

export default function LiveTicker() {
  const router = useRouter();
  const [entries, setEntries] = useState<LiveTickerEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("visible");
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    getLiveTicker().then(setEntries).catch(() => {});
  }, []);

  useEffect(() => {
    if (entries.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setPhase("leaving");
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % entries.length);
        setPhase("entering");
        // 다음 페인트에서 "entering"(아래/투명) 상태가 실제로 반영된 뒤에 "visible"로 넘겨야
        // 브라우저가 두 상태 사이를 애니메이션으로 보간해준다.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPhase("visible"));
        });
      }, TRANSITION_MS);
    }, ROTATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [entries, isPaused]);

  if (entries.length === 0) return null;

  const current = entries[index];

  // 클릭하면 방금 공개로 기록된 그 꿈의 커뮤니티 상세 페이지로 이동한다. id는 실제 DreamEntry의
  // 고유 ID다 (백엔드가 PUBLIC 상태인 실제 꿈만 골라 내려준다 - 더미 활동 아님). 정적 export
  // 배포라 동적 경로 세그먼트 대신 사전 검색과 같은 쿼리 파라미터 방식을 쓴다.
  const handleClick = () => {
    router.push(`/community/post?id=${current.id}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="fixed right-6 bottom-6 z-40 max-w-xs cursor-pointer text-left"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-center gap-2.5 overflow-hidden rounded-2xl border border-violet-400/20 bg-white/5 px-4 py-3 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-violet-300/40 hover:bg-white/10 active:scale-[0.98]">
        <span className="shrink-0 animate-pulse text-sm">✨</span>
        <p className={`text-xs leading-relaxed text-indigo-100 ${PHASE_CLASS[phase]}`}>
          방금 익명의 탐험가가 &lsquo;
          <span className="font-semibold text-amber-300">{current.keyword}</span>
          &rsquo;을 기록했습니다
        </p>
      </div>
    </button>
  );
}
