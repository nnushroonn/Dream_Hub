import { useId } from "react";

import { darken, lighten } from "@/lib/colorMix";
import { colorForGenus } from "@/lib/flowerTaxonomy";
import { variantForSpecies, type CenterEmblem, type TextureKind } from "@/lib/flowerSpeciesRoster";

// 파라메트릭 SVG 꽃 아이콘 - 유니코드 이모지(🌸🌼🥀 등)를 대신한다.
//
// 원래는 "원형(archetype, 8종)의 모양 하나를 그 원형에 속한 3~6개 종이 색(genus)+무늬
// (texture)로만 구분해 공유"하는 3축 조합식이었는데, 실제 카드 크기(44~90px)에서는 같은
// 원형을 공유하는 종끼리 계속 구분이 안 된다는 문제가 반복됐다 - 색은 그날의 감정(genus)에
// 따라 매번 달라지고, 무늬는 옅은 오버레이 하나 차이라 작은 크기에서는 결국 "같은 실루엣"이
// 지배적으로 보였다. 그래서 종(species) 45개(39종+전설 6종) 각각에 고유한 실루엣을
// 개별적으로 설계하는 쪽으로 옮겨간다 - SPECIES_SHAPE_BUILDERS가 그 개별 설계 등록부다.
//
// 색(genus 8계열)과 무늬(texture, flowerSpeciesRoster 기반 결정론적 배정)는 그대로
// 유지한다 - 실루엣이 종을 구분하고, 색은 "대략의 감정 계열"을 계속 짐작할 수 있게 해주는
// 보조 신호로 남는다.
//
// 45종을 한 번에 다 새로 그리지 않고 단계적으로 옮긴다 - SPECIES_SHAPE_BUILDERS에 아직
// 등록되지 않은 종(과 species_name이 없는 옛 기록)은 이전 renderArchetypeShape 방식으로
// 안전하게 폴백한다(정확한 종 매칭이 안 될 뿐, 렌더링 자체가 깨지지는 않는다).
//
// 변종/희귀도(별점, 아우라 글로우)는 이 컴포넌트 바깥(호출부)이 이미 하던 대로 감싸서
// 그린다 - 이 컴포넌트는 오직 "꽃 자체"(그 안쪽 레이어)만 그린다.

const CENTER = 50;
const STROKE_WIDTH = 2.2;

interface PetalSpec {
  angle: number; // 도(degree), 0 = 오른쪽, -90 = 위쪽(SVG는 y축이 아래로 향한다)
  length: number;
  width: number;
  spiky?: boolean; // true면 직선 변의 뾰족한 스파이크, false(기본)면 둥근 꽃잎
  // 중심(CENTER,CENTER)이 아닌 다른 지점에서 뻗어나가는 종(나비꽃의 날개 4장이 몸통 축을
  // 따라 살짝 다른 지점에서 시작하는 경우 등)을 위한 선택적 시작점. 없으면 CENTER를 쓴다.
  origin?: { x: number; y: number };
}

// 꽃잎 하나의 path "d" 문자열을 계산한다 - origin(기본값 CENTER,CENTER)에서 angle 방향으로
// length만큼 뻗어나가는, 폭 width짜리 도형. spiky=true면 직선 삼각형(가시), 아니면 중간이
// 볼록한 2차 베지어 곡선(둥근 꽃잎)으로 그린다. origin을 받는 이유: 표본 아이콘(SpecimenIcon)
// 처럼 중심이 아닌 다른 지점(줄기 옆)에서 뻗어나가는 잎사귀에도 같은 생성기를 재사용하기
// 위함 - 좌표 문자열을 나중에 치환하는 방식은 곡선의 볼록 제어점까지 잘못 어긋나므로 쓰지
// 않는다(반드시 origin 자체를 계산에 반영해야 한다).
function petalPath({ angle, length, width, spiky }: PetalSpec, origin: { x: number; y: number } = { x: CENTER, y: CENTER }): string {
  const rad = (angle * Math.PI) / 180;
  const perp = rad + Math.PI / 2;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const perpCos = Math.cos(perp);
  const perpSin = Math.sin(perp);
  const tipX = origin.x + length * cos;
  const tipY = origin.y + length * sin;
  const half = width / 2;

  if (spiky) {
    const leftX = origin.x + half * perpCos;
    const leftY = origin.y + half * perpSin;
    const rightX = origin.x - half * perpCos;
    const rightY = origin.y - half * perpSin;
    return `M ${leftX.toFixed(2)} ${leftY.toFixed(2)} L ${tipX.toFixed(2)} ${tipY.toFixed(2)} L ${rightX.toFixed(2)} ${rightY.toFixed(2)} Z`;
  }

  const midLen = length * 0.55;
  const bulge = width * 0.55;
  const midX = origin.x + midLen * cos;
  const midY = origin.y + midLen * sin;
  const bulgeLeftX = midX + bulge * perpCos;
  const bulgeLeftY = midY + bulge * perpSin;
  const bulgeRightX = midX - bulge * perpCos;
  const bulgeRightY = midY - bulge * perpSin;
  return (
    `M ${origin.x} ${origin.y} Q ${bulgeLeftX.toFixed(2)} ${bulgeLeftY.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)} ` +
    `Q ${bulgeRightX.toFixed(2)} ${bulgeRightY.toFixed(2)} ${origin.x} ${origin.y} Z`
  );
}

// 균등 배치(evenly spaced) 꽃잎 count개를 만든다 - startAngle부터 spread(기본 360, 즉 한
// 바퀴 전체)에 걸쳐 고르게 퍼뜨린다. spread를 360보다 작게 주면 한쪽으로 쏠린(바람에 날리는
// 듯한) 배치가 된다.
function evenPetals(count: number, length: number, width: number, options?: { spiky?: boolean; startAngle?: number; spread?: number }): PetalSpec[] {
  const startAngle = options?.startAngle ?? -90;
  const spread = options?.spread ?? 360;
  const step = spread / count;
  return Array.from({ length: count }, (_, i) => ({
    angle: startAngle + i * step,
    length,
    width,
    spiky: options?.spiky,
  }));
}

// i번째 꽃잎마다 항상 같은 [0,1) 값을 주는 결정론적 의사난수 - 하이라이트 꽃잎 각도를 아주
// 살짝(±몇 도) 어긋내 완벽한 기계적 대칭 대신 손으로 그린 듯한 미세한 불규칙함을 준다.
// (flowerSpeciesRoster.ts의 hashString과 같은 목적이지만, 여긴 렌더링 표현이라 인덱스
// 기반 삼각함수 해시로 충분하다 - 별도 import 없이 한 줄로 끝난다.)
function jitter01(i: number): number {
  const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
}

export type Archetype =
  | "관계/재회형"
  | "추적/도피형"
  | "비행/자유형"
  | "잠식/물형"
  | "시험/평가형"
  | "탐험/발견형"
  | "상실/이별형"
  | "성장/변신형";

interface ShapeResult {
  petals?: PetalSpec[];
  customPaths?: string[];
  circles?: { cx: number; cy: number; r: number }[];
  spiralPoints?: [number, number][];
  // 중심 코어 원(secondary 색)의 반지름. 생략하면 기존 기본값(나선형 4 / 그 외 8)을 쓴다.
  // 0을 주면 코어를 숨긴다 - 클러스터형(안개꽃 등)처럼 점들 자체가 이미 꽃이라 중앙에 별도
  // 원이 하나 더 떠 있으면 오히려 이상해 보이는 종을 위한 탈출구.
  coreRadius?: number;
}

