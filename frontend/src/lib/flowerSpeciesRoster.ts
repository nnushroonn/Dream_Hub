// 종별 고유성 강화 - "모양(archetype) x 색상(genus)" 2축만으로는 최대 64가지 조합이라
// 이론상은 45종이 안 겹칠 수 있지만, genus는 그날그날의 감정에 따라 정해지는 값이라(기존
// 24종은 genus가 종에 고정돼 있지 않다 - backend/flower_taxonomy.py 참고) 실제로는
// "모양은 같은데 색만 다른 두 종"이 실제 화면에 나란히 뜰 수 있다. 그래서 색과 무관하게
// 항상 성립하는 세 번째 축 "무늬(texture)"를 추가한다: 같은 원형(같은 모양) 안에 속한
// 종끼리는 항상 서로 다른 무늬를 갖도록 이 파일이 배정한다 - genus가 뭐가 되든(심지어 우연히
// 같은 색이 나오는 날에도) 무늬 하나만으로 두 종이 절대 완전히 동일해 보이지 않는다.
//
// backend/flower_taxonomy.py의 ARCHETYPES(24종)+NEW_GENUS_SPECIES(15종)를 그대로 미러링한
// "종 명부"다 - 값이 바뀌면 이쪽도 함께 맞춰야 한다(백엔드 쪽에 이미 있는 개념을 프론트가
// 다시 가져다 쓰는 것뿐이라, 두 표가 어긋나면 여기 pytest 대응 격으로 별도 스크립트/수동
// 대조가 필요하다 - 자동 동기화 장치는 없다).

export type TextureKind = "solid" | "gradient" | "speckled" | "veined" | "striped" | "bicolor" | "frosted" | "glitter";

// 일반 종(45종 중 39종)에 배정 가능한 무늬 6개 - 프로스트/글리터는 여기서 쓰지 않는다.
// 글리터는 아래 LEGENDARY_TEXTURE로 전설의 꽃 전용으로 예약해 "일반 종에서는 절대 안 나오는
// 무늬"로 남겨 둔다(그래야 글리터를 본 순간 바로 전설임을 알 수 있다). 프로스트는 여유
// 슬롯으로 남겨 둔다(현재 어떤 원형도 6종을 넘지 않아 실제로 쓰이진 않지만, 나중에 원형당
// 종이 하나 더 늘어도 곧바로 커버할 수 있게 미리 마련해 둔다).
const REGULAR_TEXTURE_POOL: TextureKind[] = ["solid", "gradient", "speckled", "veined", "striped", "bicolor", "frosted"];
const LEGENDARY_TEXTURE: TextureKind = "glitter";

export type ArchetypeKey =
  | "관계/재회형"
  | "추적/도피형"
  | "비행/자유형"
  | "잠식/물형"
  | "시험/평가형"
  | "탐험/발견형"
  | "상실/이별형"
  | "성장/변신형";

// 각 원형(모양) 안에 실제로 속한 종을 원소 순서 그대로 나열한다 - 배열 인덱스가 곧 그 종의
// 무늬 슬롯(REGULAR_TEXTURE_POOL[인덱스])이다. 원소 순서: 기존 3종(ARCHETYPES 선언 순서) 뒤에
// 신규 3속 중 그 원형을 커버하는 속의 종을 환희 -> 냉담 -> 동경 순으로 이어붙였다(백엔드
// NEW_GENUS_SPECIES 선언 순서와 동일) - 이 순서 자체가 무늬를 결정하므로 절대 임의로 바꾸면
// 안 된다(바꾸면 이미 유저가 본 종의 무늬가 조용히 달라진다).
export const ARCHETYPE_SPECIES: Record<ArchetypeKey, string[]> = {
  "관계/재회형": ["들꽃", "제비꽃", "프리지아", "금잔화", "서리꽃", "메꽃"],
  "추적/도피형": ["엉겅퀴", "가시나무꽃", "선인장꽃", "얼음새꽃"],
  "비행/자유형": ["민들레", "나팔꽃", "개양귀비", "황매화", "구절초"],
  "잠식/물형": ["수련", "물망초", "부처꽃", "설련화", "수레국화"],
  "시험/평가형": ["도라지", "초롱꽃", "금낭화", "백일홍", "냉이꽃"],
  "탐험/발견형": ["해바라기", "튤립", "다알리아", "금계국", "에델바이스"],
  "상실/이별형": ["안개꽃", "수국", "리시안셔스", "얼음꽃", "라일락"],
  "성장/변신형": ["크로커스", "나비꽃", "접시꽃", "카랑코에"],
};

// 가장 큰 원형 그룹(관계/재회형)이 6종이라 REGULAR_TEXTURE_POOL도 정확히 6개 필요하다 -
// 하나라도 모자라면 같은 원형 안에서 무늬가 겹치는 두 종이 생긴다.
if (REGULAR_TEXTURE_POOL.length < Math.max(...Object.values(ARCHETYPE_SPECIES).map((list) => list.length))) {
  // 개발 중 실수 방지용 방어 코드 - 프로덕션 빌드에서 조용히 넘어가지 않고 바로 드러나게
  // console.error만 남긴다(throw하면 렌더 자체가 죽어 더 위험하다).
  console.error("[flowerSpeciesRoster] REGULAR_TEXTURE_POOL이 가장 큰 원형 그룹보다 작다 - 무늬 충돌 가능성이 있다.");
}

