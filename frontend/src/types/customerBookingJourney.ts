/**
 * Customer booking journey (Real Estate).
 * Mirrors backend/app/routes/customer_booking_journey.py and
 * backend/app/models/customer_booking_journey.py. Only fields that exist there are typed.
 */

import type { BookingNominee, BookingNomineeInput } from "./bookingNominee";

export const VISIT_FEEDBACK_DECISIONS = ["Interested", "Maybe", "Not Interested"] as const;
export type VisitFeedbackDecision = (typeof VISIT_FEEDBACK_DECISIONS)[number];

export const PAYMENT_PREFERENCES = ["Full Payment", "Installments"] as const;
export type PaymentPreference = (typeof PAYMENT_PREFERENCES)[number];

export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "UPI", "Cheque", "Demand Draft", "Card", "Other"] as const;
export type BookingPaymentMethod = (typeof PAYMENT_METHODS)[number];

/** CHECK constraint ck_customer_booking_request_status. */
export type BookingRequestStatus =
  | "Requested"
  | "Approved"
  | "Confirmed"
  | "Completed"
  | "Rejected"
  | "Expired"
  | "Expired - Payment Review"
  | "Cancelled";

/** CHECK constraint ck_customer_booking_request_agreement_status. */
export type AgreementStatus =
  | "Not Prepared"
  | "Prepared"
  | "Customer Acknowledged"
  | "Verified"
  | "Rejected";

export type JourneyFilePurpose = "Signed Agreement" | "Payment Proof";

/* ─── Request bodies ─── */

export interface VisitFeedbackInput {
  rating?: number | null;
  feedback?: string | null;
  decision: VisitFeedbackDecision;
}

export interface BookingRequestInput {
  payment_preference: PaymentPreference;
  notes?: string | null;
}

export interface AgreementAcknowledgeInput {
  full_name: string;
  confirm: boolean;
}

export interface BookingPaymentInput {
  installment_id?: string | null;
  amount: number;
  payment_method: BookingPaymentMethod;
  transaction_reference?: string | null;
  /** ISO date-time. */
  payment_date?: string | null;
  notes?: string | null;
}

export interface BookingDecisionInput {
  decision: "Approve" | "Reject";
  agreed_price?: number | null;
  booking_amount?: number | null;
  payment_preference: PaymentPreference;
  notes?: string | null;
  customer_message?: string | null;
}

export interface HoldExtensionInput {
  hours: number;
  reason: string;
}

export interface AgreementVerifyInput {
  verified: boolean;
  signed_file_id?: string | null;
  notes?: string | null;
}

/* ─── Responses ─── */

/** `_request_payload` of the backend. Decimals are serialised as strings. */
export interface BookingRequest {
  id: string;
  status: BookingRequestStatus | string;
  property_id: string;
  site_visit_id: string;
  booking_id: string | null;
  hold_expires_at: string | null;
  extension_count: number;
  agreed_price: string | null;
  booking_amount: string | null;
  payment_preference: PaymentPreference | string;
  payment_instructions: string | null;
  agreement_status: AgreementStatus | string;
  agreement_version: number;
  agreement_text: string | null;
  agreement_acknowledged_at: string | null;
  final_confirmed_at: string | null;
  /** "Customer" or "Staff"; null when not confirmed (or confirmed before this was recorded). */
  final_confirmed_by?: string | null;
  customer_notes: string | null;
  customer_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface JourneyFile {
  id: string;
  purpose: JourneyFilePurpose | string;
  filename: string;
  content_type: string;
  file_size: number;
  payment_id: string | null;
  agreement_version: number | null;
  uploaded_at: string;
  /** Present on the detail responses. */
  file_url?: string;
}

/** Payment as listed inside a booking request detail (customer and staff variants are normalised). */
export interface JourneyPayment {
  id: string;
  /** The instalment this payment is allocated to (null for the booking amount). */
  installment_id?: string | null;
  amount: string;
  method: string | null;
  reference: string | null;
  status: string;
  payment_date: string | null;
  verified_at: string | null;
}

export interface JourneyBookingSummary {
  id: string;
  status: string;
  booking_amount: string;
  agreed_price: string;
  /** Buyer and nominee details, present on both the customer and the staff detail responses. */
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  buyer_address?: string | null;
  buyer_details_submitted_at?: string | null;
  nominees?: BookingNominee[];
}

/** PUT /api/v1/customer-portal/booking-requests/{id}/buyer-details (CustomerBookingDetailsUpdate). */
export interface BuyerDetailsInput {
  buyer_name: string;
  buyer_phone: string;
  buyer_email?: string | null;
  buyer_address?: string | null;
  nominees: BookingNomineeInput[];
}

export interface BuyerDetailsResult {
  booking_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_email: string | null;
  nominee_count: number;
  message: string;
}

export interface BookingRequestDetail extends BookingRequest {
  files: JourneyFile[];
  booking?: JourneyBookingSummary;
  payments: JourneyPayment[];
  /** Staff detail only. */
  staff_notes?: string | null;
}

export interface VisitFeedbackResult {
  message: string;
  decision: VisitFeedbackDecision;
  rating: number | null;
}

export interface AgreementAcknowledgeResult {
  agreement_status: AgreementStatus | string;
  acknowledged_at: string;
  message: string;
}

export interface BookingPaymentResult {
  id: string;
  booking_id: string;
  amount: string;
  status: string;
  message: string;
}

export interface JourneyFileUploadResult {
  id: string;
  purpose: string;
  filename: string;
  file_url: string;
  message: string;
}

export interface JourneyFileDownload {
  filename: string;
  content_type: string;
  download_url: string;
}

export interface PaymentInstructionsResult {
  message: string;
  payment_instructions: string;
}

/** GET /api/v1/customer-portal/bookings/{id}/handover (handover_payload). */
export interface PortalHandover {
  id: string;
  booking_id: string;
  status: "Pending" | "Scheduled" | "In Progress" | "Completed" | "On Hold" | string;
  scheduled_at: string | null;
  completed_at: string | null;
  customer_acknowledged_at: string | null;
  customer_notes: string | null;
}

export interface FinalConfirmResult {
  booking_id: string;
  booking_status: string;
  request_status: string;
  final_confirmed_at: string;
  verified_paid: string;
}
