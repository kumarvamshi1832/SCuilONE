import { useCallback, useEffect, useState } from "react";
import { getSiteVisitHistory } from "../../services/siteVisitService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { describeValue, diffRecords, type UserNameResolver } from "../../utils/recordHistory";
import type { SiteVisitHistoryEntry } from "../../types/recordHistory";
import "./HistoryTimeline.css";

const EVENT_TITLES: Record<string, string> = {
  CREATED: "Visit scheduled",
  RESCHEDULED: "Visit rescheduled",
  STATUS_CHANGED: "Status changed",
  UPDATED: "Visit updated",
  BASELINE: "Recorded when history tracking started",
};

/**
 * Audit trail of one site visit, read from GET /api/v1/site-visits/{id}/history.
 * Every row shows what changed (before -> after), the reason, who made the change and when.
 */
export default function SiteVisitHistory({
  visitId,
  resolveUser,
}: {
  visitId: string;
  resolveUser?: UserNameResolver;
}) {
  /** undefined = loading. */
  const [entries, setEntries] = useState<SiteVisitHistoryEntry[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await getSiteVisitHistory(visitId));
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load the site visit history."));
      setEntries((prev) => prev ?? []);
    }
  }, [visitId]);

  useEffect(() => {
    setEntries(undefined);
    void load();
  }, [load]);

  return (
    <section aria-label="Site visit history" aria-busy={entries === undefined}>
      <h3 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#64748b", margin: "0 0 10px" }}>
        Visit history
      </h3>

      {entries === undefined && (
        <>
          <div className="hist-skeleton" />
          <div className="hist-skeleton" />
        </>
      )}

      {error && (
        <div className="hist-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {entries && entries.length === 0 && !error && (
        <p className="hist-state">No history has been recorded for this visit yet.</p>
      )}

      {entries && entries.length > 0 && (
        <ol className="hist-list">
          {entries.map((entry) => {
            const changes = entry.before_data ? diffRecords(entry.before_data, entry.after_data, resolveUser) : [];
            const who = entry.changed_by ? resolveUser?.(entry.changed_by) ?? "A team member" : "System";
            const after = entry.after_data ?? {};
            return (
              <li key={entry.id} className="hist-item">
                <div className="hist-head">
                  <span className="hist-title">{EVENT_TITLES[entry.event_type] ?? entry.event_type}</span>
                  <span className="hist-meta">
                    {formatBookingDateTime(entry.created_at)} · {who}
                  </span>
                </div>

                {!entry.before_data ? (
                  <ul className="hist-changes">
                    <li>
                      <span className="hist-change-label">Window</span>
                      <span className="hist-to">
                        {describeValue("scheduled_start", after.scheduled_start)} → {describeValue("scheduled_end", after.scheduled_end)}
                      </span>
                    </li>
                    <li>
                      <span className="hist-change-label">Status</span>
                      <span className="hist-to">{describeValue("status", after.status)}</span>
                    </li>
                  </ul>
                ) : changes.length > 0 ? (
                  <ul className="hist-changes">
                    {changes.map((c) => (
                      <li key={c.key}>
                        <span className="hist-change-label">{c.label}</span>
                        <span className="hist-from">{c.from}</span>
                        <span className="hist-arrow" aria-hidden="true">→</span>
                        <span className="hist-to">{c.to}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hist-meta" style={{ margin: "6px 0 0" }}>No field changes were recorded.</p>
                )}

                {entry.reason && <p className="hist-reason">{entry.reason}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
