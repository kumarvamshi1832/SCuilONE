import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getIndustryConfig } from "../../config/industryConfig";
import {
  getLeadLeaderboard,
  getLeadScoreDetail,
  recalculateAllLeadScores,
  recalculateLeadScore,
} from "../../services/leadScoringService";
import { getUsers } from "../../services/userService";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatDateTime } from "../../utils/dateFormatter";
import { getLeadStatusLabel } from "../../utils/leadStatus";
import { LEAD_SCORE_LABELS } from "../../types/leadScoring";
import type { LeadScoreDetail, LeadScoreLabel, LeadScoreRow } from "../../types/leadScoring";
import type { User } from "../../types/user";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";

const PAGE_SIZE = 25;

/** Display names for the factors produced by backend/app/services/lead_scoring.py. */
const FACTOR_LABELS: Record<string, string> = {
  email: "Valid email provided",
  phone: "Phone number provided",
  source: "Lead source",
  notes: "Notes added",
  assigned: "Assigned to a team member",
  account: "Linked to an account",
  status: "Lead status",
  activities: "Logged activities",
  fast_response: "Fast first response",
  recent_activity: "Recent activity",
  open_deal: "Has an open deal",
  budget_known: "Budget known",
  stale: "No recent follow-up (penalty)",
};

const humanize = (key: string): string =>
  FACTOR_LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const labelClass = (label: string | null | undefined): string => (label ? label.toLowerCase() : "");

