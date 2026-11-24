import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ActionDialog, Field, inputStyle } from "../booking-journey/StaffBookingActions";
import { RentalStatusBadge } from "./RentalWidgets";
import {
  cancelRentalBookingRequest,
  createAgreementFromRentalBookingRequest,
  createWalkInRentalBookingRequest,
  decideRentalBookingRequest,
  getRentalBookingRequest,
  listRentalBookingRequests,
} from "../../services/rentalService";
import { getContacts } from "../../services/contactService";
import { getLeads } from "../../services/leadService";
import { getProperties } from "../../services/propertyService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime, parseBackendDate } from "../../utils/bookingJourney";
import { formatDay, formatRent } from "../../utils/rentalHelpers";
import { RENTAL_FREQUENCIES } from "../../types/rental";
import { RENTAL_BOOKING_REQUEST_STATUSES, RENTAL_REQUEST_OPEN_STATUSES } from "../../types/rentalBookingRequest";
import type { RentalFrequency } from "../../types/rental";
import type { LateFeeType, RentalBookingRequest, RentalBookingRequestDecision, RentalBookingRequestWalkInCreate } from "../../types/rentalBookingRequest";
import type { Contact } from "../../types/contact";
import type { Lead } from "../../types/lead";
import type { Property } from "../../types/property";

const PAGE_SIZE = 15;

const parseMoney = (raw: string, allowZero: boolean): number | null => {
  const text = raw.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  if (n > 999_999_999_999.99) return null;
  return n > 0 || (allowZero && n === 0) ? n : null;
};
const parseInt0 = (raw: string, min: number, max: number): number | null => {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
};

const holdLine = (r: RentalBookingRequest, now = Date.now()): string => {
  if (!RENTAL_REQUEST_OPEN_STATUSES.includes(r.status) || !r.hold_expires_at) return "—";
  const expires = parseBackendDate(r.hold_expires_at);
  if (!expires) return "—";
  return expires.getTime() > now ? `Until ${formatBookingDateTime(r.hold_expires_at)}` : "Expired (refresh)";
};

/**
 * Staff rent / lease BOOKING REQUESTS (a separate lifecycle from agreements), from /api/v1/rentals/booking-requests:
 *   view (booking.view) · walk-in create (booking.create) · approve / reject / cancel (booking.update) ·
 *   create agreement from an Approved request (booking.create).
 * The server decides every transition; the buttons below only mirror its status rules so staff see what is allowed.
 */
