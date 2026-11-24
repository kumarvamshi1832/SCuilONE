import { followUpState } from "../../utils/siteVisitHelpers";
import { formatBookingDate } from "../../utils/bookingJourney";
import type { SiteVisit } from "../../types/siteVisit";
import "../../pages/site-visits/SiteVisits.css";
import "./SiteVisitWidgets.css";

const BADGE_CLASS: Record<string, string> = {
  Scheduled: "badge-scheduled",
  Completed: "badge-completed",
  Cancelled: "badge-cancelled",
  Rescheduled: "badge-rescheduled",
  Requested: "badge-requested",
};

/** Status pill used by the staff and customer visit screens (same colours everywhere). */
export function SiteVisitStatusBadge({ status }: { status: string }) {
  return <span className={`badge ${BADGE_CLASS[status] ?? "badge-noshow"}`}>{status}</span>;
}

/** Pending / overdue follow-up pill; renders nothing when no follow-up is required. */
export function FollowUpBadge({ visit }: { visit: Pick<SiteVisit, "follow_up_required" | "follow_up_date"> }) {
  const state = followUpState(visit);
  if (state === "none") return null;
  const date = visit.follow_up_date ? formatBookingDate(visit.follow_up_date) : null;
  return (
    <span className={`badge ${state === "overdue" ? "badge-cancelled" : "badge-requested"}`}>
      {state === "overdue" ? "Follow-up overdue" : "Follow-up pending"}
      {date ? ` · ${date}` : " · no date set"}
    </span>
  );
}
