import { portalApiClient } from './customerPortalAuthService';
import { getBookingRequests } from './customerPortalJourneyService';
import { parseBackendDate } from '../utils/bookingJourney';
import type {
  NotificationCategory,
  PortalNotification,
  PortalNotificationApiItem,
  PortalNotificationListResponse,
} from '../types/customerPortalNotifications';

/**
 * Customer Portal notifications - backed by the real backend APIs, using the customer portal
 * client (customer token) only. Tenant and customer scoping come from the portal token; nothing is
 * persisted or generated on the client.
 *
 *   GET   /api/v1/customer-portal/notifications?limit&offset   -> { items, total, unread_count }
 *   GET   /api/v1/customer-portal/notifications/unread-count   -> { unread_count }
 *   PATCH /api/v1/customer-portal/notifications/{id}/read      -> { id, is_read }
 *   PATCH /api/v1/customer-portal/notifications/read-all       -> { updated_count }
 */

const BASE = '/api/v1/customer-portal/notifications';

/** Fired whenever notification state changed (or may have changed) so the bell and page refetch. */
export const PORTAL_NOTIFICATIONS_UPDATED_EVENT = 'portal:notifications-updated';

export function emitPortalNotificationsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PORTAL_NOTIFICATIONS_UPDATED_EVENT));
  }
}

const MODULE_CATEGORY: Record<string, Exclude<NotificationCategory, 'all'>> = {
  customer_booking_requests: 'bookings',
  bookings: 'bookings',
  payment_plans: 'bookings',
  payment_refunds: 'bookings',
  cancellation_requests: 'bookings',
  property_handovers: 'bookings',
  customer_property_service_requests: 'bookings',
  site_visits: 'visits',
  // Messages from the company use the existing "support" category (icon + label) rather than a new one.
  customer_chat: 'support',
};

function toPortalNotification(item: PortalNotificationApiItem): PortalNotification {
  const module = item.related_module || '';
  const category = MODULE_CATEGORY[module] ?? 'bookings';
  return {
    id: item.id,
    title: item.title,
    message: item.message,
    notification_type: item.notification_type,
    related_module: item.related_module,
    related_record_id: item.related_record_id,
    read: Boolean(item.is_read),
    timestamp: item.created_at,
    category,
    actionText: getNotificationActionText(item),
  };
}

function getNotificationActionText(item: Pick<PortalNotificationApiItem, 'related_module'>): string | undefined {
  switch (item.related_module) {
    case 'customer_booking_requests':
    case 'bookings':
      return 'View booking request';
    case 'site_visits':
      return 'View site visits';
    case 'customer_chat':
      return 'Open messages';
    default:
      return undefined;
  }
}

/** Parses created_at (the API returns naive UTC timestamps) into epoch milliseconds. */
export function notificationTimestamp(n: Pick<PortalNotification, 'timestamp'>): number {
  return parseBackendDate(n.timestamp)?.getTime() ?? 0;
}

export const CustomerPortalNotificationService = {
  async getNotifications(
    limit = 50,
    offset = 0
  ): Promise<{ items: PortalNotification[]; total: number; unreadCount: number }> {
    const response = await portalApiClient.get<PortalNotificationListResponse>(BASE, {
      params: { limit, offset },
    });
    const data = response.data;
    const items = Array.isArray(data?.items) ? data.items.map(toPortalNotification) : [];
    return {
      items,
      total: typeof data?.total === 'number' ? data.total : items.length,
      unreadCount: typeof data?.unread_count === 'number' ? data.unread_count : 0,
    };
  },

  async getUnreadCount(): Promise<number> {
    const response = await portalApiClient.get<{ unread_count: number }>(`${BASE}/unread-count`);
    return typeof response.data?.unread_count === 'number' ? response.data.unread_count : 0;
  },

  async markAsRead(notificationId: string): Promise<void> {
    await portalApiClient.patch(`${BASE}/${notificationId}/read`);
    emitPortalNotificationsChanged();
  },

  async markAllAsRead(): Promise<number> {
    const response = await portalApiClient.patch<{ updated_count: number }>(`${BASE}/read-all`);
    emitPortalNotificationsChanged();
    return response.data?.updated_count ?? 0;
  },

  /**
   * Resolves where a notification should take the customer. Returns null when the backend record has
   * no matching Customer Portal page (the notification is then informational only).
   *
   *  - customer_booking_requests -> related_record_id is the booking request id.
   *  - bookings                  -> related_record_id is the booking id; the matching request is
   *                                  looked up from the customer's own booking requests.
   *  - site_visits               -> booking journey (lists the customer's visits).
   */
  async resolveLink(notification: PortalNotification): Promise<string | null> {
    const { related_module: module, related_record_id: recordId } = notification;
    if (module === 'customer_booking_requests' && recordId) {
      return `/portal/booking-requests/${recordId}`;
    }
    if (module === 'bookings' && recordId) {
      try {
        const requests = await getBookingRequests();
        const match = requests.find((r) => r.booking_id === recordId);
        return match ? `/portal/booking-requests/${match.id}` : '/portal/booking-requests';
      } catch {
        return '/portal/booking-requests';
      }
    }
    if (module === 'site_visits') {
      return '/portal/booking-journey';
    }
    if (module === 'customer_chat') {
      return '/portal/chat';
    }
    return null;
  },
};
