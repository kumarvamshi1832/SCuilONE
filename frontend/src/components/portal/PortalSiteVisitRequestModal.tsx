import React, { useState } from "react";
import { XIcon, SendIcon, AlertCircleIcon } from "../common/SupportPortalIcons";
import { requestPortalSiteVisit } from "../../services/customerPortalBuyerRequirementService";
import { getPortalErrorMessage } from "../../utils/portalApiError";
import type { PortalSiteVisitRequestResult } from "../../types/customerPortalBuyerRequirement";

interface PortalSiteVisitRequestModalProps {
  propertyMatchId: string;
  propertyName: string;
  onClose: () => void;
  onSubmitted: (result: PortalSiteVisitRequestResult) => void;
}

const MIN_MINUTES = 30;
const MAX_MINUTES = 8 * 60;

/** Value for a datetime-local input, e.g. 2026-11-18T10:00 (local time). */
const toLocalInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Requests a site visit for a shortlisted property.
 * The backend requires the property to be shortlisted and creates the visit with status "Requested";
 * the property team confirms the appointment.
 */
export const PortalSiteVisitRequestModal: React.FC<PortalSiteVisitRequestModalProps> = ({
  propertyMatchId,
  propertyName,
  onClose,
  onSubmitted,
}) => {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const minStart = toLocalInputValue(new Date());

  const handleStartChange = (value: string) => {
    setStart(value);
    if (value && !end) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) setEnd(toLocalInputValue(new Date(d.getTime() + 60 * 60 * 1000)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!start || !end) {
      setError("Please choose a start and end time for the visit.");
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Please enter valid dates.");
      return;
    }
    if (startDate.getTime() <= Date.now()) {
      setError("The visit must start in the future.");
      return;
    }
    const minutes = (endDate.getTime() - startDate.getTime()) / 60000;
    if (minutes <= 0) {
      setError("The end time must be after the start time.");
      return;
    }
    if (minutes < MIN_MINUTES) {
      setError("Please request at least a 30-minute visit window.");
      return;
    }
    if (minutes > MAX_MINUTES) {
      setError("A site visit request cannot exceed 8 hours.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestPortalSiteVisit({
        property_match_id: propertyMatchId,
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString(),
      });
      onSubmitted(result);
    } catch (err) {
      setError(getPortalErrorMessage(err, "Failed to request the site visit."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="visit-modal-title">
        <div className="modal-header">
          <h2 id="visit-modal-title">Request a Site Visit</h2>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <p style={{ margin: "0 0 16px", color: "var(--cp-text-muted)", fontSize: "0.875rem" }}>
              Propose a time to visit <strong style={{ color: "var(--cp-text)" }}>{propertyName}</strong>. Our
              team will confirm or reschedule the appointment.
            </p>

            {error && (
              <div className="support-alert error cp-inline-error" role="alert">
                <AlertCircleIcon size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="visit-start">Preferred start *</label>
              <input
                id="visit-start"
                type="datetime-local"
                min={minStart}
                value={start}
                onChange={(e) => handleStartChange(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="visit-end">Preferred end *</label>
              <input
                id="visit-end"
                type="datetime-local"
                min={start || minStart}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              <SendIcon size={15} />
              <span>{submitting ? "Requesting…" : "Request Visit"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PortalSiteVisitRequestModal;
