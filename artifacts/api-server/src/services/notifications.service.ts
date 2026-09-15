import {
  notificationsRepository,
  type NotificationFilters,
} from "../repositories/notifications.repository";
import { paginate } from "../lib/pagination";

export const notificationsService = {
  /**
   * One round trip's worth of everything the bell needs: the page, and the
   * badge count.
   *
   * `unreadCount` is computed independently of `unreadOnly` on purpose. The
   * popover shows all notifications by default, so a count derived from the
   * returned page would be wrong the moment there were more than `limit` of
   * them — and derived from a filtered page it would just be the page length.
   */
  async list(clerkId: string, rawQuery: Record<string, unknown>) {
    const filters: NotificationFilters = {
      // Query strings carry no booleans; "true" is the only affirmative.
      unreadOnly: rawQuery.unreadOnly === "true",
    };
    const pagination = paginate(rawQuery);

    const [page, unreadCount] = await Promise.all([
      notificationsRepository.findAll(clerkId, filters, pagination),
      notificationsRepository.countUnread(clerkId),
    ]);

    return { ...page, unreadCount };
  },

  async markRead(id: string, clerkId: string) {
    return notificationsRepository.markRead(id, clerkId);
  },

  async markAllRead(clerkId: string) {
    const updated = await notificationsRepository.markAllRead(clerkId);
    return { updated };
  },

  async clear(clerkId: string) {
    const deleted = await notificationsRepository.deleteAll(clerkId);
    return { deleted };
  },
};
