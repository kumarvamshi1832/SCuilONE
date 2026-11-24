import { parseBackendDate } from "./bookingJourney";
import type { SiteVisit, SiteVisitUpdate } from "../types/siteVisit";

/**
 * Site visit rules shared by the staff and customer screens. Statuses, outcomes and interest levels are the values the
 * backend accepts (schemas/site_visit.py); nothing here invents a new one.
 *
 * Backend rules these helpers mirror (routes/site_visits.py, PATCH /api/v1/site-visits/{id}):
 *   - Completed / Cancelled / No-show visits cannot be rescheduled or reassigned (400)
 *   - the end must be after the start (400)
 *   - Cancelled needs a cancellation_reason unless one is already stored (400)
 *   - Rescheduled needs a new scheduled_start or scheduled_end (400)
 *   - changing the schedule without sending a status makes the backend set "Rescheduled"
 *   - follow_up_date is optional, even when follow_up_required is true
 */

export const OPEN_VISIT_STATUSES = ["Requested", "Scheduled", "Rescheduled"] as const;
export const CLOSED_VISIT_STATUSES = ["Completed", "Cancelled", "No-show"] as const;

export const isClosedVisit = (status: string): boolean => (CLOSED_VISIT_STATUSES as readonly string[]).includes(status);

/* ───────────── date helpers (backend = naive UTC, forms = local time) ───────────── */

const pad = (n: number) => String(n).padStart(2, "0");
export const toDateInputValue = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInputValue = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const localInstant = (date: string, time: string): Date => new Date(`${date}T${time}`);

/** Current schedule of a visit as local date / start / end form values. */
export const scheduleFormValues = (visit: Pick<SiteVisit, "scheduled_start" | "scheduled_end">) => {
  const start = parseBackendDate(visit.scheduled_start);
  const end = parseBackendDate(visit.scheduled_end);
  return {
    visitDate: start ? toDateInputValue(start) : "",
    startTime: start ? toTimeInputValue(start) : "",
    endTime: end ? toTimeInputValue(end) : "",
  };
};

/* ───────────── update form ───────────── */

export interface VisitUpdateForm {
  status: string;
  outcome: string;
  interestLevel: string;
  feedback: string;
  followUpRequired: boolean;
  /** YYYY-MM-DD */
  followUpDate: string;
  cancellationReason: string;
  visitDate: string;
  startTime: string;
  endTime: string;
}

export const initialUpdateForm = (visit: SiteVisit): VisitUpdateForm => {
  const followUp = visit.follow_up_date ? parseBackendDate(visit.follow_up_date) : null;
  return {
    status: visit.status,
    outcome: visit.outcome ?? "",
    interestLevel: visit.interest_level ?? "",
    feedback: visit.buyer_feedback ?? "",
    followUpRequired: visit.follow_up_required,
    followUpDate: followUp ? toDateInputValue(followUp) : "",
    cancellationReason: visit.cancellation_reason ?? "",
    ...scheduleFormValues(visit),
  };
};

export const scheduleChanged = (visit: SiteVisit, form: VisitUpdateForm): boolean => {
  const current = scheduleFormValues(visit);
  return form.visitDate !== current.visitDate || form.startTime !== current.startTime || form.endTime !== current.endTime;
};

export type VisitUpdateErrors = Partial<Record<keyof VisitUpdateForm, string>>;

export interface VisitUpdateResult {
  errors: VisitUpdateErrors;
  /** Present only when there are no errors. */
  payload?: SiteVisitUpdate;
}

