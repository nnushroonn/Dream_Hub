// 임시 저장 복구 알림/모달이 매번 강제로 뜨면 방해가 된다 - 같은 초안에 대해 자동으로
// 뜨는 횟수를 최대 MAX_AUTO_SHOWS번까지만 허용하고, 그 이후로는 조용히 건너뛴다. 초안 자체가
// 있는지 여부와는 별개 카운터라, 한도를 넘겨도 유저가 직접 불러오는 수동 버튼은 항상 그대로
// 살아있다 - 강제로 뜨는 알림만 막을 뿐 기능 자체를 없애지 않는다.
const MAX_AUTO_SHOWS = 2;

function countKey(baseKey: string): string {
  return `${baseKey}_prompt_show_count`;
}

// 자동 리마인더를 화면에 띄우기 직전에 호출한다. 아직 한도 안이면 카운트를 1 올리고 true를
// 돌려주고(=이번엔 보여줘도 된다), 이미 한도를 넘겼으면 카운트를 건드리지 않고 false를 돌려준다.
export function shouldShowDraftPrompt(baseKey: string): boolean {
  try {
    const raw = localStorage.getItem(countKey(baseKey));
    const count = raw ? Number(raw) : 0;
    if (Number.isFinite(count) && count >= MAX_AUTO_SHOWS) return false;
    localStorage.setItem(countKey(baseKey), String((Number.isFinite(count) ? count : 0) + 1));
    return true;
  } catch {
    // localStorage를 못 쓰면 제한 없이 그냥 보여준다 - 방해 요소 하나 더 뜨는 정도라 무시한다.
    return true;
  }
}

// 초안을 최종 발행(저장)했거나 명시적으로 삭제(discard)했을 때 호출한다 - 다음에 새로
// 쌓이는 초안은 다시 처음부터 MAX_AUTO_SHOWS번의 기회를 갖는다.
export function resetDraftPromptCount(baseKey: string): void {
  try {
    localStorage.removeItem(countKey(baseKey));
  } catch {
    // 무시
  }
}
