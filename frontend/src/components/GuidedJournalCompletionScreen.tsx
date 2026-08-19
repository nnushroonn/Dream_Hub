"use client";

import { getSeedDefinition, type SeedType } from "@/lib/dreamSeeds";
import { GuidedJournalRecapList } from "@/components/GuidedJournalRecap";
import type { GuidedEmotionJournalValue } from "@/components/GuidedEmotionJournal";

interface GuidedJournalCompletionScreenProps {
  dateStr: string; // "YYYY-MM-DD"
  data: GuidedEmotionJournalValue;
  // 이번 저장과 함께 실제로 씨앗이 심어졌을 때만 값이 있다 - 이미 오늘 밤 화분이 있었거나
  // 씨앗 종류를 고르지 않고 저장했으면 null이라, 그 경우엔 씨앗 연출 없이 저장 축하만 보여준다.
  plantedSeedType: SeedType | null;
  onReturn: () => void;
}

function formatRecapDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
}

// 마음 기록장 7단계 작성을 마치고 저장한 직후에만 뜨는 완료 화면 - 곧바로 일기장으로
// 돌아가는 대신, 씨앗을 심는 의식이 방금 끝났다는 걸 짧은 연출로 확인시켜주고, 방금 적은
// 7단계 문답 전체를 원본 워크시트처럼 되짚어볼 수 있게 한다. 리캡 목록 자체는 일기 상세
// 페이지의 "마음 기록 전체보기" 아코디언과 같은 컴포넌트(GuidedJournalRecapList)를
// includeEmotions=true(감정 선택 2단계 포함, 전부 펼친 상태)로만 다르게 재사용한다.
export default function GuidedJournalCompletionScreen({
  dateStr,
  data,
  plantedSeedType,
  onReturn,
}: GuidedJournalCompletionScreenProps) {
  const seedDef = plantedSeedType ? getSeedDefinition(plantedSeedType) : null;

  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-[#030712]/98 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-lg flex-col items-center px-6 py-14">
        {/* 씨앗 심기 연출 - 기존 리추얼 오버레이의 반짝이는 씨앗 아이콘과 같은 톤으로,
            떨어지듯 살짝 바운스하며 자리 잡는다. */}
        <div
          className="flex h-20 w-20 animate-seed-drop items-center justify-center rounded-full text-4xl shadow-[0_0_50px_-5px_var(--seed-glow)]"
          style={{
            ["--seed-glow" as string]: seedDef ? `${seedDef.colors[0]}70` : "rgba(168,85,247,0.4)",
            backgroundColor: seedDef ? `${seedDef.colors[0]}22` : "rgba(168,85,247,0.12)",
          }}
        >
          <span className="animate-pulse">🌱</span>
        </div>

        <p className="mt-5 text-center text-base font-semibold text-white">
          {seedDef ? (
            <>
              오늘의 <span className="text-purple-200">{seedDef.label}</span> 씨앗을 심었어요 🌱
            </>
          ) : (
            "오늘의 마음 기록을 저장했어요 🌱"
          )}
        </p>
        <p className="mt-1.5 text-center text-xs text-slate-500">
          {seedDef ? "내일 아침, 꿈을 기록하면 개화한 모습을 확인할 수 있어요." : "적어둔 마음을 아래에서 다시 한번 되짚어보세요."}
        </p>

        {/* 오늘 심은 씨앗(문답) 리캡 - 날짜 아래로 7단계 질문/답변을 순서대로 나열한다. */}
        <div className="mt-10 w-full rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
          <p className="text-sm font-medium text-slate-400">{formatRecapDate(dateStr)}</p>
          <div className="mt-5">
            <GuidedJournalRecapList data={data} includeEmotions />
          </div>
        </div>

        <button
          type="button"
          onClick={onReturn}
          className="mt-10 flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-purple-600/90 to-indigo-600/90 px-8 text-sm font-semibold text-white shadow-[0_2px_20px_rgba(147,51,234,0.3)] transition-all hover:brightness-110"
        >
          일기장으로 돌아가기
        </button>
      </div>
    </div>
  );
}