// 전설의 꽃 6종 - archetype이 없어(전설은 속x종 공식을 따르지 않는다) 위 배열 기반 배정이
// 안 통한다. 전부 글리터 무늬를 공유하는 대신(장식성 우선), 중심 문양(centerEmblem)을 서로
// 다르게 줘 6종끼리도 구분되게 한다.
export const LEGENDARY_KEYS = ["몽환화", "여명초", "재회화", "폭풍의 장미", "성단화", "초행의 꽃"] as const;

export type CenterEmblem = "none" | "dot" | "star" | "cross" | "ring" | "diamond";

const LEGENDARY_EMBLEM: Record<(typeof LEGENDARY_KEYS)[number], CenterEmblem> = {
  몽환화: "star",
  여명초: "ring",
  재회화: "diamond",
  "폭풍의 장미": "cross",
  성단화: "dot",
  "초행의 꽃": "none",
};

// 회전 각도(±각도) - 같은 무늬/모양이라도 살짝 다른 각도로 배치해 "찍어낸 듯한" 인상을
// 줄인다. 전설 6종은 위 중심 문양이 주 차별화 수단이라 회전은 작게(0/8/16도 반복)만 준다.
const LEGENDARY_ROTATION: Record<(typeof LEGENDARY_KEYS)[number], number> = {
  몽환화: 0,
  여명초: 8,
  재회화: 16,
  "폭풍의 장미": 0,
  성단화: 8,
  "초행의 꽃": 16,
};

// 문자열 -> 32비트 정수 해시(djb2 변형) - 종 이름마다 안정적인 정수를 뽑아내는 용도.
// crypto 불필요(암호학적 강도가 필요한 게 아니라 "같은 입력엔 항상 같은 출력"만 있으면
// 된다), 순수 함수라 서버/클라이언트 렌더 결과도 항상 일치한다(하이드레이션 불일치 없음).
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

export interface SpeciesVariant {
  texture: TextureKind;
  rotationOffset: number; // 도(degree) - 꽃 형태(꽃잎/경로) 그룹 전체에 적용.
  centerEmblem: CenterEmblem;
}

// 무늬 수동 보정 - 서로 다른 원형(archetype) 소속이라 배열 인덱스가 우연히 같아지면
// (REGULAR_TEXTURE_POOL[인덱스]가 같아짐) 같은 무늬를 받는다. 대부분은 실루엣 자체가
// 달라 문제없지만, 리시안셔스(상실/이별형 idx2)와 접시꽃(성장/변신형 idx2)은 둘 다
// "speckled"를 받는 데다 실루엣도 이 도감에서 가장 서로 가까운 편이라(FlowerIcon.tsx 종
// 개별 설계 단계에서 44px 스트레스 테스트로 실측 확인), 둘 다 fluid 속(genus가 매일
// 달라짐)이라 우연히 같은/비슷한 톤으로 개화하는 날엔 무늬까지 겹쳐 가장 헷갈리기 쉬운
// 조합이 됐다. 정작 이 둘을 낳는 ARCHETYPE_SPECIES 배열 순서는 다른 종들의 무늬까지
// 줄줄이 바꾸므로 손대지 않고, 리시안셔스 하나만 무늬를 강제로 바꿔 최소 변경으로 해결한다.
const TEXTURE_OVERRIDES: Partial<Record<string, TextureKind>> = {
  리시안셔스: "veined",
};

// 종 이름(+원형/전설 여부)으로부터 결정론적인 무늬/회전/중심 문양을 계산한다. 같은 종은
// 항상 같은 결과를 준다(호출마다 다시 계산해도 무방 - 메모이즈 불필요할 만큼 가볍다).
export function variantForSpecies(speciesName: string | null, archetype: string | null, isLegendary?: boolean): SpeciesVariant {
  if (isLegendary) {
    const key = (speciesName ?? "") as (typeof LEGENDARY_KEYS)[number];
    return {
      texture: LEGENDARY_TEXTURE,
      rotationOffset: LEGENDARY_ROTATION[key] ?? 0,
      centerEmblem: LEGENDARY_EMBLEM[key] ?? "star",
    };
  }

  if (speciesName && archetype && archetype in ARCHETYPE_SPECIES) {
    const roster = ARCHETYPE_SPECIES[archetype as ArchetypeKey];
    const index = roster.indexOf(speciesName);
    if (index >= 0) {
      return {
        texture: TEXTURE_OVERRIDES[speciesName] ?? REGULAR_TEXTURE_POOL[index % REGULAR_TEXTURE_POOL.length],
        // 위치마다 살짝 다른 각도(0,-12,12,-24,24,...)를 줘 같은 무늬 슬롯이라도 미세하게
        // 달라 보이게 한다 - 실제로는 텍스처만으로 이미 겹치지 않지만, 추가 변주 요청에 맞춘
        // 보강이다.
        rotationOffset: index % 2 === 0 ? index * 6 : -index * 6,
        centerEmblem: "none",
      };
    }
  }

  // 옛 기록(species_name/archetype이 없거나 명부에 없는 값) - 무늬 없이(solid) 안전하게
  // 폴백한다. 종 이름 해시로 아주 약한 회전만 줘 완전히 똑같지는 않게 한다.
  const fallbackSeed = speciesName ? hashString(speciesName) : 0;
  return { texture: "solid", rotationOffset: (fallbackSeed % 5) - 2, centerEmblem: "none" };
}
