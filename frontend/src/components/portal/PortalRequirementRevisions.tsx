import { useCallback, useEffect, useState } from "react";
import { getPortalRequirementRevisions } from "../../services/customerPortalBuyerRequirementService";
import { getPortalErrorMessage } from "../../utils/portalApiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { formatPortalMoney } from "./PortalPropertyMatchCard";
import type { PortalRequirementRevision } from "../../types/customerPortalBuyerRequirement";
import "../history/HistoryTimeline.css";
import "./PortalRequirementRevisions.css";

type Snapshot = Record<string, string | number | null>;

const present = (v: unknown): boolean => v !== null && v !== undefined && String(v).trim() !== "";

const range = (min: unknown, max: unknown, fmt: (v: string | number) => string, empty: string): string =>
  present(min) && present(max)
    ? `${fmt(min as string | number)} – ${fmt(max as string | number)}`
    : present(max)
    ? `Up to ${fmt(max as string | number)}`
    : present(min)
    ? `From ${fmt(min as string | number)}`
    : empty;

/** One displayed row, possibly combining several stored fields (e.g. min + max budget -> "Budget"). */
interface Row {
  key: string;
  label: string;
  /** Stored field keys this row is built from. */
  fields: string[];
  text: (s: Snapshot) => string;
}

const ROWS: Row[] = [
  { key: "requirement_type", label: "Requirement type", fields: ["requirement_type"], text: (s) => String(s.requirement_type ?? "—") },
  { key: "property_type", label: "Property type", fields: ["property_type"], text: (s) => String(s.property_type ?? "—") },
  {
    key: "location",
    label: "Location",
    fields: ["preferred_city", "preferred_location"],
    text: (s) => [s.preferred_location, s.preferred_city].filter(present).join(", ") || "Any location",
  },
  {
    key: "budget",
    label: "Budget",
    fields: ["min_budget", "max_budget"],
    text: (s) => range(s.min_budget, s.max_budget, (v) => formatPortalMoney(v), "Flexible"),
  },
  { key: "bedrooms", label: "Bedrooms", fields: ["bedrooms"], text: (s) => (present(s.bedrooms) ? String(s.bedrooms) : "Any") },
  {
    key: "area",
    label: "Area",
    fields: ["min_area", "max_area", "area_unit"],
    text: (s) => {
      const unit = present(s.area_unit) ? ` ${s.area_unit}` : "";
      const text = range(s.min_area, s.max_area, (v) => String(Number(v)), "");
      return text ? `${text}${unit}` : "Any";
    },
  },
  { key: "status", label: "Status", fields: ["status"], text: (s) => String(s.status ?? "—") },
];

const EVENT_TITLE: Record<string, string> = {
  created: "Requirement created",
  baseline: "Earliest recorded version",
  first_recorded: "First recorded version",
  updated: "Requirement updated",
};

/** The chronological list itself (newest first). Pure rendering of what the API returned. */
export function RevisionTimeline({ revisions }: { revisions: PortalRequirementRevision[] }) {
  return (
        <ol className="hist-list">
          {revisions.map((rev, index) => {
            // Newest first, so the previously recorded revision is the next item.
            const earlier = revisions[index + 1]?.snapshot;
            const changedFields = new Set(rev.changes.map((c) => c.field));
            const changedRows = ROWS.filter((row) => row.fields.some((f) => changedFields.has(f)));
            const isStart = rev.event !== "updated";
            return (
              <li key={rev.id} className="hist-item">
                <div className="hist-head">
                  <span className="hist-title">
                    <span className="cp-rev-badge">Revision {rev.revision_number}</span> {EVENT_TITLE[rev.event] ?? "Requirement updated"}
                  </span>
                  <span className="hist-meta">
                    {formatBookingDateTime(rev.created_at)} · Updated by {rev.updated_by}
                  </span>
                </div>

                {isStart ? (
                  <>
                    {rev.event !== "created" && (
                      <p className="hist-meta" style={{ margin: "6px 0 0" }}>
                        {rev.event === "baseline"
                          ? "History tracking started with this version, so earlier changes were not recorded."
                          : "Earlier versions of this requirement were not recorded."}
                      </p>
                    )}
                    <dl className="cp-rev-facts">
                      {ROWS.map((row) => (
                        <div key={row.key}>
                          <dt>{row.label}</dt>
                          <dd>{row.text(rev.snapshot)}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : changedRows.length > 0 ? (
                  <>
                    <div className="cp-rev-table-wrap">
                      <table className="cp-rev-table">
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Previous value</th>
                            <th>New value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changedRows.map((row) => (
                            <tr key={row.key}>
                              <th scope="row">{row.label}</th>
                              <td className="cp-rev-prev" data-label="Previous value">{earlier ? row.text(earlier) : "Not recorded"}</td>
                              <td className="cp-rev-new" data-label="New value">{row.text(rev.snapshot)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <details className="cp-rev-details">
                      <summary>View full details at this revision</summary>
                      <dl className="cp-rev-facts">
                        {ROWS.map((row) => (
                          <div key={row.key} className={changedRows.includes(row) ? "cp-rev-changed" : undefined}>
                            <dt>{row.label}</dt>
                            <dd>{row.text(rev.snapshot)}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </>
                ) : (
                  <p className="hist-meta" style={{ margin: "6px 0 0" }}>
                    Updated by our team. None of the requirement details shown here changed.
                  </p>
                )}
              </li>
            );
          })}
        </ol>
  );
}

/**
 * Revision history of one requirement, read from the customer portal API (GET .../buyer-requirements/{id}/revisions).
 * Newest revision first. For every update only the fields that really changed are listed, with the previous value
 * (from the earlier recorded revision) and the new value; "View full details" shows the whole requirement at that point.
 */
export default function PortalRequirementRevisions({ requirementId, refreshToken = 0 }: { requirementId: string; refreshToken?: number }) {
  /** undefined = loading. */
  const [revisions, setRevisions] = useState<PortalRequirementRevision[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRevisions(await getPortalRequirementRevisions(requirementId));
    } catch (err) {
      setError(getPortalErrorMessage(err, "Failed to load the revision history."));
      setRevisions((prev) => prev ?? []);
    }
  }, [requirementId]);

  useEffect(() => {
    setRevisions(undefined);
    void load();
  }, [load, refreshToken]);

  return (
    <section className="cp-panel" aria-label="Revision history" aria-busy={revisions === undefined}>
      {revisions === undefined && (
        <>
          <div className="hist-skeleton" />
          <div className="hist-skeleton" />
          <div className="hist-skeleton" />
        </>
      )}

      {error && (
        <div className="support-alert error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {revisions && revisions.length === 0 && !error && (
        <p className="hist-state" style={{ margin: 0 }}>No revision history available for this requirement yet.</p>
      )}

      {revisions && revisions.length > 0 && <RevisionTimeline revisions={revisions} />}
    </section>
  );
}