// 8원형 x 실루엣(레거시) - species_name이 SPECIES_SHAPE_BUILDERS에 없을 때만 쓰는 폴백.
// 원래는 이 8개 모양이 45종 전체를 대표했지만, 같은 원형을 공유하는 종끼리 작은 크기에서
// 구분이 안 되는 문제 때문에 종 단위 개별 설계(SPECIES_SHAPE_BUILDERS)로 옮겨가는 중이다.
//   관계/재회형: 5장 둥근 꽃잎, 균등 배치 - 가장 기본적이고 다정한 형태.
//   추적/도피형: 7개 얇고 뾰족한 가시 - 긴장감 있는 스파이크.
//   비행/자유형: 6장 꽃잎이 한쪽으로 쏠려 흩날리는(바람에 날리는) 비대칭 배치.
//   잠식/물형: 겹겹의 연꽃 - 넓은 바깥 꽃잎 6장 + 안쪽 작은 꽃잎 5장, 두 겹으로 깊이감.
//   시험/평가형: 방사형 꽃잎이 아니라 아래로 늘어진 종(초롱꽃) 모양 단일 실루엣.
//   탐험/발견형: 12개의 가늘고 촘촘한 광선형 꽃잎 - 사방으로 뻗어나가는 발견의 느낌.
//   상실/이별형: 꽃잎 대신 흩어진 작은 구슬 송이(수국/안개꽃 클러스터), 아래로 무게중심.
//   성장/변신형: 꽃잎이 아니라 중심에서 뻗어나가는 나선(피어나는 새싹의 소용돌이).
function renderArchetypeShape(archetype: Archetype | null): ShapeResult {
  switch (archetype) {
    case "관계/재회형":
      return { petals: evenPetals(5, 32, 22) };
    case "추적/도피형":
      return { petals: evenPetals(7, 36, 13, { spiky: true }) };
    case "비행/자유형":
      return {
        petals: [
          { angle: -150, length: 38, width: 16 },
          { angle: -110, length: 30, width: 14 },
          { angle: -75, length: 36, width: 15 },
          { angle: -40, length: 26, width: 13 },
          { angle: -10, length: 34, width: 15 },
          { angle: 25, length: 22, width: 12 },
        ],
      };
    case "잠식/물형":
      return {
        petals: [...evenPetals(6, 30, 26), ...evenPetals(5, 18, 15, { startAngle: -54 })],
      };
    case "시험/평가형":
      // 방사형이 아닌 단일 종(bell) 실루엣 - 둥근 윗부분에서 좁은 목을 거쳐 넓게 벌어진
      // 아랫단으로 이어진다(초롱꽃/도라지의 아래로 매달린 종 모양).
      return {
        customPaths: [
          "M 34 30 Q 34 14 50 14 Q 66 14 66 30 L 66 42 Q 74 56 62 66 Q 50 74 38 66 Q 26 56 34 42 Z",
        ],
      };
    case "탐험/발견형":
      return { petals: evenPetals(12, 34, 7, { spiky: true }) };
    case "상실/이별형":
      // 무게중심이 아래로 쏠린 작은 구슬 송이 - 시들어 늘어진 안개꽃/수국 클러스터. 반지름을
      // 기존(7~9)보다 한 단계씩 키웠다(8~10) - 작은 원 안에 무늬(그라데이션/스펙클 등)가
      // 들어갈 실제 면적이 너무 좁아 44~80px에서 종끼리 거의 구분이 안 됐던 문제를 완화한다.
      return {
        circles: [
          { cx: 50, cy: 32, r: 8 },
          { cx: 34, cy: 43, r: 9 },
          { cx: 66, cy: 43, r: 9 },
          { cx: 40, cy: 61, r: 10 },
          { cx: 60, cy: 61, r: 10 },
          { cx: 50, cy: 76, r: 8 },
        ],
      };
    case "성장/변신형": {
      // 아르키메데스 나선(θ=0~540도, 반지름 3~32) - 피어나기 직전 말려있던 새싹이 풀리는
      // 모양. 좌표는 30도 간격 19개 점을 미리 계산해 둔 값이다.
      const spiralPoints: [number, number][] = [
        [53, 50], [53.98, 52.3], [53.1, 55.4], [50, 57.8], [45.3, 58.1], [40.5, 55.5], [37.4, 50],
        [37.7, 43], [42.1, 36.3], [50, 32.6], [59.5, 33.5], [67.8, 39.7], [72.2, 50], [70.6, 61.9],
        [62.7, 72], [50, 77], [35.7, 74.8], [23.9, 65.1], [18, 50],
      ];
      return { spiralPoints };
    }
    default:
      // 원형 정보가 없는(도감 체계 도입 이전) 옛 기록 - 단순한 5장 꽃잎으로 대체한다.
      return { petals: evenPetals(5, 30, 20) };
  }
}

// 부채꼴 스캘럽(scallop) 폐곡선 - lobes개의 완만한 둥근 돌기가 innerR~outerR 사이를 오가며
// 이어진 하나의 매끈한 도형. 접시꽃처럼 "꽃잎 여러 장이 아니라 거의 이어진 넓적한 원반"으로
// 보여야 하는 종에 쓴다 - evenPetals로 넓은 꽃잎 여러 장을 겹치면 장마다 개별 테두리 선이
// 그어져 지저분해지는데, 이건 처음부터 하나의 닫힌 경로라 테두리가 매끈하게 한 줄만 남는다.
function scallopedDiscPath(lobes: number, outerR: number, innerR: number, startAngle = -90): string {
  const step = 360 / lobes;
  let d = "";
  for (let i = 0; i < lobes; i++) {
    const a0 = ((startAngle + i * step) * Math.PI) / 180;
    const aMid = ((startAngle + (i + 0.5) * step) * Math.PI) / 180;
    const a1 = ((startAngle + (i + 1) * step) * Math.PI) / 180;
    const x0 = CENTER + innerR * Math.cos(a0);
    const y0 = CENTER + innerR * Math.sin(a0);
    const xMid = CENTER + outerR * Math.cos(aMid);
    const yMid = CENTER + outerR * Math.sin(aMid);
    const x1 = CENTER + innerR * Math.cos(a1);
    const y1 = CENTER + innerR * Math.sin(a1);
    if (i === 0) d += `M ${x0.toFixed(2)} ${y0.toFixed(2)} `;
    d += `Q ${xMid.toFixed(2)} ${yMid.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)} `;
  }
  return d + "Z";
}

// 육각 촘촘 packing - 작은 원(dotR)들을 중심(cx,cy) 반경 radius 안에 최대한 빈틈없이 채운다.
// 수국처럼 "작은 꽃송이가 빽빽하게 뭉친 반구" 실루엣에 쓴다 - 안개꽃(듬성듬성 손으로 배치한
// 소수의 점)과 반대로, 이쪽은 개수가 많고 규칙적으로 빽빽해야 "무겁게 고개 숙인 뭉치" 느낌이
// 산다. 좌표를 일일이 손으로 나열하는 대신 격자 규칙으로 계산해, 나중에 반지름/밀도를 바꿔도
// 숫자 하나만 고치면 된다.
function packedDome(cx: number, cy: number, radius: number, dotR: number): { cx: number; cy: number; r: number }[] {
  const pts: { cx: number; cy: number; r: number }[] = [];
  const spacing = dotR * 2.15;
  const steps = Math.ceil(radius / spacing) + 1;
  for (let row = -steps; row <= steps; row++) {
    const y = cy + row * spacing * 0.87;
    const rowOffset = row % 2 === 0 ? 0 : spacing / 2;
    for (let col = -steps; col <= steps; col++) {
      const x = cx + col * spacing + rowOffset;
      const dx = x - cx;
      const dy = y - cy;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) pts.push({ cx: x, cy: y, r: dotR });
    }
  }
  return pts;
}

// 원뿔(cone) packing - packedDome과 같은 원리지만 반구가 아니라 위로 갈수록 좁아지는 삼각뿔
// 모양 안에 점을 채운다. 라일락처럼 "작은 꽃송이가 촘촘히 달린 원뿔형 꽃차례(panicle)"에
// 쓴다 - 수국(반구)·안개꽃(성긴 산점)·카랑코에(나선 산점)와 함께 "작은 점 무리" 계열
// 안에서도 서로 다른 윤곽(반구/성김/나선/원뿔)을 갖게 된다.
function packedCone(cx: number, topY: number, bottomY: number, bottomWidth: number, dotR: number): { cx: number; cy: number; r: number }[] {
  const pts: { cx: number; cy: number; r: number }[] = [];
  const spacing = dotR * 2.1;
  const rows = Math.max(1, Math.round((bottomY - topY) / spacing));
  for (let row = 0; row <= rows; row++) {
    const t = row / rows; // 0=꼭대기(좁음) 1=바닥(넓음)
    const y = topY + t * (bottomY - topY);
    const width = Math.max(spacing, bottomWidth * t);
    const count = Math.max(1, Math.round(width / spacing));
    for (let col = 0; col < count; col++) {
      const x = cx - width / 2 + (col + 0.5) * (width / count);
      pts.push({ cx: x, cy: y, r: dotR });
    }
  }
  return pts;
}

// 나선 궤적 위의 등간격 좌표 - 카랑코에처럼 "작은 꽃송이 여러 개가 소용돌이치며 피어나는"
// 배치에 쓴다. turns가 커질수록 더 많이 감긴다.
function spiralScatter(count: number, turns: number, startR: number, endR: number): { x: number; y: number; angle: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count <= 1 ? 0 : i / (count - 1);
    const angle = -90 + t * turns * 360;
    const r = startR + t * (endR - startR);
    const rad = (angle * Math.PI) / 180;
    return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad), angle };
  });
}

