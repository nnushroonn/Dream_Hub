"use client";

import { useEffect, useState, type ChangeEvent } from "react";

import type { DreamSurvey } from "@/api/dream";

interface ChipOption {
  emoji: string;
  label: string;
}

const TOTAL_STEPS = 6;

const STEP_META = [
  { key: "light", label: "조도 및 제목" },
  { key: "space", label: "공간" },
  { key: "target", label: "대상" },
  { key: "dynamics", label: "역동성" },
  { key: "reality", label: "현실 공명" },
  { key: "dimension", label: "마무리" },
];

const OTHER_LABEL = "기타";

// 각 보기는 프로이트(억압/욕구)·융(원형/신화)·아들러(열등감/현실목표)·게슈탈트(미해결 과제)
// 전문가 동적 매칭 매트릭스와 현대 트렌드 심리(도시, 디지털, SNS 등)를 함께 겨냥해 설계했다.
// 그래도 딱 들어맞지 않는 경우를 위해 각 단계 끝에 "기타" 직접입력을 남겨둔다.
// 백엔드는 이 라벨 문자열을 그대로 받아 EXPERT_MATRIX 힌트로 쓰므로, 표현을 임의로 바꾸지 않는다.
const LIGHT_OPTIONS: ChipOption[] = [
  { emoji: "☀️", label: "햇살이 눈부시고 엄청 맑았어요" },
  { emoji: "🏡", label: "늘 보던 일상 풍경처럼 평범했어요" },
  { emoji: "🌑", label: "눈앞이 캄캄하고 아주 어두웠어요" },
  { emoji: "🌫️", label: "안개가 낀 것처럼 흐릿하고 답답했어요" },
  { emoji: "🏚️", label: "황량하고 쓸쓸한 폐허 같은 느낌이었어요" },
  { emoji: "🔮", label: "화려한 조명이나 네온사인이 반짝였어요" },
  { emoji: "🌅", label: "새벽녘이나 노을빛처럼 은은했어요" },
  { emoji: "🎨", label: "색깔이 없는 흑백 영화 같았어요" },
  { emoji: "🌀", label: "주변 배경이랑 빛이 시시각각 변했어요" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const SPACE_OPTIONS: ChipOption[] = [
  { emoji: "🏠", label: "집, 학교, 회사처럼 매일 가는 익숙한 곳이요" },
  { emoji: "🗺️", label: "태어나서 처음 보는 낯선 장소였어요" },
  // 🫁(폐) 이모지는 일부 환경에서 깨져 보여 🔒로 대체한다.
  { emoji: "🔒", label: "방이나 엘리베이터처럼 꽉 막혀 답답한 곳이요" },
  { emoji: "🏞️", label: "바다나 벌판처럼 탁 트인 야외였어요" },
  { emoji: "🌀", label: "탈출구 없는 미로처럼 끝없이 얽힌 곳이요" },
  { emoji: "🌌", label: "우주나 가상현실처럼 현실적인 느낌이 아니었어요" },
  { emoji: "🎢", label: "높은 곳에 아슬아슬하게 매달려 있는 공간이었어요" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const PROJECTION_OPTIONS: ChipOption[] = [
  { emoji: "👤", label: "가족, 연인, 절친처럼 가장 가까운 사람요" },
  { emoji: "👥", label: "직장 동료, 학교 친구 같은 사회적 지인이요" },
  { emoji: "🎤", label: "평소에 좋아하는 연예인이나 아이돌이요" },
  { emoji: "👻", label: "정체불명의 낯선 사람이나 검은 그림자요" },
  { emoji: "🦁", label: "강아지, 고양이, 뱀 같은 실제 동물이요" },
  { emoji: "🐉", label: "용, 유령, 괴물 같은 상상 속 존재요" },
  { emoji: "🤖", label: "로봇, AI, 스마트폰 같은 기계나 사물이요" },
  { emoji: "❌", label: "아무도 없이 저 혼자만 덩그러니 있었어요" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const DYNAMICS_OPTIONS: ChipOption[] = [
  { emoji: "🏃", label: "누군가에게 필사적으로 쫓기거나 도망쳤어요" },
  { emoji: "⚔️", label: "상대방한테 격렬하게 맞서 싸우거나 저항했어요" },
  { emoji: "🦅", label: "하늘을 자유롭게 날아다니거나 붕 떠 있었어요" },
  { emoji: "🕳️", label: "바닥이 없는 낭떠러지로 끝없이 떨어졌어요" },
  { emoji: "🧍", label: "가위눌린 것처럼 몸이 굳어 꼼짝도 못 했어요" },
  { emoji: "🔍", label: "뭔가를 찾으려고 계속 헤매고 다녔어요" },
  { emoji: "📺", label: "난 아무것도 안 하고 그 상황을 구경만 했어요" },
  { emoji: "🍲", label: "음식을 먹거나 물건을 사는 일상적인 행동이었어요" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const REALITY_OPTIONS: ChipOption[] = [
  { emoji: "💼", label: "시험, 업무, 과제 등 마감 압박이 심해요" },
  { emoji: "👥", label: "직장이나 가족, 친구 간의 인간관계가 힘들어요" },
  { emoji: "📈", label: "돈 문제나 취업, 미래에 대한 불안감이 커요" },
  { emoji: "🔋", label: "몸과 마음이 다 지쳐서 번아웃이 온 것 같아요" },
  { emoji: "🎯", label: "이직, 독립 등 인생의 큰 변화나 도전을 앞두고 있어요" },
  { emoji: "🧘", label: "특별한 걱정거리 없이 비교적 평온하게 지내고 있어요" },
  { emoji: "✏️", label: OTHER_LABEL },
];

const TRANSITION_MS = 250;

type SlidePhase = "idle" | "leaving" | "entering";

interface DreamWizardProps {
  onComplete: (survey: DreamSurvey) => void;
  isSubmitting: boolean;
  /** 수정 모드에서 기존에 저장된 응답을 그대로 채워 넣기 위한 원본 데이터 */
  initialData?: DreamSurvey;
  /** 꿈해몽 사전에서 "이 상징을 바탕으로 기록하기"로 넘어온 경우, Step 1 제목만 미리 채운다 (initialData가 있으면 무시됨) */
  initialTitle?: string;
  /** ⚡ 10초 미니멀 빠른 기록에서 "정밀 분석으로 전환"한 경우, 적어둔 서술을 Step 4(행동 묘사)에 미리 채운다 (initialData가 있으면 무시됨) */
  initialActionDetail?: string;
  /** 꿈해몽 사전의 "내 꿈일기에 이 상징 기록하기"에서 넘어온 경우, 상징의 카테고리로 유추한
   * Step 3(대상) 칩을 미리 선택한다. PROJECTION_OPTIONS 라벨과 일치해야 하며, "기타"일 때만
   * initialTargetOther가 커스텀 입력값으로 함께 쓰인다 (initialData가 있으면 무시됨) */
  initialTargetChip?: string;
  initialTargetOther?: string;
  /** 같은 브릿지에서, 시나리오 제목/무드로 유추한 Step 4(역동성) 칩을 미리 선택한다.
   * DYNAMICS_OPTIONS 라벨과 일치해야 한다 (initialData가 있으면 무시됨) */
  initialDynamicsChip?: string;
  initialDynamicsOther?: string;
  /** 입력값이 하나라도 바뀔 때마다 현재까지의 응답을 통째로 올려보낸다. 부모(꿈 기록소 페이지)가
   * 이걸로 이탈 방지 가드의 "작성 중" 여부를 판단하고, 자동 임시 저장(localStorage)에도 쓴다. */
  onDraftChange?: (draft: DreamSurvey) => void;
  /** 최종 제출 버튼 라벨. 수정 모드에서는 "💾 수정 완료 및 재분석"으로 바뀐다 */
  submitLabel?: string;
}

/**
 * survey에 저장된(또는 브릿지로 넘어온) 최종 문자열이 프리셋 칩 라벨과 일치하면 그 칩을
 * 선택한 상태로, 일치하지 않으면 "기타" 칩을 선택하고 그 문자열을 커스텀 입력값으로 복원한다.
 */
function resolveChipState(options: ChipOption[], value: string): { chip: string; other: string } {
  const matched = options.find((opt) => opt.label !== OTHER_LABEL && opt.label === value);
  return matched ? { chip: matched.label, other: "" } : { chip: OTHER_LABEL, other: value };
}

function chipClass(selected: boolean): string {
  return `w-full rounded-xl border px-3 py-2.5 text-left text-sm backdrop-blur-md transition-all duration-200 ${
    selected
      ? "border-purple-500 bg-purple-600/30 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]"
      : "border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/30 hover:bg-purple-500/20"
  }`;
}

// 선명도 슬라이더 값을 친구에게 말하듯 담백한 구어체 한 줄로 풀어준다.
function vividnessDescription(value: number): string {
  if (value <= 25) return "🌫️ 꿈인 건 알겠는데, 장면들이 뿌옇고 흐릿했어요";
  if (value <= 50) return "📺 그냥 평범한 영화를 보는 것처럼 무난했어요";
  if (value <= 75) return "🎨 색깔이나 소리가 평소보다 쨍하고 생생했어요";
  return "👁️ 깨고 나서도 현실인가 싶을 정도로 생생했어요";
}

// 다크 모드 가독성: 실제 입력 글자는 선명한 화이트, placeholder는 은은한 서브 톤으로 구분한다.
function otherInputClass(): string {
  return "mt-3 w-full rounded-xl border border-violet-400/30 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-slate-500/80 focus:border-violet-400/60 focus:outline-none";
}

// 칩을 고르는 순간, 그 아래로 이 단계 전용 가이드 질문과 단답형 주관식 폼이
// 슬라이드다운 + 페이드인으로 나타난다. 별도 컴포넌트로 분리해 각 단계에서 반복 없이 재사용한다.
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
        <p className="text-xs leading-relaxed text-violet-300/80">{guide}</p>
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

export default function DreamWizard({
  onComplete,
  isSubmitting,
  initialData,
  initialTitle,
  initialActionDetail,
  initialTargetChip,
  initialTargetOther,
  initialDynamicsChip,
  initialDynamicsOther,
  onDraftChange,
  submitLabel = "🔮 내 꿈 분석결과 확인하기",
}: DreamWizardProps) {
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<SlidePhase>("idle");
  const [direction, setDirection] = useState<1 | -1>(1);

  const lightInit = initialData ? resolveChipState(LIGHT_OPTIONS, initialData.brightness) : null;
  const [light, setLight] = useState<string | null>(lightInit?.chip ?? null);
  const [lightOther, setLightOther] = useState(lightInit?.other ?? "");
  const [title, setTitle] = useState(initialData?.title ?? initialTitle ?? "");

  const spaceInit = initialData ? resolveChipState(SPACE_OPTIONS, initialData.space_depth) : null;
  const [space, setSpace] = useState<string | null>(spaceInit?.chip ?? null);
  const [spaceOther, setSpaceOther] = useState(spaceInit?.other ?? "");
  const [spaceDetail, setSpaceDetail] = useState(initialData?.space_detail ?? "");

  const projectionInit = initialData
    ? resolveChipState(PROJECTION_OPTIONS, initialData.identity_factor)
    : initialTargetChip
      ? resolveChipState(PROJECTION_OPTIONS, initialTargetChip)
      : null;
  const [projection, setProjection] = useState<string | null>(projectionInit?.chip ?? null);
  const [projectionOther, setProjectionOther] = useState(projectionInit?.other ?? initialTargetOther ?? "");
  const [targetDetail, setTargetDetail] = useState(initialData?.target_detail ?? "");

  const dynamicsInit = initialData
    ? resolveChipState(DYNAMICS_OPTIONS, initialData.action_physics)
    : initialDynamicsChip
      ? resolveChipState(DYNAMICS_OPTIONS, initialDynamicsChip)
      : null;
  const [dynamics, setDynamics] = useState<string | null>(dynamicsInit?.chip ?? null);
  const [dynamicsOther, setDynamicsOther] = useState(dynamicsInit?.other ?? initialDynamicsOther ?? "");
  const [actionDetail, setActionDetail] = useState(initialData?.action_detail ?? initialActionDetail ?? "");

  const realityInit = initialData ? resolveChipState(REALITY_OPTIONS, initialData.reality_link) : null;
  const [reality, setReality] = useState<string | null>(realityInit?.chip ?? null);
  const [realityOther, setRealityOther] = useState(realityInit?.other ?? "");
  const [realityDetail, setRealityDetail] = useState(initialData?.reality_detail ?? "");

  const [vividness, setVividness] = useState(initialData?.vividness ?? 50);
  const [isLucid, setIsLucid] = useState(initialData?.is_lucid ?? false);
  const [finalMemo, setFinalMemo] = useState(initialData?.final_memo ?? "");
  const [sketchPreview, setSketchPreview] = useState<string | null>(null);

  // 입력값이 바뀔 때마다 지금까지의 응답 전체를 부모에게 올려보낸다 - 이탈 방지 가드의
  // "작성 중" 판단과 자동 임시 저장(디바운스는 부모 쪽에서 건다)의 데이터 소스가 된다.
  useEffect(() => {
    onDraftChange?.({
      title: title.trim(),
      brightness: (light === OTHER_LABEL ? lightOther.trim() : light) ?? "",
      space_depth: (space === OTHER_LABEL ? spaceOther.trim() : space) ?? "",
      space_detail: spaceDetail.trim(),
      identity_factor: (projection === OTHER_LABEL ? projectionOther.trim() : projection) ?? "",
      target_detail: targetDetail.trim(),
      action_physics: (dynamics === OTHER_LABEL ? dynamicsOther.trim() : dynamics) ?? "",
      action_detail: actionDetail.trim(),
      reality_link: (reality === OTHER_LABEL ? realityOther.trim() : reality) ?? "",
      reality_detail: realityDetail.trim(),
      vividness,
      is_lucid: isLucid,
      final_memo: finalMemo.trim(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    light,
    lightOther,
    space,
    spaceOther,
    spaceDetail,
    projection,
    projectionOther,
    targetDetail,
    dynamics,
    dynamicsOther,
    actionDetail,
    reality,
    realityOther,
    realityDetail,
    vividness,
    isLucid,
    finalMemo,
  ]);

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
    projection !== null && (projection !== OTHER_LABEL || projectionOther.trim() !== "") && targetDetail.trim() !== "";
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
      target_detail: targetDetail.trim(),
      action_physics: (dynamics === OTHER_LABEL ? dynamicsOther.trim() : dynamics) ?? "",
      action_detail: actionDetail.trim(),
      reality_link: (reality === OTHER_LABEL ? realityOther.trim() : reality) ?? "",
      reality_detail: realityDetail.trim(),
      vividness,
      is_lucid: isLucid,
      final_memo: finalMemo.trim(),
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
                눈을 떴을 때 꿈속 주변의 전체적인 분위기는 어땠나요?
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
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
                guide="💡 이 꿈에 등장한 가장 중요한 소재를 중심으로 신비로운 [꿈 제목]을 붙여주세요."
                value={title}
                onChange={setTitle}
                placeholder="예: 황금빛 고래와 함께한 하늘 비행 (나중에 쉽게 찾아볼 수 있도록 핵심 소재를 넣어 짧게 적어보세요.)"
                as="input"
              />
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="text-base font-medium text-white">
                어떤 공간에서 일어난 일인가요?
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                guide={"🏙️ 그 장소는 구체적으로 어떤 모습이었나요? 마치 지금 그곳에 있는 것처럼 '현재형(~하고 있다)'으로 상세히 적어보세요."}
                value={spaceDetail}
                onChange={setSpaceDetail}
                placeholder="예: 끝이 보이지 않는 거대한 회색 미로 복도를 헤매고 있다. 사방이 꽉 막혀 있어 숨이 막히는 기분이다."
              />
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="text-base font-medium text-white">
                꿈에 나 말고 누가 또 등장했나요?
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                guide="👥 그 인물이나 사물은 구체적으로 어떤 외형이나 분위기를 풍겼나요? 느낀 감정을 형용사 위주로 표현해 보세요."
                value={targetDetail}
                onChange={setTargetDetail}
                placeholder="예: 초등학교 때 친구인데 얼굴이 안개처럼 흐릿하다. 나를 보고 온화하게 웃고 있지만 왠지 모르게 서글픈 분위기가 난다."
              />
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 className="text-base font-medium text-white">
                그 안에서 주로 어떤 행동을 하셨나요?
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                guide="🏃 어떤 행동을 했고 어떤 사건이 일어났나요? 꿈의 스토리가 이어지도록 생생하게 묘사해 주세요."
                value={actionDetail}
                onChange={setActionDetail}
                placeholder="예: 검은 그림자를 피해 필사적으로 달리고 있다. 발이 진흙 속에 빠진 것처럼 무거워 앞으로 잘 나아가지지 않는다."
              />
            </div>
          )}

          {step === 5 && (
            <div>
              <h3 className="text-base font-medium text-white">
                요즘 일상에서 가장 신경 쓰이는 부분이 있나요?
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                guide="🧘 꿈을 꾼 전후 1~2일간 현실에서 있었던 일이나 당신의 '마음의 풍경'을 떠올리며 꿈이 주는 깨달음을 적어보세요."
                value={realityDetail}
                onChange={setRealityDetail}
                placeholder="예: 내일 있을 중요한 프로젝트 발표 기한 때문에 엄청난 스트레스를 받고 있었는데, 도망치고 싶던 심리가 투사된 것 같다."
              />
            </div>
          )}

          {step === 6 && (
            <div>
              <h3 className="text-base font-medium text-white">마지막으로, 이 꿈이 전체적으로 얼마나 생생했나요?</h3>

              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-indigo-300/70">
                  <span>선명도</span>
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
                <p className="mt-2 text-xs text-slate-400">{vividnessDescription(vividness)}</p>
              </div>

              <div className="mt-6">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-sm text-white">
                    혹시 꿈속에서 &apos;지금 이건 꿈이구나&apos; 하고 스스로 알아챘나요?
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isLucid}
                    onClick={() => setIsLucid((prev) => !prev)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                      isLucid ? "bg-violet-500" : "bg-white/15"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                        isLucid ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>
                <p className="mt-2 text-xs text-slate-400">
                  {isLucid ? "✨ 네, 제 의지대로 꿈을 인지하거나 조절했어요" : "평소처럼 꿈속에 푹 빠져 있었어요"}
                </p>
              </div>

              <div className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4 backdrop-blur-md">
                <p className="text-xs leading-relaxed text-violet-300/80">
                  🎨 글 외에 뇌리에 스친 시각적인 잔상이나 스케치, 이미지가 있다면 함께 첨부해 주세요.
                </p>
                <textarea
                  value={finalMemo}
                  onChange={(event) => setFinalMemo(event.target.value)}
                  placeholder="그림/스케치 파일 업로드 또는 추가적인 무의식의 잔상을 자유롭게 메모하세요."
                  rows={2}
                  className={`${otherInputClass()} resize-none`}
                />
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
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
