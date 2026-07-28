import api from "./axios";

// GNB 종 아이콘 알림. Notification은 브라우저 내장 Web API 타입과 이름이 겹쳐 AppNotification으로
// 부른다. LIKE는 투표에 익명 개념이 없어 actor_display_name이 항상 null - 프론트는 이름을
// 밝히지 않고 렌더링해야 한다. COMMENT는 그 댓글의 익명 선택을 그대로 따른다.
export interface AppNotification {
  id: number;
  type: "COMMENT" | "LIKE" | "BEST";
  target_type: "POST" | "DREAM";
  target_id: number;
  comment_id: number | null;
  preview_text: string;
  actor_display_name: string | null;
  is_read: boolean;
  created_at: string;
}

export async function getNotifications(): Promise<AppNotification[]> {
  const { data } = await api.get<AppNotification[]>("/api/notifications");
  return data;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>("/api/notifications/unread-count");
  return data.count;
}

// 드롭다운을 열 때 호출해 그 시점까지 쌓인 안 읽은 알림을 한 번에 읽음 처리한다(항목별 읽음
// 처리는 없음) - 다음에 다시 열면 종 뱃지가 사라져 있고, 이번에 새로 온 알림만 강조 스타일이었다.
export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/api/notifications/mark-all-read");
}
