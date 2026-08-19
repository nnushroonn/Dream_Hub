"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface HelpButtonProps {
  onClick: () => void;
  // aria-label과 title 둘 다에 그대로 쓴다 - 그 페이지의 구조를 한 문장으로 요약한 질문형 문구.
  label: string;
  // "처음 방문했는지"를 localStorage에 남길 키 - 페이지마다 달라야 각자 독립적으로 기억한다.
  firstVisitStorageKey: string;
}

// "?" 도움말 버튼 - 아이콘만 있는 작은 원형 버튼은 존재감이 약해 잘 눌리지 않는다는 피드백에
// 따라, "도움말" 텍스트 라벨이 함께 붙은 알약 버튼으로 키웠다. 이 브라우저에서 처음 보는
// 방문자에게는 몇 초간 테두리가 은은하게 발광해 존재를 알리고, 이후로는(localStorage 기억)
// 조용히 있는다 - 매번 반복되면 오히려 시선을 분산시키는 소음이 되기 때문이다.
export default function HelpButton({ onClick, label, firstVisitStorageKey }: HelpButtonProps) {
  const [isHinting, setIsHinting] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(firstVisitStorageKey) === "1") return;
    localStorage.setItem(firstVisitStorageKey, "1");
    setIsHinting(true);
    const timer = setTimeout(() => setIsHinting(false), 4000);
    return () => clearTimeout(timer);
  }, [firstVisitStorageKey]);

  return (
    <button
      type="button"
      onClick={() => {
        // 도움말을 실제로 열어봤다면 그걸로 "존재를 알린다"는 목적은 이미 달성된 것 -
        // 4초 타이머가 아직 안 끝났어도 곧장 반짝임을 멈춘다.
        setIsHinting(false);
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium text-slate-400 transition-colors hover:border-emerald-400/30 hover:bg-white/[0.08] hover:text-emerald-200 ${
        isHinting ? "animate-help-hint border-emerald-400/40 bg-emerald-500/10 motion-reduce:animate-none" : "border-white/10 bg-white/5"
      }`}
    >
      <HelpCircle className="h-4 w-4" />
      도움말
    </button>
  );
}
