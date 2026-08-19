import { colorForGenus } from "@/lib/flowerTaxonomy";
import { EMOTION_CATEGORIES, EMOTION_CATEGORY_TO_GENUS, type EmotionCategoryKey } from "@/lib/emotionWordbook";

// 무의식 씨앗 - "밤에 심기 -> 아침에 상태 확인"의 소스 오브 트루스.
// 예전엔 SeedType(SLEEP/CONFIDENCE 등, 감정과 무관한 목적 6종 + 히든 WIND)이었지만, writing
// 단계에서 이미 고른 감정이 곧 그날 심는 씨앗이 되도록 바뀌면서 감정 대분류 7종
// (emotionWordbook.EmotionCategoryKey, backend/emotion_wordbook.py의 EMOTION_CATEGORIES와
// 동일)으로 완전히 대체됐다. 별도의 8번째 "바람이 물어온 씨앗" 값도 이제 없다 - 씨앗 없이
// 꿈만 기록해도 백엔드가 그 꿈의 무드로 7종 중 하나를 골라 채운다(emotion_wordbook.
// emotion_category_for_emoji).
export type SeedType = EmotionCategoryKey;

export const SEED_TYPES: SeedType[] = EMOTION_CATEGORIES.map((c) => c.key);

export type SeedStatus = "PLANTED" | "BLOOMING" | "RESTING";

// "꿈이 기억나지 않아요"를 명시적으로 선택했는지 - status(PLANTED 등)만으로는 "아직 안 씀"과
// "기억 안 나서 명시적으로 넘어감"을 구분할 수 없어 별도로 둔다. 백엔드 DreamRecallStatus
// (models.py)와 문자열이 정확히 일치해야 한다.
export type DreamRecallStatus = "PENDING" | "REMEMBERED" | "FORGOTTEN";

export interface SeedDefinition {
  type: SeedType;
  // 씨앗/도감 화면에 노출되는 직관적인 명사 - 감정 대분류 이름 그대로.
  label: string;
  // bloom.flower_name이 없을 때만 쓰는 방어적 폴백 이름 - 개화 시 classify_flower가 항상
  // 실제 종 이름을 채우므로, 정상적인 새 기록에서는 사실상 등장하지 않는다.
  flowerName: string;
  meaning: string;
  // [주 테마 컬러, 보조 테마 컬러] - 이 감정이 genus로 파생될 때 쓰는 GENUS_COLORS와 동일
  // (colorForGenus로 연결) - 씨앗 색이 나중에 필 꽃의 색과 항상 이어지도록 한다.
  colors: [string, string];
}

const MEANING: Record<SeedType, string> = {
  사랑: "따뜻하게 아끼는 마음",
  기쁨: "벅차게 차오르는 행복",
  즐거움: "가볍고 유쾌한 기분",
  바램: "닿고 싶은 간절한 마음",
  슬픔: "고요히 젖어드는 마음",
  분노: "뜨겁게 끓어오르는 감정",
  미움: "차갑게 식어버린 마음",
};

export const SEED_DEFINITIONS: Record<SeedType, SeedDefinition> = Object.fromEntries(
  SEED_TYPES.map((type) => [
    type,
    {
      type,
      label: type,
      flowerName: `${type} 씨앗이 피운 꽃`,
      meaning: MEANING[type],
      colors: colorForGenus(EMOTION_CATEGORY_TO_GENUS[type]),
    },
  ])
) as Record<SeedType, SeedDefinition>;

export const SEED_DEFINITION_LIST: SeedDefinition[] = SEED_TYPES.map((type) => SEED_DEFINITIONS[type]);

export function getSeedDefinition(type: SeedType): SeedDefinition {
  return SEED_DEFINITIONS[type];
}

export function isSeedType(value: string): value is SeedType {
  return (SEED_TYPES as readonly string[]).includes(value);
}

// 커뮤니티 헤더 "주파수 필터"/?template=galaxy 글쓰기용 공개 슬러그 - 백엔드에는 이 값을
// 강제하는 화이트리스트가 없다(public_tags는 자유 String 배열). 개인 씨앗(감정 대분류)과
// 1:1 대응하는 라벨만 프론트에서 노출용으로 쓴다.
export interface CommunityFrequencyTag {
  slug: string;
  label: string;
  seed: SeedType;
}

const SLUG_BY_TYPE: Record<SeedType, string> = {
  즐거움: "fun",
  바램: "longing",
  슬픔: "sadness",
  분노: "anger",
  기쁨: "joy",
  사랑: "love",
  미움: "hatred",
};

export const COMMUNITY_FREQUENCY_TAGS: CommunityFrequencyTag[] = SEED_DEFINITION_LIST.map((seed) => ({
  slug: SLUG_BY_TYPE[seed.type],
  label: seed.label,
  seed: seed.type,
}));
