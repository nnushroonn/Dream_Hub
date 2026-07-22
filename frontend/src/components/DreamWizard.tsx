"use client";

import { useState, type ChangeEvent } from "react";

import type { DreamSurvey } from "@/api/dream";

interface ChipOption {
  emoji: string;
  label: string;
}

const TOTAL_STEPS = 6;

const STEP_META = [
  { key: "light", label: "조도" },
  { key: "space", label: "공간" },
  { key: "projection", label: "투사" },
  { key: "dynamics", label: "역동성" },
  { key: "reality", label: "현실 공명" },
  { key: "dimension", label: "차원 제어" },
];

const OTHER_LABEL = "기타";

const LIGHT_OPTIONS: ChipOption[] = [
  { emoji: "🌑", label: "칠흑 같은 어둠" },
  { emoji: "🌅", label: "은은한 새벽녘" },
  { emoji: "☀️", label: "눈부신 광명" },
  { emoji: "🌆", label: "몽환적인 노을" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const SPACE_OPTIONS: ChipOption[] = [
  { emoji: "🏠", label: "밀폐된 내면(실내)" },
  { emoji: "🌄", label: "광활한 외부(실외)" },
  { emoji: "🌀", label: "초현실적 차원" },
  { emoji: "🌌", label: "무한한 심해/우주" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const PROJECTION_OPTIONS: ChipOption[] = [
  { emoji: "🙋", label: "홀로 머묾" },
  { emoji: "👨‍👩‍👧", label: "인연(가족/지인)" },
  { emoji: "🌫️", label: "그림자(낯선 사람)" },
  { emoji: "🐾", label: "영물(동물)" },
  { emoji: "🔮", label: "성물(특이한 사물)" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const DYNAMICS_OPTIONS: ChipOption[] = [
  { emoji: "🕊️", label: "중력 초월(비행)" },
  { emoji: "🏃", label: "억압과 지체(도망)" },
  { emoji: "🔍", label: "추적과 탐색" },
  { emoji: "🗣️", label: "교감과 대화" },
  { emoji: "👁️", label: "방관적 응시" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const REALITY_OPTIONS: ChipOption[] = [
  { emoji: "🔗", label: "강하게 연결됨" },
  { emoji: "🌫️", label: "희미하게 겹쳐짐" },
  { emoji: "🔄", label: "정반대로 나타남(보상 심리)" },
  { emoji: "🧩", label: "전혀 무관해 보임" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const TRANSITION_MS = 250;

type SlidePhase = "idle" | "leaving" | "entering";

interface DreamWizardProps {
  onComplete: (survey: DreamSurvey) => void;
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

// 칩을 고르는 순간, 그 아래로 '꿈일기 작성 7가지 팁'을 반영한 가이드 질문과 단답형 주관식 폼이
// 슬라이드다운 + 페이드인으로 나타난다. 별도 컴포넌트로 분리해 5개 단계에서 반복 없이 재사용한다.
interface SubjectiveGuideFieldProps {
  visible: boolean;
  guide: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  as?: "input" | "textarea";
}

function SubjectiveGuideField({ visible, guide, value, onChange, placeholder, as = "textarea" }: SubjectiveGuideFieldProps) {
  return (
    <div
      className={`overflow-hidden transition-all duration-500 ease-out ${
        visible ? "mt-5 max-h-56 opacity-100" : "mt-0 max-h-0 opacity-0"
      }`}
    >
      <div className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4 backdrop-blur-md">
        <p className="text-xs leading-relaxed text-violet-300/80">💡 {guide}</p>
        {as === "input" ? (
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={otherInputClass()}
          />
        ) : (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            rows={2}
            className={`${otherInputClass()} resize-none`}
          />
        )}
      </div>
    </div>
  );
}

export default function DreamWizard({ onComplete, isSubmitting }: DreamWizardProps) {
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<SlidePhase>("idle");
  const [direction, setDirection] = useState<1 | -1>(1);

  const [light, setLight] = useState<string | null>(null);
  const [lightOther, setLightOther] = useState("");
  const [title, setTitle] = useState("");

  const [space, setSpace] = useState<string | null>(null);
  const [spaceOther, setSpaceOther] = useState("");
  const [spaceDetail, setSpaceDetail] = useState("");

  const [projection, setProjection] = useState<string | null>(null);
  const [projectionOther, setProjectionOther] = useState("");
  const [identityDetail, setIdentityDetail] = useState("");

  const [dynamics, setDynamics] = useState<string | null>(null);
  const [dynamicsOther, setDynamicsOther] = useState("");
  const [actionDetail, setActionDetail] = useState("");

  const [reality, setReality] = useState<string | null>(null);
  const [realityOther, setRealityOther] = useState("");
  const [realityDetail, setRealityDetail] = useState("");

  const [vividness, setVividness] = useState(50);
  const [isLucid, setIsLucid] = useState(false);
  const [sketchPreview, setSketchPreview] = useState<string | null>(null);

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

  const handleSketchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSketchPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const step1Ready = light !== null && (light !== OTHER_LABEL || lightOther.trim() !== "") && title.trim() !== "";
  const step2Ready = space !== null && (space !== OTHER_LABEL || spaceOther.trim() !== "") && spaceDetail.trim() !== "";
  const step3Ready =
    projection !== null && (projection !== OTHER_LABEL || projectionOther.trim() !== "") && identityDetail.trim() !== "";
  const step4Ready =
    dynamics !== null && (dynamics !== OTHER_LABEL || dynamicsOther.trim() !== "") && actionDetail.trim() !== "";
  const step5Ready =
    reality !== null && (reality !== OTHER_LABEL || realityOther.trim() !== "") && realityDetail.trim() !== "";

  const canProceed =
    step === 1 ? step1Ready : step === 2 ? step2Ready : step === 3 ? step3Ready : step === 4 ? step4Ready : step === 5 ? step5Ready : true;

  const isSurveyComplete = step1Ready && step2Ready && step3Ready && step4Ready && step5Ready;

  const handleNext = () => {
    if (step < TOTAL_STEPS && canProceed) goToStep(step + 1, 1);
  };

  const handlePrev = () => {
    if (step > 1) goToStep(step - 1, -1);
  };

  const handleComplete = () => {
    if (!isSurveyComplete || isSubmitting) return;

    const survey: DreamSurvey = {
      title: title.trim(),
      brightness: (light === OTHER_LABEL ? lightOther.trim() : light) ?? "",
      space_depth: (space === OTHER_LABEL ? spaceOther.trim() : space) ?? "",
      space_detail: spaceDetail.trim(),
      identity_factor: (projection === OTHER_LABEL ? projectionOther.trim() : projection) ?? "",
      identity_detail: identityDetail.trim(),
      action_physics: (dynamics === OTHER_LABEL ? dynamicsOther.trim() : dynamics) ?? "",
      action_detail: actionDetail.trim(),
      reality_link: (reality === OTHER_LABEL ? realityOther.trim() : reality) ?? "",
      reality_detail: realityDetail.trim(),
      vividness,
      is_lucid: isLucid,
    };
    onComplete(survey);
  };

  const slideClass = (() => {
    if (phase === "leaving") return direction === 1 ? "-translate-x-6 opacity-0" : "translate-x-6 opacity-0";
    if (phase === "entering") return direction === 1 ? "translate-x-6 opacity-0" : "-translate-x-6 opacity-0";
    return "translate-x-0 opacity-100";
  })();

  return (
    <div>
      {/* 별자리 프로그레스 바: 단계가 넘어갈 때마다 별과 별 사이를 잇는 선이 그려지듯 채워진다 */}
      <div>
        <p className="text-center text-[11px] tracking-widest text-violet-300/70 uppercase">
          Step {step} / {TOTAL_STEPS} · {STEP_META[step - 1].label}
        </p>
        <div className="mt-2 flex items-center">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((idx) => (
            <div key={idx} className="flex flex-1 items-center last:flex-none">
              <span className="relative inline-flex items-center justify-center">
                {idx === step && (
                  <span className="absolute h-4 w-4 animate-ping rounded-full bg-purple-400/50" />
                )}
                <span
                  className={`relative text-base leading-none transition-all duration-300 ${
                    idx <= step ? "text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.9)]" : "text-slate-600"
                  } ${idx === step ? "scale-125" : ""}`}
                >
                  ✦
                </span>
              </span>
              {idx < TOTAL_STEPS && (
                <div className="relative mx-1 h-px flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`absolute inset-0 origin-left rounded-full bg-purple-400/80 shadow-[0_0_6px_rgba(192,132,252,0.6)] transition-transform duration-500 ease-out ${
                      idx < step ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </div>
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
              <h3 className="text-base font-medium text-white">
                무의식의 첫 번째 층위: 꿈속 배경의 빛은 어떠했나요?
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {LIGHT_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setLight(opt.label)}
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
              <SubjectiveGuideField
                visible={light !== null}
                guide="이 꿈에 중요한 소재를 중심으로 신비로운 [꿈 제목]을 붙여주세요."
                value={title}
                onChange={setTitle}
                placeholder="예: 흑백 도시에서 만난 새벽의 목소리"
                as="input"
              />
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="text-base font-medium text-white">
                공간의 밀도: 영혼이 머물던 장소의 깊이를 고르세요.
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {SPACE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSpace(opt.label)}
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
              <SubjectiveGuideField
                visible={space !== null}
                guide={"꿈의 상황을 생생하게 재현하기 위해, 당시 공간의 풍경을 '~했다'가 아닌 '~하고 있다' 같은 [현재형으로 상세히] 묘사해 주세요."}
                value={spaceDetail}
                onChange={setSpaceDetail}
                placeholder="예: 좁은 골목 사이로 안개가 스며들고 있다..."
              />
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="text-base font-medium text-white">
                무의식의 투사: 시선을 사로잡은 존재는 누구였나요?
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {PROJECTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setProjection(opt.label)}
                    className={chipClass(projection === opt.label)}
                  >
                    <span className="mr-1.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              {projection === OTHER_LABEL && (
                <input
                  type="text"
                  value={projectionOther}
                  onChange={(event) => setProjectionOther(event.target.value)}
                  placeholder="예: 돌아가신 외할아버지, 말하는 까마귀..."
                  autoFocus
                  className={otherInputClass()}
                />
              )}
              <SubjectiveGuideField
                visible={projection !== null}
                guide="그 인물이나 사물은 구체적으로 어떤 모습이었거나 누구와 닮았었나요?"
                value={identityDetail}
                onChange={setIdentityDetail}
                placeholder="예: 표정이 없었고, 예전 담임 선생님과 닮아 있었다..."
              />
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 className="text-base font-medium text-white">
                정신적 역동: 그곳에서 당신이 행한 본능적인 움직임은 무엇인가요?
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {DYNAMICS_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setDynamics(opt.label)}
                    className={chipClass(dynamics === opt.label)}
                  >
                    <span className="mr-1.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              {dynamics === OTHER_LABEL && (
                <input
                  type="text"
                  value={dynamicsOther}
                  onChange={(event) => setDynamicsOther(event.target.value)}
                  placeholder="예: 몸이 갑자기 투명해짐, 시간이 거꾸로 흐름..."
                  autoFocus
                  className={otherInputClass()}
                />
              )}
              <SubjectiveGuideField
                visible={dynamics !== null}
                guide="그 행동이나 사건이 일어날 때 주변 분위기나 결정적인 조각이 있다면 적어주세요."
                value={actionDetail}
                onChange={setActionDetail}
                placeholder="예: 사이렌 소리가 멀리서 들렸고, 발밑이 계속 꺼지는 느낌이었다..."
              />
            </div>
          )}

          {step === 5 && (
            <div>
              <h3 className="text-base font-medium text-white">
                현실과의 관련성: 이 꿈은 최근 당신의 삶과 어떻게 연결되어 있나요?
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {REALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setReality(opt.label)}
                    className={chipClass(reality === opt.label)}
                  >
                    <span className="mr-1.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              {reality === OTHER_LABEL && (
                <input
                  type="text"
                  value={realityOther}
                  onChange={(event) => setRealityOther(event.target.value)}
                  placeholder="예: 잘 모르겠지만 계속 마음에 걸림..."
                  autoFocus
                  className={otherInputClass()}
                />
              )}
              <SubjectiveGuideField
                visible={reality !== null}
                guide="꿈을 꾼 날 전후 1~2일간 있었던 외부 사건들이나 마음의 풍경들을 떠올리며 깨달음을 적어보세요."
                value={realityDetail}
                onChange={setRealityDetail}
                placeholder="예: 요즘 이직 문제로 마음이 복잡했던 게 떠올랐다..."
              />
            </div>
          )}

          {step === 6 && (
            <div>
              <h3 className="text-base font-medium text-white">
                차원 제어 지수: 현실 자아가 개입한 정도를 설정하세요.
              </h3>

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

              <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/5 p-4">
                <p className="text-sm text-white">🖼️ 꿈의 장면 스케치 (선택)</p>
                <p className="mt-0.5 text-xs text-slate-500">기억에 남는 이미지가 있다면 그림이나 사진을 첨부해 보세요.</p>
                <div className="mt-3 flex items-center gap-3">
                  <label className="cursor-pointer rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-xs text-violet-200 transition-colors hover:border-violet-400/60 hover:bg-violet-500/20">
                    📎 파일 선택
                    <input type="file" accept="image/*" onChange={handleSketchChange} className="hidden" />
                  </label>
                  {sketchPreview && (
                    <div className="relative">
                      <img src={sketchPreview} alt="꿈 스케치 미리보기" className="h-12 w-12 rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => setSketchPreview(null)}
                        aria-label="스케치 제거"
                        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[10px] text-slate-300 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
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
              disabled={!isSurveyComplete || isSubmitting}
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
