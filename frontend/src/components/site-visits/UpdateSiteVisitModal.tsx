import { useState, type FormEvent } from "react";
import { updateSiteVisit } from "../../services/siteVisitService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import {
  buildVisitUpdate,
  initialUpdateForm,
  isClosedVisit,
  scheduleChanged,
  toDateInputValue,
  type VisitUpdateErrors,
  type VisitUpdateForm,
} from "../../utils/siteVisitHelpers";
import { INTEREST_LEVELS, SITE_VISIT_OUTCOMES, SITE_VISIT_STATUSES } from "../../types/siteVisit";
import type { SiteVisit } from "../../types/siteVisit";
import "../../pages/site-visits/SiteVisits.css";

/**
 * Update / reschedule / complete / cancel one site visit (PATCH /api/v1/site-visits/{id}).
 * Validation mirrors the backend (see utils/siteVisitHelpers.ts) so an invalid form is never submitted; any error the
 * server still returns (for example a scheduling conflict, 409) is shown as-is.
 */
export default function UpdateSiteVisitModal({
  visit,
  onClose,
  onSaved,
}: {
  visit: SiteVisit;
  onClose: () => void;
  onSaved: (updated: SiteVisit) => void | Promise<void>;
}) {
  const [form, setForm] = useState<VisitUpdateForm>(() => initialUpdateForm(visit));
  const [errors, setErrors] = useState<VisitUpdateErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closed = isClosedVisit(visit.status);
  const rescheduling = form.status === "Rescheduled";
  const changedSchedule = !closed && scheduleChanged(visit, form);

  const set = <K extends keyof VisitUpdateForm>(key: K, value: VisitUpdateForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setApiError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const result = buildVisitUpdate(visit, form);
    setErrors(result.errors);
    if (!result.payload) return;
    setBusy(true);
    setApiError(null);
    try {
      const updated = await updateSiteVisit(visit.id, result.payload);
      await onSaved(updated);
    } catch (err) {
      setApiError(getApiErrorMessage(err, "Failed to update the site visit."));
    } finally {
      setBusy(false);
    }
  };

  const err = (key: keyof VisitUpdateForm) => (errors[key] ? <span className="sv-field-error" role="alert">{errors[key]}</span> : null);

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="modal-card"
        style={{ maxWidth: 640 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sv-update-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="sv-update-title">Update Site Visit Appointment</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose} disabled={busy}>
            &times;
          </button>
        </div>

        <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div className="modal-body">
            {apiError && (
              <div className="sv-form-alert" role="alert">
                {apiError}
              </div>
            )}

            <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
              Current appointment: <strong>{formatBookingDateTime(visit.scheduled_start)}</strong> to{" "}
              <strong>{formatBookingDateTime(visit.scheduled_end)}</strong> ({visit.status})
            </p>

            <div className="form-group">
              <label htmlFor="sv-up-status">Status *</label>
              <select id="sv-up-status" value={form.status} onChange={(e) => set("status", e.target.value)} disabled={busy} aria-invalid={!!errors.status}>
                {SITE_VISIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {err("status")}
            </div>

            {closed ? (
              <div className="sv-form-notice" style={{ marginBottom: 14 }}>
                This visit is {visit.status.toLowerCase()}, so its date, time and agent can no longer be changed. You can still record the outcome and follow-up.
              </div>
            ) : (
              <fieldset style={{ border: "1px solid rgba(100,116,139,0.3)", borderRadius: 8, padding: "10px 14px", margin: "0 0 14px" }}>
                <legend style={{ fontSize: "0.8rem", padding: "0 6px" }}>
                  {rescheduling ? "New appointment time *" : "Appointment time"}
                </legend>
                <div className="sv-schedule-grid">
                  <div className="form-group">
                    <label htmlFor="sv-up-date">Date{rescheduling ? " *" : ""}</label>
                    <input
                      id="sv-up-date"
                      type="date"
                      value={form.visitDate}
                      min={toDateInputValue(new Date())}
                      onChange={(e) => set("visitDate", e.target.value)}
                      disabled={busy}
                      aria-invalid={!!errors.visitDate}
                    />
                    {err("visitDate")}
                  </div>
                  <div className="form-group">
                    <label htmlFor="sv-up-start">Start time{rescheduling ? " *" : ""}</label>
                    <input id="sv-up-start" type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} disabled={busy} aria-invalid={!!errors.startTime} />
                    {err("startTime")}
                  </div>
                  <div className="form-group">
                    <label htmlFor="sv-up-end">End time{rescheduling ? " *" : ""}</label>
                    <input id="sv-up-end" type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} disabled={busy} aria-invalid={!!errors.endTime} />
                    {err("endTime")}
                  </div>
                </div>
                <span className="sv-field-hint">
                  {rescheduling
                    ? "Choose the new date and time. The previous appointment stays in the visit history."
                    : changedSchedule
                    ? visit.status === "Scheduled"
                      ? "Changing the time saves this visit as Rescheduled. The customer is notified."
                      : "The new time will be saved with this visit."
                    : "Leave unchanged to keep the current appointment, or pick Rescheduled to move it."}
                </span>
              </fieldset>
            )}

            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor="sv-up-outcome">Outcome</label>
                <select id="sv-up-outcome" value={form.outcome} onChange={(e) => set("outcome", e.target.value)} disabled={busy}>
                  <option value="">Not recorded</option>
                  {SITE_VISIT_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="sv-up-interest">Interest level</label>
                <select id="sv-up-interest" value={form.interestLevel} onChange={(e) => set("interestLevel", e.target.value)} disabled={busy}>
                  <option value="">Not specified</option>
                  {INTEREST_LEVELS.map((il) => (
                    <option key={il} value={il}>
                      {il}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="sv-up-feedback">Buyer feedback / observations</label>
              <textarea
                id="sv-up-feedback"
                rows={3}
                maxLength={5000}
                value={form.feedback}
                onChange={(e) => set("feedback", e.target.value)}
                disabled={busy}
                placeholder="What the buyer liked, objections raised, pricing questions, interest in negotiating…"
              />
              {err("feedback")}
            </div>

            <div className="form-group">
              <label className="sv-check-row">
                <input type="checkbox" checked={form.followUpRequired} onChange={(e) => set("followUpRequired", e.target.checked)} disabled={busy} />
                <span>Follow-up required</span>
              </label>
            </div>

            {form.followUpRequired && (
              <div className="form-group">
                <label htmlFor="sv-up-followup">Follow-up date</label>
                <input id="sv-up-followup" type="date" value={form.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} disabled={busy} />
                <span className="sv-field-hint">Optional, but a date lets overdue follow-ups be flagged.</span>
              </div>
            )}

            {form.status === "Cancelled" && (
              <div className="form-group">
                <label htmlFor="sv-up-cancel">Cancellation reason *</label>
                <input
                  id="sv-up-cancel"
                  type="text"
                  value={form.cancellationReason}
                  onChange={(e) => set("cancellationReason", e.target.value)}
                  disabled={busy}
                  maxLength={2000}
                  placeholder="e.g. Buyer postponed travel plans"
                  aria-invalid={!!errors.cancellationReason}
                />
                {err("cancellationReason")}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : rescheduling ? "Save new schedule" : "Save updates"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
