/**
 * Cancellation, refund and after-sales (service) requests, and the customer's activity timeline.
 * Mirrors backend/app/routes/customer_portal_lifecycle.py (cancellation_payload, service_payload and the refund responses).
 */

/** Pending -> Approved | Rejected (staff decision). */
export type CancellationStatus = "Pending" | "Approved" | "Rejected" | string;

export interface CancellationRequest {
  id: string;
  booking_id: string;
  reason: string;
  status: CancellationStatus;
  staff_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** POST /customer-portal/bookings/{id}/cancellation-requests - reason is 10-5000 characters. */
export const CANCELLATION_REASON_MIN = 10;

/** GET /customer-portal/bookings/{id}/refund-requests (the customer's view of a PaymentRefund). */
export interface RefundRequest {
  id: string;
  payment_id: string;
  amount: string | number;
  reason: string;
  /** Pending until staff process it; the backend never lets the customer process or approve a refund. */
  status: "Pending" | "Processed" | "Rejected" | string;
  external_reference: string | null;
  processed_at: string | null;
  created_at: string;
}

/** POST /customer-portal/bookings/{id}/refund-requests - the payment must be Verified; the reason is 10-5000 characters. */
export interface RefundRequestCreate {
  payment_id: string;
  amount: number;
  reason: string;
}
export const REFUND_REASON_MIN = 10;
/** Refund statuses that already use up part of a payment's refundable balance (the server counts exactly these). */
export const REFUND_RESERVING_STATUSES = ["Pending", "Processed"];

export const SERVICE_REQUEST_STATUSES = ["Open", "In Progress", "Waiting on Customer", "Resolved", "Closed", "Rejected"] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];
export const SERVICE_REQUEST_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export type ServiceRequestPriority = (typeof SERVICE_REQUEST_PRIORITIES)[number];
/** Statuses the backend treats as still open (they count as "open requests" in the lifecycle overview). */
export const SERVICE_REQUEST_OPEN_STATUSES: string[] = ["Open", "In Progress", "Waiting on Customer"];

/** Suggestions only: the backend accepts any category of 2-60 characters. */
export const SERVICE_REQUEST_CATEGORY_SUGGESTIONS = ["Plumbing", "Electrical", "Structural", "Painting", "Documentation", "Maintenance", "Other"];

export interface ServiceRequest {
  id: string;
  booking_id: string;
  property_id: string;
  category: string;
  subject: string;
  description: string;
  priority: ServiceRequestPriority | string;
  status: ServiceRequestStatus | string;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

/** POST /customer-portal/bookings/{id}/service-requests - only after the sale is completed. */
export interface ServiceRequestCreate {
  category: string;
  subject: string;
  description: string;
  priority: ServiceRequestPriority;
}

/** PATCH /customer-booking-workflow/service-requests/{id} (support_ticket.update). The status is required and the customer is notified. */
export interface ServiceRequestUpdate {
  status: ServiceRequestStatus;
  resolution?: string | null;
  staff_notes?: string | null;
  assigned_to?: string | null;
}

/** POST /customer-booking-workflow/cancellation-requests/{id}/decision (booking.update). */
export interface CancellationDecision {
  decision: "Approve" | "Reject";
  staff_notes?: string | null;
}

/** GET /customer-portal/activity-timeline */
export interface ActivityEvent {
  type: string;
  title: string;
  description: string;
  status: string | null;
  record_id: string;
  occurred_at: string;
}
export interface ActivityTimeline {
  items: ActivityEvent[];
  total: number;
}

/** GET /customer-portal/lifecycle-overview */
export interface LifecycleOverview {
  bookings: { total: number; confirmed: number; completed: number };
  payments: { verified_gross: string; processed_refunds: string; net_verified: string };
  notifications: { unread: number };
  after_sales: { open_requests: number };
}