/** Validates the update form exactly as the backend will, and builds the PATCH body. Invalid forms never produce a payload. */
export const buildVisitUpdate = (visit: SiteVisit, form: VisitUpdateForm, now: Date = new Date()): VisitUpdateResult => {
  const errors: VisitUpdateErrors = {};
  const closed = isClosedVisit(visit.status);
  const changed = !closed && scheduleChanged(visit, form);
  const rescheduling = form.status === "Rescheduled";
  const terminalTarget = (CLOSED_VISIT_STATUSES as readonly string[]).includes(form.status);

  if (!form.status) errors.status = "Choose a status.";

  if (changed || (rescheduling && !closed)) {
    if (!form.visitDate) errors.visitDate = "Select the new visit date.";
    if (!form.startTime) errors.startTime = "Select the new start time.";
    if (!form.endTime) errors.endTime = "Select the new end time.";
    if (form.visitDate && form.startTime && form.endTime) {
      const start = localInstant(form.visitDate, form.startTime);
      const end = localInstant(form.visitDate, form.endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) errors.visitDate = "Enter a valid date and time.";
      else if (end <= start) errors.endTime = "End time must be after the start time.";
      else if (rescheduling && start.getTime() <= now.getTime()) errors.visitDate = "The new appointment must be in the future.";
    }
  }
  if (rescheduling && !closed && !changed && !errors.visitDate && !errors.startTime && !errors.endTime) {
    errors.visitDate = "A rescheduled visit needs a new date or time. Change the schedule above.";
  }
  if (changed && terminalTarget && !closed) {
    errors.status = `Don't change the schedule while marking the visit ${form.status}. Reschedule first, or leave the schedule unchanged.`;
  }
  if (closed && rescheduling) errors.status = "Completed, cancelled or no-show visits cannot be rescheduled.";

  if (form.status === "Cancelled" && !form.cancellationReason.trim() && !visit.cancellation_reason) {
    errors.cancellationReason = "Provide a cancellation reason when cancelling a site visit.";
  }
  if (form.cancellationReason.length > 2000) errors.cancellationReason = "The reason cannot exceed 2000 characters.";
  if (form.feedback.length > 5000) errors.feedback = "Feedback cannot exceed 5000 characters.";

  if (Object.keys(errors).length > 0) return { errors };

  // Changing the time of a plain "Scheduled" visit is a reschedule; say so explicitly.
  const status = changed && form.status === visit.status && visit.status === "Scheduled" ? "Rescheduled" : form.status;

  const payload: SiteVisitUpdate = {
    status,
    outcome: (form.outcome || null) as SiteVisitUpdate["outcome"],
    interest_level: (form.interestLevel || null) as SiteVisitUpdate["interest_level"],
    buyer_feedback: form.feedback.trim() || null,
    follow_up_required: form.followUpRequired,
    // Noon local time keeps the chosen calendar day in every timezone.
    follow_up_date: form.followUpRequired && form.followUpDate ? localInstant(form.followUpDate, "12:00").toISOString() : null,
  };
  if (status === "Cancelled") payload.cancellation_reason = form.cancellationReason.trim() || visit.cancellation_reason || null;
  if (changed) {
    payload.scheduled_start = localInstant(form.visitDate, form.startTime).toISOString();
    payload.scheduled_end = localInstant(form.visitDate, form.endTime).toISOString();
  }
  return { errors, payload };
};

/* ───────────── follow-up ───────────── */

export type FollowUpState = "none" | "pending" | "overdue";

/**
 * The backend stores whether a follow-up is required and its date, but not whether it was done, so only "pending" and
 * "overdue" can be told apart; a completed follow-up cannot be shown.
 */
export const followUpState = (
  visit: Pick<SiteVisit, "follow_up_required" | "follow_up_date">,
  now: Date = new Date()
): FollowUpState => {
  if (!visit.follow_up_required) return "none";
  const due = visit.follow_up_date ? parseBackendDate(visit.follow_up_date) : null;
  if (!due) return "pending";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() < startOfToday.getTime() ? "overdue" : "pending";
};

/* ───────────── customer portal grouping ───────────── */

export interface PortalVisitLike {
  id: string;
  status: string;
  scheduled_start?: string;
  property_id?: string;
  property?: { id: string } | null;
}

export type PortalVisitGroup = "upcoming" | "completed" | "rescheduled" | "cancelled";

export const portalVisitGroup = (status: string): PortalVisitGroup => {
  if (status === "Completed") return "completed";
  if (status === "Rescheduled") return "rescheduled";
  if (status === "Cancelled" || status === "No-show") return "cancelled";
  return "upcoming"; // Requested, Scheduled
};

const startTime = (v: PortalVisitLike): number => parseBackendDate(v.scheduled_start)?.getTime() ?? 0;

/** Sections in display order; upcoming soonest-first, the rest newest-first. Empty groups are kept so the page can say so. */
export const groupPortalVisits = <T extends PortalVisitLike>(visits: T[]): Record<PortalVisitGroup, T[]> => {
  const groups: Record<PortalVisitGroup, T[]> = { upcoming: [], rescheduled: [], completed: [], cancelled: [] };
  for (const visit of visits) groups[portalVisitGroup(visit.status)].push(visit);
  groups.upcoming.sort((a, b) => startTime(a) - startTime(b));
  (["rescheduled", "completed", "cancelled"] as const).forEach((key) => groups[key].sort((a, b) => startTime(b) - startTime(a)));
  return groups;
};

/** "Visit N" per property, numbered in the order the visits were scheduled. */
export const visitNumbers = <T extends PortalVisitLike>(visits: T[]): Map<string, number> => {
  const byProperty = new Map<string, T[]>();
  for (const v of visits) {
    const key = v.property?.id ?? v.property_id ?? "unknown";
    byProperty.set(key, [...(byProperty.get(key) ?? []), v]);
  }
  const numbers = new Map<string, number>();
  byProperty.forEach((list) => {
    [...list].sort((a, b) => startTime(a) - startTime(b)).forEach((v, index) => numbers.set(v.id, index + 1));
  });
  return numbers;
};