// 4방향 스파클(오목 별) 폐곡선 - 성단화처럼 "크고 작은 별이 흩뿌려진" 실루엣에 쓴다.
// LegendarySparkles의 십자 스파클과 같은 계열의 도형이지만, 저건 장식 오버레이(항상 금빛
// 고정)이고 이건 종 자체의 실루엣(genus 색이 채워짐)이라 서로 다른 함수로 둔다.
function starPoint(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = ((-90 + i * 45) * Math.PI) / 180;
    const rad = i % 2 === 0 ? r : r * 0.38;
    pts.push(`${(cx + rad * Math.cos(angle)).toFixed(2)} ${(cy + rad * Math.sin(angle)).toFixed(2)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

// 끝에 V자 홈이 파인 꽃잎 - 금계국처럼 꽃잎 끝이 살짝 갈라진 실제 코스모스/금계국과의
// 특징을 살린다. petalPath(둥근 볼록 곡선)와 달리 5개 꼭짓점의 폐곡선이라 끝부분이 오목하게
// 파인 실루엣이 나온다 - 지금까지 쓴 어떤 꽃잎 생성기와도 다른 새 질감이다.
function notchedPetalPath(angle: number, length: number, width: number, notchDepth: number): string {
  const rad = (angle * Math.PI) / 180;
  const perp = rad + Math.PI / 2;
  const half = width / 2;
  const baseL = { x: CENTER + half * Math.cos(perp), y: CENTER + half * Math.sin(perp) };
  const baseR = { x: CENTER - half * Math.cos(perp), y: CENTER - half * Math.sin(perp) };
  const tipCenter = { x: CENTER + length * Math.cos(rad), y: CENTER + length * Math.sin(rad) };
  const notchIn = {
    x: CENTER + (length - notchDepth) * Math.cos(rad),
    y: CENTER + (length - notchDepth) * Math.sin(rad),
  };
  const tipL = { x: tipCenter.x + width * 0.28 * Math.cos(perp), y: tipCenter.y + width * 0.28 * Math.sin(perp) };
  const tipR = { x: tipCenter.x - width * 0.28 * Math.cos(perp), y: tipCenter.y - width * 0.28 * Math.sin(perp) };
  return (
    `M ${baseL.x.toFixed(2)} ${baseL.y.toFixed(2)} L ${tipL.x.toFixed(2)} ${tipL.y.toFixed(2)} ` +
    `L ${notchIn.x.toFixed(2)} ${notchIn.y.toFixed(2)} L ${tipR.x.toFixed(2)} ${tipR.y.toFixed(2)} ` +
    `L ${baseR.x.toFixed(2)} ${baseR.y.toFixed(2)} Z`
  );
}

// 종(species) 단위 개별 실루엣 등록부. 여기 없는 종은 renderSpeciesShape가 기존 원형
// 폴백으로 넘긴다.
//
// 1차(10종): 이전에 유독 비슷해 보였던 소용돌이 계열 3종 + 구슬송이 계열 3종, 프롬프트가
// 형태를 직접 지정한 전설 3종 + 대조군 전설 1종.
// 2차(10종): 성장/변신형·상실/이별형 나머지(각각 1종/2종, 두 원형 전체 완성) + 관계/재회형
// 전체 6종(가장 큰 원형 그룹이라 통째로 옮겨 상호 구분을 한 번에 검증) + 전설 1종(성단화).
const SPECIES_SHAPE_BUILDERS: Record<string, () => ShapeResult> = {
  // --- 성장/변신형: 기존엔 셋 다 같은 나선(spiral) 하나를 공유했다 ---
  // 크로커스 - "겨우내 웅크렸던 마음이 천천히 풀려났어요": 나선 대신, 좁고 긴 꽃잎 6장이
  // 곧게 선 잔(goblet) 모양. 관계/재회형(넓고 둥근 5장)과 대비되는 "길쭉하고 뾰족한" 인상.
  크로커스: () => ({ petals: evenPetals(6, 36, 13), coreRadius: 6 }),
  // 나비꽃 - "다른 모습으로 거듭나려 날개를 펼쳤어요": 이름 그대로 나비 실루엣. 몸통 축을
  // 기준으로 큰 위쪽 날개 2장 + 작은 아래쪽 날개 2장, 더듬이 2가닥.
  나비꽃: () => ({
    petals: [
      { angle: -35, length: 30, width: 24, origin: { x: 53, y: 46 } },
      { angle: 35, length: 22, width: 18, origin: { x: 55, y: 55 } },
      { angle: -145, length: 30, width: 24, origin: { x: 47, y: 46 } },
      { angle: 145, length: 22, width: 18, origin: { x: 45, y: 55 } },
    ],
    customPaths: ["M 50 40 L 50 62", "M 50 40 Q 46 32 43 28", "M 50 40 Q 54 32 57 28"],
    coreRadius: 4,
  }),
  // 접시꽃 - "낯선 하루 끝에서 조금씩 자기 모습을 찾아갔어요": 이름 그대로 넓적한 원반 하나.
  // scallopedDiscPath로 꽃잎 경계 없이 매끈하게 이어진 5개의 돌기. 처음엔 안쪽/바깥 반지름
  // 차이가 작아(38/24, 비율 0.63) 돌기 사이 골이 얕았는데, 44px에서는 그 얕은 굴곡이
  // 안티앨리어싱에 묻혀 "그냥 둥근 덩어리"로 보였다 - 두 가지로 보강한다: (1) 반지름 차를
  // 크게 벌려(39/17, 비율 0.44) 골을 훨씬 깊게 파고, (2) 윤곽선 굴곡만으로는 작은 크기에서
  // 여전히 옅어질 수 있어, 각 돌기 꼭짓점을 향해 뻗는 얇은 방사형 접선(secondary색 실선) 5개를
  // 더한다 - 곡선 윤곽이 흐려지는 크기에서도 직선은 안티앨리어싱에 덜 먹혀 "원반이 몇 개
  // 면으로 나뉘어 있다"는 인상이 살아남는다.
  접시꽃: () => {
    const lobes = 5;
    const outerR = 39;
    const innerR = 17;
    const creaseInnerR = 9;
    const creaseOuterR = 35;
    const startAngle = -90;
    const step = 360 / lobes;
    const creases = Array.from({ length: lobes }, (_, i) => {
      const rad = ((startAngle + (i + 0.5) * step) * Math.PI) / 180;
      const x1 = CENTER + creaseInnerR * Math.cos(rad);
      const y1 = CENTER + creaseInnerR * Math.sin(rad);
      const x2 = CENTER + creaseOuterR * Math.cos(rad);
      const y2 = CENTER + creaseOuterR * Math.sin(rad);
      return `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    });
    return {
      customPaths: [scallopedDiscPath(lobes, outerR, innerR, startAngle), ...creases],
      coreRadius: 6,
    };
  },
  // 카랑코에 - "새롭게 태어난 듯한 벅찬 기쁨이 소용돌이쳤어요": 실제 칼랑코에처럼 작은 4장짜리
  // 별꽃 여러 송이가 다발로 피는데, "소용돌이쳤다"는 문구를 그대로 살려 그 다발을 나선
  // 궤적(spiralScatter)을 따라 배치했다 - 크로커스(단일 6장 잔)·나비꽃(날개)·접시꽃(원반)과
  // 함께 놓아도 "작은 꽃 여러 송이가 소용돌이"라는 구조 자체가 셋과 확연히 다르다.
  카랑코에: () => {
    const points = spiralScatter(7, 1.3, 6, 30);
    const petals: PetalSpec[] = [];
    points.forEach((p) => {
      for (let k = 0; k < 4; k++) {
        petals.push({ angle: p.angle + k * 90, length: 7, width: 5, origin: { x: p.x, y: p.y } });
      }
    });
    return { petals, coreRadius: 5 };
  },

  // --- 상실/이별형: 기존엔 셋 다 같은 "구슬 6개" 클러스터를 공유했다 ---
  // 안개꽃 - "흩어진 마음들이 조용히 모여 송이를 이뤘어요": 실제로도 작은 꽃이 성기게 흩어져
  // 피는 종이라, 듬성듬성하고 크기가 제각각인 점 10개로 "흩어짐" 자체를 형태로 삼는다.
  안개꽃: () => ({
    circles: [
      { cx: 38, cy: 30, r: 2.6 }, { cx: 60, cy: 26, r: 2.2 }, { cx: 70, cy: 44, r: 2.8 },
      { cx: 56, cy: 52, r: 2.4 }, { cx: 34, cy: 50, r: 2.2 }, { cx: 44, cy: 66, r: 2.6 },
      { cx: 64, cy: 64, r: 2.2 }, { cx: 50, cy: 38, r: 2 }, { cx: 26, cy: 36, r: 2.4 },
      { cx: 74, cy: 60, r: 2 },
    ],
    coreRadius: 0,
  }),
  // 수국 - "젖은 마음이 겹겹이 모여 무겁게 고개를 숙였어요": 안개꽃과 정반대로, 작은 꽃송이가
  // 빈틈없이 빽빽하게 뭉친 무거운 반구 하나(packedDome) - 아래로 처진 느낌을 주려 중심을
  // 살짝 낮췄다.
  수국: () => ({ circles: packedDome(50, 54, 20, 3.3), coreRadius: 0 }),
  // 리시안셔스 - "이별의 자리에 남겨진 마음이 곱게 접혔어요": 클러스터가 아니라 장미에 가까운
  // 겹꽃 한 송이 - 넓은 바깥 꽃잎 6장 위에 작은 안쪽 꽃잎 5장을 살짝 돌려 겹쳐, "곱게 접힌"
  // 느낌을 낸다. 폭이 길이에 가까운(=거의 원형) 꽃잎은 44px에서 수국(빽빽한 원형 클러스터)과
  // 똑같이 "그냥 둥근 덩어리"로 뭉개져 보였다(특히 여운처럼 채도 낮은 속에서는 꽃잎 사이
  // 경계 자체가 잘 안 보였다) - 꽃잎 폭을 길이 대비 확 줄여 꽃잎 사이 골이 깊게 파이도록
  // 하고, 안쪽 겹의 회전 오프차(36도, 5장 기준 최대 엇갈림)를 키워 톱니 같은 윤곽을 냈다.
  리시안셔스: () => ({
    petals: [...evenPetals(6, 30, 15), ...evenPetals(5, 16, 9, { startAngle: -54 })],
    coreRadius: 6,
  }),
  // 얼음꽃 - "차갑게 식은 이별이 서리처럼 맺힌 자리예요": 같은 냉담 속 고정종인 서리꽃(아래,
  // 단순한 6갈래 스파이크 별)과 겹치지 않도록, 각 갈래마다 짧은 곁가지 2개를 덧붙인 진짜
  // 눈 결정(snowflake) 모양으로 키웠다 - "서리(살짝 언 첫 얼음)"보다 "완전히 얼어붙어 갈라진
  // 결정"이 훨씬 차갑고 복잡한 인상이라 이별의 무게와도 더 잘 맞는다. 곁가지도 (선이 아니라)
  // 채워진 뾰족 꽃잎이라 새 렌더링 스타일(채움 위주)에서도 가늘어 보이지 않는다.
  얼음꽃: () => {
    const spikes: PetalSpec[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = -90 + i * 60;
      spikes.push({ angle, length: 32, width: 9, spiky: true });
      const rad = (angle * Math.PI) / 180;
      const origin = { x: CENTER + 17 * Math.cos(rad), y: CENTER + 17 * Math.sin(rad) };
      spikes.push({ angle: angle - 45, length: 12, width: 5, spiky: true, origin });
      spikes.push({ angle: angle + 45, length: 12, width: 5, spiky: true, origin });
    }
    return { petals: spikes, coreRadius: 5 };
  },
  // 라일락 - "떠나보낸 자리에서 그 향기만 아득히 남았어요": 실제 라일락처럼 작은 꽃송이가
  // 촘촘히 달린 원뿔형 꽃차례 - 안개꽃(성긴 산점)·수국(빽빽한 반구)과 함께 "작은 점 무리"
  // 계열이지만 원뿔(위로 갈수록 좁아짐)이라는 뚜렷하게 다른 윤곽을 갖는다.
  라일락: () => ({ circles: packedCone(50, 24, 70, 34, 3), coreRadius: 0 }),

  // --- 관계/재회형: 가장 큰 원형 그룹(6종) - 통째로 옮겨 상호 구분을 한 번에 검증한다 ---
  // 들꽃 - "어디에도 매이지 않고 있는 그대로 피어난 마음이에요": 이 도감에서 가장 수수하고
  // 기본적인 꽃 - 6장 꽃잎이지만 길이를 일부러 조금씩 들쭉날쭉하게 줘(24~28) "다듬어지지
  // 않은 그대로"라는 이름의 정서를 살렸다.
  들꽃: () => ({
    petals: [
      { angle: -90, length: 24, width: 15 },
      { angle: -30, length: 28, width: 16 },
      { angle: 30, length: 23, width: 14 },
      { angle: 90, length: 27, width: 15 },
      { angle: 150, length: 22, width: 14 },
      { angle: -150, length: 26, width: 15 },
    ],
    coreRadius: 7,
  }),
  // 제비꽃 - "낮게 피어 있어도 곁을 알아채주는 다정함이었어요": 방사 대칭이 아니라 팬지/제비꽃
  // 특유의 좌우대칭 "얼굴" 구조 - 위쪽 작은 꽃잎 2장 + 옆 날개 꽃잎 2장 + 아래 큰 입술
  // 꽃잎 1장.
  제비꽃: () => ({
    petals: [
      { angle: -125, length: 20, width: 14 },
      { angle: -55, length: 20, width: 14 },
      { angle: -175, length: 24, width: 16 },
      { angle: 5, length: 24, width: 16 },
      { angle: 90, length: 30, width: 22 },
    ],
    coreRadius: 5,
  }),
  // 프리지아 - "다시 만날 순간을 향기로 미리 그려본 밤이었어요": 실제 프리지아처럼 한 방향
  // 대각선을 따라 크기가 줄어드는 통꽃 여러 송이가 이어진 꽃대 - 나비꽃과 같은 "원점 이동"
  // 기법을 재사용해 대각선 줄기를 표현한다.
  프리지아: () => ({
    petals: [
      { angle: -60, length: 34, width: 12 },
      { angle: -55, length: 22, width: 9, origin: { x: 42, y: 58 } },
      { angle: -50, length: 15, width: 7, origin: { x: 36, y: 66 } },
    ],
    coreRadius: 4,
  }),
  // 금잔화 - "다시 마주친 반가움에 얼굴 가득 웃음이 번졌어요": 실제 마리골드처럼 가늘고 짧은
  // 꽃잎 16장이 빽빽하게 겹친 화려한 폼폼 - 환희(밝은 노랑)와 만나면 특히 화사하다.
  금잔화: () => ({ petals: evenPetals(16, 22, 7), coreRadius: 6 }),
  // 서리꽃 - "돌아섰던 마음이 서늘하게 다시 얼어붙은 자리예요": 얼음꽃(같은 냉담 고정종,
  // 곁가지가 있는 복잡한 눈 결정)보다 앳된 "첫 서리" - 곁가지 없는 단순한 6갈래 얼음 별.
  서리꽃: () => ({ petals: evenPetals(6, 28, 8, { spiky: true }), coreRadius: 5 }),
  // 메꽃 - "끊어질 듯 이어지는 인연을 아득히 그리워했어요": 나팔꽃과 친척인 메꽃답게 얕게
  // 접힌 납작한 원반(접시꽃보다 훨씬 얕은 비율) - 그 얕은 접힘이 44px에서도 보이도록
  // 접시꽃과 같은 방사형 접선 보강 기법을 재사용했다.
  메꽃: () => {
    const lobes = 5;
    const outerR = 30;
    const innerR = 22;
    const startAngle = -90;
    const creases = Array.from({ length: lobes }, (_, i) => {
      const rad = ((startAngle + (i + 0.5) * (360 / lobes)) * Math.PI) / 180;
      const x2 = CENTER + 27 * Math.cos(rad);
      const y2 = CENTER + 27 * Math.sin(rad);
      return `M ${CENTER} ${CENTER} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    });
    return { customPaths: [scallopedDiscPath(lobes, outerR, innerR, startAngle), ...creases], coreRadius: 5 };
  },

  // --- 추적/도피형 (3차 배치): 쫓기거나 도망치는 긴장 ---
  // 엉겅퀴 - "가시로 스스로를 지키며 버텨낸 하룻밤이었어요": 실제 엉겅퀴처럼 짧고 촘촘한
  // 가시 14개(둥근 머리 부분)에 길고 성긴 가시 7개(바깥 헤일로)를 더해 "빽빽하고 둥근
  // 가시 뭉치" 인상 - 뒤이은 가시나무꽃(한쪽으로 쏠린 성긴 가시)과 뚜렷이 대비된다.
  엉겅퀴: () => ({
    petals: [...evenPetals(14, 16, 5, { spiky: true }), ...evenPetals(7, 24, 4, { spiky: true, startAngle: -64 })],
    coreRadius: 9,
  }),
  // 가시나무꽃 - "쫓기듯 날카로워진 마음 끝에 겨우 피어났어요": 엉겅퀴와 달리 원 전체가
  // 아니라 180도 안쪽으로만 몰린 불규칙한 긴 가시 7개 - "쫓기는" 방향성 있는 긴장을
  // 표현한다.
  가시나무꽃: () => ({
    petals: [
      { angle: -130, length: 22, width: 6, spiky: true },
      { angle: -100, length: 40, width: 6, spiky: true },
      { angle: -70, length: 30, width: 5, spiky: true },
      { angle: -40, length: 44, width: 5, spiky: true },
      { angle: -10, length: 26, width: 6, spiky: true },
      { angle: 20, length: 36, width: 5, spiky: true },
      { angle: 50, length: 20, width: 5, spiky: true },
    ],
    coreRadius: 5,
  }),
  // 선인장꽃 - "메마른 긴장 속에서도 꿋꿋이 버텨낸 자리예요": 넓고 둥근 꽃잎 8장(진짜 꽃)
  // 아래쪽에, 원점을 아래로 옮긴 가는 가시 5개를 덧붙여 "선인장 패드에서 막 피어난 꽃"
  // 인상을 준다 - 나비꽃 이후 두 번째로 origin 이동 기법을 "꽃+줄기 받침" 조합에 쓴 예.
  선인장꽃: () => ({
    petals: [
      ...evenPetals(8, 24, 19),
      { angle: -110, length: 8, width: 2, spiky: true, origin: { x: 50, y: 70 } },
      { angle: -90, length: 9, width: 2, spiky: true, origin: { x: 50, y: 70 } },
      { angle: -70, length: 8, width: 2, spiky: true, origin: { x: 50, y: 70 } },
      { angle: 180, length: 7, width: 2, spiky: true, origin: { x: 50, y: 70 } },
      { angle: 0, length: 7, width: 2, spiky: true, origin: { x: 50, y: 70 } },
    ],
    coreRadius: 7,
  }),
  // 얼음새꽃 - "차갑게 얼어붙은 채로 도망칠 곳을 찾던 밤이에요": 전설 여명초(위쪽 55도 부채꼴로
  // 뻗는 가는 잎)와 정반대로, 아래쪽 120도 부채꼴로 뻗는 가는 얼음 조각 5개 - "위로 뻗어
  // 나아가는" 여명초와 "아래로 웅크려 도망칠 곳을 찾는" 이 종의 방향성이 대비된다(서로
  // 다른 원형/전설 여부라 실제로 나란히 놓일 일은 없지만, 같은 생성기 계열을 방향만 뒤집어
  // 재사용한 의도적 대비).
  얼음새꽃: () => ({
    petals: [
      { angle: 40, length: 20, width: 4, spiky: true },
      { angle: 70, length: 30, width: 4, spiky: true },
      { angle: 100, length: 34, width: 5, spiky: true },
      { angle: 130, length: 28, width: 4, spiky: true },
      { angle: 160, length: 24, width: 5, spiky: true },
    ],
    coreRadius: 4,
  }),

  // --- 비행/자유형 (3차 배치): 바람에 날리듯 자유로운 정서 ---
  // 민들레 - "바람이 부는 대로 훌훌 날아가고 싶던 마음이에요": 실제 민들레 씨앗 홀씨처럼
  // 아주 가는 스파이크 22개가 정원(360도) 전체를 채운 폭신한 공 모양 - 원형 전체를 쓰는
  // 유일한 "고밀도 스파이크 구체"라 다른 스파이크 계열(서리꽃 6개, 여명초 5개 부채꼴 등)과
  // 확실히 구분된다.
  민들레: () => ({ petals: evenPetals(22, 30, 3, { spiky: true }), coreRadius: 5 }),
  // 나팔꽃 - "새벽 공기를 가르며 자유롭게 피어난 순간이에요": 접시꽃/메꽃과 같은 계열
  // (scallopedDiscPath+방사형 접선)이지만 6개 돌기(다른 둘은 5개)+더 큰 목구멍(coreRadius 8)
  // 으로 나팔꽃 특유의 넓게 벌어진 목구멍을 강조했다 - 서로 다른 원형에 흩어져 있어 직접
  // 인접할 일은 적지만, 혹시 몰라 돌기 개수부터 다르게 뒀다.
  나팔꽃: () => {
    const lobes = 6;
    const outerR = 36;
    const innerR = 24;
    const startAngle = -90;
    const creases = Array.from({ length: lobes }, (_, i) => {
      const rad = ((startAngle + (i + 0.5) * (360 / lobes)) * Math.PI) / 180;
      const x2 = CENTER + 32 * Math.cos(rad);
      const y2 = CENTER + 32 * Math.sin(rad);
      return `M ${CENTER} ${CENTER} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    });
    return { customPaths: [scallopedDiscPath(lobes, outerR, innerR, startAngle), ...creases], coreRadius: 8 };
  },
  // 개양귀비 - "구속을 벗어던지고 바람에 온몸을 맡긴 밤이에요": 실제 개양귀비처럼 크고
  // 얇은 꽃잎 정확히 4장 - 90도 등분이 아니라 살짝 어긋난 각도(-140/-50/30/110)로 흩날리는
  // 비대칭을 냈다.
  개양귀비: () => ({
    petals: [
      { angle: -140, length: 34, width: 30 },
      { angle: -50, length: 30, width: 28 },
      { angle: 30, length: 36, width: 32 },
      { angle: 110, length: 28, width: 26 },
    ],
    coreRadius: 6,
  }),
  // 황매화 - "가슴 벅차게 자유로운 웃음이 바람에 실려 갔어요": 겹꽃 형태(바깥 8장+안쪽 8장
  // 엇갈림)로 화사하고 풍성한 느낌을 낸다 - 리시안셔스(6+5 겹꽃)보다 꽃잎 수가 많아 더
  // 촘촘하고 화려하다.
  황매화: () => ({
    petals: [...evenPetals(8, 24, 16), ...evenPetals(8, 16, 11, { startAngle: -90 + 22.5 })],
    coreRadius: 6,
  }),
  // 구절초 - "멀리 떠나고픈 마음이 산들바람에 아득히 흩날렸어요": 들국화답게 가늘고 긴
  // 꽃잎(광선) 14장. 같은 원형인 민들레(22장, spiky 스파이크)와는 "장수가 적고 둥근 꽃잎"
  // 이라는 점에서 뚜렷이 다르다.
  구절초: () => ({ petals: evenPetals(14, 30, 7), coreRadius: 6 }),

  // --- 잠식/물형 (4차·마지막 배치): 물속으로 서서히 잠겨드는 정서 ---
  // 수련 - "고요한 물속으로 마음이 서서히 잠겨든 밤이었어요": 겹겹의 연꽃 - 바깥 8장+
  // 안쪽 6장, 폭이 좁고 길어 리시안셔스(장미형, 폭이 넓음)보다 훨씬 뾰족하고 우아하다.
  수련: () => ({
    petals: [...evenPetals(8, 34, 15), ...evenPetals(6, 20, 11, { startAngle: -60 })],
    coreRadius: 8,
  }),
  // 물망초 - "나를 잊지 말아 달라 속삭이며 물가에 피었어요": 실제로 아주 작고 동글동글한
  // 5장 꽃잎에 노란 "눈"이 도드라지는 종 - 이 도감에서 가장 작고 단순한 축에 속하는
  // "둥근 덩어리형"으로, 코어(눈)를 유난히 크게 키워 존재감을 준다.
  물망초: () => ({ petals: evenPetals(5, 18, 16), coreRadius: 9 }),
  // 부처꽃 - "물결처럼 밀려온 생각에 마음이 잠겨버렸어요": 실제 부처꽃처럼 줄기 하나를 따라
  // 작은 십자 모양 꽃송이 4개가 세로로 쌓인 꽃차례(raceme) - 지금까지 쓴 "가늘고 긴 대"
  // 계열(프리지아·얼음새꽃·여명초, 얇은 꽃잎이 부채꼴로 뻗는 구조)과 달리, 여긴 뚜렷한
  // 줄기 선 하나 위에 개별 꽃송이가 뭉쳐 있는 완전히 다른 구조다.
  부처꽃: () => {
    const stem = [
      { x: 50, y: 24 },
      { x: 50, y: 38 },
      { x: 50, y: 52 },
      { x: 50, y: 66 },
    ];
    const petals: PetalSpec[] = [];
    stem.forEach((origin, i) => {
      for (let k = 0; k < 4; k++) petals.push({ angle: k * 90 + (i % 2) * 20, length: 7, width: 5, origin });
    });
    return { petals, customPaths: ["M 50 76 L 50 22"], coreRadius: 0 };
  },
  // 설련화 - "차가운 물속으로 마음이 조용히 얼어 잠겼어요": 수련과 같은 겹꽃 구조를
  // spiky(각진 결정)로 다시 그려 "얼어붙은 연꽃" 인상을 낸다 - 수련(부드러운 곡선)과
  // 뚜렷이 구분되는 각진 버전.
  설련화: () => ({
    petals: [...evenPetals(8, 32, 10, { spiky: true }), ...evenPetals(6, 18, 7, { spiky: true, startAngle: -60 })],
    coreRadius: 6,
  }),
  // 수레국화 - "깊은 물빛만큼이나 아득한 그리움에 잠겨들었어요": 실제 수레국화 특유의
  // 술처럼 갈라진 꽃잎 끝 - 기본 꽃잎 7장 각 끝에 작은 가시 2개씩을 더해(얼음꽃의 "곁가지"
  // 기법을 꽃잎 끝에 적용) 너덜너덜한 술 장식을 표현한다. 지금까지 없던 "가장자리가 갈라진
  // 꽃잎" 질감.
  수레국화: () => {
    const main = evenPetals(7, 26, 9);
    const fringe: PetalSpec[] = [];
    main.forEach((p) => {
      const rad = (p.angle * Math.PI) / 180;
      const tip = { x: CENTER + p.length * 0.9 * Math.cos(rad), y: CENTER + p.length * 0.9 * Math.sin(rad) };
      fringe.push({ angle: p.angle - 20, length: 8, width: 3, spiky: true, origin: tip });
      fringe.push({ angle: p.angle + 20, length: 8, width: 3, spiky: true, origin: tip });
    });
    return { petals: [...main, ...fringe], coreRadius: 5 };
  },

  // --- 시험/평가형 (4차·마지막 배치): 매달린 채 시험받는 긴장 ---
  // 도라지 - "누군가의 시선 앞에서 조심스레 고개를 숙였어요": 실제 도라지(balloon flower)
  // 처럼 별 모양으로 벌어지기 직전의 통통한 5각 별 - spiky 꽃잎의 폭을 넓게 줘 뾰족하다기
  // 보다 "부풀어 오른 별" 느낌을 냈다.
  도라지: () => ({ petals: evenPetals(5, 26, 20, { spiky: true }), coreRadius: 7 }),
  // 초롱꽃 - "작은 불빛 하나로 스스로를 비춰 보던 밤이에요": 이름 그대로 진짜 초롱(등불)
  // 모양 - 방사 대칭을 버리고 위가 둥글고 아래로 갈수록 부풀었다 좁아지는 단일 실루엣.
  // 45종 중 유일하게 "아래로 매달려 처지는" 구조라 어디에 놓여도 확실히 구분된다.
  초롱꽃: () => ({
    customPaths: ["M 36 28 Q 36 14 50 14 Q 64 14 64 28 L 64 40 Q 72 54 60 66 Q 50 74 40 66 Q 28 54 36 40 Z"],
    coreRadius: 5,
  }),
  // 금낭화 - "매달린 마음으로 평가의 순간을 견뎌냈어요": 실제 이름처럼(bleeding heart)
  // 정직하게 하트 모양 하나 - 이 도감에서 유일한 하트 실루엣이라 절대 다른 종과 안 겹친다.
  금낭화: () => ({
    customPaths: ["M 50 30 C 42 18, 26 22, 26 36 C 26 48, 38 56, 50 72 C 62 56, 74 48, 74 36 C 74 22, 58 18, 50 30 Z"],
    coreRadius: 4,
  }),
  // 백일홍 - "오래 준비한 순간이 눈부신 결실로 피어났어요": 겹겹이 쌓인 3겹 꽃잎(10+8+6장,
  // 전부 둥근 꽃잎)으로 만든 빈틈없이 촘촘하고 둥근 덩어리 - 뾰족한 구석 하나 없이 오직
  // "꽉 찬 원" 인상만 남도록 설계했다.
  백일홍: () => ({
    petals: [
      ...evenPetals(10, 28, 14),
      ...evenPetals(8, 19, 11, { startAngle: -72 }),
      ...evenPetals(6, 11, 8, { startAngle: -54 }),
    ],
    coreRadius: 6,
  }),
  // 냉이꽃 - "차갑게 매겨진 평가 앞에서 마음이 시렸어요": 실제 냉이(십자화과)처럼 아주 작고
  // 성긴 4장 십자 꽃 - 백일홍(빈틈없이 촘촘)과 정반대로 "휑하고 차가운" 인상을 준다.
  냉이꽃: () => ({ petals: evenPetals(4, 16, 10), coreRadius: 4 }),

  // --- 탐험/발견형 (4차·마지막 배치): 새로운 것을 향한 설렘 ---
  // 해바라기 - "새로운 길을 향해 얼굴 가득 환하게 웃었어요": 이 도감에서 가장 큰 중심
  // 코어(반지름 12)로 해바라기 특유의 도드라진 씨앗판을 표현했다 - 다른 어떤 종보다도
  // "중심이 압도적으로 큰" 유일한 종.
  해바라기: () => ({ petals: evenPetals(16, 26, 9), coreRadius: 12 }),
  // 튤립 - "낯선 곳에서 마주한 설렘을 그대로 담았어요": 초롱꽃(아래로 매달린 종)과 달리
  // 위로 곧게 선 닫힌 잔 - 윗변에 3개의 완만한 돌기만 남겨 "다 벌어지지 않고 오므린" 튤립
  // 특유의 실루엣을 살렸다.
  튤립: () => ({
    customPaths: ["M 38 70 Q 30 50 34 34 Q 38 22 44 28 Q 46 20 50 30 Q 54 20 56 28 Q 62 22 66 34 Q 70 50 62 70 Q 56 76 50 76 Q 44 76 38 70 Z"],
    coreRadius: 5,
  }),
  // 다알리아 - "겹겹이 쌓인 호기심이 화려하게 피어났어요": 백일홍보다 한 겹 더 많은 4겹
  // spiky 꽃잎(12+10+8+6장, 총 36장)으로 이 도감에서 가장 화려하고 촘촘한 로제트를
  // 만들었다 - 백일홍(둥글고 3겹)과는 뾰족함과 겹 수 둘 다에서 다르다.
  다알리아: () => ({
    petals: [
      ...evenPetals(12, 30, 8, { spiky: true }),
      ...evenPetals(10, 22, 6, { spiky: true, startAngle: -66 }),
      ...evenPetals(8, 15, 5, { spiky: true, startAngle: -54 }),
      ...evenPetals(6, 8, 4, { spiky: true, startAngle: -42 }),
    ],
    coreRadius: 3,
  }),
  // 금계국 - "처음 발견한 반가움에 눈부시게 활짝 웃었어요": 실제 금계국(coreopsis)처럼
  // 꽃잎 끝마다 V자로 살짝 갈라진 자국이 있다 - notchedPetalPath로 만든, 이 도감에서
  // 유일한 "끝이 갈라진 꽃잎" 질감.
  금계국: () => ({
    customPaths: Array.from({ length: 8 }, (_, i) => notchedPetalPath(-90 + i * 45, 28, 16, 6)),
    coreRadius: 7,
  }),
  // 에델바이스 - "닿기 힘든 높은 곳을 아득히 그리워하며 피었어요": 실제 에델바이스처럼
  // 6장이 아니라 홀수(7장)로 배치된 가늘고 긴 포엽이 거의 평평하게 펼쳐진 별 - 코어를
  // 크게 줘 특유의 솜털 같은 노란 중심을 강조했다.
  에델바이스: () => ({ petals: evenPetals(7, 34, 11), coreRadius: 9 }),

  // --- 전설의 꽃: 프롬프트가 직접 지정한 형태 힌트를 그대로 구현 ---
  // 여명초 - "가늘고 위로 뻗은 형태": 방사형이 아니라 위쪽 한 방향(호 55도 안)으로만 뻗은
  // 가늘고 긴 잎/새순 5가닥 - 새벽에 홀로 돋아난 인상.
  여명초: () => ({
    petals: [
      { angle: -100, length: 40, width: 5, spiky: true },
      { angle: -85, length: 46, width: 4, spiky: true },
      { angle: -70, length: 36, width: 5, spiky: true },
      { angle: -115, length: 30, width: 4, spiky: true },
      { angle: -60, length: 26, width: 4, spiky: true },
    ],
    coreRadius: 5,
  }),
  // 재회화 - "두 갈래가 서로 감싸는 형태": 콤마(paisley) 모양 리본 2개가 중심을 기준으로
  // 정확히 점대칭(180도)을 이루며 서로 휘감는다 - 두 번째 경로는 첫 번째 좌표를
  // (100-x, 100-y)로 반사해 만들었다(90도 회전이 아니라 점대칭이라야 "마주 보며 감싸는"
  // 인상이 산다).
  재회화: () => ({
    customPaths: [
      "M 50 50 C 68 42, 74 56, 62 68 C 54 76, 40 70, 42 58 C 43 50, 46 48, 50 50 Z",
      "M 50 50 C 32 58, 26 44, 38 32 C 46 24, 60 30, 58 42 C 57 50, 54 52, 50 50 Z",
    ],
    coreRadius: 6,
  }),
  // 폭풍의 장미 - "날카롭고 불규칙한 꽃잎": 장미처럼 겹겹이 쌓인 구조는 유지하되, 길이·폭·
  // 각도를 전부 제각각으로 흐트러뜨리고 spiky(직선 스파이크)로 그려 "찢긴 듯" 사납게 만든다.
  "폭풍의 장미": () => ({
    petals: [
      { angle: -90, length: 34, width: 14, spiky: true },
      { angle: -35, length: 40, width: 10, spiky: true },
      { angle: 10, length: 28, width: 16, spiky: true },
      { angle: 55, length: 44, width: 9, spiky: true },
      { angle: 100, length: 30, width: 13, spiky: true },
      { angle: 150, length: 38, width: 11, spiky: true },
      { angle: -150, length: 26, width: 15, spiky: true },
      { angle: -195, length: 33, width: 10, spiky: true },
      { angle: -60, length: 18, width: 8, spiky: true },
      { angle: 30, length: 20, width: 7, spiky: true },
      { angle: 120, length: 16, width: 8, spiky: true },
      { angle: -110, length: 19, width: 7, spiky: true },
    ],
  }),
  // 몽환화 - 힌트가 없어 이름("꿈같은 환상의 꽃")에서 직접 형태를 끌어왔다: 서로 다른
  // 각도로 살짝씩 어긋난 3겹의 부드러운 꽃잎 고리 - 겹칠수록 또렷한 대신 흐릿하게 어긋나는
  // "몽환적인 겹" 느낌을 노린다(폭풍의 장미의 뾰족하고 불규칙한 겹과 대비되도록 전부 둥근
  // 꽃잎으로만 구성).
  몽환화: () => ({
    petals: [
      ...evenPetals(8, 30, 18, { startAngle: -90 }),
      ...evenPetals(6, 22, 14, { startAngle: -72 }),
      ...evenPetals(4, 14, 10, { startAngle: -56 }),
    ],
  }),
  // 성단화 - "한 달 동안 정원을 부지런히 가꾸면 볼 수 있을지도" (여러 종을 꾸준히 모아야
  // 나오는 조건이라, 이름 그대로 "별들이 흩어져 뭉친" 형태로 직접 옮겼다): 크기가 제각각인
  // 4방향 별 9개를 화면 전체에 흩뿌린다 - 방사 대칭이 아니라 성단/은하 사진처럼 비대칭
  // 산점이라 다른 전설 5종(전부 중심 대칭 구조)과도 뚜렷이 다르다. 전설 공통 장식인
  // LegendarySparkles(궤도 십자 스파클)와 테마가 겹치지만, 오히려 "별" 모티프를 이중으로
  // 강조하는 의도된 겹침이다.
  성단화: () => ({
    customPaths: [
      starPoint(50, 30, 7),
      starPoint(32, 42, 4),
      starPoint(68, 40, 5),
      starPoint(40, 60, 6),
      starPoint(62, 62, 4),
      starPoint(50, 74, 3.5),
      starPoint(26, 58, 3),
      starPoint(74, 56, 3),
      starPoint(50, 50, 5),
    ],
    coreRadius: 0,
  }),
  // 초행의 꽃 - "한 번도 느껴본 적 없는 감정을 마주했을 때" (조건 자체가 형태 힌트를 주지
  // 않아 이름 "초행"(처음 가보는 길)에서 형태를 끌어왔다): 다른 5종은 전부 중심 대칭 구조
  // (방사형/산점/겹층/점대칭)인데, 이 종만 유일하게 좌우 어디에도 안 맞는 비대칭 곡선
  // 하나 - 재회화(짝을 이루는 두 갈래)의 "반쪽"처럼 보이도록 일부러 홀로, 더 크게 그려
  // "처음이라 아직 짝도 없고 낯선" 인상을 준다.
  "초행의 꽃": () => ({
    customPaths: ["M 50 50 C 76 40, 86 60, 68 80 C 54 92, 32 84, 28 66 C 26 56, 32 46, 42 44 C 46 43, 49 46, 50 50 Z"],
    coreRadius: 5,
  }),
};

