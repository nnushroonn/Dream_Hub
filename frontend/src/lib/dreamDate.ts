// "꿈 날짜 = 취침일(잠든 밤)" 규칙 - 앱 전체가 이 축을 따른다(backend/models.py의
// DreamEntry.dream_date 주석과 같은 규칙). 아침에 지난밤 꿈을 기록하더라도 날짜는 "오늘"이
// 아니라 "그 꿈을 꾸기 위해 잠들었던 전날 밤"이어야, 감정일기를 쓴 밤과 다음날 아침 작성한
// 꿈일기가 성장 타임라인에서 같은 날짜로 묶이는 기존 규칙과 어긋나지 않는다.

export function todayDateInputValue(): string {
  return formatDateInput(new Date());
}

export function yesterdayDateInputValue(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatDateInput(date);
}

function formatDateInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 꿈 기록 진입점(AI 해몽 빠른 진입 모달, 일기장의 꿈 기록 모달)이 날짜 확인 단계를 열 때
// 미리 채워두는 기본값 - 자정~정오(전형적으로 "기상 후 지난밤 꿈을 기록하는" 시간대)에는
// 취침일(어제)을, 그 외 시간대(예: 저녁에 낮잠 꿈을 기록하는 경우)에는 오늘을 기본값으로
// 삼는다. 어느 쪽이든 사용자가 날짜 확인 단계에서 직접 다른 날짜를 고를 수 있어, 이 값은
// 어디까지나 "가장 가능성 높은 추정"일 뿐이다.
export function defaultDreamDateInputValue(): string {
  const hour = new Date().getHours();
  return hour < 12 ? yesterdayDateInputValue() : todayDateInputValue();
}
