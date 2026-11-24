/**
 * Negotiation offers. Staff API: /api/v1/property-offers. Customer API: /api/v1/customer-portal/property-offers.
 * An offer belongs to a property match (one buyer requirement + one property); every offer of a match forms its thread.
 *
 * Who may do what (backend/app/routes/property_offers.py and customer_portal.py):
 *   - Staff PROPOSE a price                 POST   /property-offers/                 -> offer_type "Seller"
 *   - Staff RECORD an offline buyer offer   POST   /property-offers/record-buyer-offer -> offer_type "Buyer"
 *   - Staff respond to a BUYER offer        POST   /property-offers/{id}/decision    Accepted | Rejected | Countered
 *   - Owner / admin approval                POST   /property-offers/{id}/owner-approval?approved=
 *   - Customer submits an offer             POST   /customer-portal/property-offers  -> offer_type "Buyer"
 *   - Customer responds to a SELLER offer   POST   /customer-portal/property-offers/{id}/decision  Accepted | Rejected | Countered
 * Withdrawing is not allowed for either side.
 */

export type OfferType = "Buyer" | "Seller";
export type OfferStatus =
  | "Submitted"
  | "Countered"
  | "Accepted"
  | "Rejected"
  | "Withdrawn"
  | "Pending Owner Approval"
  | "Expired";
export type OfferDecisionKind = "Accepted" | "Rejected" | "Countered" | "Withdrawn";

/** PropertyOfferResponse. The price arrives as a decimal string. */
export interface PropertyOffer {
  id: string;
  tenant_id: string;
  property_match_id: string;
  parent_offer_id: string | null;
  offered_price: string | number;
  /** One-time | Monthly | Quarterly | Yearly */
  price_frequency: string;
  status: OfferStatus | string;
  offer_type: OfferType | string;
  terms: string | null;
  response_notes: string | null;
  created_by: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  /** Offers lapse at this time (default 7 days after submission). */
  expires_at?: string | null;
  owner_approved_by?: string | null;
  owner_approved_at?: string | null;
  /** When the property is held for an accepted offer, until this time. */
  hold_expires_at?: string | null;
}

export interface PropertyOfferCreate {
  property_match_id: string;
  offered_price: number;
  terms?: string | null;
  /** Must be in the future when given. */
  expires_at?: string | null;
}

export interface PropertyOfferDecision {
  decision: OfferDecisionKind;
  response_notes?: string | null;
  counter_price?: number | null;
  counter_terms?: string | null;
}