// speciesName이 등록부에 있으면 그 종 전용 실루엣을, 없으면(아직 개별 설계로 안 옮긴 종 +
// species_name이 아예 없는 옛 기록) 기존 원형 폴백을 쓴다.
function renderSpeciesShape(speciesName: string | null, archetype: Archetype | null): ShapeResult {
  if (speciesName && speciesName in SPECIES_SHAPE_BUILDERS) return SPECIES_SHAPE_BUILDERS[speciesName]();
  return renderArchetypeShape(archetype);
}

// 전설의 꽃 장식 - 꽃잎 바깥 궤도에 작은 4방향 반짝임(십자 스파클) 6개를 두른다. 일반 종과는
// 항상 이 장식 유무로 구분되고, 색은 속과 무관하게 항상 금빛으로 고정한다(기존 정원 그리드의
// 금빛 테두리/리본 장식과 같은 언어).
function LegendarySparkles() {
  const points = evenPetals(6, 42, 0, { startAngle: -60 });
  return (
    <>
      {points.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180;
        const cx = CENTER + p.length * Math.cos(rad);
        const cy = CENTER + p.length * Math.sin(rad);
        return (
          <path
            key={i}
            d={`M ${cx - 3} ${cy} L ${cx} ${cy - 3} L ${cx + 3} ${cy} L ${cx} ${cy + 3} Z`}
            fill="#fde68a"
            stroke="#f59e0b"
            strokeWidth={0.6}
          />
        );
      })}
    </>
  );
}

