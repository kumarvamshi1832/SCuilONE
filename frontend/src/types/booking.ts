import type { BookingNominee, BookingNomineeInput } from "./bookingNominee";

export const BOOKING_STATUSES = [
  "Pending",
  "Confirmed",
  "Completed",
  "Cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_PREFERENCES = [
  "Full Payment",
  "Installments",
] as const;
export type PaymentPreference = (typeof PAYMENT_PREFERENCES)[number];

export interface Booking {
  id: string;
  tenant_id: string;
  property_id: string;
  lead_id?: string | null;
  buyer_requirement_id?: string | null;
  buyer_name: string;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  buyer_address?: string | null;
  /** Set when the customer (or staff) has submitted buyer and nominee details. */
  buyer_details_submitted_at?: string | null;
  nominees?: BookingNominee[];
  booking_amount: number | string;
  agreed_price: number | string;
  payment_preference?: PaymentPreference | string;
  installment_request_notes?: string | null;
  refund_amount: number | string;
  status: BookingStatus | string;
  booking_date: string;
  cancellation_reason?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Enriched UI fields
  property_name?: string;
  property_unit?: string;
  property_city?: string;
  total_paid?: number;
  lead_name?: string;
}

export interface BookingCreate {
  property_id: string;
  lead_id?: string | null;
  buyer_requirement_id?: string | null;
  buyer_name: string;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  buyer_address?: string | null;
  nominees?: BookingNomineeInput[];
  booking_amount: number;
  payment_preference?: PaymentPreference | string;
  installment_request_notes?: string | null;
  agreed_price?: number | null;
}

export interface BookingUpdate {
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  status?: "Pending" | "Confirmed" | "Completed" | string;
}

export interface BookingCancel {
  cancellation_reason: string;
}
