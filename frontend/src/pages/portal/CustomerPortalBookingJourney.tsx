import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  RefreshIcon,
  SendIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import { getPortalSiteVisits } from "../../services/customerPortalCommercialService";
import {
  getBookingRequests,
  requestBooking,
  submitSiteVisitFeedback,
} from "../../services/customerPortalJourneyService";
import { BookingStatusBadge } from "../../components/booking-journey/BookingJourneyWidgets";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { getApiErrorMessage } from "../../utils/apiError";
import { emitPortalNotificationsChanged } from "../../services/customerPortalNotificationService";
import { PAYMENT_PREFERENCES, VISIT_FEEDBACK_DECISIONS } from "../../types/customerBookingJourney";
import type {
  BookingRequest,
  PaymentPreference,
  VisitFeedbackDecision,
} from "../../types/customerBookingJourney";
import type { PortalSiteVisit } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";
import "../../components/booking-journey/BookingJourney.css";

interface PortalOutletContext {
  isRealEstate?: boolean;
}

const RETRYABLE_STATUSES = ["Expired", "Rejected", "Cancelled"];

/** Why the "Request booking" action is unavailable for a completed visit (the backend requires "Interested"). */
const bookingPrerequisite = (decision: string | null | undefined): string | null => {
  if (decision === "Interested") return null;
  if (!decision) {
    return "To request a booking, first give feedback on this visit and choose “Interested”. The booking button unlocks once your feedback is saved.";
  }
  return `Your saved feedback is “${decision}”. A booking can only be requested when your decision is “Interested” — update your feedback to continue.`;
};

interface BookingConfirmation {
  request: BookingRequest;
  /** true/false once the list was re-fetched; null if the re-fetch failed. */
  listed: boolean | null;
}

