import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ActionDialog, Field, inputStyle } from "./StaffBookingActions";
import { RentalStatusBadge } from "../rentals/RentalWidgets";
import {
  decideStaffCancellationRequest,
  getStaffCancellationRequests,
  getStaffServiceRequests,
  updateStaffServiceRequest,
} from "../../services/customerBookingWorkflowService";
import { getUsers } from "../../services/userService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { SERVICE_REQUEST_STATUSES } from "../../types/customerLifecycle";
import type { CancellationRequest, ServiceRequest, ServiceRequestStatus } from "../../types/customerLifecycle";
import type { User } from "../../types/user";

/** A booking request the queue can link to (the cancellation payload only carries the booking id). */
export interface BookingLink {
  requestId: string;
  propertyName: string;
}

/* ═══════════════ Cancellation requests ═══════════════ */

/**
 * Customer booking-cancellation requests (GET /customer-booking-workflow/cancellation-requests, booking.view). Deciding needs
 * booking.update. Approving is refused by the server (409) until every received payment has a Processed refund and none is pending -
 * the refunds themselves are handled on the Payments page; this screen never invents a refund action.
 */
export function StaffCancellationQueue({
  canDecide,
  bookingLinks,
  basePath,
  onNotify,
}: {
  canDecide: boolean;
  bookingLinks: Record<string, BookingLink>;
  basePath: string;
  onNotify: (message: string) => void;
}) {
  const [rows, setRows] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [deciding, setDeciding] = useState<{ row: CancellationRequest; decision: "Approve" | "Reject" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getStaffCancellationRequests());
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load cancellation requests."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => rows.filter((r) => !statusFilter || r.status === statusFilter), [rows, statusFilter]);

  return (
    <>
      <div className="ins-toolbar">
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <button className="btn-secondary" onClick={() => void load()} disabled={loading} style={{ marginLeft: "auto" }}>
          Refresh
        </button>
      </div>
      {error && (
        <div className="ins-alert error" role="alert">
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      <div className="leads-table-container">
        {loading && rows.length === 0 ? (
          <div className="ins-loading" aria-busy="true">
            <div className="leads-loading-spinner" /> Loading cancellation requests…
          </div>
        ) : !error && rows.length === 0 ? (
          <div className="ins-empty">
            <h3>No cancellation requests</h3>
            <p>When a customer asks to cancel a booking from the portal, the request appears here for review.</p>
          </div>
        ) : visible.length === 0 && rows.length > 0 ? (
          <div className="ins-empty">
            <h3>No matching requests</h3>
            <p>Try another status.</p>
          </div>
        ) : (
          rows.length > 0 && (
            <div className="ins-table-wrap">
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>Booking</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Staff notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const link = bookingLinks[r.booking_id];
                    return (
                      <tr key={r.id}>
                        <td>{formatBookingDateTime(r.created_at)}</td>
                        <td>
                          {link ? (
                            <Link to={`${basePath}/customer-booking-requests/${link.requestId}`}>{link.propertyName || `#${r.booking_id.slice(0, 8).toUpperCase()}`}</Link>
                          ) : (
                            `#${r.booking_id.slice(0, 8).toUpperCase()}`
                          )}
                        </td>
                        <td style={{ maxWidth: 320, whiteSpace: "normal" }}>{r.reason}</td>
                        <td>
                          <RentalStatusBadge status={r.status} />
                          {r.reviewed_at && <div className="text-muted" style={{ fontSize: "0.75rem" }}>{formatBookingDateTime(r.reviewed_at)}</div>}
                        </td>
                        <td style={{ maxWidth: 240, whiteSpace: "normal" }}>{r.staff_notes || "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {r.status === "Pending" && canDecide ? (
                            <>
                              <button className="btn-secondary ins-btn-sm" onClick={() => setDeciding({ row: r, decision: "Reject" })}>
                                Reject
                              </button>{" "}
                              <button className="btn-primary ins-btn-sm" onClick={() => setDeciding({ row: r, decision: "Approve" })}>
                                Approve
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      {deciding && (
        <CancellationDecisionDialog
          row={deciding.row}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={async () => {
            const decision = deciding.decision;
            setDeciding(null);
            onNotify(decision === "Approve" ? "Cancellation approved. The booking is cancelled and the property released." : "Cancellation request rejected.");
            await load();
          }}
        />
      )}
    </>
  );
}

function CancellationDecisionDialog({ row, decision, onClose, onDone }: { row: CancellationRequest; decision: "Approve" | "Reject"; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [notes, setNotes] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setApiError(null);
    try {
      await decideStaffCancellationRequest(row.id, { decision, staff_notes: notes.trim() || null });
      await onDone();
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The decision could not be saved."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ActionDialog title={`${decision} cancellation`} titleId="cxq-title" error={apiError} busy={busy} submitLabel={decision === "Approve" ? "Approve cancellation" : "Reject request"} onClose={onClose} onSubmit={submit}>
      <p style={{ marginTop: 0 }}>
        <strong>Customer's reason:</strong> {row.reason}
      </p>
      {decision === "Approve" && (
        <div className="bj-note bj-warn" style={{ marginBottom: 14 }}>
          Approving cancels the booking, releases the property and rejects any in-flight payments. The server refuses it until every verified payment has a <strong>processed refund</strong> and no refund is pending — process those on the Payments page first.
        </div>
      )}
      <Field id="cxq-notes" label={decision === "Reject" ? "Message to the customer" : "Notes (shown to the customer)"} hint="Optional.">
        <textarea id="cxq-notes" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

/* ═══════════════ After-sales (service) requests ═══════════════ */

/**
 * After-sales requests (GET /customer-booking-workflow/service-requests?status=, support_ticket.view; PATCH needs support_ticket.update).
 * The PATCH always overwrites resolution and internal notes with what is submitted, and the API does not return the internal notes,
 * so the form prefills the resolution and says that the internal note is replaced.
 */
export function StaffServiceRequestQueue({
  canUpdate,
  bookingLinks,
  basePath,
  onNotify,
}: {
  canUpdate: boolean;
  bookingLinks: Record<string, BookingLink>;
  basePath: string;
  onNotify: (message: string) => void;
}) {
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ServiceRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getStaffServiceRequests(statusFilter || undefined));
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load after-sales requests."));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => !q || [r.subject, r.category, r.description, r.priority].some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  return (
    <>
      <div className="ins-toolbar">
        <div className="leads-search-box">
          <input type="text" placeholder="Search by subject, category or description…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search service requests" />
        </div>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {SERVICE_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={() => void load()} disabled={loading} style={{ marginLeft: "auto" }}>
          Refresh
        </button>
      </div>
      {error && (
        <div className="ins-alert error" role="alert">
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      <div className="leads-table-container">
        {loading && rows.length === 0 ? (
          <div className="ins-loading" aria-busy="true">
            <div className="leads-loading-spinner" /> Loading after-sales requests…
          </div>
        ) : !error && rows.length === 0 ? (
          <div className="ins-empty">
            <h3>No after-sales requests</h3>
            <p>{statusFilter ? "No request has this status." : "Customers can raise maintenance and after-sales requests once their sale is completed."}</p>
          </div>
        ) : visible.length === 0 && rows.length > 0 ? (
          <div className="ins-empty">
            <h3>No matching requests</h3>
            <p>Try adjusting the search.</p>
          </div>
        ) : (
          rows.length > 0 && (
            <div className="ins-table-wrap">
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>Raised</th>
                    <th>Subject</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Booking</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const link = bookingLinks[r.booking_id];
                    return (
                      <tr key={r.id}>
                        <td>{formatBookingDateTime(r.created_at)}</td>
                        <td style={{ maxWidth: 320, whiteSpace: "normal" }}>
                          <strong>{r.subject}</strong>
                          <div className="text-muted" style={{ fontSize: "0.8rem" }}>{r.description}</div>
                        </td>
                        <td>{r.category}</td>
                        <td>{r.priority}</td>
                        <td>
                          <RentalStatusBadge status={r.status} />
                          {r.closed_at && <div className="text-muted" style={{ fontSize: "0.75rem" }}>Closed {formatBookingDateTime(r.closed_at)}</div>}
                        </td>
                        <td>{link ? <Link to={`${basePath}/customer-booking-requests/${link.requestId}`}>{link.propertyName || `#${r.booking_id.slice(0, 8).toUpperCase()}`}</Link> : `#${r.booking_id.slice(0, 8).toUpperCase()}`}</td>
                        <td>
                          {canUpdate && (
                            <button className="btn-secondary ins-btn-sm" onClick={() => setEditing(r)}>
                              Update
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      {editing && (
        <ServiceUpdateDialog
          row={editing}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            onNotify("After-sales request updated. The customer has been notified.");
            await load();
          }}
        />
      )}
    </>
  );
}

function ServiceUpdateDialog({ row, onClose, onDone }: { row: ServiceRequest; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [status, setStatus] = useState<ServiceRequestStatus>((SERVICE_REQUEST_STATUSES as readonly string[]).includes(row.status) ? (row.status as ServiceRequestStatus) : "Open");
  const [resolution, setResolution] = useState(row.resolution ?? "");
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUsers()
      .then((list) => !cancelled && setUsers(list.filter((u) => u.status === "Active")))
      .catch(() => undefined); // assigning is optional
    return () => {
      cancelled = true;
    };
  }, []);

  const closing = status === "Resolved" || status === "Closed" || status === "Rejected";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setApiError(null);
    try {
      await updateStaffServiceRequest(row.id, {
        status,
        resolution: resolution.trim() || null,
        staff_notes: notes.trim() || null,
        ...(assignee ? { assigned_to: assignee } : {}),
      });
      await onDone();
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The request could not be updated."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog title="Update after-sales request" titleId="svq-title" error={apiError} busy={busy} submitLabel="Save update" onClose={onClose} onSubmit={submit}>
      <p style={{ marginTop: 0 }}>
        <strong>{row.subject}</strong> · {row.category} · {row.priority} priority
        <br />
        <span className="text-muted">{row.description}</span>
      </p>
      <Field id="svq-status" label="Status *" hint={closing ? "Resolved, Closed and Rejected stamp the closing time." : undefined}>
        <select id="svq-status" className="filter-select" style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value as ServiceRequestStatus)}>
          {SERVICE_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field id="svq-resolution" label="Resolution (shown to the customer)">
        <textarea id="svq-resolution" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} maxLength={5000} value={resolution} onChange={(e) => setResolution(e.target.value)} />
      </Field>
      <Field id="svq-assignee" label="Assign to" hint="Leave empty to keep the current assignee.">
        <select id="svq-assignee" className="filter-select" style={inputStyle} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">No change</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="svq-notes" label="Internal notes" hint="Saving replaces any existing internal note with this text (the API does not return the current one).">
        <textarea id="svq-notes" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}