function ScoreBar({ score, label }: { score: number; label: string | null }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="ins-score">
      <span className="ins-score-num">{score}</span>
      <span className="ins-score-track" aria-hidden="true">
        <span className={`ins-score-fill ${labelClass(label)}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function BreakdownGroup({ title, data }: { title: string; data: Record<string, number> | undefined }) {
  const entries = Object.entries(data ?? {});
  return (
    <div className="ins-breakdown-group">
      <h4>{title}</h4>
      {entries.length === 0 ? (
        <p className="text-muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          No points in this category.
        </p>
      ) : (
        entries.map(([key, points]) => (
          <div className="ins-breakdown-row" key={key}>
            <span>{humanize(key)}</span>
            <span className={`ins-points ${points < 0 ? "neg" : "pos"}`}>
              {points > 0 ? `+${points}` : points}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export default function LeadScoring() {
  const { industry } = useParams();
  const config = getIndustryConfig(industry);

  const canRecalculate = useMemo(() => hasFeaturePermission("lead.update"), []);

  const [label, setLabel] = useState<LeadScoreLabel | "">("");
  const [ownerId, setOwnerId] = useState("");
  const [minScore, setMinScore] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<LeadScoreRow[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadScoreDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLeadName, setDetailLeadName] = useState("");

  const [confirmAll, setConfirmAll] = useState(false);
  const [recalcAllBusy, setRecalcAllBusy] = useState(false);
  const [recalcAllError, setRecalcAllError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const requestSeq = useRef(0);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let active = true;
    getUsers()
      .then((list) => active && setUsers(Array.isArray(list) ? list : []))
      .catch(() => active && setUsers([]));
    return () => {
      active = false;
    };
  }, []);

  const userName = useCallback(
    (id: string | null): string => (id ? users.find((u) => u.id === id)?.full_name ?? "—" : "Unassigned"),
    [users]
  );

  const minScoreNumber = (() => {
    if (minScore.trim() === "") return 0;
    const n = Number(minScore);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
  })();

  const load = useCallback(async () => {
    if (minScoreNumber === null) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getLeadLeaderboard({
        label: label || undefined,
        assigned_to: ownerId || undefined,
        min_score: minScoreNumber,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE + 1,
      });
      if (seq !== requestSeq.current) return;
      setHasNext(data.length > PAGE_SIZE);
      setRows(data.slice(0, PAGE_SIZE));
    } catch (err: any) {
      if (seq !== requestSeq.current) return;
      setRows([]);
      setHasNext(false);
      setError(getApiErrorMessage(err, "Failed to load the lead scoring leaderboard."));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [label, ownerId, minScoreNumber, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetPage = () => setPage(0);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q) ||
        (r.source || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const openDetail = async (row: LeadScoreRow) => {
    setDetail(null);
    setDetailError(null);
    setDetailLeadName(row.full_name);
    setDetailLoading(true);
    try {
      setDetail(await getLeadScoreDetail(row.id));
    } catch (err) {
      setDetailError(getApiErrorMessage(err, "Failed to load the score details."));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    setDetailLeadName("");
  };

  const handleRecalculate = async (leadId: string, name: string, fromDetail = false) => {
    setBusyLeadId(leadId);
    try {
      const updated = await recalculateLeadScore(leadId);
      showToast(`Score recalculated for "${name}": ${updated.score}.`);
      if (fromDetail) setDetail(updated);
      await load(); // ranking may change after a recalculation
    } catch (err) {
      const message = getApiErrorMessage(err, "Could not recalculate the score.");
      if (fromDetail) setDetailError(message);
      else showToast(message, "error");
    } finally {
      setBusyLeadId(null);
    }
  };

  const handleRecalculateAll = async () => {
    setRecalcAllBusy(true);
    setRecalcAllError(null);
    try {
      const result = await recalculateAllLeadScores();
      setConfirmAll(false);
      showToast(`Scores recalculated for ${result.leads_scored} lead${result.leads_scored === 1 ? "" : "s"}.`);
      await load();
    } catch (err) {
      setRecalcAllError(getApiErrorMessage(err, "Could not recalculate all scores."));
    } finally {
      setRecalcAllBusy(false);
    }
  };

  const hasFilters = Boolean(label || ownerId || minScore);
  const detailOpen = detailLoading || Boolean(detail) || Boolean(detailError);

  return (
    <div className="ins-page">
      {toast && (
        <div className={`ins-alert ins-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Lead Scoring</h1>
          <p className="text-muted">
            Rule-based 0–100 scores that rank your {config.leadLabel.toLowerCase()} by how likely they are to
            convert. Dead and converted leads are hidden unless you filter for them.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          {canRecalculate && (
            <button
              className="btn-primary"
              onClick={() => {
                setRecalcAllError(null);
                setConfirmAll(true);
              }}
            >
              Recalculate all
            </button>
          )}
        </div>
      </div>

      <div className="ins-toolbar">
        <div className="leads-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search this page by name, email, phone, source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search leads on this page"
          />
        </div>

        <select
          className="filter-select"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value as LeadScoreLabel | "");
            resetPage();
          }}
          aria-label="Filter by score label"
        >
          <option value="">Hot, Warm &amp; Cold</option>
          {LEAD_SCORE_LABELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        {users.length > 0 && (
          <select
            className="filter-select"
            value={ownerId}
            onChange={(e) => {
              setOwnerId(e.target.value);
              resetPage();
            }}
            aria-label="Filter by assigned user"
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        )}

        <input
          className="filter-select"
          style={{ minWidth: 0, width: 120 }}
          type="number"
          min={0}
          max={100}
          placeholder="Min score"
          value={minScore}
          onChange={(e) => {
            setMinScore(e.target.value);
            resetPage();
          }}
          aria-label="Minimum score"
          aria-invalid={minScoreNumber === null}
        />

        {hasFilters && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setLabel("");
              setOwnerId("");
              setMinScore("");
              resetPage();
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {minScoreNumber === null && (
        <div className="ins-alert error" role="alert">
          <span>Minimum score must be a whole number between 0 and 100.</span>
        </div>
      )}

      {error && (
        <div className="ins-alert error" role="alert">
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="leads-table-container">
        {loading ? (
          <div className="ins-loading" aria-busy="true">
            <div className="leads-loading-spinner" /> Loading leaderboard…
          </div>
        ) : !error && rows.length === 0 ? (
          <div className="ins-empty">
            <h3>No scored leads found</h3>
            <p>
              {hasFilters
                ? "No leads match the selected filters."
                : "Create leads, or use Recalculate all to score your existing leads."}
            </p>
          </div>
        ) : !error && visibleRows.length === 0 ? (
          <div className="ins-empty">
            <h3>No matching leads</h3>
            <p>Nothing on this page matches "{search}".</p>
          </div>
        ) : (
          !error && (
            <>
              <div className="ins-table-wrap">
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Lead</th>
                      <th>Contact</th>
                      <th>Score</th>
                      <th>Label</th>
                      <th>Assigned to</th>
                      <th>Last scored</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const rank = page * PAGE_SIZE + rows.indexOf(row) + 1;
                      const busy = busyLeadId === row.id;
                      return (
                        <tr key={row.id}>
                          <td>
                            <span className={`ins-rank ${rank <= 3 ? "top" : ""}`}>{rank}</span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{row.full_name}</div>
                            <div className="text-dim" style={{ fontSize: "0.78rem" }}>
                              {[getLeadStatusLabel(row.status), row.source].filter(Boolean).join(" · ")}
                            </div>
                          </td>
                          <td className="text-dim">
                            <div>{row.email || "—"}</div>
                            <div style={{ fontSize: "0.78rem" }}>{row.phone || "—"}</div>
                          </td>
                          <td>
                            <ScoreBar score={row.score} label={row.score_label} />
                          </td>
                          <td>
                            {row.score_label ? (
                              <span className={`ins-badge ${labelClass(row.score_label)}`}>{row.score_label}</span>
                            ) : (
                              <span className="text-dim">—</span>
                            )}
                          </td>
                          <td className="text-dim">{userName(row.assigned_to)}</td>
                          <td className="text-dim">{row.scored_at ? formatDateTime(row.scored_at) : "Not scored"}</td>
                          <td>
                            <div className="ins-row-actions">
                              <button className="btn-secondary ins-btn-sm" onClick={() => void openDetail(row)}>
                                Breakdown
                              </button>
                              {canRecalculate && (
                                <button
                                  className="btn-secondary ins-btn-sm"
                                  onClick={() => void handleRecalculate(row.id, row.full_name)}
                                  disabled={busy}
                                >
                                  {busy ? "Working…" : "Recalculate"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ins-pager">
                <span>Page {page + 1}</span>
                <div className="ins-pager-controls">
                  <button
                    className="btn-secondary ins-btn-sm"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="btn-secondary ins-btn-sm"
                    disabled={!hasNext || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </div>

      {detailOpen && (
        <div className="ins-modal-overlay" role="presentation" onClick={closeDetail}>
          <div
            className="ins-modal wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="score-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ins-modal-header">
              <h3 id="score-detail-title">Score breakdown · {detail?.full_name ?? detailLeadName}</h3>
              <button className="ins-modal-close" onClick={closeDetail} aria-label="Close">
                ×
              </button>
            </div>
            <div className="ins-modal-body">
              {detailLoading && (
                <div className="ins-loading" aria-busy="true">
                  <div className="leads-loading-spinner" /> Loading score details…
                </div>
              )}
              {detailError && (
                <div className="ins-alert error" role="alert">
                  <span>{detailError}</span>
                </div>
              )}
              {detail && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 180px" }}>
                      <ScoreBar score={detail.score} label={detail.score_label} />
                    </div>
                    {detail.score_label && (
                      <span className={`ins-badge ${labelClass(detail.score_label)}`}>{detail.score_label}</span>
                    )}
                    <span className="text-dim" style={{ fontSize: "0.8rem" }}>
                      {detail.scored_at ? `Scored ${formatDateTime(detail.scored_at)}` : "Not scored yet"}
                    </span>
                  </div>
                  <BreakdownGroup title="Profile" data={detail.breakdown.profile} />
                  <BreakdownGroup title="Engagement" data={detail.breakdown.engagement} />
                  <div className="ins-breakdown-row" style={{ fontWeight: 700 }}>
                    <span>Total (capped at 100)</span>
                    <span className="ins-points">{detail.breakdown.total ?? detail.score}</span>
                  </div>
                </>
              )}
            </div>
            <div className="ins-modal-footer">
              <button className="btn-secondary" onClick={closeDetail}>
                Close
              </button>
              {canRecalculate && detail && (
                <button
                  className="btn-primary"
                  onClick={() => void handleRecalculate(detail.id, detail.full_name, true)}
                  disabled={busyLeadId === detail.id}
                >
                  {busyLeadId === detail.id ? "Recalculating…" : "Recalculate score"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmAll && (
        <div className="ins-modal-overlay" role="presentation">
          <div className="ins-modal" role="alertdialog" aria-modal="true" aria-labelledby="recalc-all-title">
            <div className="ins-modal-header">
              <h3 id="recalc-all-title">Recalculate all lead scores?</h3>
              <button className="ins-modal-close" onClick={() => setConfirmAll(false)} disabled={recalcAllBusy} aria-label="Close">
                ×
              </button>
            </div>
            <div className="ins-modal-body">
              <p style={{ margin: 0 }}>
                Every lead in your organisation will be re-scored from its current data. This can take a moment
                for large lead lists and is limited to a few runs per minute.
              </p>
              {recalcAllError && (
                <div className="ins-alert error" role="alert" style={{ marginTop: 12 }}>
                  <span>{recalcAllError}</span>
                </div>
              )}
            </div>
            <div className="ins-modal-footer">
              <button className="btn-secondary" onClick={() => setConfirmAll(false)} disabled={recalcAllBusy}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => void handleRecalculateAll()} disabled={recalcAllBusy}>
                {recalcAllBusy ? "Recalculating…" : "Recalculate all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