// 무늬(texture) 축을 실제 SVG 채우기/오버레이로 변환한다. 채우기 자체을 바꾸는 무늬
// (gradient/striped/bicolor)는 <defs> 하나 + fill을 url() 참조로 바꾸는 방식, 표면 위에
// 덧그리는 무늬(speckled/veined/glitter)는 평범한 primary 채우기 위에 작은 도형을 겹쳐
// 그리는 방식, frosted는 채우기 대신 불투명도+블러 필터로 표현한다. uid는 한 화면에 아이콘이
// 여러 개(정원 그리드 등) 동시에 떠도 <defs> id가 서로 충돌하지 않게 하는 인스턴스별 접두어다.
function textureFill(texture: TextureKind, primary: string, secondary: string, uid: string): { fill: string; defs: React.ReactNode } {
  switch (texture) {
    case "gradient":
      // r을 65%->42%로 좁혔다 - 반경이 넓을수록 개별 도형(특히 상실/이별형의 작은 원 6개처럼
      // 지름이 16~20 정도인 도형) 안에서는 대부분 primary 구간만 보이고 secondary로의 전환은
      // 도형 밖 여백에서나 일어나, 정작 눈에 보이는 영역에는 그라데이션 티가 거의 안 났다.
      // 반경을 좁혀 전환이 도형 안쪽에서 확실히 일어나게 했다.
      return {
        fill: `url(#${uid}-grad)`,
        defs: (
          <radialGradient id={`${uid}-grad`} cx="42%" cy="38%" r="42%">
            <stop offset="0%" stopColor={primary} />
            <stop offset="100%" stopColor={secondary} />
          </radialGradient>
        ),
      };
    case "striped":
      return {
        fill: `url(#${uid}-stripe)`,
        defs: (
          <pattern id={`${uid}-stripe`} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
            <rect width="7" height="7" fill={primary} />
            <rect width="3.2" height="7" fill={secondary} opacity={0.55} />
          </pattern>
        ),
      };
    case "bicolor":
      return {
        fill: `url(#${uid}-bi)`,
        defs: (
          <linearGradient id={`${uid}-bi`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={primary} />
            <stop offset="54%" stopColor={primary} />
            <stop offset="54%" stopColor={secondary} />
            <stop offset="100%" stopColor={secondary} />
          </linearGradient>
        ),
      };
    default: {
      // solid/speckled/veined/frosted/glitter는 원래 평범한 단색(primary) 채우기 위에서
      // 시작했는데(speckled/veined/glitter는 위에 덧그리는 오버레이로, frosted는 아래 group의
      // fillOpacity+filter로 나머지를 표현), 단색 채우기 + 얇은 외곽선만 있으니 "눈꽃 결정/
      // 기술 도면" 같다는 지적을 받았다 - 대부분 종(45종 중 gradient/striped/bicolor 3무늬를
      // 뺀 나머지)이 이 default 분기라, 여기를 평평한 단색 대신 은은한 입체 셰이딩(왼쪽 위
      // 하이라이트 -> primary -> 가장자리로 갈수록 살짝 어두워짐)으로 바꿔 모든 아이콘에
      // 기본 입체감을 깔아준다. gradient 무늬(primary->secondary, genus 색 자체가 바뀌는
      // 더 뚜렷한 효과)와는 성격이 달라 서로 안 겹친다.
      const hi = lighten(primary, 0.4);
      const lo = darken(primary, 0.16);
      return {
        fill: `url(#${uid}-shade)`,
        defs: (
          <radialGradient id={`${uid}-shade`} cx="36%" cy="30%" r="78%">
            <stop offset="0%" stopColor={hi} />
            <stop offset="45%" stopColor={primary} />
            <stop offset="100%" stopColor={lo} />
          </radialGradient>
        ),
      };
    }
  }
}

// 표면 위에 덧그리는 오버레이(점무늬/잎맥형/글리터) - 채우기 자체는 이미 primary 단색이라,
// 그 위에 작은 도형들을 얹는다. 좌표는 CENTER(50,50) 기준 고정 오프셋 배열이라 항상
// 결정론적이다(같은 종은 항상 같은 자리에 점이 찍힌다).
//
// speckled/veined는 원래 secondary 색을 옅게(opacity 0.5대) 썼는데, genus 색상표(primary/
// secondary)가 같은 색조의 밝기 차이 쌍이라(예: 환희 #facc15/#fef9c3 - 둘 다 노랑 계열)
// 44~80px 아이콘 크기에서는 그 미세한 명도 차이가 거의 안 보였다 - 정원 그리드 스크린샷에서
// "무늬가 다른데도 종끼리 구분이 안 된다"는 지적이 여기서 비롯됐다. genus가 뭐가 되든 항상
// 확실히 보이도록, secondary 대신 흰색(speckled, 옅은 이슬/서리 느낌)과 짙은 반투명 검정
// (veined, 잎맥 그림자 느낌)처럼 배경 색과 무관하게 항상 대비가 서는 고정 톤으로 바꿨다.
function TextureOverlay({ texture }: { texture: TextureKind }) {
  if (texture === "speckled") {
    const dots: [number, number, number][] = [
      [40, 38, 3.4], [60, 33, 2.8], [66, 54, 3.6], [45, 62, 3], [32, 50, 2.8], [55, 68, 3.2],
    ];
    return (
      <>
        {dots.map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="#ffffff" fillOpacity={0.85} stroke="#1e293b" strokeOpacity={0.35} strokeWidth={0.6} />
        ))}
      </>
    );
  }
  if (texture === "veined") {
    const angles = [-90, -35, 20, 75, 130, 185, 240, 305];
    return (
      <>
        {angles.map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const x2 = CENTER + 26 * Math.cos(rad);
          const y2 = CENTER + 26 * Math.sin(rad);
          return (
            <line key={i} x1={CENTER} y1={CENTER} x2={x2} y2={y2} stroke="#0f172a" strokeWidth={1.6} strokeOpacity={0.55} strokeLinecap="round" />
          );
        })}
      </>
    );
  }
  if (texture === "glitter") {
    const sparkles: [number, number, number][] = [
      [38, 30, 2], [62, 32, 1.6], [66, 58, 2], [34, 62, 1.6], [50, 24, 1.4],
    ];
    return (
      <>
        {sparkles.map(([cx, cy, r], i) => (
          <path key={i} d={`M ${cx - r} ${cy} L ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} Z`} fill="#fff7cc" opacity={0.85} />
        ))}
      </>
    );
  }
  return null;
}

