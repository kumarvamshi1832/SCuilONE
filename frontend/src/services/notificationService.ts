
import { apiClient } from "./authService";

export interface NotificationItem {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  workflow_id: string | null;
  title: string;
  message: string;
  notification_type: string;
  related_module: string | null;
  related_record_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread_count: number;
  limit: number;
  offset: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface NotificationReadResponse {
  message: string;
  notification_id: string | null;
  is_read: boolean;
}

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

export async function getNotifications(
  limit = 20,
  offset = 0
): Promise<NotificationListResponse> {
  const response = await apiClient.get<NotificationListResponse>(
    "/api/v1/notifications/",
    {
      ...getHeaders(),
      params: { limit, offset },
    }
  );

  return response.data;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const response = await apiClient.get<UnreadCountResponse>(
    "/api/v1/notifications/unread-count",
    getHeaders()
  );

  return response.data.unread_count;
}

export async function markNotificationAsRead(
  notificationId: string
): Promise<NotificationReadResponse> {
  const response = await apiClient.patch<NotificationReadResponse>(
    `/api/v1/notifications/${notificationId}/read`,
    {},
    getHeaders()
  );

  return response.data;
}

export async function markAllNotificationsAsRead(): Promise<NotificationReadResponse> {
  const response = await apiClient.patch<NotificationReadResponse>(
    "/api/v1/notifications/read-all",
    {},
    getHeaders()
  );

  return response.data;
}
