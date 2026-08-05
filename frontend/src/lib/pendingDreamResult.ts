import type { AiInterpretation, DreamSurvey } from "@/api/dream";

// 비로그인 유저가 홈 히어로에서 10초 AI 해몽을 완료한 뒤 로그인(특히 전체 페이지 리다이렉트를
// 거치는 구글 OAuth)으로 넘어가면 리액트 메모리 상태가 전부 날아간다. sessionStorage는 그 리다이렉트
// 왕복에도 살아남으므로, 여기에 결과를 잠깐 백업해두고 로그인 성공 직후 자동으로 저장을 이어간다.
const PENDING_DREAM_RESULT_KEY = "pending_dream_result";

export interface PendingDreamResult {
  survey: DreamSurvey;
  interpretation: AiInterpretation;
  rawText: string;
}

export function setPendingDreamResult(data: PendingDreamResult): void {
  try {
    sessionStorage.setItem(PENDING_DREAM_RESULT_KEY, JSON.stringify(data));
  } catch {
    // 저장 공간 부족 등은 조용히 무시한다 - 실패해도 화면에는 이미 결과가 떠 있다.
  }
}

export function consumePendingDreamResult(): PendingDreamResult | null {
  try {
    const raw = sessionStorage.getItem(PENDING_DREAM_RESULT_KEY);
    if (!raw) return null;
    // 동시에 여러 곳(예: 페이지 전환 중 겹치는 NavBar 마운트)에서 이 함수가 거의 동시에 불려도
    // 이중 저장이 발생하지 않도록, 파싱/API 호출보다 먼저 즉시 지운다.
    sessionStorage.removeItem(PENDING_DREAM_RESULT_KEY);
    return JSON.parse(raw) as PendingDreamResult;
  } catch {
    return null;
  }
}
