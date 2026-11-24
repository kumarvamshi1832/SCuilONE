import type { BookingRequest } from "../types/customerBookingJourney";
import type { PortalBooking, PortalSiteVisit } from "../types/customerPortal";

/**
 * One row of the customer's booking history, built ONLY from what the two customer-portal APIs return:
 *   GET /api/v1/customer-portal/bookings          (bookings visible to this portal user)
 *   GET /api/v1/customer-portal/booking-requests  (this portal user's booking requests)
 * A request that has been approved owns a booking (request.booking_id === booking.id); the two are merged into one
 * record. Requests that never produced a booking (Requested, Rejected, Expired) and bookings staff created
 * without a request each stay a single record. Nothing is invented: a missing figure stays null.
 */

export type BookingFilter = "all" | "active" | "pending" | "confirmed" | "completed" | "closed";

export interface BookingRecord {
  key: string;
  bookingId: string | null;
  requestId: string | null;
  /** Backend status shown to the customer (request status when there is one, else the booking status). */
  status: string;
  propertyName: string | null;
  unitNumber: string | null;
  city: string | null;
  currency: string;
  /** Booking date for bookings, request date for requests that have no booking yet. */
  date: string | null;
  updatedAt: string | null;
  agreedPrice: string | null;
  bookingAmount: string | null;
  paidAmount: string | null;
  remainingBalance: string | null;
  holdExpiresAt: string | null;
}

const CLOSED_STATUSES = ["Cancelled", "Rejected", "Expired", "Expired - Payment Review"];

/** Active = the customer currently holds or owns the unit and the booking is not finished: Approved/Pending/Confirmed. */
export const isActiveStatus = (s: string): boolean => ["Approved", "Pending", "Confirmed"].includes(s);
export const isPendingRequestStatus = (s: string): boolean => s === "Requested";
export const isClosedStatus = (s: string): boolean => CLOSED_STATUSES.includes(s);

export const matchesFilter = (record: BookingRecord, filter: BookingFilter): boolean => {
  switch (filter) {
    case "active":
      return isActiveStatus(record.status);
    case "pending":
      return isPendingRequestStatus(record.status);
    case "confirmed":
      return record.status === "Confirmed";
    case "completed":
      return record.status === "Completed";
    case "closed":
      return isClosedStatus(record.status);
    default:
      return true;
  }
};

export interface BookingCounts {
  total: number;
  active: number;
  pending: number;
  confirmed: number;
  completed: number;
  closed: number;
}

export const countBookings = (records: readonly BookingRecord[]): BookingCounts => ({
  total: records.length,
  active: records.filter((r) => matchesFilter(r, "active")).length,
  pending: records.filter((r) => matchesFilter(r, "pending")).length,
  confirmed: records.filter((r) => matchesFilter(r, "confirmed")).length,
  completed: records.filter((r) => matchesFilter(r, "completed")).length,
  closed: records.filter((r) => matchesFilter(r, "closed")).length,
});

const time = (value: string | null): number => {
  if (!value) return 0;
  const t = Date.parse(/([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(t) ? 0 : t;
};

export const buildBookingRecords = (
  bookings: readonly PortalBooking[],
  requests: readonly BookingRequest[],
  visits: readonly PortalSiteVisit[] = []
): BookingRecord[] => {
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const usedBookings = new Set<string>();
  const records: BookingRecord[] = [];

  for (const request of requests) {
    const booking = request.booking_id ? bookingById.get(request.booking_id) ?? null : null;
    if (booking) usedBookings.add(booking.id);
    const visitProperty = visitById.get(request.site_visit_id)?.property ?? null;
    const property = booking?.property ?? visitProperty;
    // A finished booking is authoritative: the request row can lag behind a cancellation or completion.
    const status = booking && ["Cancelled", "Completed"].includes(booking.status) ? booking.status : request.status;
    records.push({
      key: `request:${request.id}`,
      bookingId: booking?.id ?? request.booking_id ?? null,
      requestId: request.id,
      status,
      propertyName: property?.name ?? booking?.property_title ?? null,
      unitNumber: (booking?.property?.unit_number as string | null | undefined) ?? null,
      city: property?.city ?? null,
      currency: booking?.property?.currency || "INR",
      date: booking?.booking_date ?? request.created_at,
      updatedAt: request.updated_at,
      agreedPrice: booking?.agreed_price ?? request.agreed_price,
      bookingAmount: booking?.booking_amount ?? request.booking_amount,
      paidAmount: booking?.verified_paid_amount ?? null,
      remainingBalance: booking?.remaining_balance ?? null,
      holdExpiresAt: request.hold_expires_at ?? booking?.hold_expires_at ?? null,
    });
  }

  for (const booking of bookings) {
    if (usedBookings.has(booking.id)) continue;
    records.push({
      key: `booking:${booking.id}`,
      bookingId: booking.id,
      requestId: null,
      status: booking.status,
      propertyName: booking.property?.name ?? booking.property_title ?? null,
      unitNumber: booking.property?.unit_number ?? null,
      city: booking.property?.city ?? null,
      currency: booking.property?.currency || "INR",
      date: booking.booking_date ?? booking.created_at ?? null,
      updatedAt: null,
      agreedPrice: booking.agreed_price ?? null,
      bookingAmount: booking.booking_amount ?? null,
      paidAmount: booking.verified_paid_amount ?? null,
      remainingBalance: booking.remaining_balance ?? null,
      holdExpiresAt: booking.hold_expires_at ?? null,
    });
  }

  return records.sort((a, b) => time(b.date) - time(a.date));
};

export const shortRef = (id: string | null): string => (id ? id.slice(0, 8).toUpperCase() : "—");
