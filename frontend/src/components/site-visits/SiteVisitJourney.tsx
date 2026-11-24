import { useEffect, useMemo, useState } from "react";
import { getSiteVisitHistory } from "../../services/siteVisitService";
import { formatBookingDate, formatBookingDateTime, parseBackendDate } from "../../utils/bookingJourney";
import type { UserNameResolver } from "../../utils/recordHistory";
import { FollowUpBadge, SiteVisitStatusBadge } from "./SiteVisitWidgets";
import type { SiteVisitHistoryEntry } from "../../types/recordHistory";
import type { SiteVisit } from "../../types/siteVisit";
import "./SiteVisitWidgets.css";

const byCreated = (a: SiteVisit, b: SiteVisit) => (parseBackendDate(a.created_at)?.getTime() ?? 0) - (parseBackendDate(b.created_at)?.getTime() ?? 0);

/** The schedule the visit was first booked for: the earliest recorded history entry's schedule. */
const originalSchedule = (history: SiteVisitHistoryEntry[] | undefined): { start: string; end: string } | null => {
  const first = history?.[0];
  const start = first?.after_data?.scheduled_start;
  const end = first?.after_data?.scheduled_end;
  return typeof start === "string" && typeof end === "string" ? { start, end } : null;
};

/**
 * Every site visit of one customer and property (all visits sharing the property match), oldest first and numbered
 * "Site Visit 1, 2, ...". The visits come from the site visit list; the original scheduled date comes from each
 * visit's recorded history (GET /api/v1/site-visits/{id}/history), so a rescheduled visit shows both dates.
 */
export default function SiteVisitJourney({
  visits,
  currentId,
  propertyName,
  resolveUser,
}: {
  /** Visits that share the viewed visit's property match. */
  visits: SiteVisit[];
  currentId: string;
  propertyName: string;
  resolveUser?: UserNameResolver;
}) {
  const ordered = useMemo(() => [...visits].sort(byCreated), [visits]);
  const [histories, setHistories] = useState<Record<string, SiteVisitHistoryEntry[] | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      ordered.map((v) =>
        getSiteVisitHistory(v.id)
          .then((rows) => [v.id, rows] as const)
          .catch(() => [v.id, null] as const)
      )
    ).then((entries) => {
      if (cancelled) return;
      setHistories(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Re-read when a visit changes (updated_at) so the timeline never shows a stale schedule.
  }, [ordered.map((v) => `${v.id}:${v.updated_at}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-label="Site visit history for this customer and property" aria-busy={loading}>
      <h3 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#64748b", margin: "0 0 10px" }}>
        Site visit history · {propertyName}
      </h3>
      <ol className="svj-list">
        {ordered.map((visit, index) => {
          const original = originalSchedule(histories[visit.id] ?? undefined);
          const moved = original && (original.start !== visit.scheduled_start || original.end !== visit.scheduled_end);
          const createdBy = visit.created_by ? resolveUser?.(visit.created_by) ?? "A team member" : "Customer request";
          return (
            <li key={visit.id} className={`svj-item${visit.id === currentId ? " is-current" : ""}`}>
              <div className="svj-head">
                <span className="svj-title">Site Visit {index + 1}</span>
                <SiteVisitStatusBadge status={visit.status} />
                <FollowUpBadge visit={visit} />
                {visit.id === currentId && <span className="svp-muted">(this visit)</span>}
              </div>

              <dl className="svj-grid">
                <div>
                  <dt>{moved ? "Original scheduled date" : "Scheduled date"}</dt>
                  <dd className={moved ? "svj-prev" : undefined}>
                    {original && moved
                      ? `${formatBookingDateTime(original.start)} – ${formatBookingDateTime(original.end)}`
                      : `${formatBookingDateTime(visit.scheduled_start)} – ${formatBookingDateTime(visit.scheduled_end)}`}
                  </dd>
                </div>
                {moved && (
                  <div>
                    <dt>Updated scheduled date</dt>
                    <dd>{`${formatBookingDateTime(visit.scheduled_start)} – ${formatBookingDateTime(visit.scheduled_end)}`}</dd>
                  </div>
                )}
                <div>
                  <dt>Outcome</dt>
                  <dd>{visit.outcome ?? (visit.status === "Completed" ? "Not recorded" : "Pending")}</dd>
                </div>
                <div>
                  <dt>Interest level</dt>
                  <dd>{visit.interest_level ?? "Not specified"}</dd>
                </div>
                <div>
                  <dt>Follow-up required</dt>
                  <dd>
                    {visit.follow_up_required ? "Yes" : "No"}
                    {visit.follow_up_required && visit.follow_up_date ? ` · ${formatBookingDate(visit.follow_up_date)}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    {formatBookingDateTime(visit.created_at)} · {createdBy}
                  </dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatBookingDateTime(visit.updated_at)}</dd>
                </div>
                {visit.cancellation_reason && (
                  <div className="svj-wide">
                    <dt>Cancellation reason</dt>
                    <dd style={{ color: "#b91c1c" }}>{visit.cancellation_reason}</dd>
                  </div>
                )}
              </dl>
              {visit.buyer_feedback && (
                <p className="svj-note">
                  <strong>Feedback:</strong> {visit.buyer_feedback}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
