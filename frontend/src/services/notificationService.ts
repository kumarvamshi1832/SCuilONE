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

// Backend notifications router is commented out in main.py, so disable network calls to prevent 404s
let isNotificationsEndpointAvailable = false;

export const isNotificationsSupported = (): boolean => isNotificationsEndpointAvailable;

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
  if (!isNotificationsEndpointAvailable) {
    return { items: [], total: 0, unread_count: 0, limit, offset };
  }
  try {
    const response = await apiClient.get<NotificationListResponse>(
      "/api/v1/notifications/",
      {
        ...getHeaders(),
        params: { limit, offset },
      }
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      isNotificationsEndpointAvailable = false;
      return { items: [], total: 0, unread_count: 0, limit, offset };
    }
    throw error;
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  if (!isNotificationsEndpointAvailable) {
    return 0;
  }
  try {
    const response = await apiClient.get<UnreadCountResponse>(
      "/api/v1/notifications/unread-count",
      getHeaders()
    );
    return response.data.unread_count;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      isNotificationsEndpointAvailable = false;
      return 0;
    }
    throw error;
  }
}

export async function markNotificationAsRead(
  notificationId: string
): Promise<NotificationReadResponse> {
  if (!isNotificationsEndpointAvailable) {
    return {
      message: "Notifications service unavailable",
      notification_id: notificationId,
      is_read: true,
    };
  }
  try {
    const response = await apiClient.patch<NotificationReadResponse>(
      `/api/v1/notifications/${notificationId}/read`,
      {},
      getHeaders()
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      isNotificationsEndpointAvailable = false;
      return {
        message: "Notifications service unavailable",
        notification_id: notificationId,
        is_read: true,
      };
    }
    throw error;
  }
}

export async function markAllNotificationsAsRead(): Promise<NotificationReadResponse> {
  if (!isNotificationsEndpointAvailable) {
    return {
      message: "Notifications service unavailable",
      notification_id: null,
      is_read: true,
    };
  }
  try {
    const response = await apiClient.patch<NotificationReadResponse>(
      "/api/v1/notifications/read-all",
      {},
      getHeaders()
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      isNotificationsEndpointAvailable = false;
      return {
        message: "Notifications service unavailable",
        notification_id: null,
        is_read: true,
      };
    }
    throw error;
  }
}
