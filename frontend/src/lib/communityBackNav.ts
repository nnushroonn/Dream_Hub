// 자유 광장/무의식 피드 리스트에서 상세로 들어갔다가 "돌아가기"를 눌렀을 때, 목록의 스크롤
// 위치와 태그 필터 상태를 보존하려면 router.push로 새로 이동하는 대신 브라우저 히스토리를
// 한 칸 되돌려야 한다(같은 페이지 인스턴스로 복귀). 다만 알림/공유 링크 등으로 상세 페이지에
// 곧장 들어온 경우엔 되돌아갈 목록 히스토리 자체가 없으므로, 리스트에서 실제로 넘어올 때만
// sessionStorage에 표시를 남겨두고 상세 페이지가 이 표시를 소비해 되돌아갈지(history.back)
// 아니면 고정 경로로 이동할지를 판단한다.
const CAME_FROM_LIST_KEY = "community:came-from-list";

export function markCameFromCommunityList(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CAME_FROM_LIST_KEY, "1");
}

export function consumeCameFromCommunityList(): boolean {
  if (typeof window === "undefined") return false;
  const cameFromList = window.sessionStorage.getItem(CAME_FROM_LIST_KEY) === "1";
  window.sessionStorage.removeItem(CAME_FROM_LIST_KEY);
  return cameFromList;
}
