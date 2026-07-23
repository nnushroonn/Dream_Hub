// 완성형 한글(가~힣)의 첫 글자에서 초성(자음)을 뽑아내는 유틸.
// 유니코드 한글 완성형 블록은 (초성 19개 * 중성 21개 * 종성 28개) 조합으로 배열되어 있어,
// 코드값에서 그 구조를 역산하면 초성 인덱스를 구할 수 있다.
const CHOSEONG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

const HANGUL_BASE = 0xac00; // '가'
const HANGUL_LAST = 0xd7a3; // '힣'
const JUNGSEONG_COUNT = 21;
const JONGSEONG_COUNT = 28;

export function getChoseong(char: string): string | null {
  const code = char.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return null;
  const choseongIndex = Math.floor((code - HANGUL_BASE) / (JUNGSEONG_COUNT * JONGSEONG_COUNT));
  return CHOSEONG[choseongIndex] ?? null;
}

export function wordStartsWithChoseong(word: string, choseong: string): boolean {
  return getChoseong(word.trim().charAt(0)) === choseong;
}