export default function RentalBookingRequestsPanel({
  propertyNames,
  canCreate,
  canUpdate,
  onOpenAgreement,
  onNotify,
}: {
  propertyNames: Record<string, string>;
  canCreate: boolean;
  canUpdate: boolean;
  onOpenAgreement: (agreementId: string) => void;
  onNotify: (message: string) => void;
}) {
  const [rows, setRows] = useState<RentalBookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listRentalBookingRequests());
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load rental booking requests."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPage(0), [search, statusFilter, typeFilter, channelFilter]);

  const nameOf = (r: RentalBookingRequest) => propertyNames[r.property_id] ?? "—";
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (typeFilter && r.booking_type !== typeFilter) return false;
      if (channelFilter && r.channel !== channelFilter) return false;
      return !q || [r.customer_name, r.id, propertyNames[r.property_id] ?? "", r.status].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter, typeFilter, channelFilter, propertyNames]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const hasFilters = Boolean(search || statusFilter || typeFilter || channelFilter);

  return (
    <>
      <div className="ins-toolbar">
        <div className="leads-search-box">
          <input type="text" placeholder="Search by customer, property or status…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search booking requests" />
        </div>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {RENTAL_BOOKING_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
          <option value="">Rent &amp; Lease</option>
          <option value="Rent">Rent</option>
          <option value="Lease">Lease</option>
        </select>
        <select className="filter-select" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} aria-label="Filter by channel">
          <option value="">All channels</option>
          <option value="Portal">Portal</option>
          <option value="Walk-in">Walk-in</option>
        </select>
        {hasFilters && (
          <button className="btn-clear-filters" onClick={() => { setSearch(""); setStatusFilter(""); setTypeFilter(""); setChannelFilter(""); }}>
            Clear filters
          </button>
        )}
        <button className="btn-secondary" onClick={() => void load()} disabled={loading} style={{ marginLeft: "auto" }}>
          Refresh
        </button>
        {canCreate && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            New walk-in request
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

      <div className="leads-table-container">
        {loading && rows.length === 0 ? (
          <div className="ins-loading" aria-busy="true">
            <div className="leads-loading-spinner" /> Loading booking requests…
          </div>
        ) : !error && rows.length === 0 ? (
          <div className="ins-empty">
            <h3>No rental booking requests yet</h3>
            <p>Requests from the customer portal and walk-in requests appear here. Approve one to prepare its agreement.</p>
          </div>
        ) : rows.length > 0 && filtered.length === 0 ? (
          <div className="ins-empty">
            <h3>No matching requests</h3>
            <p>Try adjusting the search or filters.</p>
          </div>
        ) : (
          rows.length > 0 && (
            <>
              <div className="ins-table-wrap">
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Property</th>
                      <th>Type</th>
                      <th>Channel</th>
                      <th>Status</th>
                      <th className="num">Rent</th>
                      <th>Term</th>
                      <th>Hold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id} onClick={() => setSelectedId(r.id)} style={{ cursor: "pointer" }}>
                        <td>
                          <strong>{r.customer_name}</strong>
                          <div className="text-muted" style={{ fontSize: "0.78rem" }}>#{r.id.slice(0, 8).toUpperCase()}</div>
                        </td>
                        <td>{nameOf(r)}</td>
                        <td>{r.booking_type}</td>
                        <td>{r.channel}</td>
                        <td>
                          <RentalStatusBadge status={r.status} />
                        </td>
                        <td className="num">{formatRent(r.approved_rent_amount ?? r.proposed_rent_amount, r.rent_frequency)}</td>
                        <td>
                          {formatDay(r.desired_start_date)} → {r.desired_end_date ? formatDay(r.desired_end_date) : "open-ended"}
                        </td>
                        <td>{holdLine(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className="ins-pager">
                  <button className="btn-secondary ins-btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <span>
                    Page {page + 1} of {pageCount}
                  </span>
                  <button className="btn-secondary ins-btn-sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              )}
            </>
          )
        )}
      </div>

      {selectedId && (
        <RequestDetail
          id={selectedId}
          propertyName={nameOf(rows.find((r) => r.id === selectedId) ?? ({ property_id: "" } as RentalBookingRequest))}
          canCreate={canCreate}
          canUpdate={canUpdate}
          onClose={() => setSelectedId(null)}
          onChanged={async (message) => {
            onNotify(message);
            await load();
          }}
          onOpenAgreement={onOpenAgreement}
        />
      )}
      {creating && (
        <WalkInDialog
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            onNotify("Walk-in request created and the property is on hold.");
            await load();
          }}
        />
      )}
    </>
  );
}

/* ─── detail + actions ─── */

type Sub = null | "approve" | "reject" | "cancel" | "agreement";