// 중심 문양 - 전설 6종끼리(모두 같은 기본 실루엣+글리터 무늬를 공유) 서로 구분하는 주된
// 수단. 일반 종은 대부분 "none"이라 렌더링에 영향이 없다(variantForSpecies 참고).
function CenterEmblemMark({ emblem, primary }: { emblem: CenterEmblem; primary: string }) {
  if (emblem === "none") return null;
  const c = CENTER;
  if (emblem === "dot") return <circle cx={c} cy={c} r={2.4} fill={primary} />;
  if (emblem === "cross")
    return (
      <>
        <line x1={c - 4} y1={c} x2={c + 4} y2={c} stroke={primary} strokeWidth={1.4} strokeLinecap="round" />
        <line x1={c} y1={c - 4} x2={c} y2={c + 4} stroke={primary} strokeWidth={1.4} strokeLinecap="round" />
      </>
    );
  if (emblem === "ring") return <circle cx={c} cy={c} r={3.5} fill="none" stroke={primary} strokeWidth={1.2} />;
  if (emblem === "diamond") return <path d={`M ${c} ${c - 4} L ${c + 4} ${c} L ${c} ${c + 4} L ${c - 4} ${c} Z`} fill={primary} />;
  // star
  return <path d={`M ${c - 3.5} ${c} L ${c} ${c - 3.5} L ${c + 3.5} ${c} L ${c} ${c + 3.5} Z`} fill={primary} />;
}

