import { Link } from "react-router-dom";
import { formatBookingDate, parseBackendDate } from "../../utils/bookingJourney";
import { groupPortalVisits, visitNumbers, type PortalVisitGroup } from "../../utils/siteVisitHelpers";
import { SiteVisitStatusBadge } from "./SiteVisitWidgets";
import type { PortalSiteVisit } from "../../types/customerPortal";
import "./SiteVisitWidgets.css";

const SECTIONS: Array<{ key: PortalVisitGroup; title: string; empty: string }> = [
  { key: "upcoming", title: "Upcoming site visits", empty: "You have no upcoming site visits." },
  { key: "rescheduled", title: "Rescheduled visits", empty: "None of your visits has been rescheduled." },
  { key: "completed", title: "Completed site visits", empty: "You have no completed site visits yet." },
  { key: "cancelled", title: "Cancelled visits", empty: "You have no cancelled visits." },
];

const dateText = (value?: string): string => {
  const d = parseBackendDate(value);
  return d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date to be confirmed";
};
const timeText = (start?: string, end?: string): string => {
  const s = parseBackendDate(start);
  const e = parseBackendDate(end);
  if (!s) return "Time to be confirmed";
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return e ? `${fmt(s)} – ${fmt(e)}` : fmt(s);
};

/**
 * The customer's own site visits (GET /api/v1/customer-portal/site-visits, scoped to the signed-in customer by the
 * backend) in four sections. Only what that endpoint returns is shown: property, location, date and time, status,
 * outcome, interest, the team's notes and follow-up date, and the customer's own feedback.
 *
 * The endpoint does not return the assigned staff member, a property image or a cancellation reason, and there is no
 * customer reschedule/cancel API, so those are not shown; customers are pointed to the existing chat instead.
 */
export default function PortalSiteVisitSections({ visits }: { visits: PortalSiteVisit[] }) {
  const groups = groupPortalVisits(visits);
  const numbers = visitNumbers(visits);

  return (
    <div>
      {SECTIONS.map(({ key, title, empty }) => (
        <section key={key} className="svp-section" aria-label={title}>
          <h3>
            {title} <span className="svp-count">{groups[key].length}</span>
          </h3>
          {groups[key].length === 0 ? (
            <p className="svp-muted" style={{ margin: 0 }}>{empty}</p>
          ) : (
            <div className="svp-grid">
              {groups[key].map((v) => {
                const location = [v.property?.address, v.property?.city, v.property?.state].filter(Boolean).join(", ");
                return (
                  <article key={v.id} className="svp-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div>
                        <h4>{v.property?.name || v.property_title || "Property visit"}</h4>
                        <div className="svp-muted">
                          {v.property?.property_type || "Property"} · Site visit {numbers.get(v.id) ?? 1}
                        </div>
                      </div>
                      <SiteVisitStatusBadge status={v.status} />
                    </div>

                    <div>
                      <div className="svp-when">{dateText(v.scheduled_start)}</div>
                      <div className="svp-muted">{timeText(v.scheduled_start, v.scheduled_end)}</div>
                      {v.status === "Requested" && <div className="svp-muted">Waiting for our team to confirm this time.</div>}
                    </div>

                    <div className="svp-muted">{location || "Location details on file"}</div>

                    {(v.outcome || v.interest_level) && (
                      <div style={{ fontSize: "0.85rem" }}>
                        {v.outcome && (
                          <div>
                            <strong>Visit outcome:</strong> {v.outcome}
                          </div>
                        )}
                        {v.interest_level && (
                          <div>
                            <strong>Interest level:</strong> {v.interest_level}
                          </div>
                        )}
                      </div>
                    )}

                    {v.staff_feedback && (
                      <div className="svj-note" style={{ margin: 0 }}>
                        <strong>Notes from our team:</strong> {v.staff_feedback}
                      </div>
                    )}

                    {v.follow_up_required && (
                      <div style={{ fontSize: "0.85rem" }}>
                        <strong>Follow-up:</strong>{" "}
                        {v.follow_up_date ? `our team will follow up around ${formatBookingDate(v.follow_up_date)}` : "our team will follow up with you"}
                      </div>
                    )}

                    {v.customer_feedback && (
                      <div style={{ fontSize: "0.85rem" }}>
                        <strong>Your feedback:</strong> {v.customer_feedback}
                        {v.customer_rating ? ` (${v.customer_rating}/5)` : ""}
                      </div>
                    )}

                    {(key === "upcoming" || key === "rescheduled") && (
                      <div className="svp-muted">
                        Need to change this visit? <Link to="/portal/chat">Message our team</Link> to reschedule or cancel.
                      </div>
                    )}
                    {key === "completed" && !v.customer_feedback && (() => {
                      const isRental = Boolean(
                        v.property?.property_type?.toLowerCase().includes("rent") ||
                        v.property?.property_type?.toLowerCase().includes("lease") ||
                        v.property?.name?.toLowerCase().includes("rent") ||
                        v.property?.name?.toLowerCase().includes("lease") ||
                        v.property_title?.toLowerCase().includes("rent") ||
                        v.property_title?.toLowerCase().includes("lease")
                      );
                      return (
                        <div className="svp-muted">
                          Visited? <Link to="/portal/booking-journey">Share your feedback</Link> {isRental ? "to continue towards a rental." : "to continue towards a booking."}
                        </div>
                      );
                    })()}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
