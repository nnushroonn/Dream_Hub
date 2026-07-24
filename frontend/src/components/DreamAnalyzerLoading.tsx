"use client";

import { useEffect, useState } from "react";

// AI 해몽 리포트가 오기 전까지 결과 모달 안에서만 도는 스토리텔링형 로딩 -
// 대기 시간 자체를 줄이진 못해도, "지금 실제로 분석 중"이라는 인상을 줘 체감 대기 피로를 낮춘다.
const ANALYZER_MESSAGES = [
  "🧐 프로이트가 꿈속에 숨겨진 무의식을 탐색하고 있습니다...",
  "🔮 칼 융이 어젯밤 상징적 단서들의 의미를 해독하는 중입니다...",
  "📊 아들러가 현재 현실 스트레스와의 연결 고리를 분석 중입니다...",
];

const CYCLE_MS = 1500;
const FADE_MS = 300;

export default function DreamAnalyzerLoading() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let fadeTimeout: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      setVisible(false);
      fadeTimeout = setTimeout(() => {
        setIndex((prev) => (prev + 1) % ANALYZER_MESSAGES.length);
        setVisible(true);
      }, FADE_MS);
    }, CYCLE_MS);
    return () => {
      clearInterval(cycle);
      clearTimeout(fadeTimeout);
    };
  }, []);

  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-6 py-8 text-center">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,rgba(167,139,250,0.05),rgba(167,139,250,0.9),rgba(99,102,241,0.05))] blur-[2px]" />
        <div className="absolute inset-2 rounded-full bg-slate-950" />
      </div>
      <p
        className={`max-w-xs text-sm leading-relaxed text-violet-200 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {ANALYZER_MESSAGES[index]}
      </p>
    </div>
  );
}
