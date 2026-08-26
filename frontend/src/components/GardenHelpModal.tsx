"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BookOpen, Flower2, MoonStar, Sparkles, Sprout } from "lucide-react";

import { useOnboardingTourStore } from "@/store/useOnboardingTourStore";

interface GardenHelpModalProps {
  onClose: () => void;
}

// 성장 여정 4단계 - GrowthTimeline과 같은 아이콘을 재사용해 두 화면의 시각 언어를 통일한다.
const JOURNEY_STEPS = [
  { icon: Sprout, title: "씨앗 심기", detail: "밤에 감정일기 작성" },
  { icon: MoonStar, title: "씨앗 발아", detail: "수면, 자동으로 진행돼요" },
  { icon: Flower2, title: "개화", detail: "꿈일기 작성" },
  { icon: Sparkles, title: "꽃", detail: "AI 해몽 완료" },
];

// 정원/꽃 시스템의 작동 원리를 대략적으로만 알려준다 - 정확한 속-종 매핑 공식이나 전설의 꽃
// 언락 조건 같은 세부 로직은 스포일러라 절대 노출하지 않고, 발견의 재미를 위해 힌트 수준으로만
// 남긴다. 전설의 꽃 개별 힌트는 도감 화면(CompendiumModal)의 미발견 슬롯에서 별도로 보여준다.
export default function GardenHelpModal({ onClose }: GardenHelpModalProps) {
  const router = useRouter();
  const requestOnboardingTourStart = useOnboardingTourStore((state) => state.requestManualStart);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-8 backdrop-blur-md" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-7 shadow-[0_0_70px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-center text-xs tracking-widest text-emerald-300/70 uppercase">How the Garden Works</p>
        <h2 className="mt-1.5 text-center text-lg font-semibold text-white">🌌 무의식의 정원, 이렇게 자라요</h2>

        {/* 섹션 1 - 성장 여정 */}
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
                    <span className="max-w-[4.5rem] text-[10px] leading-tight text-slate-500">{step.detail}</span>
                  </div>
                  {index < JOURNEY_STEPS.length - 1 && <div className="mx-1 h-px w-4 shrink-0 bg-white/10 sm:w-6" />}
                </div>
              );
            })}
          </div>
        </section>

        {/* 섹션 2 - 어떤 꽃이 필까요 */}
        <section className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs font-semibold text-slate-300">🌸 어떤 꽃이 필까요</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            그날 밤 남긴 감정과 꾼 꿈이 합쳐져서, 매번 다른 꽃이 피어나요. 같은 감정이라도 어떤 꿈을 꾸느냐에 따라 다른 꽃이
            됩니다.
          </p>
        </section>

        {/* 섹션 2.5 - 정원에 남는 세 가지 결과물 구분. 정식 루틴(씨앗->발아->개화)을 온전히
            거친 것만 "꽃"이고, 나머지 둘("표본"/"새싹 표본")은 정식 종 분류를 따르지 않는
            별개 결과물이다 - 이 구분이 도움말에 없어서 세 가지를 헷갈릴 수 있다는 지적을 받고
            추가했다. */}
        <section className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs font-semibold text-slate-300">🌸🧪🌫️ 정원에 남는 세 가지</p>
          <div className="mt-2 space-y-2.5">
            <p className="text-xs leading-relaxed text-slate-400">
              <span className="font-medium text-slate-300">🌸 정식 꽃</span> — 씨앗 심기→발아→개화(꿈일기 작성)까지 정식
              루틴을 다 거치면 피어나는, 39종+전설 6종 도감에 들어가는 진짜 꽃이에요.
            </p>
            <p className="text-xs leading-relaxed text-slate-400">
              <span className="font-medium text-slate-300">🧪 표본</span> — 씨앗 없이 상단의 &ldquo;AI 해몽&rdquo; 버튼으로
              곧장 받은 결과예요. 정식 종 분류를 따르지 않고 &ldquo;표본 No.1&rdquo;처럼 순번만 매겨 별도 칸에 남아요.
            </p>
            <p className="text-xs leading-relaxed text-slate-400">
              <span className="font-medium text-slate-300">🌫️ 새싹 표본</span> — 씨앗은 심었는데 꿈이 기억나지 않아
              &ldquo;기억 안 나요&rdquo;를 선택했을 때 남는 자리예요. 나중에 그 꿈이 기억나서 다시 기록하면 정식 꽃으로
              바뀌어요.
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              표본과 새싹 표본은 정식 꽃이 아니라서 도감 완성률에는 포함되지 않아요.
            </p>
          </div>
        </section>

        {/* 섹션 3 - 희귀도 */}
        <section className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs font-semibold text-slate-300">⭐ 희귀도</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            흔한 조합일수록 자주 보는 꽃이 되고, 드문 조합일수록 귀한 꽃이 돼요.
          </p>
        </section>

        {/* 섹션 4 - 전설의 꽃 (언락 조건은 절대 노출하지 않는다) */}
        <section className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-500/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
            <Sparkles className="h-3.5 w-3.5" /> 전설의 꽃
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            아주 특별한 순간에만 몰래 피어나는 전설의 꽃도 있어요. 어떻게 만날 수 있는지는… 직접 찾아보세요.
          </p>
        </section>

        {/* 섹션 5 - 도감·고정·공유 */}
        <section className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <BookOpen className="h-3.5 w-3.5" /> 도감·고정·공유
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            모은 꽃은 도감에서 한눈에 볼 수 있고, 마음에 드는 꽃은 정원 대표로 고정하거나 커뮤니티에 자랑할 수 있어요.
          </p>
        </section>

        {/* 신규 가입 온보딩 투어(홈 화면에서 진행) 재실행 진입점 - 기존 정적 도움말 내용은
            그대로 두고, 처음 보는 화면이 낯선 유저를 위한 옵션만 하단에 자연스럽게 덧붙인다. */}
        <button
          type="button"
          onClick={() => {
            requestOnboardingTourStart();
            onClose();
            router.push("/");
          }}
          className="mt-6 w-full rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] py-2.5 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/[0.12]"
        >
          🧭 처음이신가요? 서비스 전체 둘러보기
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl border border-slate-700 py-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-800/40"
        >
          닫기
        </button>
      </div>
    </div>,
    document.body
  );
}
