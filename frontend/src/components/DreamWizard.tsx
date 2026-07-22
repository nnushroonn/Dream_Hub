"use client";

import { useState } from "react";

interface ChipOption {
  emoji: string;
  label: string;
}

const TOTAL_STEPS = 6;

const STEP_META = [
  { key: "light", label: "조도" },
  { key: "space", label: "공간" },
  { key: "subject", label: "대상" },
  { key: "action", label: "역동성" },
  { key: "dimension", label: "차원 제어" },
  { key: "summary", label: "최종 서술" },
];

const OTHER_LABEL = "기타";

const LIGHT_OPTIONS: ChipOption[] = [
  { emoji: "☀️", label: "쨍한 대낮" },
  { emoji: "🌇", label: "노을/황혼" },
  { emoji: "🌙", label: "어두운 밤" },
  { emoji: "💡", label: "인공적인 조명" },
  { emoji: "🌫️", label: "흐릿하고 모호함" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const SPACE_OPTIONS: ChipOption[] = [
  { emoji: "🏠", label: "좁고 아늑한 실내" },
  { emoji: "🏟️", label: "넓게 트인 야외" },
  { emoji: "🌊", label: "물속 공간" },
  { emoji: "🌌", label: "끝없는 우주" },
  { emoji: "🏚️", label: "낡고 폐쇄적인 공간" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const SUBJECT_OPTIONS: ChipOption[] = [
  { emoji: "👨‍👩‍👧", label: "가족" },
  { emoji: "👥", label: "친구" },
  { emoji: "❓", label: "낯선 사람" },
  { emoji: "🐾", label: "동물" },
  { emoji: "📦", label: "특정 사물" },
  { emoji: "🕳️", label: "알 수 없는 존재" },
  { emoji: "🙋", label: "나 혼자" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const ACTION_OPTIONS: ChipOption[] = [
  { emoji: "🕊️", label: "날아오름" },
  { emoji: "🏃", label: "쫓기거나 도망침" },
  { emoji: "📉", label: "떨어짐" },
  { emoji: "⚔️", label: "싸우거나 부딪힘" },
  { emoji: "💧", label: "헤엄치거나 잠김" },
  { emoji: "🧍", label: "얼어붙은 듯 멈춤" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const TRANSITION_MS = 250;
const AUTO_ADVANCE_MS = 350;

type SlidePhase = "idle" | "leaving" | "entering";

interface DreamWizardProps {
  onComplete: (composedContent: string) => void;
  isSubmitting: boolean;
}

function chipClass(selected: boolean): string {
  return `rounded-full border px-4 py-2 text-sm backdrop-blur-md transition-all duration-200 ${
    selected
      ? "border-violet-400/70 bg-violet-500/25 text-white shadow-[0_0_16px_rgba(167,139,250,0.35)]"
      : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/30 hover:text-slate-200"
  }`;
}

function otherInputClass(): string {
  return "mt-3 w-full rounded-xl border border-violet-400/30 bg-black/30 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none";
}

export default function DreamWizard({ onComplete, isSubmitting }: DreamWizardProps) {
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<SlidePhase>("idle");
  const [direction, setDirection] = useState<1 | -1>(1);

  const [light, setLight] = useState<string | null>(null);
  const [lightOther, setLightOther] = useState("");
  const [space, setSpace] = useState<string | null>(null);
  const [spaceOther, setSpaceOther] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [subjectOther, setSubjectOther] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [actionOther, setActionOther] = useState("");
  const [vividness, setVividness] = useState(50);
  const [isLucid, setIsLucid] = useState(false);
  const [summary, setSummary] = useState("");

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

  // 칩 선택형 단계(1~4)는 클릭 즉시 값을 반영하고, "기타"가 아니라면 짧은 딜레이 후 자동으로 다음 단계로 넘어가
  // 클릭 횟수와 피로도를 최소화한다. "기타"는 직접 입력이 필요하므로 자동 전환하지 않는다.
  const selectAndAdvance = (setter: (value: string) => void, value: string) => {
    setter(value);
    if (value === OTHER_LABEL) return;
    window.setTimeout(() => {
      goToStep(step + 1, 1);
    }, AUTO_ADVANCE_MS);
  };

  const canProceed =
    step === 1
      ? light !== null && (light !== OTHER_LABEL || lightOther.trim() !== "")
      : step === 2
        ? space !== null && (space !== OTHER_LABEL || spaceOther.trim() !== "")
        : step === 3
          ? subject !== null && (subject !== OTHER_LABEL || subjectOther.trim() !== "")
          : step === 4
            ? action !== null && (action !== OTHER_LABEL || actionOther.trim() !== "")
            : true;

  const handleNext = () => {
    if (step < TOTAL_STEPS && canProceed) goToStep(step + 1, 1);
  };

  const handlePrev = () => {
    if (step > 1) goToStep(step - 1, -1);
  };

  const handleComplete = () => {
    if (!summary.trim() || isSubmitting) return;

    const resolvedLight = light === OTHER_LABEL ? lightOther.trim() : light;
    const resolvedSpace = space === OTHER_LABEL ? spaceOther.trim() : space;
    const resolvedSubject = subject === OTHER_LABEL ? subjectOther.trim() : subject;
    const resolvedAction = action === OTHER_LABEL ? actionOther.trim() : action;

    const composed = [
      `조도: ${resolvedLight}`,
      `공간: ${resolvedSpace}`,
      `대상: ${resolvedSubject}`,
      `행동: ${resolvedAction}`,
      `선명도: ${vividness}%`,
      `자각몽 여부: ${isLucid ? "예" : "아니오"}`,
      `기억나는 장면: ${summary.trim()}`,
    ].join("\n");
    onComplete(composed);
  };

  const slideClass = (() => {
    if (phase === "leaving") return direction === 1 ? "-translate-x-6 opacity-0" : "translate-x-6 opacity-0";
    if (phase === "entering") return direction === 1 ? "translate-x-6 opacity-0" : "-translate-x-6 opacity-0";
    return "translate-x-0 opacity-100";
  })();

  return (
    <div>
      {/* 별자리 프로그레스 바 */}
      <div>
        <p className="text-center text-[11px] tracking-widest text-violet-300/70 uppercase">
          Step {step} / {TOTAL_STEPS} · {STEP_META[step - 1].label}
        </p>
        <div className="mt-2 flex items-center">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((idx) => (
            <div key={idx} className="flex flex-1 items-center last:flex-none">
              <span
                className={`text-base leading-none transition-all duration-300 ${
                  idx <= step ? "text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.9)]" : "text-slate-600"
                } ${idx === step ? "scale-125" : ""}`}
              >
                ✦
              </span>
              {idx < TOTAL_STEPS && (
                <div
                  className={`mx-1 h-px flex-1 transition-colors duration-500 ${
                    idx < step ? "bg-purple-400/70 shadow-[0_0_6px_rgba(192,132,252,0.6)]" : "bg-white/10"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 단계별 질문 콘텐츠 (슬라이딩 전환) */}
      <div className="mt-6 overflow-hidden">
        <div className={`transition-all duration-300 ease-out ${slideClass}`}>
          {step === 1 && (
            <div>
              <h3 className="text-base font-medium text-white">배경의 빛과 조도는 어땠나요?</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {LIGHT_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => selectAndAdvance(setLight, opt.label)}
                    className={chipClass(light === opt.label)}
                  >
                    <span className="mr-1.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              {light === OTHER_LABEL && (
                <input
                  type="text"
                  value={lightOther}
                  onChange={(event) => setLightOther(event.target.value)}
                  placeholder="예: 색이 없는 흑백의 빛..."
                  autoFocus
                  className={otherInputClass()}
                />
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="text-base font-medium text-white">공간의 밀도와 장소는 어땠나요?</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {SPACE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => selectAndAdvance(setSpace, opt.label)}
                    className={chipClass(space === opt.label)}
                  >
                    <span className="mr-1.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              {space === OTHER_LABEL && (
                <input
                  type="text"
                  value={spaceOther}
                  onChange={(event) => setSpaceOther(event.target.value)}
                  placeholder="예: 우리 동네인데 골목 구조가 다른 곳..."
                  autoFocus
                  className={otherInputClass()}
                />
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="text-base font-medium text-white">시선을 끈 핵심 인물/오브젝트는 무엇이었나요?</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUBJECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => selectAndAdvance(setSubject, opt.label)}
                    className={chipClass(subject === opt.label)}
                  >
                    <span className="mr-1.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              {subject === OTHER_LABEL && (
                <input
                  type="text"
                  value={subjectOther}
                  onChange={(event) => setSubjectOther(event.target.value)}
                  placeholder="예: 돌아가신 외할아버지, 말하는 까마귀..."
                  autoFocus
                  className={otherInputClass()}
                />
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 className="text-base font-medium text-white">무의식 속 핵심 물리적 행동은 무엇이었나요?</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {ACTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => selectAndAdvance(setAction, opt.label)}
                    className={chipClass(action === opt.label)}
                  >
                    <span className="mr-1.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              {action === OTHER_LABEL && (
                <input
                  type="text"
                  value={actionOther}
                  onChange={(event) => setActionOther(event.target.value)}
                  placeholder="예: 몸이 갑자기 투명해짐, 시간이 거꾸로 흐름..."
                  autoFocus
                  className={otherInputClass()}
                />
              )}
            </div>
          )}

          {step === 5 && (
            <div>
              <h3 className="text-base font-medium text-white">선명도와 자각몽 여부를 알려주세요</h3>

              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-indigo-300/70">
                  <span>선명도 (Vivid)</span>
                  <span className="font-medium text-violet-200">{vividness}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={vividness}
                  onChange={(event) => setVividness(Number(event.target.value))}
                  className="mt-2 w-full accent-violet-500"
                />
              </div>

              <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <p className="text-sm text-white">🪄 자각몽이었나요?</p>
                  <p className="mt-0.5 text-xs text-slate-500">꿈속에서 꿈이라는 걸 인지하고 있었다면 켜주세요.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLucid((prev) => !prev)}
                  aria-pressed={isLucid}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-all duration-300 ${
                    isLucid ? "bg-violet-500 shadow-[0_0_12px_rgba(167,139,250,0.6)]" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${
                      isLucid ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {step === 6 && (
            <div>
              <h3 className="text-base font-medium text-white">감정의 잔상을 짧게 남겨주세요</h3>
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="깨어난 뒤에도 남아있는 감정이나 결정적인 장면을 적어보세요..."
                rows={3}
                className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* 이전/다음 내비게이션 */}
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrev}
          disabled={step === 1}
          className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-slate-300 transition-colors hover:border-violet-400/40 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ← 이전
        </button>

        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed}
            className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음 →
          </button>
        ) : (
          <div className="group relative">
            <div className="absolute inset-0 rounded-full bg-violet-500 opacity-40 blur-xl transition-all duration-300 ease-out group-hover:opacity-90 group-hover:blur-2xl" />
            <button
              type="button"
              onClick={handleComplete}
              disabled={!summary.trim() || isSubmitting}
              className="relative rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white transition-all duration-300 group-hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✨ AI 무의식 해몽 요청하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