export interface FlowerIconProps {
  // 8원형 키 그대로 - null이거나 목록에 없는 값(옛 기록 등)이면 기본 5장 꽃잎으로 대체한다.
  archetype: string | null;
  // 8속 키 - null이거나 목록에 없으면 중립 회색(colorForGenus의 기본값)을 쓴다.
  genus: string | null;
  // 무늬(texture) 축을 결정하는 값 - 없으면(옛 기록 등) 항상 solid로 안전하게 폴백한다
  // (flowerSpeciesRoster.variantForSpecies 참고). 39종 일반 종은 종 이름 자체가, 전설
  // 6종은 legendary_key 문자열이 여기 들어온다(둘 다 species_name 필드로 넘어온다).
  speciesName?: string | null;
  isLegendary?: boolean;
  sizePx?: number;
  className?: string;
}

// 정원 그리드/도감/상세 모달/일기 카드/커뮤니티 공유 카드까지, 꽃을 보여주는 모든 화면이
// 이 컴포넌트 하나를 공유한다 - 전부 클라이언트 사이드 SVG라 서버에서 이미지를 미리 굽는
// 별도 파이프라인이 없어도(이 프로젝트엔 그런 OG 이미지 생성 파이프라인 자체가 없다) 그대로
// 적용된다.
export default function FlowerIcon({ archetype, genus, speciesName, isLegendary, sizePx = 40, className }: FlowerIconProps) {
  const [primary, secondary] = colorForGenus(genus);
  // 외곽선을 secondary 대신 primary를 어둡게 파생시킨 톤으로 그린다 - genus 팔레트의
  // secondary는 "밝기만 다른 같은 색조 쌍"이 아닌 경우가 있다(예: 격동 #ef4444(빨강)/
  // #a855f7(보라)는 색조 자체가 다르다) - 그런 속에서 외곽선에 secondary를 쓰면 채움색과
  // 색조가 부딪혀 부자연스러웠다. primary를 어둡게 만든 톤은 어떤 속이든 항상 "같은 색의
  // 그림자"로 자연스럽게 보인다.
  const strokeTone = darken(primary, 0.42);
  // 전설 종은 species_name에 legendary_key(예: "폭풍의 장미")가 그대로 들어오므로, 일반 종과
  // 같은 SPECIES_SHAPE_BUILDERS 조회 한 번으로 둘 다 처리된다.
  const shape = renderSpeciesShape(speciesName ?? null, (archetype as Archetype) ?? null);
  const variant = variantForSpecies(speciesName ?? null, archetype, isLegendary);
  const uid = useId();
  const { fill, defs } = textureFill(variant.texture, primary, secondary, uid);
  const isFrosted = variant.texture === "frosted";
  // 꽃잎마다 안쪽에 얹는 하이라이트 꽃잎(더 작고, 더 밝고, 테두리 없음) - 실루엣은 그대로
  // 두고 "칠해진 도형" 위에 빛이 얹힌 듯한 입체감을 준다. 각도를 살짝(개체마다 결정론적으로
  // 다른 양만큼) 어긋내 완벽한 대칭 대신 손으로 그린 듯한 미세한 불규칙함을 섞는다.
  const highlightTone = lighten(primary, 0.55);

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-hidden
    >
      {defs && <defs>{defs}</defs>}
      {isLegendary && <LegendarySparkles />}

      {/* 꽃 실루엣 그룹 - 무늬별 회전 오프셋(같은 무늬 슬롯이라도 미세하게 다르게 보이도록)과
          frosted 무늬의 불투명도+블러를 여기 한 군데서 적용한다. */}
      <g
        transform={variant.rotationOffset ? `rotate(${variant.rotationOffset} ${CENTER} ${CENTER})` : undefined}
        opacity={isFrosted ? 0.62 : undefined}
        style={isFrosted ? { filter: "blur(0.6px)" } : undefined}
      >
        {shape.petals?.map((petal, i) => (
          <path key={i} d={petalPath(petal, petal.origin)} fill={fill} stroke={strokeTone} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />
        ))}

        {/* 하이라이트 꽃잎 - 각 꽃잎보다 작고(길이 62%/폭 42%) 더 밝은 톤을, 테두리 없이
            반투명하게 얹는다. 실루엣(모양 차별화 작업)은 전혀 건드리지 않고 그 위에 입히는
            스타일 레이어라, petalPath를 그대로 재사용한다. */}
        {shape.petals?.map((petal, i) => {
          const wobble = (jitter01(i) - 0.5) * 8;
          const inner: PetalSpec = {
            ...petal,
            length: petal.length * 0.62,
            width: petal.width * 0.42,
            angle: petal.angle + wobble,
          };
          return <path key={`hi-${i}`} d={petalPath(inner, petal.origin)} fill={highlightTone} opacity={0.55} />;
        })}

        {shape.customPaths?.map((d, i) => (
          <path key={i} d={d} fill={fill} stroke={strokeTone} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />
        ))}

        {shape.circles?.map((circle, i) => (
          <g key={i}>
            <circle cx={circle.cx} cy={circle.cy} r={circle.r} fill={fill} stroke={strokeTone} strokeWidth={STROKE_WIDTH * 0.6} />
            {/* 작은 하이라이트 점 - 클러스터형 종(안개꽃/수국 등)의 낱개 점 하나하나도
                평평한 원이 아니라 살짝 도톰한 구슬처럼 보이게 한다. */}
            <circle
              cx={circle.cx - circle.r * 0.3}
              cy={circle.cy - circle.r * 0.3}
              r={circle.r * 0.38}
              fill={highlightTone}
              opacity={0.6}
            />
          </g>
        ))}

        {shape.spiralPoints && (
          <path
            d={`M ${shape.spiralPoints.map(([x, y]) => `${x} ${y}`).join(" L ")}`}
            fill="none"
            // 선(stroke) 전용 도형도 fill과 동일한 url() 참조를 그대로 stroke에 써도 된다 -
            // SVG는 gradient/pattern을 stroke paint로도 지원한다(줄무늬/그라데이션 무늬가
            // 나선 궤적에도 똑같이 입혀진다).
            stroke={fill}
            // 원래 1.6배(4.8)였는데, 얇은 선 하나뿐인 나선(성장/변신형)은 그 폭 안에 그라데이션/
            // 패턴이 들어갈 면적 자체가 거의 없어 무늬 차이가 44~80px에서 사실상 안 보였다 -
            // 3배(9)로 굵혀 "리본"에 가깝게 만들어 무늬가 실제로 드러날 공간을 확보했다.
            strokeWidth={STROKE_WIDTH * 3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        <TextureOverlay texture={variant.texture} />
      </g>

      {/* 중심 코어 - 방사형/클러스터 원형은 중심이 비어 보이지 않도록, 나선형은 씨앗
          자리로 작은 원을 하나 더 얹는다. coreRadius로 종마다 크기를 조절하거나(나비꽃의
          작은 머리) 아예 숨길 수 있다(안개꽃/수국처럼 점들 자체가 이미 꽃인 종).
          회전 그룹 밖에 둬 항상 정면을 향하게 한다. */}
      {(shape.coreRadius ?? (shape.spiralPoints ? 4 : 8)) > 0 && (
        <>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={shape.coreRadius ?? (shape.spiralPoints ? 4 : 8)}
            fill={secondary}
            stroke={strokeTone}
            strokeWidth={1.5}
          />
          {/* 중심 글린트 - 꽃술 자리에 작은 광택 점 하나를 더해, 텅 빈 단색 원이 아니라
              시선이 머무는 디테일로 만든다. 코어 왼쪽 위로 살짝 치우쳐 광원이 있는 듯한
              인상을 준다. */}
          <circle
            cx={CENTER - (shape.coreRadius ?? (shape.spiralPoints ? 4 : 8)) * 0.32}
            cy={CENTER - (shape.coreRadius ?? (shape.spiralPoints ? 4 : 8)) * 0.32}
            r={(shape.coreRadius ?? (shape.spiralPoints ? 4 : 8)) * 0.4}
            fill={lighten(secondary, 0.6)}
            opacity={0.85}
          />
        </>
      )}
      <CenterEmblemMark emblem={variant.centerEmblem} primary={primary} />
    </svg>
  );
}

// 표본(specimen) 전용 아이콘 - 정식 종 taxonomy에 속하지 않는 "떠돌이 표본"용 단순화된
// 새싹/잎사귀 실루엣. 모든 표본이 이 아이콘 하나를 공유한다(속/원형과 무관, 색도 고정).
export function SpecimenIcon({ sizePx = 40, className }: { sizePx?: number; className?: string }) {
  return (
    <svg width={sizePx} height={sizePx} viewBox="0 0 100 100" className={className} role="img" aria-hidden>
      {/* 줄기 */}
      <path d="M 50 82 L 50 44" fill="none" stroke="#34d399" strokeWidth={4} strokeLinecap="round" />
      {/* 좌우 잎사귀 - 둥근 꽃잎 생성기를 origin만 바꿔 재사용한다(줄기 옆 지점을 기준으로
          좌우 대칭). */}
      <path
        d={petalPath({ angle: -160, length: 26, width: 20 }, { x: 36, y: 58 })}
        fill="#6ee7b7"
        stroke="#059669"
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
      <path
        d={petalPath({ angle: -20, length: 26, width: 20 }, { x: 64, y: 58 })}
        fill="#6ee7b7"
        stroke="#059669"
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
      {/* 새싹 끝 - 아직 피지 않은 봉오리를 작은 타원으로 표현. */}
      <ellipse cx={50} cy={38} rx={10} ry={14} fill="#a7f3d0" stroke="#059669" strokeWidth={STROKE_WIDTH * 0.8} />
    </svg>
  );
}
