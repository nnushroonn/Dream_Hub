"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { getSeedDefinition, type SeedType } from "@/lib/dreamSeeds";

// AI 해몽 대기(10~30초)를 그냥 흘려보내지 않고, 씨앗 시스템 온보딩/개인화 시간으로 쓴다.
// 3단 분기:
//  A) 라이트 유저(홈 히어로 Quick-해몽 등, 씨앗 컨텍스트 자체가 없음) - 3장 튜토리얼 슬라이드
//  B) 코어 유저(저널 진입) + 대기 중인 씨앗이 있음 - 그 씨앗이 숨쉬듯 커졌다 작아진다
//  C) 코어 유저(저널 진입) + 대기 중인 씨앗이 없음 - 홀씨 하나가 화면을 떠다닌다
// 어느 분기인지는 pendingSeedType으로만 판단한다: undefined=A(컨텍스트 없음/라이트),
// SeedType=B(그 씨앗), null=C(명시적으로 "확인했는데 없음").
interface DreamAnalyzerLoadingProps {
  pendingSeedType?: SeedType | null;
}

const TUTORIAL_SLIDES = [
  { icon: "🌌🌱", text: "일기장에 무의식 씨앗을 심고 잠들어보세요." },
  { icon: "✨🌰", text: "밤새 당신의 바람이 무의식 속에서 자라납니다." },
  { icon: "🌸", text: "아침에 꿈을 기록하면 나만의 무의식 식물이 피어나요." },
];

const SLIDE_CYCLE_MS = 3200;
const FADE_MS = 400;

function TutorialLoading() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let fadeTimeout: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      setVisible(false);
      fadeTimeout = setTimeout(() => {
        setIndex((prev) => (prev + 1) % TUTORIAL_SLIDES.length);
        setVisible(true);
      }, FADE_MS);
    }, SLIDE_CYCLE_MS);
    return () => {
      clearInterval(cycle);
      clearTimeout(fadeTimeout);
    };
  }, []);

  const slide = TUTORIAL_SLIDES[index];
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-6 py-8 text-center">
      <div
        className="text-5xl transition-opacity"
        style={{ transitionDuration: `${FADE_MS}ms`, opacity: visible ? 1 : 0 }}
      >
        {slide.icon}
      </div>
      <p
        className="max-w-xs text-sm leading-relaxed text-violet-200 transition-opacity"
        style={{ transitionDuration: `${FADE_MS}ms`, opacity: visible ? 1 : 0 }}
      >
        {slide.text}
      </p>
    </div>
  );
}

function SeedBreathingLoading({ seedType }: { seedType: SeedType }) {
  const definition = getSeedDefinition(seedType);
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-6 py-8 text-center">
      <motion.div
        className="flex h-20 w-20 items-center justify-center rounded-full text-4xl"
        style={{ backgroundColor: `${definition.colors[0]}22`, boxShadow: `0 0 30px ${definition.colors[0]}55` }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        🌱
      </motion.div>
      <p className="max-w-xs text-sm leading-relaxed text-violet-200">
        어젯밤 심어둔 <span className="font-semibold text-emerald-300">{definition.label}</span> 씨앗이 무의식의 조각을
        모으고 있어요...
      </p>
    </div>
  );
}

function WindSporeLoading() {
  return (
    <div className="relative flex min-h-[220px] flex-col items-center justify-center gap-6 overflow-hidden py-8 text-center">
      <motion.div
        className="text-4xl"
        animate={{
          x: [-40, 40, -20, 30, -40],
          y: [0, -18, 6, -10, 0],
          rotate: [0, 15, -10, 8, 0],
          opacity: [0.6, 1, 0.8, 1, 0.6],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        🌬️
      </motion.div>
      <p className="max-w-xs text-sm leading-relaxed text-violet-200">
        어젯밤 비워둔 정원에, 바람을 타고 온 꿈의 조각들이 모이고 있습니다...
      </p>
    </div>
  );
}

export default function DreamAnalyzerLoading({ pendingSeedType }: DreamAnalyzerLoadingProps) {
  if (pendingSeedType) return <SeedBreathingLoading seedType={pendingSeedType} />;
  if (pendingSeedType === null) return <WindSporeLoading />;
  return <TutorialLoading />;
}
