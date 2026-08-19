import { useId } from "react";

import { darken, lighten } from "@/lib/colorMix";
import { EMOTION_CATEGORY_TO_GENUS, type EmotionCategoryKey } from "@/lib/emotionWordbook";
import { colorForGenus } from "@/lib/flowerTaxonomy";

// 감정 대분류 7종(즐거움/바램/슬픔/분노/기쁨/사랑/미움) 기준 씨앗 아이콘. 예전엔 SeedType
// (숙면/스트레스 해소 등, 감정과 무관한 목적 카테고리) 기준이었으나, writing 단계에서 이미
// 고른 감정이 곧 그날 심는 씨앗이 되도록 바뀌면서 이 컴포넌트도 감정 축으로 다시 그렸다.
//
// 색은 이 감정이 genus(속)로 파생될 때 쓰는 GENUS_COLORS를 그대로 가져온다
// (EMOTION_CATEGORY_TO_GENUS로 연결) - 씨앗일 때 본 색이 나중에 실제로 피는 꽃의 색과
// 항상 같아서, 씨앗->꽃 전환이 "색이 바뀌는" 게 아니라 "같은 색이 자라나는" 것처럼
// 자연스럽게 이어진다. 렌더링 구조(껍질 실루엣 + 방사형 셰이딩 + 하이라이트 + 글린트 +
// 안쪽 기호)는 45종 꽃 아이콘(FlowerIcon)의 기본 셰이딩 공식과 같은 수치를 쓴다.

const STROKE_WIDTH = 3;
const SHELL_PATH =
  "M 50 16 C 66 30 72 46 72 60 C 72 76 62 86 50 86 C 38 86 28 76 28 60 C 28 46 34 30 50 16 Z";

// 사랑 - 하트. 온기 계열의 다정함을 가장 직관적으로 담는 형태.
function GlyphLove({ color }: { color: string }) {
  return (
    <path
      d="M 50 66 C 38 57 34 49 39 44 C 43 40 49 42 50 47 C 51 42 57 40 61 44 C 66 49 62 57 50 66 Z"
      fill={color}
    />
  );
}

// 기쁨 - 사방으로 뻗는 햇살(환희=눈부신 톤). 중심에서 고르게 퍼지는 대칭 광채로,
// 즐거움의 비대칭 음표/바램의 편향된 별과 구분한다.
function GlyphJoy({ color }: { color: string }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <>
      <circle cx="50" cy="53" r="7" fill={color} />
      {rays.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 50 + 11 * Math.cos(rad);
        const y1 = 53 + 11 * Math.sin(rad);
        const x2 = 50 + 17 * Math.cos(rad);
        const y2 = 53 + 17 * Math.sin(rad);
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2.2} strokeLinecap="round" />;
      })}
    </>
  );
}

// 즐거움 - 통통 튀는 음표 하나. 생동(경쾌한 생기)을 리듬감 있는 형태로 표현.
function GlyphFun({ color }: { color: string }) {
  return (
    <>
      <circle cx="44" cy="64" r="5.5" fill={color} />
      <path d="M 49.3 64 L 49.3 39 L 61 34.5 L 61 43.5" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

// 바램 - 손을 뻗어 닿고 싶은 먼 별. 별 하나 + 옅어지는 궤적 두 점으로 "아직 닿지
// 못한 거리감"을 표현(동경 계열).
function GlyphLonging({ color }: { color: string }) {
  return (
    <>
      <path d="M 59 37 L 62.5 47.5 L 73 51 L 62.5 54.5 L 59 65 L 55.5 54.5 L 45 51 L 55.5 47.5 Z" fill={color} />
      <circle cx="38" cy="62" r="2.1" fill={color} opacity={0.55} />
      <circle cx="32" cy="68" r="1.3" fill={color} opacity={0.32} />
    </>
  );
}

// 슬픔 - 눈물방울. 여운 계열의 가라앉는 정서를 가장 단순하고 부드러운 하나의
// 방울로 담는다(미움의 각진 서리와 실루엣 대비를 위해 의도적으로 둥글게).
function GlyphSadness({ color }: { color: string }) {
  return (
    <path
      d="M 50 39 C 56.5 47.5 61 56 61 62.5 C 61 69.5 56 74 50 74 C 44 74 39 69.5 39 62.5 C 39 56 43.5 47.5 50 39 Z"
      fill={color}
    />
  );
}

// 분노 - 번개. 격동 계열의 날카롭고 급작스러운 감정을 지그재그 실루엣으로.
function GlyphAnger({ color }: { color: string }) {
  return <path d="M 57 37 L 43 59 L 51 59 L 45 71 L 63 49 L 54 49 Z" fill={color} />;
}

// 미움 - 서리/얼음 결정. 냉담 계열의 차갑고 거리를 두는 정서를, 슬픔의 둥근
// 눈물방울과 뚜렷이 다른 각진 3축 결정으로 대비시킨다.
function GlyphHatred({ color }: { color: string }) {
  const axes = [-90, 30, 150];
  return (
    <>
      {axes.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x2 = 50 + 15 * Math.cos(rad);
        const y2 = 53 + 15 * Math.sin(rad);
        const x1 = 50 - 15 * Math.cos(rad);
        const y1 = 53 - 15 * Math.sin(rad);
        const branch = (t: number, side: 1 | -1) => {
          const bx = 50 + t * 15 * Math.cos(rad);
          const by = 53 + t * 15 * Math.sin(rad);
          const perp = rad + Math.PI / 2;
          return { x: bx + side * 4 * Math.cos(perp), y: by + side * 4 * Math.sin(perp) };
        };
        const b1 = branch(0.55, 1);
        const b2 = branch(0.55, -1);
        return (
          <g key={deg}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} strokeLinecap="round" />
            <line x1={50 + 0.55 * 15 * Math.cos(rad)} y1={53 + 0.55 * 15 * Math.sin(rad)} x2={b1.x} y2={b1.y} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
            <line x1={50 + 0.55 * 15 * Math.cos(rad)} y1={53 + 0.55 * 15 * Math.sin(rad)} x2={b2.x} y2={b2.y} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          </g>
        );
      })}
    </>
  );
}

