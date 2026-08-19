"use client";

import { Flower2, MoonStar, Sparkles, Sprout, type LucideIcon } from "lucide-react";

interface JourneyStep {
  icon: LucideIcon;
  title: string;
  description: string;
  // 씨앗 심기/새싹은 초록, 개화는 라임, 꽃은 amber - 일기장 상세 페이지의 지하철 노선도식
  // 진행선(StageRow)이 쓰는 것과 완전히 같은 4단계 색 언어를 그대로 재사용한다.
  color: string;
}

const JOURNEY_STEPS: JourneyStep[] = [
  { icon: Sprout, title: "씨앗 심기", description: "밤에 오늘의 감정을 기록해요", color: "#34d399" },
  { icon: MoonStar, title: "새싹", description: "잠드는 동안 씨앗이 자라요", color: "#34d399" },
  { icon: Flower2, title: "개화", description: "아침에 꾼 꿈을 기록해요", color: "#a3e635" },
  { icon: Sparkles, title: "꽃", description: "AI 해몽으로 나만의 꽃이 완성돼요", color: "#fbbf24" },
];

interface JourneyNodeProps {
  step: JourneyStep;
}

// 노드 하나(원형 아이콘 + 제목 + 한 줄 설명) - 데스크톱/모바일 두 레이아웃이 이 마크업을
// 그대로 공유한다. 아이콘 배경이 반투명(hex+alpha)이라, 뒤로 지나가는 커넥터 선이 비쳐
// 보이지 않도록 불투명 배킹(bg-[#030712], 앱 루트 배경과 같은 색)을 먼저 깐다 - 일기장
// 상세 페이지의 StageRow가 쓰는 것과 같은 2겹 배킹 기법이다.
function JourneyNode({ step }: JourneyNodeProps) {
  const Icon = step.icon;
  return (
    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full">
      <span className="absolute inset-0 z-0 rounded-full bg-[#030712]" />
      <span
        className="absolute inset-0 z-10 rounded-full border-2"
        style={{ borderColor: `${step.color}70`, backgroundColor: `${step.color}18`, boxShadow: `0 0 20px 2px ${step.color}35` }}
      />
      <Icon className="relative z-20 h-6 w-6" style={{ color: step.color }} />
    </span>
  );
}

interface GrowthJourneyIntroProps {
  ctaLabel: string;
  onCtaClick: () => void;
}

// 홈화면 - "감정 씨앗을 심고 -> 잠들며 새싹이 자라고 -> 꿈으로 개화하고 -> 해몽으로 꽃이
// 핀다"는 서비스 핵심 컨셉을 처음 보는(또는 오랜만에 돌아온) 사용자에게 소개하는 정적
// 일러스트레이션. 실제 그날의 기록 데이터를 읽지 않는 순수 개념 소개용이라 로딩 지연이나
// API 호출 없이 항상 즉시 렌더링된다 - CTA 문구/이동 경로만 호출부(page.tsx)가 로그인
// 상태나 오늘의 씨앗 여부에 따라 바꿔 넘겨준다.
export default function GrowthJourneyIntro({ ctaLabel, onCtaClick }: GrowthJourneyIntroProps) {
  return (
    <section className="relative mx-auto max-w-5xl px-6 py-10">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">감정에서 꽃이 피기까지</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          밤마다 심는 감정의 씨앗이, 꿈을 거쳐 하나의 꽃으로 완성됩니다.
        </p>
      </div>

      {/* 데스크톱 - 가로 배치. 아이콘 사이를 짧은 그라데이션 선분으로 잇는다(GrowthTimeline의
          축약형 스테퍼와 같은 구조: 절대 위치로 전체 길이를 재는 대신, 두 노드 사이 칸에만
          flex로 짧은 커넥터를 끼워 넣어 위치가 항상 정확히 아이콘 중심 높이(h-14의 절반,
          28px)에 맞는다 - 별도 DOM 측정이 필요 없다). */}
      <div className="mt-10 hidden items-start justify-center sm:flex">
        {JOURNEY_STEPS.map((step, index) => (
          <div key={step.title} className="flex items-start">
            <div className="flex w-36 flex-col items-center gap-3 text-center">
              <JourneyNode step={step} />
              <div>
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{step.description}</p>
              </div>
            </div>
            {index < JOURNEY_STEPS.length - 1 && (
              <div
                aria-hidden
                className="mt-7 h-px w-8 shrink-0 lg:w-16"
                style={{ background: `linear-gradient(to right, ${step.color}80, ${JOURNEY_STEPS[index + 1].color}80)` }}
              />
            )}
          </div>
        ))}
      </div>

      {/* 모바일 - 세로 배치. 같은 이유로 노드 사이 칸에만 짧은 세로 커넥터를 끼워 넣는다. */}
      <div className="mt-10 flex flex-col sm:hidden">
        {JOURNEY_STEPS.map((step, index) => (
          <div key={step.title}>
            <div className="flex items-start gap-4">
              <JourneyNode step={step} />
              <div className="pt-3.5">
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{step.description}</p>
              </div>
            </div>
            {index < JOURNEY_STEPS.length - 1 && (
              <div
                aria-hidden
                className="ml-7 h-8 w-px"
                style={{ background: `linear-gradient(to bottom, ${step.color}80, ${JOURNEY_STEPS[index + 1].color}80)` }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={onCtaClick}
          className="rounded-full bg-gradient-to-r from-emerald-600 to-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(52,211,153,0.25)] transition-transform hover:-translate-y-0.5"
        >
          {ctaLabel}
        </button>
      </div>
    </section>
  );
}
