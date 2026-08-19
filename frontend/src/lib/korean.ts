// 한글 단어의 마지막 글자 받침 유무로 "이"/"가" 조사를 고른다. 완성형 한글이 아닌 문자
// (영문/숫자 등)로 끝나면 받침이 있다고 보고 "이"를 고른다 - 발음상 더 무난하다.
export function igaFor(word: string): "이" | "가" {
  const trimmed = word.trim();
  const lastChar = trimmed.slice(-1);
  const code = lastChar.charCodeAt(0);
  const isCompleteHangul = code >= 0xac00 && code <= 0xd7a3;
  const hasBatchim = !isCompleteHangul || (code - 0xac00) % 28 !== 0;
  return hasBatchim ? "이" : "가";
}

// word 바로 뒤에 조사가 붙는 가장 흔한 경우의 축약형 - "따옴표로 감싼 단어 뒤" 같은
// 경우는 word만 넘겨 igaFor로 조사만 받고 직접 이어 붙인다.
export function withIga(word: string): string {
  return `${word.trim()}${igaFor(word)}`;
}