function RequestDetail({
  id,
  propertyName,
  canCreate,
  canUpdate,
  onClose,
  onChanged,
  onOpenAgreement,
}: {
  id: string;
  propertyName: string;
  canCreate: boolean;
  canUpdate: boolean;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
  onOpenAgreement: (agreementId: string) => void;
}) {
  const [req, setReq] = useState<RentalBookingRequest | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setReq(await getRentalBookingRequest(id));
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load this request."));
      setReq((prev) => prev ?? null);
    }
  }, [id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const done = async (message: string) => {
    setSub(null);
    await onChanged(message);
    await refresh();
  };

  const createAgreement = async () => {
    if (busy || !req) return;
    setBusy(true);
    setError(null);
    try {
      const agreement = await createAgreementFromRentalBookingRequest(req.id);
      setSub(null);
      await onChanged("Draft agreement created from the request. Open it to send it for signature.");
      onOpenAgreement(agreement.id);
    } catch (err) {
      setError(getApiErrorMessage(err, "The agreement could not be created."));
      setSub(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const open = req ? RENTAL_REQUEST_OPEN_STATUSES.includes(req.status) : false;
  const canDecide = Boolean(req && req.status === "Requested" && canUpdate);
  const canMakeAgreement = Boolean(req && req.status === "Approved" && !req.rental_agreement_id && canCreate);
  const canCancel = Boolean(req && open && canUpdate);

  return (
    <div className="ins-modal-overlay" role="presentation">
      <div className="ins-modal wide" role="dialog" aria-modal="true" aria-labelledby="rbr-title">
        <div className="ins-modal-header">
          <h3 id="rbr-title">Rental booking request{req ? ` · #${req.id.slice(0, 8).toUpperCase()}` : ""}</h3>
          <button type="button" className="ins-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ins-modal-body">
          {error && (
            <div className="ins-alert error" role="alert" style={{ marginBottom: 14 }}>
              <span>{error}</span>
            </div>
          )}
          {req === undefined && <div className="ins-loading" aria-busy="true"><div className="leads-loading-spinner" /> Loading…</div>}
          {req && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <strong>{req.customer_name}</strong>
                  <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                    {[req.customer_email, req.customer_phone].filter(Boolean).join(" · ") || "No contact details"} · {req.channel}
                  </div>
                </div>
                <RentalStatusBadge status={req.status} />
              </div>
              <dl className="bj-facts" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px 18px", margin: 0 }}>
                <Item label="Property" value={propertyName} />
                <Item label="Type" value={req.booking_type} />
                <Item label="Proposed rent" value={formatRent(req.proposed_rent_amount, req.rent_frequency)} />
                <Item label="Approved rent" value={req.approved_rent_amount != null ? formatRent(req.approved_rent_amount, req.rent_frequency) : "Not approved yet"} />
                <Item label="Proposed deposit" value={formatRent(req.proposed_deposit_amount)} />
                <Item label="Approved deposit" value={req.approved_deposit_amount != null ? formatRent(req.approved_deposit_amount) : "Not approved yet"} />
                <Item label="Maintenance" value={Number(req.maintenance_amount) > 0 ? formatRent(req.maintenance_amount, req.maintenance_frequency) : "None"} />
                <Item label="Start" value={formatDay(req.desired_start_date)} />
                <Item label="End" value={req.desired_end_date ? formatDay(req.desired_end_date) : "Open-ended"} />
                <Item label="Duration" value={req.duration_months ? `${req.duration_months} months` : "—"} />
                <Item label="Lock-in / notice" value={`${req.lock_in_months} months / ${req.notice_period_days} days`} />
                <Item label="Rent due day" value={`Day ${req.due_day}`} />
                <Item label="Late fee" value={Number(req.late_fee_amount ?? 0) > 0 ? `${req.late_fee_type === "Percentage" ? `${req.late_fee_amount}%` : formatRent(req.late_fee_amount)} after ${req.late_fee_grace_days ?? 0} days` : "None"} />
                <Item label="Property hold" value={holdLine(req)} />
                <Item label="Submitted" value={formatBookingDateTime(req.created_at)} />
                <Item label="Reviewed" value={req.reviewed_at ? formatBookingDateTime(req.reviewed_at) : "Not reviewed"} />
              </dl>
              {req.customer_notes && <Note title="Customer notes" text={req.customer_notes} />}
              {req.terms_notes && <Note title="Terms" text={req.terms_notes} />}
              {req.staff_notes && <Note title="Staff notes" text={req.staff_notes} />}
              {req.rejection_reason && <Note title="Rejection reason" text={req.rejection_reason} />}
              {req.cancellation_reason && <Note title="Cancellation reason" text={req.cancellation_reason} />}
              {req.status === "Expired - Payment Review" && <Note title="Needs attention" text="The hold expired while a payment was awaiting review. Resolve the payment before releasing the property." />}
              {!canUpdate && !canCreate && <p className="text-muted" style={{ fontSize: "0.85rem" }}>You can view this request. Approving, cancelling and creating agreements need additional permissions.</p>}
            </>
          )}
        </div>
        <div className="ins-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {req?.rental_agreement_id && (
            <button type="button" className="btn-secondary" onClick={() => onOpenAgreement(req.rental_agreement_id as string)}>
              Open agreement
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn-secondary" onClick={() => setSub("cancel")}>
              Cancel request
            </button>
          )}
          {canDecide && (
            <button type="button" className="btn-secondary" onClick={() => setSub("reject")}>
              Reject
            </button>
          )}
          {canDecide && (
            <button type="button" className="btn-primary" onClick={() => setSub("approve")}>
              Approve
            </button>
          )}
          {canMakeAgreement && (
            <button type="button" className="btn-primary" onClick={() => setSub("agreement")}>
              Create agreement
            </button>
          )}
        </div>
      </div>

      {req && sub === "approve" && <ApproveDialog req={req} onClose={() => setSub(null)} onDone={() => done("Request approved. The property stays on hold while the agreement is prepared.")} />}
      {req && sub === "reject" && <RejectDialog req={req} onClose={() => setSub(null)} onDone={() => done("Request rejected and the property hold released.")} />}
      {req && sub === "cancel" && <CancelDialog req={req} onClose={() => setSub(null)} onDone={() => done("Request cancelled.")} />}
      {req && sub === "agreement" && (
        <ActionDialog
          title="Create a draft agreement?"
          titleId="rbr-agr"
          error={null}
          busy={busy}
          submitLabel="Create agreement"
          onClose={() => setSub(null)}
          onSubmit={(e) => {
            e.preventDefault();
            void createAgreement();
          }}
        >
          <p style={{ margin: 0 }}>
            A Draft {req.booking_type.toLowerCase()} agreement will be created for <strong>{req.customer_name}</strong> at{" "}
            {formatRent(req.approved_rent_amount ?? req.proposed_rent_amount, req.rent_frequency)} using the approved terms. You can review it and send it for signature next.
          </p>
        </ActionDialog>
      )}
    </div>
  );
}

