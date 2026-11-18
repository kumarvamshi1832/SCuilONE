export type NotificationCategory =
  | 'all'
  | 'estimates'
  | 'contracts'
  | 'projects'
  | 'invoices'
  | 'support'
  | 'documents'
  | 'bookings'
  | 'visits';

export type NotificationPriority = 'normal' | 'high' | 'urgent';

/**
 * Raw item returned by GET /api/v1/customer-portal/notifications.
 * (backend: customer_portal_lifecycle.customer_notifications)
 */
export interface PortalNotificationApiItem {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  related_module: string | null;
  related_record_id: string | null;
  is_read: boolean;
  created_at: string;
}

/** Response of GET /api/v1/customer-portal/notifications. */
export interface PortalNotificationListResponse {
  items: PortalNotificationApiItem[];
  total: number;
  unread_count: number;
}

/** UI model derived from a server notification (nothing here is stored client-side). */
export interface PortalNotification {
  id: string;
  title: string;
  message: string;
  /** Raw backend fields, kept for link resolution. */
  notification_type: string;
  related_module: string | null;
  related_record_id: string | null;
  /** Server-side read state (is_read). */
  read: boolean;
  /** Server created_at (ISO, naive UTC from the API). */
  timestamp: string;
  category: Exclude<NotificationCategory, 'all'>;
  priority?: NotificationPriority;
  actionText?: string;
}

export type NotificationFilterTab = 'all' | 'unread';
