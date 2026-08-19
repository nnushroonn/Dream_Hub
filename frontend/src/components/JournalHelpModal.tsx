"use client";

import { createPortal } from "react-dom";
import { ClipboardList, Flower2, MoonStar, MousePointerClick, Search, Sparkles, Sprout } from "lucide-react";

interface JournalHelpModalProps {
  onClose: () => void;
}

// 성장 여정 4단계 - GrowthTimeline과 같은 아이콘을 재사용해 GardenHelpModal/이 화면의
// 시각 언어를 통일한다.
const JOURNEY_STEPS = [
  { icon: Sprout, title: "씨앗 심기" },
  { icon: MoonStar, title: "씨앗 발아" },
  { icon: Flower2, title: "개화" },
  { icon: Sparkles, title: "꽃" },
];

// 일기장 상세 화면의 구조(요약 카드/4단계 자세히 보기 토글/섹션별 접기·펼치기)를 짧게
// 안내한다 - GardenHelpModal과 같은 모달 셸(어두운 카드, 대문자 eyebrow, 섹션 카드,
// 하단 닫기 버튼)을 그대로 재사용해 두 도움말의 톤을 통일했다. 내용 자체는 서로 다른
// 화면을 설명하므로 컴포넌트를 공유하지 않고 별도로 둔다.
export default function JournalHelpModal({ onClose }: JournalHelpModalProps) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-8 backdrop-blur-md" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-7 shadow-[0_0_70px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-center text-xs tracking-widest text-emerald-300/70 uppercase">How the Journal Works</p>
        <h2 className="mt-1.5 text-center text-lg font-semibold text-white">📝 나만의 일기장, 이렇게 봐요</h2>

        {/* 섹션 1 - 성장 여정 (도감/정원 도움말과 같은 4단계 스테퍼) */}
        <section className="mt-6">
          <p className="text-xs font-semibold text-slate-300">🌱 성장 여정</p>
          <div className="mt-3 flex items-center justify-between gap-1">
            {JOURNEY_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="flex items-center">
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-medium text-slate-200">{step.title}</span>
                  </div>
                  {index < JOURNEY_STEPS.length - 1 && <div className="mx-1 h-px w-4 shrink-0 bg-white/10 sm:w-6" />}
                </div>
              );
            })}
          </div>
        </section>

        {/* 섹션 2 - 오늘의 요약 */}
        <section className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <ClipboardList className="h-3.5 w-3.5" /> 오늘의 요약
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">하루를 한눈에 보여줘요.</p>
        </section>

        {/* 섹션 3 - 단계별로 자세히 보기 */}
        <section className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Search className="h-3.5 w-3.5" /> 단계별로 자세히 보기
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            씨앗 심기부터 꽃이 피기까지 4단계를 하나씩 펼쳐볼 수 있어요.
          </p>
        </section>

        {/* 섹션 4 - 섹션 접기/펼치기 */}
        <section className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <MousePointerClick className="h-3.5 w-3.5" /> 섹션 접기·펼치기
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">각 섹션은 눌러서 접고 펼 수 있어요.</p>
        </section>

        {/* 섹션 5 - 정원과의 연결. 정원에 남는 세 가지 결과물(꽃/표본/새싹 표본)이 헷갈릴 수
            있다는 지적을 받고, GardenHelpModal과 같은 구분을 여기도 짧게 옮겨왔다 - 두
            도움말의 문구는 같은 셸을 재사용하되 내용은 각자 다른 화면을 설명하므로 서로
            컴포넌트를 공유하지 않는다는 기존 방침대로, 텍스트만 이 파일에 복사해 뒀다(한쪽만
            고치면 어긋날 수 있으니 나중에 문구를 바꾼다면 두 파일 모두 확인). */}
        <section className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-500/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
            <Flower2 className="h-3.5 w-3.5" /> 무의식의 정원
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">완성된 꽃은 무의식의 정원에도 함께 저장돼요.</p>
          <div className="mt-2.5 space-y-2">
            <p className="text-[11px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-400">🌸 정식 꽃</span> — 씨앗 심기→발아→개화까지 다 거치면 피는
              정식 도감 종.
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-400">🧪 표본</span> — 씨앗 없이 &ldquo;AI 해몽&rdquo;으로 곧장 받은
              결과, 정식 종이 아니라 별도 순번으로 남아요.
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-400">🌫️ 새싹 표본</span> — 씨앗은 심었지만 꿈이 기억나지 않아
              &ldquo;기억 안 나요&rdquo;를 선택했을 때 남는 자리. 나중에 기억나서 다시 쓰면 정식 꽃으로 바뀌어요.
            </p>
          </div>
        </section>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl border border-slate-700 py-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-800/40"
        >
          닫기
        </button>
      </div>
    </div>,
    document.body
  );
}
