import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Bell,
  CalendarClock,
  CheckCheck,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListNotificationsQueryKey,
  useClearNotifications,
  useListNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@workspace/api-client-react";
import type {
  Notification,
  NotificationListResponse,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * How many notifications the popover holds. Deliberately a single page with no
 * "load more": the bell is a glance at what changed, not an archive, and every
 * row it shows links to the job it is about. Anything older than twenty items
 * has been overtaken by the Jobs and Applications pages.
 */
const PAGE_LIMIT = 20;

/**
 * NO POLLING INTERVAL, deliberately.
 *
 * The obvious thing here is `refetchInterval`, and it is wrong twice over.
 * Rows are written by the six-hourly cron, so a five-minute poll asks 72 times
 * for every time the answer can change. And a timer that fires on a tab left
 * open is a keep-alive ping by another name — CLAUDE.md is explicit that the
 * free tier's 750 instance-hours a month do not survive one ("do not add a
 * keep-alive ping"), and a service kept awake all night is a service suspended
 * mid hiring season.
 *
 * React Query's defaults already cover the real cases: the query refetches when
 * the window regains focus and whenever the component mounts, which is every
 * page navigation in this SPA. The badge is therefore current at exactly the
 * moments someone could look at it, and silent the rest of the time.
 */

const TYPE_ICONS: Record<string, typeof Bell> = {
  deadline_reminder: CalendarClock,
  new_job: Sparkles,
};

/** "3h ago", "2d ago" — short enough for a 360px popover row. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/** 9+ rather than a three-digit badge that would widen the header. */
export function badgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/**
 * Where clicking a notification goes.
 *
 * NOT a per-job deep link. There is no `/jobs/:id` route and no `?job=` param
 * on the Jobs page, and inventing one is Phase 7/9 work, not this phase's — a
 * link to a URL the router does not handle is worse than a link to the right
 * list. So each type goes to the page where its subject already lives: a
 * deadline reminder is about something in the tracker, a new-job alert is
 * about something in the feed. Anything else (a `system` message) is not a
 * link at all.
 */
export function destinationFor(notification: Notification): string | null {
  switch (notification.type) {
    case "deadline_reminder":
      return "/applications";
    case "new_job":
      return "/jobs";
    default:
      return null;
  }
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: (notification: Notification) => void;
}) {
  const Icon = TYPE_ICONS[notification.type] ?? Bell;
  const body = (
    <div
      className={`flex gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary ${
        notification.isRead ? "" : "bg-primary/5"
      }`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          notification.isRead ? "text-muted-foreground" : "text-primary"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {notification.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {notification.message}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {relativeTime(notification.createdAt)}
        </p>
      </div>
      {!notification.isRead && (
        <span
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          aria-label="Unread"
        />
      )}
    </div>
  );

  const href = destinationFor(notification);
  return href ? (
    <Link href={href} onClick={() => onOpen(notification)} className="block">
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className="block w-full"
    >
      {body}
    </button>
  );
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const queryKey = useMemo(
    () => getListNotificationsQueryKey({ limit: PAGE_LIMIT }),
    [],
  );

  const { data, isLoading, isError } = useListNotifications(
    { limit: PAGE_LIMIT },
    {
      query: {
        queryKey,
        // The bell must never be the reason a page looks broken. A 401 before
        // Clerk has settled, or a 503 from a cold instance, leaves `data`
        // undefined and the component renders a plain bell with no badge.
        retry: 1,
      },
    },
  );

  const { mutateAsync: markRead } = useMarkNotificationRead();
  const { mutateAsync: markAllRead, isPending: isMarkingAll } =
    useMarkAllNotificationsRead();
  const { mutateAsync: clearAll, isPending: isClearing } =
    useClearNotifications();

  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleOpen = useCallback(
    (notification: Notification) => {
      setOpen(false);
      if (notification.isRead) return;

      // Optimistic: the row greys out as the popover closes rather than one
      // round trip later. A failure just leaves it unread, which the next
      // refetch confirms — nothing is lost.
      queryClient.setQueryData<NotificationListResponse>(
        queryKey,
        (current) =>
          current && {
            ...current,
            data: current.data.map((n) =>
              n.id === notification.id ? { ...n, isRead: true } : n,
            ),
            unreadCount: Math.max(0, current.unreadCount - 1),
          },
      );
      void markRead({ id: notification.id })
        .catch(() => undefined)
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey });
        });
    },
    [markRead, queryClient, queryKey],
  );

  const handleMarkAll = useCallback(async () => {
    try {
      await markAllRead();
    } finally {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [markAllRead, queryClient, queryKey]);

  const handleClearAll = useCallback(async () => {
    try {
      await clearAll();
    } finally {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [clearAll, queryClient, queryKey]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          data-testid="notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              data-testid="notification-badge"
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
            >
              {badgeLabel(unreadCount)}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[22rem] p-0"
        data-testid="notification-panel"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => void handleMarkAll()}
                disabled={isMarkingAll}
              >
                {isMarkingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => void handleClearAll()}
                disabled={isClearing}
              >
                {isClearing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Clear all
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">
            Notifications are unavailable right now.
          </p>
        ) : notifications.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">
            Nothing yet. Deadline reminders appear here three days and one day
            before a saved job closes.
          </p>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onOpen={handleOpen}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