const GLYPHS: Record<EmotionCategoryKey, (props: { color: string }) => React.ReactElement> = {
  사랑: GlyphLove,
  기쁨: GlyphJoy,
  즐거움: GlyphFun,
  바램: GlyphLonging,
  슬픔: GlyphSadness,
  분노: GlyphAnger,
  미움: GlyphHatred,
};

// 도감/일기장 등에서 함께 쓸 짧은 한 줄 - 예전 SeedDefinition.meaning과 같은 자리.
export const EMOTION_SEED_MEANING: Record<EmotionCategoryKey, string> = {
  사랑: "따뜻하게 아끼는 마음",
  기쁨: "벅차게 차오르는 행복",
  즐거움: "가볍고 유쾌한 기분",
  바램: "닿고 싶은 간절한 마음",
  슬픔: "고요히 젖어드는 마음",
  분노: "뜨겁게 끓어오르는 감정",
  미움: "차갑게 식어버린 마음",
};

// 아직 어떤 감정도 정해지지 않았거나(미완료), 도감에서 아직 심어본 적 없는 칸을 표시할 때
// 쓰는 중립 회색 - genus 색과 안 겹치도록 채도 없는 슬레이트 톤 하나만 쓴다.
const NEUTRAL_COLORS: [string, string] = ["#475569", "#94a3b8"];

export interface SeedIconProps {
  // null이면 "아직 어떤 감정도 정해지지 않음"(미완료 자리) - 특정 기호 없이 빈 껍질만 그린다.
  category: EmotionCategoryKey | null;
  // true면 실제 색 대신 중립 회색으로 그린다 - 도감에서 "이 감정은 아직 안 심어봤다"를
  // 표시할 때 쓴다. category와 별개다: locked여도 어떤 기호인지(글리프)는 그대로 보여준다
  // (감정 종류 자체는 비밀이 아니라, "심어본 적 있는지"만 잠겨 있다는 뜻이라서).
  locked?: boolean;
  sizePx?: number;
  className?: string;
}

// 정원 도감/일기장 등, 씨앗을 보여주는 화면이 이 컴포넌트 하나를 공유한다.
export default function SeedIcon({ category, locked = false, sizePx = 40, className }: SeedIconProps) {
  const [primary, secondary] = locked || !category ? NEUTRAL_COLORS : colorForGenus(EMOTION_CATEGORY_TO_GENUS[category]);
  const Glyph = category ? GLYPHS[category] : null;
  const uid = useId();

  const hi = lighten(primary, 0.4);
  const lo = darken(primary, 0.16);
  const highlightTone = lighten(primary, 0.55);
  const glintTone = lighten(primary, 0.85);

  return (
    <svg width={sizePx} height={sizePx} viewBox="0 0 100 100" className={className} role="img" aria-hidden>
      <defs>
        <radialGradient id={`${uid}-shade`} cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor={hi} />
          <stop offset="45%" stopColor={primary} />
          <stop offset="100%" stopColor={lo} />
        </radialGradient>
        <clipPath id={`${uid}-clip`}>
          <path d={SHELL_PATH} />
        </clipPath>
      </defs>

      <path
        d={SHELL_PATH}
        fill={`url(#${uid}-shade)`}
        stroke={secondary}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />

      <g clipPath={`url(#${uid}-clip)`}>
        <ellipse cx="41" cy="34" rx="12" ry="18" transform="rotate(-24 41 34)" fill={highlightTone} opacity={0.45} />
        <circle cx="39" cy="27" r="3" fill={glintTone} opacity={0.9} />
      </g>

      <path d="M 50 22 C 50 40 50 68 50 82" fill="none" stroke={secondary} strokeWidth={1.2} opacity={0.35} strokeLinecap="round" />
      {Glyph && <Glyph color={secondary} />}
    </svg>
  );
}
