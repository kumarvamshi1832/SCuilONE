import { useCallback, useEffect, useState } from "react";
import { getBuyerRequirementRevisions } from "../../services/buyerRequirementService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { describeValue, diffRecords, type UserNameResolver } from "../../utils/recordHistory";
import type { BuyerRequirementRevision } from "../../types/recordHistory";
import "./HistoryTimeline.css";

/** Facts shown for revision 1, which has nothing to be compared with. */
const INITIAL_KEYS = ["requirement_type", "property_type", "preferred_city", "preferred_location", "min_budget", "max_budget", "bedrooms", "status"];

/**
 * Version history of one buyer requirement, read from GET /api/v1/buyer-requirements/{id}/revisions.
 * Each revision stores the full requirement; the list below shows what changed from the previous revision.
 */
export default function RequirementRevisionHistory({
  requirementId,
  resolveUser,
}: {
  requirementId: string;
  resolveUser?: UserNameResolver;
}) {
  /** undefined = loading. */
  const [revisions, setRevisions] = useState<BuyerRequirementRevision[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await getBuyerRequirementRevisions(requirementId);
      setRevisions([...rows].sort((a, b) => a.revision_number - b.revision_number));
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load the requirement revision history."));
      setRevisions((prev) => prev ?? []);
    }
  }, [requirementId]);

  useEffect(() => {
    setRevisions(undefined);
    void load();
  }, [load]);

  return (
    <section aria-label="Requirement revision history" aria-busy={revisions === undefined}>
      {revisions === undefined && (
        <>
          <div className="hist-skeleton" />
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

      {revisions && revisions.length === 0 && !error && (
        <p className="hist-state">No revisions have been recorded for this requirement yet.</p>
      )}

      {revisions && revisions.length > 0 && (
        <ol className="hist-list">
          {revisions.map((rev, index) => {
            const previous = index > 0 ? revisions[index - 1] : undefined;
            const changes = previous ? diffRecords(previous.snapshot, rev.snapshot, resolveUser) : [];
            const who = rev.changed_by ? resolveUser?.(rev.changed_by) ?? "A team member" : "System";
            return (
              <li key={rev.id} className="hist-item">
                <div className="hist-head">
                  <span className="hist-title">
                    Revision {rev.revision_number}
                    {!previous ? " · Initial requirement" : ""}
                  </span>
                  <span className="hist-meta">
                    {formatBookingDateTime(rev.created_at)} · {who}
                  </span>
                </div>

                {!previous ? (
                  <ul className="hist-changes">
                    {INITIAL_KEYS.filter((k) => rev.snapshot[k] !== null && rev.snapshot[k] !== undefined && rev.snapshot[k] !== "").map((k) => (
                      <li key={k}>
                        <span className="hist-change-label">{k.replace(/_/g, " ")}</span>
                        <span className="hist-to">{describeValue(k, rev.snapshot[k], resolveUser)}</span>
                      </li>
                    ))}
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
                  <p className="hist-meta" style={{ margin: "6px 0 0" }}>Saved without any field changes.</p>
                )}

                {rev.change_reason && <p className="hist-reason">{rev.change_reason}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
