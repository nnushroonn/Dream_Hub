"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Inbox, MessageCircle, ThumbsUp, Trophy, type LucideIcon } from "lucide-react";

import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  type AppNotification,
} from "@/api/notifications";

const UNREAD_POLL_MS = 30000;

const NOTIFICATION_ICON: Record<AppNotification["type"], LucideIcon> = {
  COMMENT: MessageCircle,
  LIKE: ThumbsUp,
  BEST: Trophy,
};

const NOTIFICATION_ICON_COLOR: Record<AppNotification["type"], string> = {
  COMMENT: "text-slate-300",
  LIKE: "text-purple-500",
  BEST: "text-amber-400",
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

// LIKE는 투표에 익명 선택지가 없어 actor_display_name이 항상 null로 온다 - 절대 이름을
// 밝히지 않고 렌더링한다. COMMENT는 그 댓글의 익명 선택을 그대로 따른다(null이면 "익명의 탐험가").
function notificationMessage(notification: AppNotification): string {
  const targetLabel = notification.target_type === "POST" ? "자유 광장 글" : "무의식 피드 꿈";
  if (notification.type === "LIKE") {
    return `내 ${targetLabel} "${notification.preview_text}"에 좋아요가 달렸어요`;
  }
  if (notification.type === "COMMENT") {
    const actor = notification.actor_display_name ?? "익명의 탐험가";
    return `${actor}님이 댓글을 남겼어요: "${notification.preview_text}"`;
  }
  return `내 ${targetLabel} "${notification.preview_text}"이(가) 베스트에 올랐어요`;
}

function notificationHref(notification: AppNotification): string {
  const base = notification.target_type === "POST" ? "/community/board-post" : "/community/post";
  const params = new URLSearchParams({ id: String(notification.target_id) });
  if (notification.comment_id) params.set("highlightComment", String(notification.comment_id));
  return `${base}?${params.toString()}`;
}

// GNB 종 아이콘 알림 드롭다운. 탭 분리 없이 최신순 단일 리스트로만 보여준다 - 항목별 읽음
// 처리 대신, 드롭다운을 여는 순간 그 시점까지의 안 읽은 알림을 한 번에 읽음 처리한다.
export default function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const poll = () => getUnreadNotificationCount().then(setUnreadCount).catch(() => {});
    poll();
    const timer = setInterval(poll, UNREAD_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (!next) return;

    setIsLoading(true);
    getNotifications()
      .then((result) => {
        setNotifications(result);
        setHasLoaded(true);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));

    // 드롭다운을 여는 순간 지금까지의 안 읽은 알림을 전부 읽음 처리한다 - 이번 열람에서는
    // 방금 fetch한 is_read 값(아직 반영 전)을 그대로 보여주고, 뱃지 카운트만 즉시 0으로 지운다.
    markAllNotificationsRead()
      .then(() => setUnreadCount(0))
      .catch(() => {});
  };

  const handleItemClick = (notification: AppNotification) => {
    setIsOpen(false);
    router.push(notificationHref(notification));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label="알림"
        className="relative rounded-full p-2 text-indigo-300/70 transition-colors hover:bg-indigo-900/40 hover:text-indigo-100"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-slate-700 bg-[#0f172a] shadow-xl">
          <p className="border-b border-white/5 px-4 py-3 text-sm font-semibold text-white">알림</p>

          {isLoading && !hasLoaded ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-slate-400">
              <Inbox className="h-8 w-8" />
              <p className="mt-2 text-sm">아직 도착한 알림이 없어요</p>
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => {
                const Icon = NOTIFICATION_ICON[notification.type];
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(notification)}
                      className={`flex w-full flex-row gap-3 border-b border-white/5 p-4 text-left transition-colors hover:bg-white/[0.06] ${
                        notification.is_read ? "bg-transparent opacity-60" : "bg-purple-900/20"
                      }`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${NOTIFICATION_ICON_COLOR[notification.type]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm text-slate-200">{notificationMessage(notification)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatRelativeTime(notification.created_at)}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