const Item = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</dt>
    <dd style={{ margin: "2px 0 0", fontWeight: 600 }}>{value}</dd>
  </div>
);
const Note = ({ title, text }: { title: string; text: string }) => (
  <div className="bj-note" style={{ marginTop: 12 }}>
    <strong>{title}:</strong> {text}
  </div>
);

/* ─── approve ─── */

function ApproveDialog({ req, onClose, onDone }: { req: RentalBookingRequest; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [rent, setRent] = useState(String(Number(req.proposed_rent_amount)));
  const [deposit, setDeposit] = useState(String(Number(req.proposed_deposit_amount)));
  const [maintenance, setMaintenance] = useState(String(Number(req.maintenance_amount)));
  const [maintFreq, setMaintFreq] = useState<RentalFrequency>((req.maintenance_frequency as RentalFrequency) || "Monthly");
  const [start, setStart] = useState(req.desired_start_date);
  const [end, setEnd] = useState(req.desired_end_date ?? "");
  const [duration, setDuration] = useState(req.duration_months ? String(req.duration_months) : "");
  const [lockIn, setLockIn] = useState(String(req.lock_in_months));
  const [notice, setNotice] = useState(String(req.notice_period_days));
  const [dueDay, setDueDay] = useState(String(req.due_day));
  const [lateType, setLateType] = useState<LateFeeType>((req.late_fee_type as LateFeeType) || "Fixed");
  const [lateAmount, setLateAmount] = useState(String(Number(req.late_fee_amount ?? 0)));
  const [lateGrace, setLateGrace] = useState(String(req.late_fee_grace_days ?? 0));
  const [holdHours, setHoldHours] = useState("");
  const [terms, setTerms] = useState(req.terms_notes ?? "");
  const [staffNotes, setStaffNotes] = useState(req.staff_notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const er: Record<string, string> = {};
    const rentV = parseMoney(rent, false);
    if (rentV === null) er.rent = "Enter a rent greater than zero (at most 2 decimals).";
    const depV = parseMoney(deposit, true);
    if (depV === null) er.deposit = "Enter the deposit (0 or more).";
    const maintV = parseMoney(maintenance || "0", true);
    if (maintV === null) er.maintenance = "Enter a valid maintenance amount (0 or more).";
    if (!start) er.start = "Choose the start date.";
    if (end && start && end < start) er.end = "The end date cannot be before the start date.";
    const dur = duration.trim() === "" ? null : parseInt0(duration, 1, 600);
    if (duration.trim() !== "" && dur === null) er.duration = "Whole months between 1 and 600.";
    const lock = parseInt0(lockIn, 0, 600);
    if (lock === null) er.lockIn = "Whole months between 0 and 600.";
    if (lock !== null && dur !== null && lock > dur) er.lockIn = "The lock-in period cannot exceed the duration.";
    const noticeV = parseInt0(notice, 0, 365);
    if (noticeV === null) er.notice = "Whole days between 0 and 365.";
    const due = parseInt0(dueDay, 1, 28);
    if (due === null) er.dueDay = "A day between 1 and 28.";
    const lateV = parseMoney(lateAmount || "0", true);
    if (lateV === null) er.lateAmount = "Enter a valid late fee (0 or more).";
    const graceV = parseInt0(lateGrace || "0", 0, 365);
    if (graceV === null) er.lateGrace = "Whole days between 0 and 365.";
    const hold = holdHours.trim() === "" ? null : parseInt0(holdHours, 1, 720);
    if (holdHours.trim() !== "" && hold === null) er.holdHours = "Whole hours between 1 and 720.";
    setErrors(er);
    if (Object.keys(er).length > 0) return;
    const payload: RentalBookingRequestDecision = {
      decision: "Approve",
      approved_rent_amount: rentV,
      approved_deposit_amount: depV,
      maintenance_amount: maintV,
      maintenance_frequency: maintFreq,
      desired_start_date: start,
      desired_end_date: end || null,
      duration_months: dur,
      lock_in_months: lock,
      notice_period_days: noticeV,
      due_day: due,
      late_fee_type: lateType,
      late_fee_amount: lateV,
      late_fee_grace_days: graceV,
      hold_hours: hold,
      terms_notes: terms.trim() || null,
      staff_notes: staffNotes.trim() || null,
    };
    setBusy(true);
    setApiError(null);
    try {
      await decideRentalBookingRequest(req.id, payload);
      await onDone();
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The request could not be approved."));
    } finally {
      setBusy(false);
    }
  };

  const text = (id: string, label: string, value: string, set: (v: string) => void, key: string, hint?: string) => (
    <Field id={id} label={label} error={errors[key]} hint={hint}>
      <input id={id} className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
    </Field>
  );

  return (
    <ActionDialog title="Approve request" titleId="rbr-approve" error={apiError} busy={busy} submitLabel="Approve request" onClose={onClose} onSubmit={submit}>
      <p className="text-muted" style={{ marginTop: 0 }}>
        Confirm or adjust the commercial terms. Approving keeps the property on hold for the customer while the agreement is prepared.
      </p>
      {text("ap-rent", "Approved rent", rent, setRent, "rent", `Customer proposed ${formatRent(req.proposed_rent_amount, req.rent_frequency)}`)}
      {text("ap-dep", "Approved security deposit", deposit, setDeposit, "deposit")}
      {text("ap-maint", "Maintenance amount", maintenance, setMaintenance, "maintenance")}
      <Field id="ap-mf" label="Maintenance frequency">
        <select id="ap-mf" className="filter-select" style={inputStyle} value={maintFreq} onChange={(e) => setMaintFreq(e.target.value as RentalFrequency)}>
          {RENTAL_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Field>
      <Field id="ap-start" label="Start date" error={errors.start}>
        <input id="ap-start" type="date" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field id="ap-end" label="End date" error={errors.end} hint="Leave empty for an open-ended rent (a lease needs a fixed term).">
        <input id="ap-end" type="date" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} value={end} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      {text("ap-dur", "Duration (months)", duration, setDuration, "duration")}
      {text("ap-lock", "Lock-in (months)", lockIn, setLockIn, "lockIn")}
      {text("ap-notice", "Notice period (days)", notice, setNotice, "notice")}
      {text("ap-due", "Rent due day (1-28)", dueDay, setDueDay, "dueDay")}
      <Field id="ap-lt" label="Late fee type">
        <select id="ap-lt" className="filter-select" style={inputStyle} value={lateType} onChange={(e) => setLateType(e.target.value as LateFeeType)}>
          <option value="Fixed">Fixed amount</option>
          <option value="Percentage">Percentage</option>
        </select>
      </Field>
      {text("ap-la", lateType === "Percentage" ? "Late fee (%)" : "Late fee amount", lateAmount, setLateAmount, "lateAmount")}
      {text("ap-lg", "Late fee grace (days)", lateGrace, setLateGrace, "lateGrace")}
      {text("ap-hold", "Hold the property for (hours)", holdHours, setHoldHours, "holdHours", "Optional. Leave empty to use the default hold period.")}
      <Field id="ap-terms" label="Terms for the customer">
        <textarea id="ap-terms" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={2} maxLength={5000} value={terms} onChange={(e) => setTerms(e.target.value)} />
      </Field>
      <Field id="ap-notes" label="Internal notes">
        <textarea id="ap-notes" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={2} maxLength={5000} value={staffNotes} onChange={(e) => setStaffNotes(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

/* ─── reject / cancel ─── */

function RejectDialog({ req, onClose, onDone }: { req: RentalBookingRequest; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [reason, setReason] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setApiError(null);
    try {
      await decideRentalBookingRequest(req.id, { decision: "Reject", rejection_reason: reason.trim() || null });
      await onDone();
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The request could not be rejected."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ActionDialog title="Reject request" titleId="rbr-reject" error={apiError} busy={busy} submitLabel="Reject request" submitClass="btn-primary" onClose={onClose} onSubmit={submit}>
      <p style={{ marginTop: 0 }}>
        Reject the request from <strong>{req.customer_name}</strong>? The property hold is released.
      </p>
      <Field id="rj-reason" label="Reason shown to the customer" hint="Optional, but the customer sees it.">
        <textarea id="rj-reason" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} maxLength={5000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

function CancelDialog({ req, onClose, onDone }: { req: RentalBookingRequest; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (reason.trim().length < 3) {
      setReasonError("Enter a reason (at least 3 characters).");
      return;
    }
    setBusy(true);
    setApiError(null);
    try {
      await cancelRentalBookingRequest(req.id, reason.trim());
      await onDone();
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The request could not be cancelled."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ActionDialog title="Cancel request" titleId="rbr-cancel" error={apiError} busy={busy} submitLabel="Cancel request" onClose={onClose} onSubmit={submit}>
      <p style={{ marginTop: 0 }}>
        Cancel the {req.status.toLowerCase()} request from <strong>{req.customer_name}</strong>? The property hold is released unless verified payments exist (the server will refuse in that case).
      </p>
      <Field id="cn-reason" label="Reason *" error={reasonError}>
        <textarea id="cn-reason" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} maxLength={5000} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(undefined); }} />
      </Field>
    </ActionDialog>
  );
}

/* ─── walk-in request ─── */

function WalkInDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void | Promise<void> }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [propertyId, setPropertyId] = useState("");
  const [customer, setCustomer] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("0");
  const [maintenance, setMaintenance] = useState("0");
  const [maintFreq, setMaintFreq] = useState<RentalFrequency>("Monthly");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState("");
  const [lockIn, setLockIn] = useState("0");
  const [notice, setNotice] = useState("30");
  const [dueDay, setDueDay] = useState("5");
  const [lateType, setLateType] = useState<LateFeeType>("Fixed");
  const [lateAmount, setLateAmount] = useState("0");
  const [lateGrace, setLateGrace] = useState("0");
  const [holdHours, setHoldHours] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchProps = async (): Promise<Property[]> => {
      try {
        const result = await getProperties({ limit: 100 });
        return Array.isArray(result) ? result : [];
      } catch (err) {
        console.warn("[WalkInDialog] Failed to load properties:", err);
        return [];
      }
    };
    Promise.all([fetchProps(), getContacts().catch(() => [] as Contact[]), getLeads().catch(() => [] as Lead[])]).then(([props, c, l]) => {
      if (cancelled) return;
      // The server only accepts an Available Rent / Lease property here (a Reserved one needs an accepted offer, which this form does not link).
      setProperties(props.filter((p) => (p.listing_type === "Rent" || p.listing_type === "Lease") && p.status === "Available"));
      setContacts(c);
      setLeads(l);
      setRefsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const property = properties.find((p) => p.id === propertyId) ?? null;
  const customers = useMemo(
    () => [
      ...contacts.map((c) => ({ value: `contact:${c.id}`, label: `${c.full_name}${c.phone ? ` · ${c.phone}` : ""} (contact)` })),
      ...leads.map((l) => ({ value: `lead:${l.id}`, label: `${l.full_name}${l.phone ? ` · ${l.phone}` : ""} (lead)` })),
    ],
    [contacts, leads]
  );

  const pickProperty = (id: string) => {
    const p = properties.find((x) => x.id === id);
    setPropertyId(id);
    setRent(p ? String(Number(p.price)) : "");
    setDeposit(p?.security_deposit != null ? String(Number(p.security_deposit)) : "0");
  };
  const pickCustomer = (value: string) => {
    setCustomer(value);
    const [kind, id] = value.split(":");
    const c = kind === "contact" ? contacts.find((x) => x.id === id) : undefined;
    const l = kind === "lead" ? leads.find((x) => x.id === id) : undefined;
    setName(c?.full_name || l?.full_name || "");
    setEmail(c?.email || l?.email || "");
    setPhone(c?.phone || l?.phone || "");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const er: Record<string, string> = {};
    if (!property) er.property = "Choose an available rent or lease property.";
    if (!customer) er.customer = "Link a contact or lead (the server requires one).";
    if (!name.trim()) er.name = "Enter the customer's name.";
    const rentV = parseMoney(rent, false);
    if (rentV === null) er.rent = "Enter a rent greater than zero (at most 2 decimals).";
    const depV = parseMoney(deposit || "0", true);
    if (depV === null) er.deposit = "Enter a valid deposit (0 or more).";
    const maintV = parseMoney(maintenance || "0", true);
    if (maintV === null) er.maintenance = "Enter a valid maintenance amount (0 or more).";
    if (!start) er.start = "Choose the start date.";
    if (end && start && end < start) er.end = "The end date cannot be before the start date.";
    const dur = duration.trim() === "" ? null : parseInt0(duration, 1, 600);
    if (duration.trim() !== "" && dur === null) er.duration = "Whole months between 1 and 600.";
    if (property?.listing_type === "Lease" && !end && dur === null) er.duration = "A lease needs a fixed term: enter a duration or an end date.";
    if (dur !== null && property) {
      if (property.minimum_term_months != null && dur < property.minimum_term_months) er.duration = `The minimum term for this property is ${property.minimum_term_months} months.`;
      if (property.maximum_term_months != null && dur > property.maximum_term_months) er.duration = `The maximum term for this property is ${property.maximum_term_months} months.`;
    }
    const lock = parseInt0(lockIn || "0", 0, 600);
    if (lock === null) er.lockIn = "Whole months between 0 and 600.";
    if (lock !== null && dur !== null && lock > dur) er.lockIn = "The lock-in period cannot exceed the duration.";
    const noticeV = parseInt0(notice || "0", 0, 365);
    if (noticeV === null) er.notice = "Whole days between 0 and 365.";
    const due = parseInt0(dueDay, 1, 28);
    if (due === null) er.dueDay = "A day between 1 and 28.";
    const lateV = parseMoney(lateAmount || "0", true);
    if (lateV === null) er.lateAmount = "Enter a valid late fee (0 or more).";
    const graceV = parseInt0(lateGrace || "0", 0, 365);
    if (graceV === null) er.lateGrace = "Whole days between 0 and 365.";
    const hold = holdHours.trim() === "" ? null : parseInt0(holdHours, 1, 720);
    if (holdHours.trim() !== "" && hold === null) er.holdHours = "Whole hours between 1 and 720.";
    setErrors(er);
    if (Object.keys(er).length > 0 || !property || rentV === null) return;
    const [kind, id] = customer.split(":");
    const payload: RentalBookingRequestWalkInCreate = {
      property_id: property.id,
      booking_type: property.listing_type as "Rent" | "Lease",
      ...(kind === "contact" ? { contact_id: id } : { lead_id: id }),
      customer_name: name.trim(),
      customer_email: email.trim() || null,
      customer_phone: phone.trim() || null,
      proposed_rent_amount: rentV,
      proposed_deposit_amount: depV ?? 0,
      maintenance_amount: maintV ?? 0,
      maintenance_frequency: maintFreq,
      desired_start_date: start,
      desired_end_date: end || null,
      duration_months: dur,
      lock_in_months: lock ?? 0,
      notice_period_days: noticeV ?? 30,
      due_day: due ?? 5,
      late_fee_type: lateType,
      late_fee_amount: lateV ?? 0,
      late_fee_grace_days: graceV ?? 0,
      hold_hours: hold,
      terms_notes: terms.trim() || null,
      staff_notes: notes.trim() || null,
    };
    setBusy(true);
    setApiError(null);
    try {
      await createWalkInRentalBookingRequest(payload);
      await onCreated();
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The request could not be created."));
    } finally {
      setBusy(false);
    }
  };

  const num = (id: string, label: string, value: string, set: (v: string) => void, key: string, hint?: string): ReactNode => (
    <Field id={id} label={label} error={errors[key]} hint={hint}>
      <input id={id} className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
    </Field>
  );

  return (
    <ActionDialog title="New walk-in rental request" titleId="rbr-new" error={apiError} busy={busy} submitLabel="Create request" onClose={onClose} onSubmit={submit}>
      {refsLoading && <p className="text-muted" style={{ marginTop: 0 }}>Loading properties and customers…</p>}
      <Field id="wi-prop" label="Property *" error={errors.property} hint={!refsLoading && properties.length === 0 ? "No available rent or lease property found. Only available rent and lease properties are listed." : "Only available rent and lease properties are listed. Creating the request places the property on hold."}>
        <select id="wi-prop" className="filter-select" style={inputStyle} value={propertyId} onChange={(e) => pickProperty(e.target.value)} disabled={refsLoading}>
          <option value="">{refsLoading ? "Loading properties…" : properties.length === 0 ? "No available rent or lease properties" : "Select a property…"}</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.listing_type}, {formatRent(p.price, p.price_frequency)}
            </option>
          ))}
        </select>
      </Field>
      <Field id="wi-cust" label="Customer record *" error={errors.customer}>
        <select id="wi-cust" className="filter-select" style={inputStyle} value={customer} onChange={(e) => pickCustomer(e.target.value)} disabled={refsLoading}>
          <option value="">Select a contact or lead…</option>
          {customers.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id="wi-name" label="Customer name *" error={errors.name}>
        <input id="wi-name" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="wi-email" label="Email">
        <input id="wi-email" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field id="wi-phone" label="Phone">
        <input id="wi-phone" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      {num("wi-rent", "Proposed rent *", rent, setRent, "rent")}
      {num("wi-dep", "Proposed security deposit", deposit, setDeposit, "deposit")}
      {num("wi-maint", "Maintenance amount", maintenance, setMaintenance, "maintenance")}
      <Field id="wi-mf" label="Maintenance frequency">
        <select id="wi-mf" className="filter-select" style={inputStyle} value={maintFreq} onChange={(e) => setMaintFreq(e.target.value as RentalFrequency)}>
          {RENTAL_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Field>
      <Field id="wi-start" label="Start date *" error={errors.start}>
        <input id="wi-start" type="date" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field id="wi-end" label="End date" error={errors.end}>
        <input id="wi-end" type="date" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      {num("wi-dur", `Duration (months)${property?.listing_type === "Lease" ? " *" : ""}`, duration, setDuration, "duration", property && (property.minimum_term_months != null || property.maximum_term_months != null) ? `Allowed: ${property.minimum_term_months ?? "any"}–${property.maximum_term_months ?? "any"} months` : undefined)}
      {num("wi-lock", "Lock-in (months)", lockIn, setLockIn, "lockIn")}
      {num("wi-notice", "Notice period (days)", notice, setNotice, "notice")}
      {num("wi-due", "Rent due day (1-28)", dueDay, setDueDay, "dueDay")}
      <Field id="wi-lt" label="Late fee type">
        <select id="wi-lt" className="filter-select" style={inputStyle} value={lateType} onChange={(e) => setLateType(e.target.value as LateFeeType)}>
          <option value="Fixed">Fixed amount</option>
          <option value="Percentage">Percentage</option>
        </select>
      </Field>
      {num("wi-la", lateType === "Percentage" ? "Late fee (%)" : "Late fee amount", lateAmount, setLateAmount, "lateAmount")}
      {num("wi-lg", "Late fee grace (days)", lateGrace, setLateGrace, "lateGrace")}
      {num("wi-hold", "Hold the property for (hours)", holdHours, setHoldHours, "holdHours", "Optional. Leave empty to use the default hold period.")}
      <Field id="wi-terms" label="Terms">
        <textarea id="wi-terms" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={2} maxLength={5000} value={terms} onChange={(e) => setTerms(e.target.value)} />
      </Field>
      <Field id="wi-notes" label="Internal notes">
        <textarea id="wi-notes" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}
