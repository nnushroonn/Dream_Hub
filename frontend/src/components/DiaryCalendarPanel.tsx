"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DreamEntryRecord } from "@/api/dream";
import { ConstellationDots, ConstellationMoodLegend, type ConstellationEntry } from "@/components/ConstellationCalendar";
import { buildDayEntryMap } from "@/lib/constellationEntries";
import { computeStreak } from "@/lib/dreamCalendar";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

const CHECK_IN_PULSE_MS = 1600;

function daysInMonthOf(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

interface DiaryCalendarPanelProps {
  /** 불 켜진 별자리 노드를 클릭했을 때, 그 날의 꿈 기록 전체 목록을 들고 상세 보기를 열어달라는 콜백 */
  onSelectDay?: (dayEntries: DreamEntryRecord[]) => void;
  /** 오늘 아직 출석하지 않았을 때, "오늘의 무의식 기록하기" 유도 문구를 클릭하면 호출된다 */
  onRequestWrite?: () => void;
}

export default function DiaryCalendarPanel({ onSelectDay, onRequestWrite }: DiaryCalendarPanelProps) {
  const entries = useSavedDreamsStore((state) => state.entries);

  // 조회 중인 달은 클라이언트 시각에 의존하므로, 서버/클라이언트 렌더 불일치를 피하려고
  // 마운트 이후에만 채운다. 이후 좌우 화살표로 다른 달을 자유롭게 넘나들 수 있다.
  const [viewDate, setViewDate] = useState<Date | null>(null);

  useEffect(() => {
    setViewDate(new Date());
  }, []);

  const monthKey = viewDate ? monthKeyOf(viewDate) : null;
  const monthLabel = viewDate ? monthLabelOf(viewDate) : "이번 달";
  const daysInMonth = viewDate ? daysInMonthOf(viewDate) : 30;
  const startWeekday = viewDate ? new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() : 0;
  const isViewingCurrentMonth = viewDate ? monthKey === monthKeyOf(new Date()) : true;
  // 링 표시용 "오늘" 날짜 - 다른 달을 조회 중일 때는 어느 셀에도 표시하지 않는다.
  const todayDay = isViewingCurrentMonth ? new Date().getDate() : null;

  const goToPrevMonth = () => setViewDate((prev) => (prev ? shiftMonth(prev, -1) : prev));
  const goToNextMonth = () => setViewDate((prev) => (prev ? shiftMonth(prev, 1) : prev));

  // 기록이 없는 날은 하드코딩 없이 그대로 비어 있어야 하므로, 백엔드에서 동기화해 온
  // entries 중 조회 중인 달에 해당하는 항목만 뽑아 날짜별로 묶는다 (홈 화면 미니 위젯과 로직 공유).
  const entryMap = useMemo(() => (monthKey ? buildDayEntryMap(entries, monthKey) : new Map()), [entries, monthKey]);

  const { streakDays, checkedInToday } = useMemo(() => computeStreak(entries), [entries]);

  // 오늘 미출석이라 불꽃이 꺼진 상태에서 "탐험 중"이라고 하면 앞뒤가 안 맞으므로,
  // 꺼진 불꽃 메타포와 논리적으로 맞물리는 유예/경고형 문구로 대체한다.
  const streakLapseWarning =
    streakDays === 1
      ? "오늘이 지나면 첫 기록 버프가 사라져요"
      : `오늘이 지나면 연속 ${streakDays}일 기록이 리셋돼요`;

  // 출석 체크가 방금 완료된 순간(false -> true 전환)에만 배지가 잠깐 부풀어 오르며 강조된다.
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const wasCheckedInRef = useRef(checkedInToday);

  useEffect(() => {
    const wasCheckedIn = wasCheckedInRef.current;
    wasCheckedInRef.current = checkedInToday;
    if (!wasCheckedIn && checkedInToday) {
      setJustCheckedIn(true);
      const timer = window.setTimeout(() => setJustCheckedIn(false), CHECK_IN_PULSE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [checkedInToday]);

  const handleSelectDay = (dayEntries: ConstellationEntry[]) => {
    const ids = new Set(dayEntries.map((e) => e.id));
    const fullEntries = entries.filter((e) => ids.has(e.id));
    if (fullEntries.length > 0) onSelectDay?.(fullEntries);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(129,90,255,0.12),transparent_60%)]" />

      {streakDays > 0 ? (
        <div className="flex w-full flex-col items-center">
          {checkedInToday ? (
            <div
              className={`relative flex w-auto max-w-full flex-row items-center justify-center gap-1.5 overflow-x-auto whitespace-nowrap rounded-full border px-3 py-2 text-center text-[10px] transition-all duration-700 no-scrollbar lg:text-xs ${
                justCheckedIn
                  ? "scale-110 border-amber-300/60 bg-amber-400/20 text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.5)]"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-200"
              }`}
            >
              <span className="shrink-0 transition-all duration-500 drop-shadow-[0_0_6px_rgba(251,191,36,0.85)]">🔥</span>
              <span className="shrink-0">연속 {streakDays}일째 무의식 탐험 중 (오늘의 출석 완료)</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onRequestWrite}
              disabled={!onRequestWrite}
              className="flex w-auto max-w-full flex-col items-center justify-center gap-0.5 rounded-2xl border border-purple-500/20 bg-purple-950/10 px-4 py-2 text-center text-[10px] transition-all duration-700 disabled:cursor-default lg:text-xs"
            >
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="shrink-0 grayscale contrast-75 opacity-50 transition-all duration-500">🔥</span>
                <span className="shrink-0 font-medium text-slate-400">{streakLapseWarning}</span>
              </span>
              <span className="whitespace-nowrap font-semibold text-purple-300">
                · 밤사이 무의식을 기록해 볼까요?
              </span>
            </button>
          )}
        </div>
      ) : (
        <p className="relative text-xs text-slate-500">
          아직 기록된 꿈이 없어요.{" "}
          {onRequestWrite ? (
            <button
              type="button"
              onClick={onRequestWrite}
              className="text-violet-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-violet-200"
            >
              오늘 첫 발자국을 남겨보세요 ✨
            </button>
          ) : (
            "오늘 첫 발자국을 남겨보세요 ✨"
          )}
        </p>
      )}

      <h2 className="relative mt-4 text-lg font-semibold text-slate-100">🌌 꿈 별자리 캘린더</h2>

      {/* 월 네비게이션: 좌우 화살표로 다른 달의 별자리를 자유롭게 조회한다 */}
      <div className="relative mt-3 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={goToPrevMonth}
          disabled={!viewDate}
          aria-label="이전 달"
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors duration-200 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ◀
        </button>
        <p className="min-w-[6rem] text-sm font-medium tracking-wide text-slate-200">{monthLabel}</p>
        <button
          type="button"
          onClick={goToNextMonth}
          disabled={!viewDate || isViewingCurrentMonth}
          aria-label="다음 달"
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors duration-200 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ▶
        </button>
      </div>
      <p className="relative mt-1 text-xs text-slate-500">당신이 기록한 무의식의 궤적</p>

      <div className="relative mt-8 flex justify-center">
        <ConstellationDots
          daysInMonth={daysInMonth}
          startWeekday={startWeekday}
          entries={entryMap}
          onSelectEntry={handleSelectDay}
          todayDay={todayDay}
        />
      </div>

      <div className="relative mt-6">
        <ConstellationMoodLegend />
      </div>
    </div>
  );
}
