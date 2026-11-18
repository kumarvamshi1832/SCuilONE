import { platformApiClient } from "./platformApiClient";
import type {
  NotificationItem,
  NotificationListResponse,
  NotificationReadResponse,
  UnreadCountResponse,
} from "./notificationService";

/**
 * Platform-employee access to the existing per-user notification endpoints:
 *   GET   /api/v1/notifications/            (list, scoped server-side to the caller)
 *   GET   /api/v1/notifications/unread-count
 *   PATCH /api/v1/notifications/{id}/read
 *   PATCH /api/v1/notifications/read-all
 *
 * The CRM `notificationService` is intentionally not reused for calls: it is disabled and reads the
 * CRM access token, whereas platform sessions authenticate with the platform token that
 * `platformApiClient` attaches (and refreshes) automatically.
 */
const BASE = "/api/v1/notifications";

export type { NotificationItem, NotificationListResponse };

export const platformNotificationService = {
  async list(limit = 30, offset = 0): Promise<NotificationListResponse> {
    // Trailing slash is required by the route; without it FastAPI redirects.
    const res = await platformApiClient.get<NotificationListResponse>(`${BASE}/`, {
      params: { limit, offset },
    });
    return res.data;
  },

  async unreadCount(): Promise<number> {
    const res = await platformApiClient.get<UnreadCountResponse>(`${BASE}/unread-count`);
    return res.data.unread_count;
  },

  async markRead(notificationId: string): Promise<NotificationReadResponse> {
    const res = await platformApiClient.patch<NotificationReadResponse>(
      `${BASE}/${encodeURIComponent(notificationId)}/read`,
      {}
    );
    return res.data;
  },

  async markAllRead(): Promise<NotificationReadResponse> {
    const res = await platformApiClient.patch<NotificationReadResponse>(`${BASE}/read-all`, {});
    return res.data;
  },
};
