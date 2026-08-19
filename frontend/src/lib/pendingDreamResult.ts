import type { AiInterpretation, DreamSurvey } from "@/api/dream";

// 비로그인 유저가 홈 히어로에서 30초 AI 해몽을 완료한 뒤 로그인(특히 전체 페이지 리다이렉트를
// 거치는 구글 OAuth)으로 넘어가면 리액트 메모리 상태가 전부 날아간다. localStorage는 그
// 리다이렉트 왕복은 물론 브라우저를 완전히 닫았다 나중에 돌아와 가입하는 경우에도 살아남으므로,
// 여기에 결과를 백업해두고 로그인 성공 직후 자동으로 저장을 이어간다(sessionStorage였다면 탭을
// 닫는 순간 유실됐다).
const PENDING_DREAM_ANALYSIS_KEY = "pending_dream_analysis";

export interface PendingDreamResult {
  survey: DreamSurvey;
  interpretation: AiInterpretation;
  rawText: string;
  // 날짜/기분을 고르는 화면이 없는 진입점(홈 히어로)에서는 비워둔다 - 소비하는 쪽이 오늘 날짜·
  // 평온(기본값)으로 채운다. 날짜·기분 선택 UI가 있는 진입점(AI 해몽 페이지)은 유저가 고른 값을 담는다.
  selectedDate?: string;
  mood?: string;
}

export function setPendingDreamResult(data: PendingDreamResult): void {
  try {
    localStorage.setItem(PENDING_DREAM_ANALYSIS_KEY, JSON.stringify(data));
  } catch {
    // 저장 공간 부족 등은 조용히 무시한다 - 실패해도 화면에는 이미 결과가 떠 있다.
  }
}

export function consumePendingDreamResult(): PendingDreamResult | null {
  try {
    const raw = localStorage.getItem(PENDING_DREAM_ANALYSIS_KEY);
    if (!raw) return null;
    // 동시에 여러 곳(예: 페이지 전환 중 겹치는 NavBar 마운트)에서 이 함수가 거의 동시에 불려도
    // 이중 저장이 발생하지 않도록, 파싱/API 호출보다 먼저 즉시 지운다 - 실제 저장이 실패하면
    // 호출부가 setPendingDreamResult로 다시 채워 넣어(re-arm) 다음 기회에 재시도한다.
    localStorage.removeItem(PENDING_DREAM_ANALYSIS_KEY);
    return JSON.parse(raw) as PendingDreamResult;
  } catch {
    return null;
  }
}
