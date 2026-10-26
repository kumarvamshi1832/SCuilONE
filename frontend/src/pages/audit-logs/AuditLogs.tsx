import { useState, useEffect, useCallback } from "react";
import { getAuditLogs } from "../../services/auditLogService";
import type { AuditLog, AuditLogPagination } from "../../types/auditLog";
import "./AuditLogs.css";

const MODULE_OPTIONS = [
  "projects",
  "buildings",
  "building_image",
  "properties",
  "property_image",
  "buyer_requirements",
  "property_matches",
  "site_visits",
  "bookings",
  "payments",
  "payment_refunds",
  "leads",
  "contacts",
  "accounts",
  "deals",
  "users",
];

const ACTION_OPTIONS = ["CREATE", "UPDATE", "DELETE", "CANCEL", "COMPLETE"];

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<AuditLogPagination>({
    page: 1,
    page_size: 25,
    total: 0,
    total_pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [recordIdSearch, setRecordIdSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Inspect Modal
  const [inspectingLog, setInspectingLog] = useState<AuditLog | null>(null);

  const formatApiError = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (typeof first === "string") return first;
      if (first && typeof first.msg === "string") {
        const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
        return field && field !== "body" && field !== "query" ? `${field}: ${first.msg}` : first.msg;
      }
    }
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
      return detail.message;
    }
    return err?.message || fallback;
  };

  const fetchLogs = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAuditLogs({
          module: moduleFilter || undefined,
          action: actionFilter || undefined,
          record_id: recordIdSearch.trim() || undefined,
          start_date: startDate ? new Date(startDate).toISOString() : undefined,
          end_date: endDate ? new Date(endDate).toISOString() : undefined,
          page,
          page_size: 25,
        });
        setLogs(res.items);
        setPagination(res.pagination);
      } catch (err: any) {
        console.error("Failed to load audit logs:", err);
        setError(formatApiError(err, "Failed to load audit logs."));
      } finally {
        setLoading(false);
      }
    },
    [moduleFilter, actionFilter, recordIdSearch, startDate, endDate]
  );

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getActionClass = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("CREATE")) return "action-create";
    if (act.includes("UPDATE")) return "action-update";
    if (act.includes("DELETE")) return "action-delete";
    if (act.includes("CANCEL")) return "action-cancel";
    if (act.includes("COMPLETE")) return "action-complete";
    return "action-update";
  };

  return (
    <div className="audit-logs-page">
      {/* Page Header */}
      <div className="audit-logs-header">
        <div className="header-titles">
          <div className="title-row">
            <h1>Compliance Audit Trail</h1>
            <span className="count-chip">{pagination.total} Logged Events</span>
          </div>
          <p className="subtitle">
            Immutable history of state changes, reservations, verified payments, and user actions
          </p>
        </div>

        <button
          className="btn-refresh-logs"
          onClick={() => fetchLogs(pagination.page)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Refresh Trail
        </button>
      </div>

      {/* Filter Bar */}
      <div className="audit-filter-container">
        <div className="audit-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search Record ID..."
            value={recordIdSearch}
            onChange={(e) => setRecordIdSearch(e.target.value)}
          />
          {recordIdSearch && (
            <button className="clear-search-btn" onClick={() => setRecordIdSearch("")}>
              &times;
            </button>
          )}
        </div>

        <div className="filter-dropdowns-group">
          <select
            className="filter-select"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="">All CRM Modules</option>
            {MODULE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All Action Types</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#64748b" }}>
            <span>From:</span>
            <input
              type="date"
              className="filter-select"
              style={{ minWidth: "120px" }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span>To:</span>
            <input
              type="date"
              className="filter-select"
              style={{ minWidth: "120px" }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {(moduleFilter || actionFilter || recordIdSearch || startDate || endDate) && (
            <button
              className="btn-clear-filters"
              onClick={() => {
                setModuleFilter("");
                setActionFilter("");
                setRecordIdSearch("");
                setStartDate("");
                setEndDate("");
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="audit-table-container">
        {loading ? (
          <div className="audit-loading-state">
            <div className="spinner"></div>
            <p style={{ margin: 0, color: "#64748b" }}>Loading audit records...</p>
          </div>
        ) : error ? (
          <div className="audit-error-state">
            <p style={{ margin: "0 0 12px", color: "#ef4444", fontWeight: 600 }}>{error}</p>
            <button className="btn-refresh-logs" onClick={() => fetchLogs(pagination.page)}>
              Retry
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="audit-empty-card">
            <div className="empty-audit-art">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <h3>No Audit Records Found</h3>
            <p>
              No compliance logs matched your filter parameters. Try loosening date ranges or module filters.
            </p>
          </div>
        ) : (
          <>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Module</th>
                  <th>Description</th>
                  <th>Record Reference</th>
                  <th style={{ textAlign: "right" }}>Data Diff</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  return (
                    <tr key={log.id}>
                      <td>
                        <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                          {formatTimestamp(log.created_at)}
                        </div>
                      </td>
                      <td>
                        <span className={`audit-action-badge ${getActionClass(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <span className="module-chip">
                          {log.module}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                          {log.description}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.8rem", color: "#64748b", fontFamily: "monospace" }}>
                          {log.record_id ? log.record_id.substring(0, 12) + "..." : "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {(log.before_data || log.after_data) ? (
                          <button
                            className="btn-refresh-logs"
                            style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                            onClick={() => setInspectingLog(log)}
                          >
                            Inspect Changes
                          </button>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>No Snapshot</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="pagination-bar">
              <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                Showing page <strong>{pagination.page}</strong> of <strong>{pagination.total_pages}</strong> ({pagination.total} events)
              </div>

              <div className="pagination-controls">
                <button
                  className="btn-refresh-logs"
                  style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                  onClick={() => fetchLogs(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loading}
                >
                  Previous
                </button>
                <button
                  className="btn-refresh-logs"
                  style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                  onClick={() => fetchLogs(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages || loading}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Inspect Change Diff Modal ─── */}
      {inspectingLog && (
        <div className="modal-overlay" onClick={() => setInspectingLog(null)}>
          <div className="modal-card" style={{ maxWidth: "750px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Audit Event Inspection</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  {inspectingLog.module} • {inspectingLog.action} • {formatTimestamp(inspectingLog.created_at)}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setInspectingLog(null)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: "14px", padding: "12px 14px", background: "rgba(100,116,139,0.06)", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>
                  Event Description
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: "2px" }}>
                  {inspectingLog.description}
                </div>
                {inspectingLog.record_id && (
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                    Record Target: <code>{inspectingLog.record_id}</code>
                  </div>
                )}
              </div>

              {/* Side-by-side Snapshot Comparison */}
              <div className="diff-inspector-container">
                <div className="diff-box">
                  <h5>State Before Change</h5>
                  {inspectingLog.before_data ? (
                    <pre className="diff-json">
                      {JSON.stringify(inspectingLog.before_data, null, 2)}
                    </pre>
                  ) : (
                    <div style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.8rem" }}>
                      Initial Creation / No Previous State
                    </div>
                  )}
                </div>

                <div className="diff-box">
                  <h5>State After Change</h5>
                  {inspectingLog.after_data ? (
                    <pre className="diff-json">
                      {JSON.stringify(inspectingLog.after_data, null, 2)}
                    </pre>
                  ) : (
                    <div style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.8rem" }}>
                      Record Deleted / Purged
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-refresh-logs" onClick={() => setInspectingLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
