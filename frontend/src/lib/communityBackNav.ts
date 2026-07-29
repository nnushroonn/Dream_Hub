// 커뮤니티 안에서 "목록 → 상세 → 더 깊은 상세(예: 전체 해몽)"처럼 여러 단계로 들어갔다가
// "돌아가기"를 눌렀을 때, 각 단계가 고정 경로로 새로 이동(push)하는 대신 브라우저 히스토리를
// 한 칸씩 되돌려야(router.back()) 스크롤 위치·필터 상태가 살아있는 이전 페이지 인스턴스로
// 정확히 복귀한다. 중간에 단 한 곳이라도 고정 경로로 push해버리면 history 스택 깊이가 실제
// "몇 단계를 거쳐왔는지"와 어긋나 back() 한 번으로 엉뚱한 단계에 멈추는 문제가 생긴다
// (예: 목록 → 상세 → 전체 해몽까지 갔다가 전체 해몽에서 push로 되돌아오면, 상세 페이지의
// back()이 목록이 아니라 다시 전체 해몽으로 가버린다) - 그래서 각 진입 지점마다 별도의 키로
// "직전 단계에서 왔다"는 표시를 남기고, 되돌아갈 때 이 표시를 소비해 router.back()을 쓸지
// 고정 경로로 이동할지 판단한다. 알림/공유 링크로 중간 단계에 곧장 들어온 경우엔 표시가 없으니
// 안전하게 고정 경로로 이동한다.
const PREFIX = "community:back-nav:";

export function markBackNavOrigin(originId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PREFIX + originId, "1");
}

export function consumeBackNavOrigin(originId: string): boolean {
  if (typeof window === "undefined") return false;
  const key = PREFIX + originId;
  const cameFromOrigin = window.sessionStorage.getItem(key) === "1";
  window.sessionStorage.removeItem(key);
  return cameFromOrigin;
}
