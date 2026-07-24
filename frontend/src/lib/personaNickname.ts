// 🎲 랜덤 꿈 페르소나 닉네임 생성기 - 회원가입 폼과 마이페이지 닉네임 수정에서 함께 쓴다.
// 백엔드의 자동 배정(구글 로그인용) 생성기와 같은 컨셉의 조합.
export const PERSONA_ADJECTIVES = ["보랏빛", "자각몽을 꾸는", "달빛 아래", "새벽녘의"];
export const PERSONA_NOUNS = ["탐험가", "몽상가", "추적자", "나비"];

export function randomPersonaNickname(): string {
  const adjective = PERSONA_ADJECTIVES[Math.floor(Math.random() * PERSONA_ADJECTIVES.length)];
  const noun = PERSONA_NOUNS[Math.floor(Math.random() * PERSONA_NOUNS.length)];
  return `${adjective} ${noun}`;
}
