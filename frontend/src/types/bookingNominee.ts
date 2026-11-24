/**
 * Booking nominees. Mirrors BookingNomineeInput / BookingNomineeResponse in backend/app/schemas/booking.py.
 * Used by staff (PUT /api/v1/bookings/{id}/nominees) and by the customer portal
 * (PUT /api/v1/customer-portal/booking-requests/{id}/buyer-details).
 */

export const NOMINEE_LIMITS = {
  maxNominees: 20,
  nameMin: 2,
  nameMax: 200,
  relationshipMin: 2,
  relationshipMax: 80,
  phoneMax: 30,
  addressMax: 2000,
  remarksMax: 2000,
  buyerAddressMax: 2000,
  buyerPhoneMin: 7,
} as const;

/** Choices for a nominee's relationship to the buyer (the API stores it as free text, 2-80 characters). */
export const NOMINEE_RELATIONSHIPS = ["Father", "Mother", "Sister", "Brother", "Cousin", "Son", "Daughter"] as const;

/** A nominee as returned by the API. `allocation_percentage` is a Decimal - serialised as a string or a number. */
export interface BookingNominee {
  id: string;
  booking_id?: string;
  nominee_name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  allocation_percentage: string | number | null;
  remarks: string | null;
  created_at?: string;
  updated_at?: string;
}

/** One nominee in a request body. */
export interface BookingNomineeInput {
  nominee_name: string;
  relationship: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  allocation_percentage?: string | null;
  remarks?: string | null;
}

/** What the form inputs hold (everything is a string). `key` identifies the row for React and error mapping. */
export interface NomineeDraft {
  key: string;
  nominee_name: string;
  relationship: string;
  phone: string;
  email: string;
  date_of_birth: string;
  address: string;
  allocation_percentage: string;
  remarks: string;
}

export type NomineeField = Exclude<keyof NomineeDraft, "key">;
export type NomineeFieldErrors = Partial<Record<NomineeField, string>>;
/** Errors per row key, plus `form` for list-level problems such as "percentages must total 100%". */
export interface NomineeErrors {
  rows: Record<string, NomineeFieldErrors>;
  form: string | null;
}
