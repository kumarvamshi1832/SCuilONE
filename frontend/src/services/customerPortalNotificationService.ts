import { portalApiClient } from './customerPortalAuthService';
import { getBookingRequest, getBookingRequests } from './customerPortalJourneyService';
import { getPortalRentalAgreement, getPortalRentalAgreements } from './customerPortalRentalService';
import { resolveOfferTarget } from './customerPortalBookingNegotiation';
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
  payments: 'bookings',
  property_offers: 'bookings',
  rental_agreements: 'bookings',
  rental_payments: 'bookings',
  rental_inspections: 'bookings',
  rental_agreement_revisions: 'bookings',
  rental_payment_schedules: 'bookings',
  payment_plan_installments: 'bookings',
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
    case 'payments':
      return 'View payment';
    case 'property_offers':
      return 'View offer';
    case 'rental_agreements':
    case 'rental_payments':
    case 'rental_inspections':
    case 'rental_agreement_revisions':
    case 'rental_payment_schedules':
      return 'View rental';
    case 'payment_plan_installments':
      return 'View payment schedule';
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
   *  - site_visits               -> the customer's Site Visits page.
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
    if (module === 'payments' && recordId) {
      // related_record_id is the payment id: find the customer's own request that contains it.
      try {
        const requests = await getBookingRequests();
        for (const request of requests.filter((r) => r.booking_id)) {
          const detail = await getBookingRequest(request.id);
          if (detail.payments.some((p) => p.id === recordId)) return `/portal/booking-requests/${request.id}`;
        }
      } catch {
        /* fall through to the list */
      }
      return '/portal/booking-requests';
    }
    if (module === 'payment_plan_installments') {
      return '/portal/booking-requests';
    }
    if (module === 'property_offers') {
      // related_record_id is an offer id. Check property/transaction type (Rental vs Sale):
      // Rental property offers navigate to Rentals & Leases (/portal/rentals?respond=true&offer=...)
      // Sale property offers navigate to Booking Requests (/portal/booking-requests/:id?respond=true&offer=...)
      if (recordId) {
        try {
          const target = await resolveOfferTarget(recordId);
          if (target?.link) return target.link;
        } catch {
          /* fall through to text heuristic or default */
        }
      }
      // Secondary fallback if offer record lookup was not found:
      const isRentalType =
        notification.notification_type === 'rental_offer' ||
        notification.notification_type === 'lease_offer';
      const text = `${notification.title} ${notification.message || ''}`.toLowerCase();
      const isRentalText =
        isRentalType ||
        text.includes('rent') ||
        text.includes('lease') ||
        text.includes('monthly') ||
        text.includes('quarterly') ||
        text.includes('yearly') ||
        text.includes('/ month') ||
        text.includes('/month') ||
        text.includes('/mo');
      const offerParam = recordId ? `?respond=true&offer=${encodeURIComponent(recordId)}` : '';
      if (isRentalText) {
        return `/portal/rentals${offerParam}`;
      }
      return `/portal/booking-requests${offerParam}`;
    }
    if (module && module.startsWith('rental_')) {
      // Most rental notifications carry the agreement id, but a payment decision carries the payment id.
      if (!recordId) return '/portal/rentals';
      try {
        const agreements = await getPortalRentalAgreements();
        if (agreements.some((a) => a.id === recordId)) return `/portal/rentals/${recordId}`;
        for (const agreement of agreements) {
          const detail = await getPortalRentalAgreement(agreement.id);
          if (detail.payments.some((p) => p.id === recordId) || detail.inspections.some((i) => i.id === recordId)) {
            return `/portal/rentals/${agreement.id}`;
          }
        }
      } catch {
        /* fall through to the list */
      }
      return '/portal/rentals';
    }
    if (module === 'site_visits') {
      // The Site Visits page shows the appointment, its new time and status.
      return '/portal/site-visits';
    }
    if (module === 'customer_chat') {
      return '/portal/chat';
    }
    return null;
  },
};
