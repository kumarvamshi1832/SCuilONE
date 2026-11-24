/**
 * Customer Portal buyer requirements (Real Estate).
 * Mirrors backend/app/routes/customer_portal.py and backend/app/schemas/customer_portal.py.
 * Ownership (tenant, contact, assignee, status) is supplied by the server from the
 * authenticated portal identity and is intentionally NOT part of the create payload.
 */

export type PortalRequirementType = "Buy" | "Rent" | "Lease";

/** POST /api/v1/customer-portal/buyer-requirements */
export interface PortalBuyerRequirementCreate {
  requirement_type: PortalRequirementType;
  property_type: string;
  preferred_city: string;
  preferred_location?: string | null;
  min_budget?: number | null;
  max_budget?: number | null;
  bedrooms?: number | null;
  min_area?: number | null;
  max_area?: number | null;
  area_unit?: string;
  notes?: string | null;
  budget_frequency?: "One-time" | "Monthly" | "Quarterly" | "Yearly" | null;
  min_duration_months?: number | null;
  max_duration_months?: number | null;
}

/** Response of the list / detail / create endpoints (decimals are serialised as strings). */
export interface PortalBuyerRequirement {
  id: string;
  requirement_type: PortalRequirementType | string;
  property_type: string;
  preferred_city: string | null;
  preferred_location: string | null;
  min_budget: string | null;
  max_budget: string | null;
  bedrooms: number | null;
  min_area: string | null;
  max_area: string | null;
  area_unit: string;
  status: string;
  /** Recurring budget period (One-time for a purchase) and the lease/rent duration the customer wants, in months. */
  budget_frequency?: string | null;
  min_duration_months?: number | null;
  max_duration_months?: number | null;
  created_at: string;
  updated_at: string;
}

export interface PortalMatchedPropertyImage {
  image_url: string;
  image_type: string | null;
  is_primary: boolean;
}

export interface PortalMatchedProperty {
  id: string;
  name: string;
  unit_number: string | null;
  property_type: string;
  listing_type: string;
  description: string | null;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string | null;
  price: string;
  currency: string;
  area: string | null;
  area_unit: string;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string;
  status: string;
  images: PortalMatchedPropertyImage[];
}

/** Item of the /matches and /shortlist endpoints. */
export interface PortalPropertyMatch {
  match_id: string;
  match_status: string;
  property: PortalMatchedProperty;
  requirement_id?: string;
  requirement_type?: string;
}

/**
 * What a price negotiation needs to know about its property. A full PortalPropertyMatch satisfies it; for a Reserved
 * property (which the matches endpoint no longer lists) only the ids and name are known, so the rest is optional.
 */
export interface NegotiationTarget {
  match_id: string;
  property: {
    id: string;
    name: string | null;
    unit_number?: string | null;
    price?: string | null;
    currency?: string | null;
    listing_type?: string | null;
    property_type?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    security_deposit?: string | null;
    images?: PortalMatchedPropertyImage[];
  };
  requirement_id?: string;
  requirement_type?: string;
}

export interface PortalShortlistEntry {
  id: string;
  buyer_requirement_id: string;
  property_match_id: string;
  created_at: string;
}

/** POST /api/v1/customer-portal/site-visits/requests */
export interface PortalSiteVisitRequestCreate {
  property_match_id: string;
  scheduled_start: string;
  scheduled_end: string;
}

export interface PortalSiteVisitRequestResult {
  id: string;
  property_match_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  message?: string;
}

/** A shortlisted property together with the requirement it belongs to. */
export interface PortalShortlistedProperty extends PortalPropertyMatch {
  requirement: PortalBuyerRequirement;
}

/** GET /api/v1/customer-portal/buyer-requirements/{id}/revisions (newest first). Staff identities and notes are never included. */
export type PortalRevisionEvent = "created" | "baseline" | "first_recorded" | "updated";

export interface PortalRevisionChange {
  /** Requirement field key, e.g. "min_budget". */
  field: string;
  label: string;
  previous: string | number | null;
  updated: string | number | null;
}

export interface PortalRequirementRevision {
  id: string;
  revision_number: number;
  event: PortalRevisionEvent | string;
  /** "You" (submitted in the portal) or "Our team". */
  updated_by: string;
  /** Naive UTC timestamp. */
  created_at: string;
  /** The customer-visible fields as they were after this revision. */
  snapshot: Record<string, string | number | null>;
  /** Fields that differ from the previous revision (empty for the first one). */
  changes: PortalRevisionChange[];
}
