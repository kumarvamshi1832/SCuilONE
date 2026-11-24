/**
 * Append-only history records written by the backend.
 *   GET /api/v1/site-visits/{id}/history               site_visit.view
 *   GET /api/v1/buyer-requirements/{id}/revisions      buyer_requirement.view
 */

/** CREATED | RESCHEDULED | STATUS_CHANGED | UPDATED | BASELINE (rows written before history existed). */
export interface SiteVisitHistoryEntry {
  id: string;
  event_type: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
}

/** `snapshot` is the complete requirement as it was after the change. */
export interface BuyerRequirementRevision {
  id: string;
  revision_number: number;
  snapshot: Record<string, unknown>;
  change_reason: string | null;
  changed_by: string | null;
  created_at: string;
}
