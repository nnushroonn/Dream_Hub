"use client";

import { useState } from "react";

interface DreamDateConfirmProps {
  date: string; // yyyy-mm-dd - 호출부가 이미 취침일 기준 스마트 기본값(defaultDreamDateInputValue)으로 초기화해 넘긴다.
  onDateChange: (date: string) => void;
  todayValue: string;
  isConfirmed: boolean;
  // 화면에 뜬 날짜(date)를 그대로 확정한다 - "오늘"을 강제로 덮어쓰지 않는다. 기본값 자체가
  // 이미 취침일 기준으로 계산되어 있으므로, 직접 고른 날짜를 확정할 때도 같은 핸들러를 쓴다.
  onConfirm: () => void;
  onRequestChange: () => void;
}

function formatKoreanDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

// 날짜 필드가 조용히 미리 채워져 있으면 확인 없이 그냥 지나쳐, 며칠 전 꿈을 실수로 엉뚱한
// 날짜로 저장하는 사고가 난다 - 날짜를 명시적으로 묻고 답해야만 다음 단계로 진행되게 한다.
// "꿈 날짜 = 취침일(잠든 밤)" 규칙(lib/dreamDate.ts)에 따라 기본값은 이미 가장 그럴듯한
// 취침일로 채워져 있고, 이 컴포넌트는 그 값을 사용자가 확인하거나 고쳐 쓰게만 한다. 일기장의
// 꿈 기록 모달/AI 해몽 빠른 진입 모달 양쪽이 이 컴포넌트 하나를 공유해 같은 패턴을 유지한다.
export default function DreamDateConfirm({
  date,
  onDateChange,
  todayValue,
  isConfirmed,
  onConfirm,
  onRequestChange,
}: DreamDateConfirmProps) {
  const [isPickingCustomDate, setIsPickingCustomDate] = useState(false);

  if (isConfirmed) {
    // 확정된 날짜는 이후 단계에서도 계속 눈에 띄도록, 폼 상단에 배지 형태로 고정해 둔다.
    return (
      <div className="flex items-center justify-between rounded-xl border border-violet-400/20 bg-violet-500/[0.06] px-4 py-2.5">
        <span className="text-sm font-medium text-violet-100">📅 {formatKoreanDate(date)}의 꿈</span>
        <button
          type="button"
          onClick={() => {
            setIsPickingCustomDate(false);
            onRequestChange();
          }}
          className="text-xs text-violet-300/70 underline-offset-2 transition-colors hover:text-violet-200 hover:underline"
        >
          변경
        </button>
      </div>
    );
  }

  if (isPickingCustomDate) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <label className="text-xs text-indigo-300/70">잠들었던 날짜를 선택해 주세요</label>
        <input
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          max={todayValue}
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-slate-100 [color-scheme:dark] focus:border-violet-400/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={onConfirm}
          className="mt-2 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5"
        >
          이 날짜로 확정
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
      {/* "지난밤"이라는 표현만으로는 날짜가 정확히 언제를 가리키는지 애매할 수 있어, 계산된
          날짜를 문장 안에 직접 보여준다 - 이 값이 "잠든 날(취침일)" 기준임을 문구에서 바로
          알 수 있게 한다. */}
      <p className="text-sm text-slate-200">
        <span className="font-semibold text-violet-200">{formatKoreanDate(date)}</span> 밤(잠들었던 날짜)에 꾼 꿈이 맞나요?
      </p>
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5"
        >
          네, 맞아요
        </button>
        <button
          type="button"
          onClick={() => setIsPickingCustomDate(true)}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-violet-400/40 hover:text-violet-200"
        >
          아니요, 다른 날짜예요
        </button>
      </div>
    </div>
  );
}
