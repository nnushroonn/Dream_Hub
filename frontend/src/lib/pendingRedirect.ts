// 구글 OAuth는 전체 페이지 리다이렉트(로그인 -> 백엔드 콜백 -> "/"로 복귀)를 거치며 리액트
// 메모리 상태가 모두 날아간다. 그래서 "로그인 성공 후 어디로 이어서 보낼지"를 클라이언트
// 메모리가 아니라 localStorage에 남겨, 홈으로 돌아왔을 때 그 목적지로 한 번 더 이동시킨다.
const PENDING_REDIRECT_KEY = "dream_hub_pending_redirect";

export function setPendingRedirect(path: string): void {
  try {
    localStorage.setItem(PENDING_REDIRECT_KEY, path);
  } catch {
    // 저장 공간 부족 등은 조용히 무시한다 - 실패해도 로그인 자체는 계속 진행된다.
  }
}

export function consumePendingRedirect(): string | null {
  try {
    const value = localStorage.getItem(PENDING_REDIRECT_KEY);
    if (value) localStorage.removeItem(PENDING_REDIRECT_KEY);
    return value;
  } catch {
    return null;
  }
}
