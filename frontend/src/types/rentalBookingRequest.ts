import type { RentalAgreement, RentalFrequency } from "./rental";

/**
 * Rent / lease BOOKING REQUESTS - a separate lifecycle from rental agreements.
 * Mirrors RentalBookingRequestResponse (backend/app/schemas/rental.py) for staff and _portal_rental_booking_request_payload
 * (backend/app/routes/customer_portal.py) for the customer. Decimals are serialised as strings.
 *
 *   Requested -> Approved -> Agreement Created -> Activated
 *   Requested -> Rejected | Cancelled | Expired (hold lapsed)       Approved / Agreement Created -> Cancelled | Expired
 */
export const RENTAL_BOOKING_REQUEST_STATUSES = [
  "Requested",
  "Approved",
  "Agreement Created",
  "Activated",
  "Rejected",
  "Cancelled",
  "Expired",
  "Expired - Payment Review",
] as const;
export type RentalBookingRequestStatus = (typeof RENTAL_BOOKING_REQUEST_STATUSES)[number];

/** Statuses in which a request still holds the property (the server expires the hold lazily on read). */
export const RENTAL_REQUEST_OPEN_STATUSES: string[] = ["Requested", "Approved", "Agreement Created"];

export type RentalBookingType = "Rent" | "Lease";
export type LateFeeType = "Fixed" | "Percentage";

type Money = string | number;

export interface RentalBookingRequest {
  id: string;
  tenant_id?: string;
  property_id: string;
  booking_type: RentalBookingType | string;
  channel: "Portal" | "Walk-in" | string;
  portal_user_id: string | null;
  contact_id: string | null;
  account_id?: string | null;
  lead_id: string | null;
  buyer_requirement_id: string | null;
  property_match_id: string | null;
  accepted_offer_id: string | null;
  rental_agreement_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  proposed_rent_amount: Money;
  approved_rent_amount: Money | null;
  rent_frequency: RentalFrequency | string;
  proposed_deposit_amount: Money;
  approved_deposit_amount: Money | null;
  maintenance_amount: Money;
  maintenance_frequency: RentalFrequency | string;
  desired_start_date: string;
  desired_end_date: string | null;
  duration_months: number | null;
  lock_in_months: number;
  notice_period_days: number;
  due_day: number;
  /** Staff responses only. */
  late_fee_type?: LateFeeType | string;
  late_fee_amount?: Money;
  late_fee_grace_days?: number;
  status: RentalBookingRequestStatus | string;
  hold_created_at: string | null;
  hold_expires_at: string | null;
  expired_at: string | null;
  terms_notes: string | null;
  customer_notes: string | null;
  /** Staff responses only - never returned to the customer. */
  staff_notes?: string | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  reviewed_by?: string | null;
  reviewed_at: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /customer-portal/rental-booking-requests/{id}: the request plus its agreement once the agreement left Draft / Cancelled. */
export interface PortalRentalBookingRequestDetail extends RentalBookingRequest {
  agreement?: Partial<RentalAgreement> & { id: string; status: string };
}

/** GET /customer-portal/rental-properties - Available Rent / Lease listings only. */
export interface EligibleRentalProperty {
  id: string;
  name: string;
  property_type: string;
  listing_type: RentalBookingType | string;
  city: string | null;
  state: string | null;
  address: string | null;
  price: string;
  price_frequency: string | null;
  security_deposit: string | null;
  minimum_term_months: number | null;
  maximum_term_months: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string | null;
  status: string;
}

/** POST /customer-portal/rental-booking-requests */
export interface RentalBookingRequestPortalCreate {
  property_id: string;
  booking_type?: RentalBookingType;
  buyer_requirement_id?: string | null;
  property_match_id?: string | null;
  accepted_offer_id?: string | null;
  proposed_rent_amount?: number | null;
  proposed_deposit_amount?: number | null;
  desired_start_date: string;
  desired_end_date?: string | null;
  duration_months?: number | null;
  customer_notes?: string | null;
}

/** POST /rentals/booking-requests (staff walk-in; booking.create). One of contact_id / lead_id / buyer_requirement_id is required. */
export interface RentalBookingRequestWalkInCreate {
  property_id: string;
  booking_type?: RentalBookingType;
  contact_id?: string | null;
  account_id?: string | null;
  lead_id?: string | null;
  buyer_requirement_id?: string | null;
  property_match_id?: string | null;
  accepted_offer_id?: string | null;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  proposed_rent_amount: number;
  proposed_deposit_amount?: number;
  maintenance_amount?: number;
  maintenance_frequency?: RentalFrequency;
  desired_start_date: string;
  desired_end_date?: string | null;
  duration_months?: number | null;
  lock_in_months?: number;
  notice_period_days?: number;
  due_day?: number;
  late_fee_type?: LateFeeType;
  late_fee_amount?: number;
  late_fee_grace_days?: number;
  hold_hours?: number | null;
  terms_notes?: string | null;
  staff_notes?: string | null;
}

/** POST /rentals/booking-requests/{id}/decision (booking.update). Approve may adjust the commercial terms; Reject may carry a reason. */
export interface RentalBookingRequestDecision {
  decision: "Approve" | "Reject";
  approved_rent_amount?: number | null;
  approved_deposit_amount?: number | null;
  maintenance_amount?: number | null;
  maintenance_frequency?: RentalFrequency | null;
  desired_start_date?: string | null;
  desired_end_date?: string | null;
  duration_months?: number | null;
  lock_in_months?: number | null;
  notice_period_days?: number | null;
  due_day?: number | null;
  late_fee_type?: LateFeeType | null;
  late_fee_amount?: number | null;
  late_fee_grace_days?: number | null;
  hold_hours?: number | null;
  terms_notes?: string | null;
  staff_notes?: string | null;
  rejection_reason?: string | null;
}
