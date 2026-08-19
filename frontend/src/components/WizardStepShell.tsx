"use client";

import { useState, type ReactNode } from "react";

// DreamWizard(꿈일기 7단계 정밀 기록)가 쓰던 "화면 전환형 단계별 마법사" 패턴을 다른 곳에서도
// 그대로 재사용할 수 있게 뽑아낸 셸이다 - 슬라이드 전환(순수 CSS, framer-motion 없음) 상태
// 관리(useWizardStepTransition)와 그 전환을 감싸는 뷰포트(WizardStepViewport)만 남았다.
// DreamWizard 자체는 이미 잘 동작하고 있어 이 셸로 바꿔치기하지 않았다(굳이 손댈 이유가 없는
// 위험) - 새로 만드는 마음 기록장(GuidedEmotionJournal)만 이 셸을 쓴다. 다음에 또 다른
// 단계별 폼이 필요하면 이 파일 하나로 계속 재사용하면 된다.
// 진행 상태 표시(별자리 프로그레스 바, WizardProgressBar)는 원래 이 파일에 있었는데, 마음
// 기록장이 7단계 전체를 자체적인 얇은 퍼센트 바+구석 텍스트로 통일하면서 유일한 소비자가
// 사라져 걷어냈다. 내비게이션 버튼(알약 모양 그라데이션 버튼, WizardNavButtons)도 같은
// 이유로 걷어냈다 - 마음 기록장이 "노트 페이지" 메타포로 재구성되며 카드 하단 모서리에
// 붙는 손글씨풍 텍스트 링크(GuidedEmotionJournal.tsx의 PageNavCorner)로 바뀌었고, 이 역시
// 유일한 소비자였다. 두 컴포넌트 모두 필요해지면 git 이력에서 되살릴 수 있다.

const TRANSITION_MS = 250;

type WizardSlidePhase = "idle" | "leaving" | "entering";

interface UseWizardStepTransitionResult {
  step: number;
  slideClass: string;
  goNext: (canProceed: boolean) => void;
  goPrev: () => void;
}

// step/phase/direction 상태와, "나가는 중 -> 다음 스텝으로 교체 -> 들어오는 중 -> idle"
// 타임아웃 시퀀스를 관리한다. DreamWizard의 goToStep 그대로다.
export function useWizardStepTransition(totalSteps: number): UseWizardStepTransitionResult {
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<WizardSlidePhase>("idle");
  const [direction, setDirection] = useState<1 | -1>(1);

  const goToStep = (nextStep: number, dir: 1 | -1) => {
    setDirection(dir);
    setPhase("leaving");
    window.setTimeout(() => {
      setStep(nextStep);
      setPhase("entering");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("idle"));
      });
    }, TRANSITION_MS);
  };

  const goNext = (canProceed: boolean) => {
    if (step < totalSteps && canProceed) goToStep(step + 1, 1);
  };
  const goPrev = () => {
    if (step > 1) goToStep(step - 1, -1);
  };

  const slideClass = (() => {
    if (phase === "leaving") return direction === 1 ? "-translate-x-6 opacity-0" : "translate-x-6 opacity-0";
    if (phase === "entering") return direction === 1 ? "translate-x-6 opacity-0" : "-translate-x-6 opacity-0";
    return "translate-x-0 opacity-100";
  })();

  return { step, slideClass, goNext, goPrev };
}

interface WizardStepViewportProps {
  slideClass: string;
  children: ReactNode;
}

// 단계별 질문 콘텐츠를 감싸는 슬라이딩 전환 뷰포트 - useWizardStepTransition의 slideClass를
// 그대로 받아 적용한다. overflow는 x축만 숨긴다(전환이 translateX만 쓰므로 가로 넘침만 막으면
// 충분하다) - 예전엔 overflow-hidden(양축)이었는데, 이 박스가 자식(NotePage 카드)과 정확히
// 같은 크기라 여유 공간이 전혀 없어서, 마음 기록장의 감정별 분위기 glow(NotePage가
// -inset-y-10으로 카드 위아래에 그리는 은은한 색 번짐)가 위아래로 조금도 빠져나가지 못하고
// 100% 잘려 안 보이는 상태였다 - "색상 강도를 올렸는데도 여전히 안 보인다"는 원인이 실은
// 알파값이 아니라 이 클리핑이었다. x축만 숨기면 전환 시 가로로 살짝 넘치는 것만 가려지고,
// glow의 세로 번짐은 그대로 화면에 드러난다.
export function WizardStepViewport({ slideClass, children }: WizardStepViewportProps) {
  return (
    <div className="mt-6 overflow-x-hidden">
      <div className={`transition-all duration-300 ease-out ${slideClass}`}>{children}</div>
    </div>
  );
}

