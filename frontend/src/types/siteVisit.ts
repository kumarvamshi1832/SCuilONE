export const SITE_VISIT_STATUSES = [
  "Scheduled",
  "Completed",
  "Cancelled",
  "Rescheduled",
  "No-show",
] as const;
export type SiteVisitStatus = (typeof SITE_VISIT_STATUSES)[number];

export const SITE_VISIT_OUTCOMES = [
  "Interested",
  "Follow-up Required",
  "Not Interested",
  "Negotiation",
  "Other",
] as const;
export type SiteVisitOutcome = (typeof SITE_VISIT_OUTCOMES)[number];

export const INTEREST_LEVELS = [
  "Interested",
  "Maybe",
  "Not Interested",
] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];

export interface SiteVisit {
  id: string;
  tenant_id: string;
  property_match_id: string;
  assigned_to?: string | null;
  created_by?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: SiteVisitStatus | string;
  outcome?: SiteVisitOutcome | string | null;
  buyer_feedback?: string | null;
  interest_level?: InterestLevel | string | null;
  follow_up_required: boolean;
  follow_up_date?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
  // Enriched UI fields
  property_name?: string;
  buyer_name?: string;
  assigned_to_name?: string;
}

export interface SiteVisitCreate {
  property_match_id: string;
  scheduled_start: string;
  scheduled_end: string;
  assigned_to?: string | null;
}

export interface SiteVisitUpdate {
  scheduled_start?: string;
  scheduled_end?: string;
  assigned_to?: string | null;
  status?: SiteVisitStatus | string;
  outcome?: SiteVisitOutcome | string | null;
  buyer_feedback?: string | null;
  interest_level?: InterestLevel | string | null;
  follow_up_required?: boolean;
  follow_up_date?: string | null;
  cancellation_reason?: string | null;
}
