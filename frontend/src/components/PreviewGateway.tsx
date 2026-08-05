"use client";

import type { ReactNode } from "react";

import { useLoginModalStore, type LoginModalTriggerSource } from "@/store/useLoginModalStore";

// 별자리 장식용 좌표는 SSR/CSR 렌더 결과가 어긋나지 않도록(hydration mismatch 방지) 고정값을
// 쓴다 - 홈 히어로의 별 입자(Math.random)와 달리 여기는 useEffect 없이 그냥 바로 그린다.
const CONSTELLATION_STARS = [
  { x: 40, y: 60, r: 2.2 },
  { x: 120, y: 30, r: 1.6 },
  { x: 210, y: 70, r: 2.6 },
  { x: 280, y: 25, r: 1.4 },
  { x: 330, y: 90, r: 2 },
  { x: 90, y: 130, r: 1.8 },
  { x: 190, y: 150, r: 2.4 },
  { x: 260, y: 140, r: 1.5 },
];
const CONSTELLATION_LINES = "40,60 120,30 210,70 280,25 330,90 260,140 190,150 90,130 210,70";

function ConstellationBackdrop() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg viewBox="0 0 370 180" className="h-auto w-full max-w-lg">
        <polyline points={CONSTELLATION_LINES} fill="none" stroke="rgba(167,139,250,0.4)" strokeWidth="1" />
        {CONSTELLATION_STARS.map((star, index) => (
          <circle
            key={index}
            cx={star.x}
            cy={star.y}
            r={star.r}
            fill="#e9d5ff"
            className="animate-twinkle"
            style={{ animationDelay: `${index * 0.4}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

interface PreviewGatewayProps {
  title: string;
  subtitle: string;
  ctaLabel: string;
  // LoginModal이 이 값으로 진입점에 맞는 헤더 카피를 보여준다.
  triggerSource: LoginModalTriggerSource;
  // 블러 처리해서 배경에 깔 실제 콘텐츠 미리보기 - 없으면 몽환적인 별자리 장식을 대신 보여준다.
  children?: ReactNode;
}

// 비로그인 유저가 잠긴 페이지에 들어왔을 때 빈 화면/강제 리다이렉트 대신 보여주는 공용
// "프리뷰 게이트웨이" - 기능의 가치(실제 피드나 별자리 컨셉)를 먼저 살짝 보여주고, 그 위에
// 가입 유도 글래스모피즘 카드를 얹어 자연스러운 전환을 유도한다.
export default function PreviewGateway({ title, subtitle, ctaLabel, triggerSource, children }: PreviewGatewayProps) {
  const openLoginModal = useLoginModalStore((state) => state.open);

  return (
    <div className="relative min-h-[60vh] overflow-hidden rounded-3xl bg-[#050509]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none opacity-60 blur-md">
        {children ?? <ConstellationBackdrop />}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#050509]/30 via-[#050509]/70 to-[#050509]" />

      <div className="relative flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="w-full max-w-md rounded-3xl border border-purple-500/30 bg-slate-900/70 p-8 shadow-[0_0_40px_rgba(168,85,247,0.15)] backdrop-blur-xl">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{subtitle}</p>
          <button
            type="button"
            onClick={() => openLoginModal({ triggerSource })}
            className="mt-6 w-full rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-transform hover:-translate-y-0.5"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
