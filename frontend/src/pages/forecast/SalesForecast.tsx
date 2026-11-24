import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../../context/ThemeContext";
import {
  getForecastSummary,
  getStageProbabilities,
  updateStageProbability,
} from "../../services/forecastService";
import { getUsers } from "../../services/userService";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { getApiErrorMessage } from "../../utils/apiError";
import type { ForecastSummary, StageProbability } from "../../types/forecast";
import type { User } from "../../types/user";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";

const MONTH_OPTIONS = [3, 6, 12, 24];

const formatMoney = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatCompact = (value: number): string =>
  new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export default function SalesForecast() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const canEditProbability = useMemo(() => hasFeaturePermission("pipeline.update"), []);

  const [months, setMonths] = useState(6);
  const [pipelineId, setPipelineId] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const [summary, setSummary] = useState<ForecastSummary | null>(null);
  const [stages, setStages] = useState<StageProbability[]>([]);
  const [allPipelines, setAllPipelines] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stagesError, setStagesError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingStageId, setSavingStageId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const requestSeq = useRef(0);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Owners for the optional filter - best effort (the user list may not be permitted for every role).
  useEffect(() => {
    let active = true;
    getUsers()
      .then((list) => active && setUsers(Array.isArray(list) ? list : []))
      .catch(() => active && setUsers([]));
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    setStagesError(null);

    const [summaryResult, stagesResult] = await Promise.allSettled([
      getForecastSummary({ months, pipeline_id: pipelineId, assigned_to: ownerId }),
      getStageProbabilities(pipelineId),
    ]);
    if (seq !== requestSeq.current) return;

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value);
    } else {
      setSummary(null);
      setError(getApiErrorMessage(summaryResult.reason, "Failed to load the sales forecast."));
    }

    if (stagesResult.status === "fulfilled") {
      setStages(stagesResult.value);
      setDrafts({});
      // Remember every pipeline so the filter keeps all options while a pipeline is selected.
      if (!pipelineId) {
        const seen = new Map<string, string>();
        stagesResult.value.forEach((s) => seen.set(s.pipeline_id, s.pipeline_name));
        setAllPipelines(Array.from(seen, ([id, name]) => ({ id, name })));
      }
    } else {
      setStages([]);
      setStagesError(null);
    }
    setLoading(false);
  }, [months, pipelineId, ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedStages = useMemo(() => {
    const groups = new Map<string, { name: string; rows: StageProbability[] }>();
    stages.forEach((s) => {
      const group = groups.get(s.pipeline_id) ?? { name: s.pipeline_name, rows: [] };
      group.rows.push(s);
      groups.set(s.pipeline_id, group);
    });
    return Array.from(groups, ([id, g]) => ({ id, ...g }));
  }, [stages]);

  const parseDraft = (stage: StageProbability): { value: number | null; valid: boolean } => {
    const raw = drafts[stage.stage_id];
    if (raw === undefined) return { value: stage.probability, valid: true };
    const trimmed = raw.trim();
    if (trimmed === "") return { value: null, valid: false };
    const num = Number(trimmed);
    const valid = Number.isInteger(num) && num >= 0 && num <= 100;
    return { value: valid ? num : null, valid };
  };

  const saveProbability = async (stage: StageProbability) => {
    const { value, valid } = parseDraft(stage);
    if (!valid || value === null) {
      showToast("Enter a whole number between 0 and 100.", "error");
      return;
    }
    setSavingStageId(stage.stage_id);
    try {
      await updateStageProbability(stage.stage_id, value);
      showToast(`"${stage.stage_name}" probability saved as ${value}%.`);
      await load(); // refresh the weighted forecast, which depends on the probabilities
    } catch (err) {
      showToast(getApiErrorMessage(err, "Could not save the probability."), "error");
    } finally {
      setSavingStageId(null);
    }
  };

  const tickColor = isDark ? "#94A3B8" : "#64748B";
  const gridColor = isDark ? "rgba(51, 65, 85, 0.45)" : "rgba(209, 220, 232, 0.7)";
  const axisColor = isDark ? "#334155" : "#CBD5E1";
  const tooltipStyle = {
    backgroundColor: isDark ? "#172033" : "#F5F8FC",
    border: `1px solid ${isDark ? "#334155" : "#D1DCE8"}`,
    borderRadius: 8,
    color: isDark ? "#F8FAFC" : "#0F172A",
    fontSize: 12,
  };

  const hasOpenDeals = Boolean(summary && summary.totals.deal_count > 0);
  const hasAnyData = Boolean(
    summary && (summary.totals.deal_count > 0 || summary.totals.won_deals_this_month > 0)
  );

  const monthData = (summary?.by_month ?? []).map((m) => ({
    label: m.label,
    "Pipeline value": m.pipeline_amount,
    "Weighted forecast": m.weighted_amount,
  }));
  const stageData = (summary?.by_stage ?? []).map((s) => ({
    label: s.stage,
    "Pipeline value": s.pipeline_amount,
    "Weighted forecast": s.weighted_amount,
  }));

  const renderChart = (data: Array<Record<string, string | number>>, label: string) => (
    <div className="ins-chart" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: data.length > 5 ? 28 : 8 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: tickColor, fontSize: 11 }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
            interval={0}
            angle={data.length > 5 ? -25 : 0}
            textAnchor={data.length > 5 ? "end" : "middle"}
          />
          <YAxis
            tick={{ fill: tickColor, fontSize: 11 }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
            tickFormatter={(v: number) => formatCompact(v)}
            width={56}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(val) => formatMoney(typeof val === "number" ? val : Number(val))}
            cursor={{ fill: isDark ? "rgba(74,144,226,0.08)" : "rgba(0,0,0,0.04)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Pipeline value" fill={isDark ? "#4A5F82" : "#A9BCD5"} radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Bar dataKey="Weighted forecast" fill="#4a90e2" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="ins-page">
      {toast && (
        <div className={`ins-alert ins-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Sales Forecast</h1>
          <p className="text-muted">
            Open deal value weighted by each pipeline stage's win probability
            {summary ? ` · as of ${summary.as_of}` : ""}.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="ins-toolbar">
        <select
          className="filter-select"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          aria-label="Forecast period"
        >
          {MONTH_OPTIONS.map((m) => (
            <option key={m} value={m}>
              Next {m} months
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={pipelineId}
          onChange={(e) => setPipelineId(e.target.value)}
          aria-label="Filter by pipeline"
        >
          <option value="">All pipelines</option>
          {allPipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {users.length > 0 && (
          <select
            className="filter-select"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            aria-label="Filter by deal owner"
          >
            <option value="">All owners</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        )}

        {(pipelineId || ownerId || months !== 6) && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setMonths(6);
              setPipelineId("");
              setOwnerId("");
            }}
          >
            Reset
          </button>
        )}
      </div>

      {error && (
        <div className="ins-alert error" role="alert">
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {loading && !summary ? (
        <div className="ins-kpi-grid" aria-busy="true" aria-label="Loading forecast">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ins-skeleton" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="ins-kpi-grid">
            <div className="ins-kpi">
              <span className="ins-kpi-label">Total pipeline value</span>
              <span className="ins-kpi-value">{formatMoney(summary.totals.pipeline_amount)}</span>
              <span className="ins-kpi-note">{summary.totals.deal_count} open deals</span>
            </div>
            <div className="ins-kpi green">
              <span className="ins-kpi-label">Weighted forecast (expected revenue)</span>
              <span className="ins-kpi-value">{formatMoney(summary.totals.weighted_amount)}</span>
              <span className="ins-kpi-note">Pipeline value × stage probability</span>
            </div>
            <div className="ins-kpi purple">
              <span className="ins-kpi-label">Won this month</span>
              <span className="ins-kpi-value">{formatMoney(summary.totals.won_this_month)}</span>
              <span className="ins-kpi-note">
                {summary.totals.won_deals_this_month} won · {summary.totals.lost_deals_this_month} lost
              </span>
            </div>
            <div className="ins-kpi amber">
              <span className="ins-kpi-label">Needs attention</span>
              <span className="ins-kpi-value">
                {summary.totals.overdue_close_date_deals + summary.totals.no_close_date_deals}
              </span>
              <span className="ins-kpi-note">
                {summary.totals.overdue_close_date_deals} past close date ·{" "}
                {summary.totals.no_close_date_deals} without a close date
              </span>
            </div>
          </div>

          {!hasAnyData && (
            <div className="ins-card ins-empty">
              <h3>No forecast data yet</h3>
              <p>
                There are no open deals for the selected filters. Create deals with an amount and a pipeline
                stage to see the forecast.
              </p>
            </div>
          )}

          {hasOpenDeals && (
            <>
              <div className="ins-kpi-grid">
                <div className="ins-kpi green">
                  <span className="ins-kpi-label">Commit (≥ 75%)</span>
                  <span className="ins-kpi-value">{formatMoney(summary.forecast_categories.commit)}</span>
                </div>
                <div className="ins-kpi">
                  <span className="ins-kpi-label">Best case (40–74%)</span>
                  <span className="ins-kpi-value">{formatMoney(summary.forecast_categories.best_case)}</span>
                </div>
                <div className="ins-kpi amber">
                  <span className="ins-kpi-label">Pipeline (&lt; 40%)</span>
                  <span className="ins-kpi-value">{formatMoney(summary.forecast_categories.pipeline)}</span>
                </div>
              </div>

              <div className="ins-two-col">
                <section className="ins-card" aria-label="Forecast by month">
                  <h2 className="ins-card-title">
                    Forecast by expected close month <small>Weighted vs. total value</small>
                  </h2>
                  {renderChart(monthData, "Forecast by expected close month")}
                </section>
                <section className="ins-card" aria-label="Forecast by stage">
                  <h2 className="ins-card-title">
                    Opportunity value by stage <small>Weighted vs. total value</small>
                  </h2>
                  {renderChart(stageData, "Opportunity value by stage")}
                </section>
              </div>

              <section className="leads-table-container" aria-label="Forecast by stage table">
                <div className="ins-table-wrap">
                  <table className="leads-table">
                    <thead>
                      <tr>
                        <th>Stage</th>
                        <th className="num">Probability</th>
                        <th className="num">Deals</th>
                        <th className="num">Pipeline value</th>
                        <th className="num">Weighted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_stage.map((row) => (
                        <tr key={row.stage}>
                          <td style={{ fontWeight: 600 }}>{row.stage}</td>
                          <td className="num">{row.probability}%</td>
                          <td className="num">{row.deal_count}</td>
                          <td className="num">{formatMoney(row.pipeline_amount)}</td>
                          <td className="num">{formatMoney(row.weighted_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="leads-table-container" aria-label="Forecast by month table">
                <div className="ins-table-wrap">
                  <table className="leads-table">
                    <thead>
                      <tr>
                        <th>Expected close</th>
                        <th className="num">Deals</th>
                        <th className="num">Pipeline value</th>
                        <th className="num">Weighted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_month.map((row) => (
                        <tr key={row.period}>
                          <td style={{ fontWeight: 600 }}>{row.label}</td>
                          <td className="num">{row.deal_count}</td>
                          <td className="num">{formatMoney(row.pipeline_amount)}</td>
                          <td className="num">{formatMoney(row.weighted_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {summary.by_owner.length > 0 && (
                <section className="leads-table-container" aria-label="Forecast by owner">
                  <div className="ins-table-wrap">
                    <table className="leads-table">
                      <thead>
                        <tr>
                          <th>Owner</th>
                          <th className="num">Deals</th>
                          <th className="num">Pipeline value</th>
                          <th className="num">Weighted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.by_owner.map((row) => (
                          <tr key={row.user_id ?? "unassigned"}>
                            <td style={{ fontWeight: 600 }}>{row.user_name}</td>
                            <td className="num">{row.deal_count}</td>
                            <td className="num">{formatMoney(row.pipeline_amount)}</td>
                            <td className="num">{formatMoney(row.weighted_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          <p className="text-muted" style={{ fontSize: "0.8rem", margin: 0 }}>
            Won and lost counts: {summary.totals.won_lost_basis}.
          </p>
        </>
      ) : null}

      <section className="ins-card" aria-label="Stage win probabilities">
        <h2 className="ins-card-title">
          Stage win probabilities
          <small>
            {canEditProbability
              ? "Changing a probability updates the weighted forecast."
              : "You have view-only access to probabilities."}
          </small>
        </h2>

        {stagesError && (
          <div className="ins-alert error" role="alert" style={{ marginBottom: 12 }}>
            <span>{stagesError}</span>
          </div>
        )}

        {!stagesError && stages.length === 0 && !loading && (
          <div className="ins-empty" style={{ padding: "24px 12px" }}>
            <p>No pipeline stages found.</p>
          </div>
        )}

        {groupedStages.map((group) => (
          <div key={group.id} style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: "0.9rem", margin: "0 0 8px" }}>{group.name}</h3>
            <div className="ins-table-wrap">
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th className="num">Win probability (%)</th>
                    {canEditProbability && <th style={{ textAlign: "right" }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((stage) => {
                    const closed = stage.is_closed_won || stage.is_closed_lost;
                    const draft = drafts[stage.stage_id];
                    const { valid } = parseDraft(stage);
                    const dirty = draft !== undefined && draft !== String(stage.probability ?? "");
                    const saving = savingStageId === stage.stage_id;
                    return (
                      <tr key={stage.stage_id}>
                        <td style={{ fontWeight: 600 }}>
                          {stage.stage_name}
                          {stage.is_closed_won && <span className="ins-badge converted" style={{ marginLeft: 8 }}>Closed won</span>}
                          {stage.is_closed_lost && <span className="ins-badge dead" style={{ marginLeft: 8 }}>Closed lost</span>}
                        </td>
                        <td className="num">
                          {closed ? (
                            <span className="ins-locked">{stage.is_closed_won ? "100% (fixed)" : "0% (fixed)"}</span>
                          ) : canEditProbability ? (
                            <input
                              className={`ins-prob-input ${valid ? "" : "invalid"}`}
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={draft ?? (stage.probability ?? "")}
                              placeholder="—"
                              onChange={(e) =>
                                setDrafts((prev) => ({ ...prev, [stage.stage_id]: e.target.value }))
                              }
                              aria-label={`Win probability for ${stage.stage_name}`}
                              aria-invalid={!valid}
                              disabled={saving}
                            />
                          ) : stage.probability === null ? (
                            <span className="ins-locked">Not set</span>
                          ) : (
                            `${stage.probability}%`
                          )}
                        </td>
                        {canEditProbability && (
                          <td>
                            <div className="ins-row-actions">
                              {!closed && (
                                <button
                                  className="btn-primary ins-btn-sm"
                                  onClick={() => void saveProbability(stage)}
                                  disabled={!dirty || !valid || saving}
                                >
                                  {saving ? "Saving…" : "Save"}
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
