import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  getStaffHandover,
  scheduleStaffHandover,
  updateStaffHandover,
} from "../../services/customerBookingWorkflowService";
import { acknowledgeHandover } from "../../services/customerPortalJourneyService";
import { getUsers } from "../../services/userService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime, parseBackendDate } from "../../utils/bookingJourney";
import {
  evaluateHandoverEligibility,
  explainHandoverCompletionError,
  type HandoverEligibility,
} from "../../utils/handoverEligibility";
import { BookingFacts, BookingStatusBadge } from "./BookingJourneyWidgets";
import { ActionDialog, Field, inputStyle } from "./StaffBookingActions";
import type {
  BookingRequestDetail,
  HandoverChecklistItem,
  PortalHandover,
  StaffHandover,
} from "../../types/customerBookingJourney";
import type { User } from "../../types/user";
import "../../pages/insights/CrmInsights.css";
import "./BookingJourney.css";

/* ─── helpers ─── */

const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Local date + time chosen by the user -> UTC ISO string the backend stores. */
const toUtcIso = (date: string, time: string): string | null => {
  const when = new Date(`${date}T${time}`);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
};

const formatDate = (value: string | null): string => {
  const d = parseBackendDate(value);
  return d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—";
};
const formatTime = (value: string | null): string => {
  const d = parseBackendDate(value);
  return d ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
};

/** Staff may only edit an open handover. */
const isOpen = (status: string) => status !== "Completed" && status !== "Cancelled";

/* ─── Staff section ─── */

type StaffModal = "schedule" | "reschedule" | "cancel" | "complete" | null;

