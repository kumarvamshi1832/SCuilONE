import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getIndustryConfig } from "../../config/industryConfig";
import {
  describeTrashError,
  getTrashRecords,
  isRequestCanceled,
  purgeTrashRecord,
  restoreTrashRecord,
} from "../../services/trashService";
import type { TrashErrorInfo } from "../../services/trashService";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { formatDateTime } from "../../utils/dateFormatter";
import { TRASH_ENTITIES } from "../../types/trash";
import type { TrashEntity, TrashRecord } from "../../types/trash";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";
import "./Trash.css";

const PAGE_SIZE = 25;

export default function Trash() {
  const { industry } = useParams();
  const config = getIndustryConfig(industry);

  const permissions = useMemo(
    () => ({
      canView: hasFeaturePermission("trash.view"),
      canRestore: hasFeaturePermission("trash.restore"),
      canPurge: hasFeaturePermission("trash.purge"),
    }),
    []
  );

  const entityLabels: Record<TrashEntity, string> = {
    lead: config.leadLabel,
    contact: config.contactLabel,
    account: config.accountLabel,
    deal: config.dealLabel,
  };

  const [entity, setEntity] = useState<TrashEntity>("lead");
  const [page, setPage] = useState(0);
  const [records, setRecords] = useState<TrashRecord[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TrashErrorInfo | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashRecord | null>(null);
  const [purgeError, setPurgeError] = useState<TrashErrorInfo | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TrashRecord | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const requestSeq = useRef(0);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    if (!permissions.canView) {
      setLoading(false);
      return;
    }
    // Cancel the previous in-flight request so a slow response from another tab/page can never win.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      // Ask for one extra row to learn whether another page exists (the API returns no total).
      const rows = await getTrashRecords(
        entity,
        { skip: page * PAGE_SIZE, limit: PAGE_SIZE + 1 },
        controller.signal
      );
      if (seq !== requestSeq.current) return;
      setHasNext(rows.length > PAGE_SIZE);
      setRecords(rows.slice(0, PAGE_SIZE));
    } catch (err) {
      if (seq !== requestSeq.current || isRequestCanceled(err)) return;
      setRecords([]);
      setHasNext(false);
      setError(describeTrashError(err, "list", entity, entityLabels[entity]));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
    // entityLabels is derived from the (stable) industry config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, page, permissions.canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const switchEntity = (next: TrashEntity) => {
    if (next === entity) return;
    abortRef.current?.abort();
    setRecords([]);
    setHasNext(false);
    setError(null);
    setLoading(true);
    setEntity(next);
    setPage(0);
    setSearch("");
  };

  const visibleRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        (r.deleted_by_name || "").toLowerCase().includes(q)
    );
  }, [records, search]);

  const handleRestore = async (record: TrashRecord) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(record.id);
    try {
      await restoreTrashRecord(record.entity, record.id);
      setRestoreTarget(null);
      // Remove the restored record right away, then refresh the category from the server.
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      showToast(`"${record.label}" was restored.`);
      // If this was the only row on a later page, step back one page.
      if (records.length === 1 && page > 0) setPage((p) => p - 1);
      else await load();
    } catch (err) {
      setRestoreTarget(null);
      showToast(describeTrashError(err, "restore", record.entity, entityLabels[record.entity]).message, "error");
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const openPurge = (record: TrashRecord) => {
    setPurgeError(null);
    setPurgeTarget(record);
  };

  const confirmPurge = async () => {
    if (!purgeTarget || busyRef.current) return;
    busyRef.current = true;
    setBusyId(purgeTarget.id);
    setPurgeError(null);
    try {
      await purgeTrashRecord(purgeTarget.entity, purgeTarget.id);
      const { label, id } = purgeTarget;
      setPurgeTarget(null);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      showToast(`"${label}" was permanently deleted.`);
      if (records.length === 1 && page > 0) setPage((p) => p - 1);
      else await load();
    } catch (err) {
      // e.g. 409 - the record is still referenced by other records.
      setPurgeError(describeTrashError(err, "purge", purgeTarget.entity, entityLabels[purgeTarget.entity]));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  if (!permissions.canView) {
    return (
      <div className="ins-page">
        <div className="page-header">
          <div>
            <h1>Trash</h1>
            <p className="text-muted">Deleted records can be restored or permanently removed here.</p>
          </div>
        </div>
        <div className="leads-table-container">
          <div className="ins-empty">
            <h3>You do not have access to Trash</h3>
            <p>Ask your administrator for the "View deleted records" permission.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ins-page">
      {toast && (
        <div className={`ins-alert ins-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Trash</h1>
          <p className="text-muted">
            Deleted records are kept here. Restore a record to bring it back, or delete it permanently.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="ins-tabs" role="tablist" aria-label="Deleted record type">
        {TRASH_ENTITIES.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={entity === key}
            className={`ins-tab ${entity === key ? "active" : ""}`}
            onClick={() => switchEntity(key)}
          >
            {entityLabels[key]}
          </button>
        ))}
      </div>

      <div className="ins-toolbar">
        <div className="leads-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search this page by name or deleted by…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search deleted records on this page"
          />
        </div>
        {!loading && !error && (
          <span className="text-muted" style={{ fontSize: "0.85rem" }}>
            {visibleRecords.length} shown on this page
          </span>
        )}
      </div>

      {error && (
        <div className="ins-alert error trash-error" role="alert">
          <div className="trash-error-text">
            <strong>{error.message}</strong>
            {error.detail && <code>{error.detail}</code>}
          </div>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="leads-table-container">
        {loading ? (
          <div className="ins-loading" aria-busy="true">
            <div className="leads-loading-spinner" /> Loading deleted records…
          </div>
        ) : !error && records.length === 0 ? (
          <div className="ins-empty">
            <h3>No deleted records found.</h3>
            <p>Deleted {entityLabels[entity].toLowerCase()} will appear here.</p>
          </div>
        ) : !error && visibleRecords.length === 0 ? (
          <div className="ins-empty">
            <h3>No matching records</h3>
            <p>Nothing on this page matches "{search}".</p>
          </div>
        ) : (
          !error && (
            <>
              <div className="ins-table-wrap">
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Deleted on</th>
                      <th>Deleted by</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecords.map((record) => {
                      const busy = busyId === record.id;
                      return (
                        <tr key={record.id}>
                          <td>
                            <span style={{ fontWeight: 600 }}>{record.label}</span>
                          </td>
                          <td>
                            <span className="ins-badge">{entityLabels[record.entity]}</span>
                          </td>
                          <td className="text-dim">{formatDateTime(record.deleted_at)}</td>
                          <td className="text-dim">{record.deleted_by_name || "—"}</td>
                          <td>
                            <div className="ins-row-actions">
                              {permissions.canRestore && (
                                <button
                                  className="btn-secondary ins-btn-sm"
                                  onClick={() => setRestoreTarget(record)}
                                  disabled={busy}
                                >
                                  {busy ? "Working…" : "Restore"}
                                </button>
                              )}
                              {permissions.canPurge && (
                                <button
                                  className="ins-btn-sm ins-btn-outline-danger"
                                  onClick={() => openPurge(record)}
                                  disabled={busy}
                                >
                                  Delete permanently
                                </button>
                              )}
                              {!permissions.canRestore && !permissions.canPurge && (
                                <span className="text-dim">View only</span>
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

      {restoreTarget && (
        <div className="ins-modal-overlay" role="presentation">
          <div className="ins-modal" role="alertdialog" aria-modal="true" aria-labelledby="restore-title">
            <div className="ins-modal-header">
              <h3 id="restore-title">Restore this record?</h3>
              <button
                className="ins-modal-close"
                onClick={() => setRestoreTarget(null)}
                disabled={busyId === restoreTarget.id}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="ins-modal-body">
              <p style={{ margin: 0 }}>
                Restore the {entityLabels[restoreTarget.entity].toLowerCase()} record{" "}
                <strong>"{restoreTarget.label}"</strong> to your active records?
              </p>
            </div>
            <div className="ins-modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setRestoreTarget(null)}
                disabled={busyId === restoreTarget.id}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => void handleRestore(restoreTarget)}
                disabled={busyId === restoreTarget.id}
              >
                {busyId === restoreTarget.id ? "Restoring…" : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {purgeTarget && (
        <div className="ins-modal-overlay" role="presentation">
          <div className="ins-modal" role="alertdialog" aria-modal="true" aria-labelledby="purge-title" aria-describedby="purge-desc">
            <div className="ins-modal-header">
              <h3 id="purge-title">Delete permanently?</h3>
              <button
                className="ins-modal-close"
                onClick={() => setPurgeTarget(null)}
                disabled={busyId === purgeTarget.id}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="ins-modal-body" id="purge-desc">
              <p style={{ margin: 0 }}>
                You are about to permanently delete the {entityLabels[purgeTarget.entity].toLowerCase()} record{" "}
                <strong>"{purgeTarget.label}"</strong>.
              </p>
              <div className="ins-warning-box" role="note">
                <span>
                  This cannot be undone. Unlike moving a record to Trash, a permanently deleted record can no
                  longer be restored.
                </span>
              </div>
              {purgeError && (
                <div className="ins-alert error" role="alert" style={{ marginTop: 12 }}>
                  <div className="trash-error-text">
                    <strong>{purgeError.message}</strong>
                    {purgeError.detail && <code>{purgeError.detail}</code>}
                  </div>
                </div>
              )}
            </div>
            <div className="ins-modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setPurgeTarget(null)}
                disabled={busyId === purgeTarget.id}
              >
                Cancel
              </button>
              <button
                className="ins-btn-danger"
                onClick={() => void confirmPurge()}
                disabled={busyId === purgeTarget.id}
              >
                {busyId === purgeTarget.id ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