export default function CustomerPortalBookingJourney() {
  const outlet = useOutletContext<PortalOutletContext | null>();
  const isRealEstate = outlet?.isRealEstate !== false;

  const [visits, setVisits] = useState<PortalSiteVisit[]>([]);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const [feedbackVisit, setFeedbackVisit] = useState<PortalSiteVisit | null>(null);
  const [bookingVisit, setBookingVisit] = useState<PortalSiteVisit | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /** Re-fetches visits and requests from the API. Returns the fresh requests (null if that fetch failed). */
  const load = useCallback(async (): Promise<BookingRequest[] | null> => {
    setLoading(true);
    setError(null);
    const [visitsResult, requestsResult] = await Promise.allSettled([
      getPortalSiteVisits(),
      getBookingRequests(),
    ]);
    // A failed refresh keeps the previously loaded data and shows the error.
    if (visitsResult.status === "fulfilled") setVisits(visitsResult.value);
    else setError(getApiErrorMessage(visitsResult.reason, "Failed to load your site visits."));
    let fresh: BookingRequest[] | null = null;
    if (requestsResult.status === "fulfilled") {
      fresh = requestsResult.value;
      setRequests(fresh);
    } else {
      setError((prev) => prev ?? getApiErrorMessage(requestsResult.reason, "Failed to load your booking requests."));
    }
    setLoading(false);
    return fresh;
  }, []);

  const handleBookingSubmitted = useCallback(
    async (request: BookingRequest) => {
      setBookingVisit(null);
      // Fetch the list again from the API instead of patching local state, so what is shown is what
      // the backend actually returns.
      const fresh = await load();
      setConfirmation({ request, listed: fresh ? fresh.some((r) => r.id === request.id) : null });
      // The booking request may have produced server-side notifications; refresh the bell.
      emitPortalNotificationsChanged();
    },
    [load]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const requestByVisit = useMemo(() => {
    const map = new Map<string, BookingRequest>();
    requests.forEach((r) => map.set(r.site_visit_id, r));
    return map;
  }, [requests]);

  const completed = visits.filter((v) => v.status === "Completed");
  const others = visits.filter((v) => v.status !== "Completed");

  if (!isRealEstate) {
    return (
      <div className="cp-tickets-page">
        <div className="cp-table-card">
          <div className="cp-empty-state">
            <AlertCircleIcon size={40} />
            <h3>Booking journey is not available</h3>
            <p>This feature is available for Real Estate workspaces only.</p>
          </div>
        </div>
      </div>
    );
  }

  const renderVisitCard = (visit: PortalSiteVisit) => {
    const request = requestByVisit.get(visit.id);
    const isCompleted = visit.status === "Completed";
    const decision = visit.customer_decision;
    const canRequest = isCompleted && decision === "Interested";
    const canRetry = Boolean(request && RETRYABLE_STATUSES.includes(request.status));

    return (
      <article key={visit.id} className="cp-req-card">
        <div className="cp-req-card-head">
          <div>
            <h3 className="cp-req-card-title">{visit.property?.name ?? "Property"}</h3>
            <p className="cp-req-card-sub">
              {[visit.property?.address, visit.property?.city].filter(Boolean).join(", ") || "—"}
            </p>
          </div>
          <BookingStatusBadge status={visit.status} />
        </div>

        <dl className="cp-req-facts">
          <div className="cp-req-fact">
            <dt>Visit</dt>
            <dd>{formatBookingDateTime(visit.scheduled_start)}</dd>
          </div>
          <div className="cp-req-fact">
            <dt>Your feedback</dt>
            <dd>
              {decision ? (
                <>
                  {decision}
                  {visit.customer_rating ? ` · ${visit.customer_rating}/5` : ""}
                </>
              ) : (
                "Not submitted"
              )}
            </dd>
          </div>
          {visit.customer_feedback && (
            <div className="cp-req-fact" style={{ gridColumn: "1 / -1" }}>
              <dt>Comments</dt>
              <dd>{visit.customer_feedback}</dd>
            </div>
          )}
          {request && (
            <div className="cp-req-fact" style={{ gridColumn: "1 / -1" }}>
              <dt>Booking request</dt>
              <dd>
                <BookingStatusBadge status={request.status} />
              </dd>
            </div>
          )}
        </dl>

        <div className="cp-req-card-foot" style={{ flexWrap: "wrap" }}>
          {!isCompleted ? (
            <span>Feedback opens once our team marks this visit Completed.</span>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
              {(!request || canRetry) && !canRequest && (
                <div className="bj-note bj-warn" role="note" style={{ width: "100%", marginBottom: 4 }}>
                  {bookingPrerequisite(decision)}
                </div>
              )}
              <button className="btn-secondary" onClick={() => setFeedbackVisit(visit)}>
                {decision ? "Update feedback" : "Give feedback"}
              </button>
              {request && !canRetry ? (
                <Link
                  to={`/portal/booking-requests/${request.id}`}
                  className="btn-primary"
                  style={{ textDecoration: "none" }}
                >
                  View booking request
                </Link>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() => setBookingVisit(visit)}
                  disabled={!canRequest}
                  title={canRequest ? undefined : bookingPrerequisite(decision) ?? undefined}
                >
                  {canRetry ? "Request booking again" : "Request booking"}
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="cp-tickets-page">
      {toast && (
        <div className="cp-toast-stack" role="status" aria-live="polite">
          <div className={`support-alert ${toast.type}`}>
            {toast.type === "success" ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="cp-tickets-header">
        <div>
          <h1>Booking Journey</h1>
          <p>
            After a completed site visit, tell us what you think and request a booking. You can follow every
            booking request from the Booking Requests page.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={() => void load()} disabled={loading} aria-label="Refresh">
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          <Link to="/portal/booking-requests" className="btn-primary" style={{ textDecoration: "none" }}>
            My booking requests
          </Link>
        </div>
      </div>

      {confirmation && (
        <div
          className={`support-alert ${confirmation.listed === false ? "error" : "success"}`}
          role="status"
          aria-live="polite"
          style={{ alignItems: "flex-start", flexWrap: "wrap" }}
        >
          <CheckCircleIcon size={18} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>
              {confirmation.request.status === "Requested"
                ? "Your booking request was submitted for staff review."
                : `You already have a booking request for this visit (status: ${confirmation.request.status}).`}
            </strong>
            <div style={{ marginTop: 4, fontSize: "0.875rem" }}>
              Request ID: <code>#{confirmation.request.id.slice(0, 8).toUpperCase()}</code> ({confirmation.request.id})
            </div>
            {confirmation.listed === false && (
              <div style={{ marginTop: 4, fontSize: "0.875rem" }}>
                The server accepted the request, but it is not in your booking request list yet. Use Refresh to
                check again.
              </div>
            )}
            {confirmation.listed === null && (
              <div style={{ marginTop: 4, fontSize: "0.875rem" }}>
                The request was accepted, but your list could not be refreshed. Use Refresh to try again.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              to={`/portal/booking-requests/${confirmation.request.id}`}
              className="btn-primary"
              style={{ textDecoration: "none" }}
            >
              View booking request
            </Link>
            <button className="btn-secondary" onClick={() => setConfirmation(null)} aria-label="Dismiss confirmation">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{error}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {loading && visits.length === 0 ? (
        <div className="cp-loading-grid" aria-busy="true" aria-label="Loading site visits">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cp-skeleton" />
          ))}
        </div>
      ) : !error && visits.length === 0 ? (
        <div className="cp-table-card">
          <div className="cp-empty-state">
            <ClockIcon size={40} />
            <h3>No site visits yet</h3>
            <p>Request a site visit from your shortlist. Once a visit is completed you can continue here.</p>
            <Link to="/portal/shortlist" className="btn-primary" style={{ marginTop: 16, textDecoration: "none" }}>
              Go to shortlist
            </Link>
          </div>
        </div>
      ) : (
        <>
          {completed.length > 0 && (
            <section aria-label="Completed site visits">
              <h2 className="cp-panel-title">Completed visits</h2>
              <div className="cp-req-grid">{completed.map(renderVisitCard)}</div>
            </section>
          )}
          {others.length > 0 && (
            <section aria-label="Other site visits">
              <h2 className="cp-panel-title">Upcoming and other visits</h2>
              <div className="cp-req-grid">{others.map(renderVisitCard)}</div>
            </section>
          )}
        </>
      )}

      {feedbackVisit && (
        <FeedbackModal
          visit={feedbackVisit}
          onClose={() => setFeedbackVisit(null)}
          onSaved={async (message) => {
            setFeedbackVisit(null);
            showToast(message);
            await load();
          }}
        />
      )}

      {bookingVisit && (
        <BookingRequestModal
          visit={bookingVisit}
          existing={requestByVisit.get(bookingVisit.id)}
          onClose={() => setBookingVisit(null)}
          onSubmitted={handleBookingSubmitted}
        />
      )}
    </div>
  );
}

/* ─── Feedback form ─── */

function FeedbackModal({
  visit,
  onClose,
  onSaved,
}: {
  visit: PortalSiteVisit;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [decision, setDecision] = useState<VisitFeedbackDecision | "">(
    (VISIT_FEEDBACK_DECISIONS as readonly string[]).includes(visit.customer_decision ?? "")
      ? (visit.customer_decision as VisitFeedbackDecision)
      : ""
  );
  const [rating, setRating] = useState<string>(visit.customer_rating ? String(visit.customer_rating) : "");
  const [feedback, setFeedback] = useState(visit.customer_feedback ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!decision) {
      setError("Please choose how interested you are in this property.");
      return;
    }
    if (feedback.length > 5000) {
      setError("Comments cannot exceed 5000 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitSiteVisitFeedback(visit.id, {
        decision,
        rating: rating ? Number(rating) : null,
        feedback: feedback.trim() || null,
      });
      await onSaved(result.message || "Your feedback has been saved.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save your feedback."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className="modal-header">
          <h2 id="feedback-title">Site visit feedback</h2>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <p style={{ margin: "0 0 16px", color: "var(--cp-text-muted)", fontSize: "0.875rem" }}>
              {visit.property?.name ?? "Property"} · visited {formatBookingDateTime(visit.scheduled_start)}
            </p>
            {error && (
              <div className="support-alert error cp-inline-error" role="alert">
                <AlertCircleIcon size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="fb-decision">How interested are you? *</label>
              <select id="fb-decision" value={decision} onChange={(e) => setDecision(e.target.value as VisitFeedbackDecision | "")}>
                <option value="">Select…</option>
                {VISIT_FEEDBACK_DECISIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="fb-rating">Rating (optional)</label>
              <select id="fb-rating" value={rating} onChange={(e) => setRating(e.target.value)}>
                <option value="">No rating</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="fb-text">Comments (optional)</label>
              <textarea
                id="fb-text"
                rows={4}
                maxLength={5000}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What did you like or dislike about the property?"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              <SendIcon size={15} />
              <span>{submitting ? "Saving…" : "Save feedback"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Booking request form ─── */

function BookingRequestModal({
  visit,
  existing,
  onClose,
  onSubmitted,
}: {
  visit: PortalSiteVisit;
  existing?: BookingRequest;
  onClose: () => void;
  onSubmitted: (request: BookingRequest) => void | Promise<void>;
}) {
  const [preference, setPreference] = useState<PaymentPreference>("Full Payment");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard: state updates are async, so a fast double click could otherwise send two POSTs.
  const inFlight = useRef(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (bookingPrerequisite(visit.customer_decision)) {
      setError(bookingPrerequisite(visit.customer_decision));
      return;
    }
    if (!confirmed) {
      setError("Please confirm that you want to request a booking for this property.");
      return;
    }
    if (notes.length > 3000) {
      setError("Notes cannot exceed 3000 characters.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    let request: BookingRequest;
    try {
      request = await requestBooking(visit.id, {
        payment_preference: preference,
        notes: notes.trim() || null,
      });
    } catch (err) {
      // 409s explain the restriction (feedback not "Interested", property held for someone else, no
      // longer for sale, ...). No success is shown when the POST fails.
      setError(getApiErrorMessage(err, "Failed to submit your booking request."));
      inFlight.current = false;
      setSubmitting(false);
      return;
    }
    // The POST succeeded; the parent closes this modal and re-fetches the list.
    await onSubmitted(request);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-title">
        <div className="modal-header">
          <h2 id="booking-title">Request a booking</h2>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {error && (
              <div className="support-alert error cp-inline-error" role="alert">
                <AlertCircleIcon size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="bj-note" style={{ marginBottom: 16 }}>
              <strong>{visit.property?.name ?? "Property"}</strong>
              <br />
              {[visit.property?.address, visit.property?.city, visit.property?.state].filter(Boolean).join(", ")}
              <br />
              Site visit: {formatBookingDateTime(visit.scheduled_start)} · Your feedback:{" "}
              {visit.customer_decision ?? "—"}
            </div>

            {existing && (
              <div className="bj-note bj-warn" style={{ marginBottom: 16 }}>
                Your previous request is <strong>{existing.status}</strong>. Submitting again re-opens it for staff
                review.
              </div>
            )}

            <div className="form-group">
              <label htmlFor="bk-pref">Payment preference *</label>
              <select id="bk-pref" value={preference} onChange={(e) => setPreference(e.target.value as PaymentPreference)}>
                {PAYMENT_PREFERENCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="bk-notes">Notes for our team (optional)</label>
              <textarea
                id="bk-notes"
                rows={3}
                maxLength={3000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Preferred timelines, financing, questions…"
              />
            </div>

            <label className="bj-check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                I confirm I would like to request a booking for this property. This is a request for staff review and
                does not guarantee the property.
              </span>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              <SendIcon size={15} />
              <span>{submitting ? "Submitting…" : "Submit request"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