export function StaffHandoverSection({
  detail,
  canManage,
  notify,
  onRefresh,
}: {
  detail: BookingRequestDetail;
  canManage: boolean;
  notify: (message: string, type?: "success" | "error") => void;
  /** Re-fetches the booking request (payments, booking and sale status) so eligibility never uses stale data. */
  onRefresh?: () => Promise<void>;
}) {
  const bookingId = detail.booking_id;
  const eligible =
    Boolean(bookingId) && (detail.status === "Confirmed" || detail.status === "Completed") && detail.agreement_status === "Verified";

  /** undefined = loading, null = none scheduled. */
  const [handover, setHandover] = useState<StaffHandover | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<StaffModal>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) {
      setHandover(null);
      return;
    }
    setLoadError(null);
    try {
      setHandover(await getStaffHandover(bookingId));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, "Failed to load the property handover."));
      setHandover((prev) => (prev === undefined ? null : prev));
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The sale is completed on another page and payments are verified elsewhere: re-read the handover AND the booking
  // request whenever the user returns to this tab, so the completion requirements below are never stale.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  useEffect(() => {
    const refreshAll = () => {
      if (document.hidden) return;
      void load();
      void onRefreshRef.current?.();
    };
    document.addEventListener("visibilitychange", refreshAll);
    window.addEventListener("focus", refreshAll);
    return () => {
      document.removeEventListener("visibilitychange", refreshAll);
      window.removeEventListener("focus", refreshAll);
    };
  }, [load]);

  const done = async (message: string) => {
    setModal(null);
    notify(message);
    await Promise.all([load(), onRefreshRef.current?.()]);
  };

  /** Evaluated from the latest booking request + handover; null until a handover exists. */
  const eligibility: HandoverEligibility | null = handover ? evaluateHandoverEligibility(detail, handover) : null;

  const act = async (data: Parameters<typeof updateStaffHandover>[1], message: string) => {
    if (!handover) return;
    setBusy(true);
    try {
      await updateStaffHandover(handover.id, data);
      notify(message);
      await Promise.all([load(), onRefreshRef.current?.()]);
    } catch (err) {
      notify(getApiErrorMessage(err, "The handover could not be updated."), "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleChecklist = (index: number) => {
    if (!handover) return;
    const next: HandoverChecklistItem[] = handover.checklist.map((item, i) =>
      i === index ? { ...item, completed: !item.completed, completed_at: !item.completed ? new Date().toISOString() : null } : item
    );
    void act({ checklist: next }, "Checklist updated.");
  };

  return (
    <section className="ins-card" aria-label="Property handover" aria-busy={handover === undefined}>
      <h2 className="ins-card-title">
        Property handover {handover && <BookingStatusBadge status={handover.status} />}
      </h2>

      {handover === undefined && <div className="ins-skeleton" style={{ minHeight: 70 }} />}

      {loadError && (
        <div className="ins-alert error" role="alert" style={{ marginBottom: 12 }}>
          <span>{loadError}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {handover === null && !loadError && (
        <>
          <p className="text-muted" style={{ marginTop: 0 }}>
            {eligible
              ? "No handover has been scheduled yet. The customer sees “Not scheduled yet” until you schedule one."
              : "A handover can be scheduled once the booking is confirmed and the agreement is verified."}
          </p>
          {eligible && canManage && (
            <button className="btn-primary" onClick={() => setModal("schedule")}>
              Schedule handover
            </button>
          )}
        </>
      )}

      {handover && (
        <>
          <BookingFacts
            items={[
              { label: "Date", value: formatDate(handover.scheduled_at) },
              { label: "Time", value: formatTime(handover.scheduled_at) },
              { label: "Location", value: handover.location ?? "—" },
              {
                label: "Assigned staff",
                value: handover.assigned_to_name ? `${handover.assigned_to_name}${handover.assigned_to_phone ? ` · ${handover.assigned_to_phone}` : ""}` : "—",
              },
              {
                label: "Customer acknowledgement",
                value: handover.customer_acknowledged_at ? `Acknowledged ${formatBookingDateTime(handover.customer_acknowledged_at)}` : "Not yet",
              },
              { label: "Completed", value: handover.completed_at ? formatBookingDateTime(handover.completed_at) : "—" },
            ]}
          />

          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {handover.instructions && (
              <div className="bj-note" style={{ whiteSpace: "pre-wrap" }}>
                <strong>Instructions shown to the customer:</strong> {handover.instructions}
              </div>
            )}
            {handover.staff_notes && (
              <div className="bj-note bj-warn" style={{ whiteSpace: "pre-wrap" }}>
                <strong>Internal notes:</strong> {handover.staff_notes}
              </div>
            )}
            {handover.cancellation_reason && handover.status === "Cancelled" && (
              <div className="bj-note bj-warn" style={{ whiteSpace: "pre-wrap" }}>
                <strong>Cancellation reason:</strong> {handover.cancellation_reason}
              </div>
            )}
            {handover.completion_remarks && (
              <div className="bj-note" style={{ whiteSpace: "pre-wrap" }}>
                <strong>Completion remarks:</strong> {handover.completion_remarks}
              </div>
            )}
          </div>

          {handover.checklist.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.875rem", margin: "16px 0 8px" }}>Handover checklist</h3>
              <ul className="bj-list">
                {handover.checklist.map((item, index) => (
                  <li key={`${item.item}-${index}`}>
                    <label className="bj-list-main" style={{ display: "flex", gap: 8, alignItems: "center", cursor: canManage && isOpen(handover.status) ? "pointer" : "default" }}>
                      <input
                        type="checkbox"
                        checked={item.completed}
                        disabled={busy || !canManage || !isOpen(handover.status)}
                        onChange={() => toggleChecklist(index)}
                      />
                      <span>{item.item}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {eligibility && isOpen(handover.status) && <CompletionRequirements eligibility={eligibility} />}

          {canManage && handover.status !== "Completed" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
              {(handover.status === "Scheduled" || handover.status === "Rescheduled" || handover.status === "On Hold") && (
                <button className="btn-primary" disabled={busy} onClick={() => void act({ status: "In Progress" }, "Handover started.")}>
                  Start handover
                </button>
              )}
              {handover.status === "In Progress" && (
                <>
                  <button
                    className="btn-primary"
                    disabled={busy || !eligibility?.ready}
                    title={eligibility?.firstPending ? `Not ready: ${eligibility.firstPending.label}` : undefined}
                    onClick={() => setModal("complete")}
                  >
                    Mark completed
                  </button>
                  <button className="btn-secondary" disabled={busy} onClick={() => void act({ status: "On Hold" }, "Handover put on hold.")}>
                    Put on hold
                  </button>
                </>
              )}
              {(handover.status === "Scheduled" || handover.status === "Rescheduled") && (
                <button className="btn-secondary" disabled={busy} onClick={() => void act({ status: "On Hold" }, "Handover put on hold.")}>
                  Put on hold
                </button>
              )}
              <button className="btn-secondary" disabled={busy} onClick={() => setModal("reschedule")}>
                {handover.status === "Cancelled" ? "Schedule again" : "Reschedule"}
              </button>
              {handover.status !== "Cancelled" && (
                <button className="btn-secondary" disabled={busy} onClick={() => setModal("cancel")}>
                  Cancel handover
                </button>
              )}
            </div>
          )}
        </>
      )}

      {modal === "schedule" && bookingId && (
        <ScheduleModal mode="schedule" bookingId={bookingId} handover={null} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === "reschedule" && handover && bookingId && (
        <ScheduleModal mode="reschedule" bookingId={bookingId} handover={handover} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === "cancel" && handover && <CancelModal handover={handover} onClose={() => setModal(null)} onDone={done} />}
      {modal === "complete" && handover && eligibility && (
        <CompleteModal handover={handover} eligibility={eligibility} onClose={() => setModal(null)} onDone={done} />
      )}
    </section>
  );
}

function ScheduleModal({
  mode,
  bookingId,
  handover,
  onClose,
  onDone,
}: {
  mode: "schedule" | "reschedule";
  bookingId: string;
  handover: StaffHandover | null;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const existing = handover?.scheduled_at ? parseBackendDate(handover.scheduled_at) : null;
  const tomorrow = new Date(Date.now() + 24 * 3_600_000);
  const [date, setDate] = useState(existing && existing.getTime() > Date.now() ? toDateInput(existing) : toDateInput(tomorrow));
  const [time, setTime] = useState(existing ? toTimeInput(existing) : "11:00");
  const [location, setLocation] = useState(handover?.location ?? "");
  const [assignedTo, setAssignedTo] = useState(handover?.assigned_to ?? "");
  const [instructions, setInstructions] = useState(handover?.instructions ?? "");
  const [notes, setNotes] = useState(handover?.staff_notes ?? "");
  const [staff, setStaff] = useState<User[] | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUsers()
      .then((users) => !cancelled && setStaff(users.filter((u) => !u.status || u.status.toLowerCase() === "active")))
      .catch((err) => !cancelled && setStaffError(getApiErrorMessage(err, "Could not load staff members.")));
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const iso = date && time ? toUtcIso(date, time) : null;
    if (!date) next.date = "Choose the handover date.";
    if (!time) next.time = "Choose the handover time.";
    if (iso && new Date(iso).getTime() <= Date.now()) next.date = "The handover must be scheduled in the future.";
    if (location.trim().length < 3) next.location = "Enter the handover location.";
    if (!assignedTo) next.assignedTo = "Assign a responsible staff member.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !iso) return;

    setBusy(true);
    setError(null);
    try {
      if (mode === "schedule") {
        await scheduleStaffHandover(bookingId, {
          scheduled_at: iso,
          location: location.trim(),
          assigned_to: assignedTo,
          instructions: instructions.trim() || null,
          staff_notes: notes.trim() || null,
        });
        await onDone("Handover scheduled. The customer can now see it in their portal.");
      } else if (handover) {
        await updateStaffHandover(handover.id, {
          status: "Rescheduled",
          scheduled_at: iso,
          location: location.trim(),
          assigned_to: assignedTo,
          instructions: instructions.trim() || null,
          staff_notes: notes.trim() || null,
        });
        await onDone("Handover rescheduled. The customer has been notified.");
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "The handover could not be saved."));
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      title={mode === "schedule" ? "Schedule handover" : "Reschedule handover"}
      titleId="handover-schedule-title"
      error={error}
      busy={busy}
      submitLabel={mode === "schedule" ? "Schedule handover" : "Save new schedule"}
      onClose={onClose}
      onSubmit={submit}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field id="ho-date" label="Handover date" error={errors.date}>
          <input id="ho-date" type="date" className="ins-prob-input" style={inputStyle} value={date} min={toDateInput(new Date())} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="ho-time" label="Handover time" error={errors.time}>
          <input id="ho-time" type="time" className="ins-prob-input" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field id="ho-location" label="Location" error={errors.location}>
        <input id="ho-location" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Site office, Tower B, ground floor" />
      </Field>
      <Field id="ho-staff" label="Responsible staff member" error={errors.assignedTo || staffError || undefined}>
        <select id="ho-staff" className="filter-select" style={inputStyle} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={staff === null && !staffError}>
          <option value="">{staff === null && !staffError ? "Loading staff…" : "Select staff member"}</option>
          {(staff ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
              {u.role ? ` (${u.role})` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field id="ho-instructions" label="Instructions for the customer" hint="Shown to the customer in their portal (what to bring, parking, who to ask for).">
        <textarea id="ho-instructions" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} maxLength={5000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </Field>
      <Field id="ho-notes" label="Internal notes" hint="Never shown to the customer.">
        <textarea id="ho-notes" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

function CancelModal({
  handover,
  onClose,
  onDone,
}: {
  handover: StaffHandover;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setFieldError("Enter the reason for cancelling.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateStaffHandover(handover.id, { status: "Cancelled", cancellation_reason: reason.trim() });
      await onDone("Handover cancelled. The customer has been notified.");
    } catch (err) {
      setError(getApiErrorMessage(err, "The handover could not be cancelled."));
      setBusy(false);
    }
  };

  return (
    <ActionDialog title="Cancel handover" titleId="handover-cancel-title" error={error} busy={busy} submitLabel="Cancel handover" submitClass="btn-primary" onClose={onClose} onSubmit={submit}>
      <Field id="ho-cancel" label="Reason" error={fieldError} hint="The customer sees this reason.">
        <textarea id="ho-cancel" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} maxLength={5000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

/** The conditions for completing a handover, each with its own status - never a single generic message. */
function CompletionRequirements({ eligibility }: { eligibility: HandoverEligibility }) {
  return (
    <div className="bj-note" style={{ marginTop: 14 }} role="status" aria-label="Handover completion requirements">
      <strong>{eligibility.ready ? "Ready to complete" : "Before this handover can be completed"}</strong>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 6 }}>
        {eligibility.checks.map((check) => (
          <li key={check.key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ fontWeight: 700, color: check.met ? "#15803d" : "#b45309" }}>
              {check.met ? "✓" : "✕"}
            </span>
            <span>
              <strong>{check.label}</strong> {check.met ? "(done)" : "(pending)"}
              <br />
              <span style={{ fontSize: "0.85rem", opacity: 0.85 }}>{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompleteModal({
  handover,
  eligibility,
  onClose,
  onDone,
}: {
  handover: StaffHandover;
  eligibility: HandoverEligibility;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [remarks, setRemarks] = useState(handover.completion_remarks ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // The server enforces the same rules; stopping here just names the outstanding one.
    if (!eligibility.ready && eligibility.firstPending) {
      setError(`${eligibility.firstPending.label}: ${eligibility.firstPending.detail}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateStaffHandover(handover.id, { status: "Completed", completion_remarks: remarks.trim() || null });
      await onDone("Handover completed. The booking journey now shows Property handover as completed.");
    } catch (err) {
      setError(explainHandoverCompletionError(getApiErrorMessage(err, "The handover could not be completed."), eligibility));
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      title="Complete handover"
      titleId="handover-complete-title"
      error={error}
      busy={busy}
      submitLabel="Mark completed"
      submitDisabled={!eligibility.ready}
      onClose={onClose}
      onSubmit={submit}
    >
      <CompletionRequirements eligibility={eligibility} />
      <p className="text-muted" style={{ fontSize: "0.85rem" }}>The completion date and time are recorded automatically.</p>
      <Field id="ho-remarks" label="Completion remarks">
        <textarea id="ho-remarks" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} maxLength={5000} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

/* ─── Customer card ─── */

export function PortalHandoverCard({
  eligible,
  handover,
  loadFailed,
  onRetry,
  onChanged,
  notify,
}: {
  eligible: boolean;
  /** undefined = not loaded, null = none scheduled. */
  handover: PortalHandover | null | undefined;
  loadFailed: boolean;
  onRetry: () => void;
  onChanged: () => void | Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (!eligible) return null;

  const submitAck = async (e: FormEvent) => {
    e.preventDefault();
    if (!handover || !confirm) return;
    setBusy(true);
    try {
      await acknowledgeHandover(handover.id, { confirm_possession: true, notes: notes.trim() || null });
      notify("Thank you — your acknowledgement has been recorded.");
      setConfirm(false);
      await onChanged();
    } catch (err) {
      notify(getApiErrorMessage(err, "Your acknowledgement could not be saved."), "error");
    } finally {
      setBusy(false);
    }
  };

  const canAcknowledge = handover?.status === "In Progress" && !handover.customer_acknowledged_at;

  return (
    <section className="cp-panel" aria-label="Property handover">
      <h2 className="cp-panel-title">
        Property handover {handover && <BookingStatusBadge status={handover.status} />}
      </h2>

      {loadFailed && handover === undefined && (
        <div className="support-alert error" role="alert">
          <span>We couldn’t load your handover details.</span>{" "}
          <button className="btn-secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {!loadFailed && handover === undefined && <p className="cp-ticket-snippet" style={{ margin: 0 }}>Loading handover details…</p>}

      {handover === null && (
        <p className="cp-ticket-snippet" style={{ margin: 0 }}>
          Your property handover has not been scheduled yet. We will notify you here as soon as a date is set.
        </p>
      )}

      {handover && (
        <>
          <BookingFacts
            items={[
              { label: "Date", value: formatDate(handover.scheduled_at) },
              { label: "Time", value: formatTime(handover.scheduled_at) },
              { label: "Location", value: handover.location ?? "To be confirmed" },
              {
                label: "Your contact",
                value: handover.assigned_to_name ? `${handover.assigned_to_name}${handover.assigned_to_phone ? ` · ${handover.assigned_to_phone}` : ""}` : "To be confirmed",
              },
              ...(handover.completed_at ? [{ label: "Completed on", value: formatBookingDateTime(handover.completed_at) }] : []),
              ...(handover.customer_acknowledged_at ? [{ label: "You acknowledged", value: formatBookingDateTime(handover.customer_acknowledged_at) }] : []),
            ]}
          />

          {handover.status === "Cancelled" && (
            <div className="bj-note bj-warn" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
              <strong>This handover was cancelled.</strong>
              {handover.cancellation_reason ? ` ${handover.cancellation_reason}` : ""} We will share a new date soon.
            </div>
          )}
          {handover.instructions && handover.status !== "Cancelled" && (
            <div className="bj-note" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
              <strong>Instructions:</strong> {handover.instructions}
            </div>
          )}
          {handover.completion_remarks && (
            <div className="bj-note" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
              <strong>Notes from our team:</strong> {handover.completion_remarks}
            </div>
          )}

          {canAcknowledge && (
            <form onSubmit={submitAck} style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I have inspected the property with the team and I acknowledge taking possession.</span>
              </label>
              <textarea
                className="ins-prob-input"
                style={{ width: "100%", boxSizing: "border-box", textAlign: "left" }}
                rows={2}
                maxLength={3000}
                placeholder="Optional comments"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-label="Optional comments"
              />
              <button type="submit" className="btn-primary" disabled={!confirm || busy} style={{ width: "fit-content" }}>
                {busy ? "Saving…" : "Confirm possession"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
