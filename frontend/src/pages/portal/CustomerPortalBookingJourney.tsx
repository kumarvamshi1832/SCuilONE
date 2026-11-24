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
import { loadPortalMatches } from "../../services/customerPortalBookingNegotiation";
import {
  createPortalRentalBookingRequest,
  getPortalRentalAgreements,
  getPortalRentalBookingRequests,
  getPortalRentalProperties,
} from "../../services/customerPortalRentalService";
import PortalOfferNegotiation from "../../components/portal/PortalOfferNegotiation";
import type { PortalPropertyMatch } from "../../types/customerPortalBuyerRequirement";
import { PAYMENT_PREFERENCES, VISIT_FEEDBACK_DECISIONS } from "../../types/customerBookingJourney";
import type {
  BookingRequest,
  PaymentPreference,
  VisitFeedbackDecision,
} from "../../types/customerBookingJourney";
import type { PortalSiteVisit } from "../../types/customerPortal";
import type { RentalAgreement } from "../../types/rental";
import type {
  EligibleRentalProperty,
  RentalBookingRequest,
  RentalBookingRequestPortalCreate,
} from "../../types/rentalBookingRequest";
import { formatRent, frequencySuffix } from "../../utils/rentalHelpers";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";
import "../../components/booking-journey/BookingJourney.css";

interface PortalOutletContext {
  isRealEstate?: boolean;
}

const RETRYABLE_STATUSES = ["Expired", "Rejected", "Cancelled"];

export const RENTAL_PAYMENT_PLANS = [
  "Monthly Rent",
  "Quarterly Rent",
  "Half-Yearly Rent",
  "Annual Rent",
] as const;
export type RentalPaymentPlan = (typeof RENTAL_PAYMENT_PLANS)[number];

/** Why the "Request booking" action is unavailable for a completed visit (the backend requires "Interested"). */
const bookingPrerequisite = (decision: string | null | undefined): string | null => {
  if (decision === "Interested") return null;
  if (!decision) {
    return "To request a booking, first give feedback on this visit and choose “Interested”. The booking button unlocks once your feedback is saved.";
  }
  return `Your saved feedback is “${decision}”. A booking can only be requested when your decision is “Interested” — update your feedback to continue.`;
};

/** Why the "Request rental" action is unavailable for a completed visit (the backend requires "Interested"). */
const rentalPrerequisite = (decision: string | null | undefined): string | null => {
  if (decision === "Interested") return null;
  if (!decision) {
    return "To request a rental, first give feedback on this visit and choose “Interested”. The rental request button unlocks once your feedback is saved.";
  }
  return `Your saved feedback is “${decision}”. A rental can only be requested when your decision is “Interested” — update your feedback to continue.`;
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
  const [rentalVisit, setRentalVisit] = useState<PortalSiteVisit | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [rentalConfirmation, setRentalConfirmation] = useState<{
    request: RentalBookingRequest;
    propertyName?: string;
  } | null>(null);
  /** The customer's matched properties: the only customer API that says whether a property is for Sale or Rent. */
  const [matches, setMatches] = useState<PortalPropertyMatch[]>([]);
  const [offerMatch, setOfferMatch] = useState<PortalPropertyMatch | null>(null);
  const [rentalPropertyIds, setRentalPropertyIds] = useState<Set<string>>(new Set());
  const [rentalProperties, setRentalProperties] = useState<EligibleRentalProperty[]>([]);
  const [rentalAgreements, setRentalAgreements] = useState<RentalAgreement[]>([]);
  const [rentalBookingRequests, setRentalBookingRequests] = useState<RentalBookingRequest[]>([]);

  useEffect(() => {
    let active = true;
    getPortalRentalProperties()
      .then((props) => {
        if (active) {
          setRentalProperties(props);
          setRentalPropertyIds(new Set(props.map((p) => p.id)));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const isRentalVisit = useCallback(
    (visit?: PortalSiteVisit | null): boolean => {
      if (!visit) return false;
      const pid = visit.property?.id ?? visit.property_id ?? "";
      if (pid && rentalPropertyIds.has(pid)) return true;
      const match = matches.find((m) => m.property.id === pid);
      if (match && ["Rent", "Lease"].includes(match.property.listing_type)) return true;
      const pt = (visit.property?.property_type || "").toLowerCase();
      if (pt.includes("rent") || pt.includes("lease")) return true;
      const name = (visit.property?.name || "").toLowerCase();
      if (name.includes("rent") || name.includes("lease")) return true;
      return false;
    },
    [rentalPropertyIds, matches]
  );

  const hasOnlyRentals = useMemo(
    () => visits.length > 0 && visits.every((v) => isRentalVisit(v)),
    [visits, isRentalVisit]
  );
  const hasAnyRentals = useMemo(
    () => visits.some((v) => isRentalVisit(v)),
    [visits, isRentalVisit]
  );

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
    const [visitsResult, requestsResult, agreementsResult, rentalRequestsResult, rentalPropsResult] = await Promise.allSettled([
      getPortalSiteVisits(),
      getBookingRequests(),
      getPortalRentalAgreements(),
      getPortalRentalBookingRequests(),
      getPortalRentalProperties(),
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
    if (agreementsResult.status === "fulfilled") {
      setRentalAgreements(agreementsResult.value);
    }
    if (rentalRequestsResult.status === "fulfilled") {
      setRentalBookingRequests(rentalRequestsResult.value);
    }
    if (rentalPropsResult.status === "fulfilled") {
      setRentalProperties(rentalPropsResult.value);
      setRentalPropertyIds(new Set(rentalPropsResult.value.map((p) => p.id)));
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

  const handleRentalSubmitted = useCallback(
    async (created: RentalBookingRequest) => {
      setRentalVisit(null);
      const v = visits.find((item) => (item.property?.id || item.property_id) === created.property_id);
      const propName = v?.property?.name ?? "Property";
      await load();
      setRentalConfirmation({
        request: created,
        propertyName: propName,
      });
      showToast(`Rental request for ${propName} submitted successfully! A temporary hold has been placed on the property.`, "success");
      emitPortalNotificationsChanged();
    },
    [load, visits]
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    loadPortalMatches()
      .then((list) => {
        if (!cancelled) setMatches(list);
      })
      .catch(() => undefined); // without it the page simply behaves as before (booking request)
    return () => {
      cancelled = true;
    };
  }, []);

  /** Rent / lease properties have no booking request (the backend accepts them for Sale only): they go through an offer. */
  const rentalMatchFor = (visit: PortalSiteVisit): PortalPropertyMatch | undefined => {
    const propertyId = visit.property?.id ?? visit.property_id;
    const match = matches.find((m) => m.property.id === propertyId);
    return match && ["Rent", "Lease"].includes(match.property.listing_type) ? match : undefined;
  };

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
    const isRental = isRentalVisit(visit);
    const rentalMatch = request ? undefined : rentalMatchFor(visit);
    const prereq = isRental ? rentalPrerequisite(decision) : bookingPrerequisite(decision);

    const pid = visit.property?.id || visit.property_id;
    const rentalReq = pid ? rentalBookingRequests.find((r) => r.property_id === pid) : undefined;
    const hasRentalAgreement = Boolean(
      pid && rentalAgreements.some((a) => a.property_id === pid && a.status !== "Terminated" && a.status !== "Cancelled")
    );
    const hasProcessedRentalRequest = Boolean(
      rentalReq &&
        (rentalReq.status === "Approved" || rentalReq.status === "Agreement Created" || rentalReq.status === "Activated")
    );
    const isBookingRequestProcessed = Boolean(
      request && (request.status === "Approved" || request.status === "Confirmed" || request.status === "Completed")
    );
    const isRentalBooked = isRental && (hasRentalAgreement || hasProcessedRentalRequest || isBookingRequestProcessed);

    const canRetryRental = Boolean(rentalReq && ["Cancelled", "Rejected", "Expired"].includes(rentalReq.status));
    const canRetrySale = Boolean(request && RETRYABLE_STATUSES.includes(request.status));

    return (
      <article key={visit.id} className="cp-req-card">
        <div className="cp-req-card-head">
          <div>
            <h3 className="cp-req-card-title">{visit.property?.name ?? "Property"}</h3>
            <p className="cp-req-card-sub">
              {[visit.property?.address, visit.property?.city].filter(Boolean).join(", ") || "—"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {isRentalBooked && <BookingStatusBadge status="Booked" />}
            <BookingStatusBadge status={visit.status} />
          </div>
        </div>

        <dl className="cp-req-facts">
          {isRentalBooked && (
            <div className="cp-req-fact">
              <dt>Property Status</dt>
              <dd>
                <BookingStatusBadge status="Booked" />
              </dd>
            </div>
          )}
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
          {rentalReq ? (
            <div className="cp-req-fact" style={{ gridColumn: "1 / -1" }}>
              <dt>Rental request</dt>
              <dd style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <BookingStatusBadge status={rentalReq.status} />
                <span className="cp-ticket-snippet">#{rentalReq.id.slice(0, 8).toUpperCase()}</span>
              </dd>
            </div>
          ) : request ? (
            <div className="cp-req-fact" style={{ gridColumn: "1 / -1" }}>
              <dt>{isRental ? "Rental request" : "Booking request"}</dt>
              <dd>
                <BookingStatusBadge status={request.status} />
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="cp-req-card-foot" style={{ flexWrap: "wrap" }}>
          {!isCompleted ? (
            <span>Feedback opens once our team marks this visit Completed.</span>
          ) : isRental ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
              {!isRentalBooked && !rentalReq && !canRequest && (
                <div className="bj-note bj-warn" role="note" style={{ width: "100%", marginBottom: 4 }}>
                  {prereq}
                </div>
              )}
              {canRetryRental && !canRequest && (
                <div className="bj-note bj-warn" role="note" style={{ width: "100%", marginBottom: 4 }}>
                  {prereq}
                </div>
              )}
              <button className="btn-secondary" onClick={() => setFeedbackVisit(visit)}>
                {decision ? "Update feedback" : "Give feedback"}
              </button>
              {!isRentalBooked && !rentalReq && rentalMatch && (
                <button className="btn-primary" onClick={() => setOfferMatch(rentalMatch)}>
                  Make a rental offer
                </button>
              )}
              {rentalReq && !canRetryRental ? (
                <Link
                  to="/portal/rentals"
                  className="btn-primary"
                  style={{ textDecoration: "none" }}
                >
                  View rental request
                </Link>
              ) : request && !canRetrySale ? (
                <Link
                  to={`/portal/booking-requests/${request.id}`}
                  className="btn-primary"
                  style={{ textDecoration: "none" }}
                >
                  View rental request
                </Link>
              ) : !isRentalBooked ? (
                <button
                  className="btn-primary"
                  onClick={() => setRentalVisit(visit)}
                  disabled={!canRequest}
                  title={canRequest ? undefined : prereq ?? undefined}
                >
                  {canRetryRental || canRetrySale ? "Request rental again" : "Request rental"}
                </button>
              ) : null}
              <Link
                to="/portal/rentals"
                className="btn-secondary"
                style={{ textDecoration: "none" }}
              >
                My rentals
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
              {(!request || canRetrySale) && !canRequest && (
                <div className="bj-note bj-warn" role="note" style={{ width: "100%", marginBottom: 4 }}>
                  {prereq}
                </div>
              )}
              <button className="btn-secondary" onClick={() => setFeedbackVisit(visit)}>
                {decision ? "Update feedback" : "Give feedback"}
              </button>
              {request && !canRetrySale ? (
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
                  title={canRequest ? undefined : prereq ?? undefined}
                >
                  {canRetrySale ? "Request booking again" : "Request booking"}
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
          <h1>{hasOnlyRentals ? "Rental Journey" : "Booking Journey"}</h1>
          <p>
            {hasOnlyRentals
              ? "After a completed site visit, tell us what you think and request a rental. You can follow every rental request from the Rental Requests page."
              : "After a completed site visit, tell us what you think and request a booking or rental."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={() => void load()} disabled={loading} aria-label="Refresh">
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          {hasOnlyRentals ? (
            <Link to="/portal/rentals" className="btn-primary" style={{ textDecoration: "none" }}>
              My rental requests
            </Link>
          ) : (
            <>
              <Link to="/portal/booking-requests" className="btn-primary" style={{ textDecoration: "none" }}>
                My booking requests
              </Link>
              {hasAnyRentals && (
                <Link to="/portal/rentals" className="btn-secondary" style={{ textDecoration: "none" }}>
                  My rentals
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {rentalConfirmation && (
        <div
          className="support-alert success"
          role="status"
          aria-live="polite"
          style={{ alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}
        >
          <CheckCircleIcon size={18} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>Your rental request for {rentalConfirmation.propertyName} was submitted for staff review.</strong>
            <div style={{ marginTop: 4, fontSize: "0.875rem" }}>
              Request ID: <code>#{rentalConfirmation.request.id.slice(0, 8).toUpperCase()}</code> ({rentalConfirmation.request.id})
            </div>
            {rentalConfirmation.request.hold_expires_at && (
              <div style={{ marginTop: 4, fontSize: "0.875rem" }}>
                The property is held for you until {formatBookingDateTime(rentalConfirmation.request.hold_expires_at)}.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link to="/portal/rentals" className="btn-primary" style={{ textDecoration: "none" }}>
              View in My Rentals
            </Link>
            <button className="btn-secondary" onClick={() => setRentalConfirmation(null)} aria-label="Dismiss confirmation">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {confirmation && (() => {
        const confVisit = visits.find((v) => v.id === confirmation.request.site_visit_id);
        const isConfRental = isRentalVisit(confVisit ?? { id: "", property_id: confirmation.request.property_id, status: "" });
        return (
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
                  ? isConfRental
                    ? "Your rental request was submitted for staff review."
                    : "Your booking request was submitted for staff review."
                  : isConfRental
                  ? `You already have a rental request for this visit (status: ${confirmation.request.status}).`
                  : `You already have a booking request for this visit (status: ${confirmation.request.status}).`}
              </strong>
              <div style={{ marginTop: 4, fontSize: "0.875rem" }}>
                Request ID: <code>#{confirmation.request.id.slice(0, 8).toUpperCase()}</code> ({confirmation.request.id})
              </div>
              {confirmation.listed === false && (
                <div style={{ marginTop: 4, fontSize: "0.875rem" }}>
                  The server accepted the request, but it is not in your {isConfRental ? "rental request" : "booking request"} list yet. Use Refresh to
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
                {isConfRental ? "View rental request" : "View booking request"}
              </Link>
              {isConfRental && (
                <Link to="/portal/rentals" className="btn-secondary" style={{ textDecoration: "none" }}>
                  My rentals
                </Link>
              )}
              <button className="btn-secondary" onClick={() => setConfirmation(null)} aria-label="Dismiss confirmation">
                Dismiss
              </button>
            </div>
          </div>
        );
      })()}

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

      {offerMatch && <PortalOfferNegotiation item={offerMatch} onClose={() => setOfferMatch(null)} notify={showToast} />}

      {rentalVisit && (
        <RentalRequestModal
          visit={rentalVisit}
          match={rentalMatchFor(rentalVisit)}
          rentalProperty={rentalProperties.find((p) => p.id === (rentalVisit.property?.id || rentalVisit.property_id))}
          existingRequest={rentalBookingRequests.find((r) => r.property_id === (rentalVisit.property?.id || rentalVisit.property_id))}
          onClose={() => setRentalVisit(null)}
          onSubmitted={handleRentalSubmitted}
        />
      )}

      {bookingVisit && (
        <BookingRequestModal
          visit={bookingVisit}
          isRental={isRentalVisit(bookingVisit)}
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
  isRental,
  existing,
  onClose,
  onSubmitted,
}: {
  visit: PortalSiteVisit;
  isRental: boolean;
  existing?: BookingRequest;
  onClose: () => void;
  onSubmitted: (request: BookingRequest) => void | Promise<void>;
}) {
  const [rentalPlan, setRentalPlan] = useState<RentalPaymentPlan>("Monthly Rent");
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
    const prereqError = isRental
      ? rentalPrerequisite(visit.customer_decision)
      : bookingPrerequisite(visit.customer_decision);
    if (prereqError) {
      setError(prereqError);
      return;
    }
    if (!confirmed) {
      setError(
        isRental
          ? "Please confirm that you want to request a rental for this property."
          : "Please confirm that you want to request a booking for this property."
      );
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
      const payloadPref: PaymentPreference = isRental ? "Installments" : preference;
      const effectiveNotes = isRental
        ? [`Payment Plan: ${rentalPlan}`, notes.trim()].filter(Boolean).join("\n")
        : notes.trim() || null;

      request = await requestBooking(visit.id, {
        payment_preference: payloadPref,
        notes: effectiveNotes,
      });
    } catch (err) {
      // 409s explain the restriction (feedback not "Interested", property held for someone else, no
      // longer for sale, ...). No success is shown when the POST fails.
      setError(
        getApiErrorMessage(
          err,
          isRental ? "Failed to submit your rental request." : "Failed to submit your booking request."
        )
      );
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
          <h2 id="booking-title">{isRental ? "Request a rental" : "Request a booking"}</h2>
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
                {isRental ? (
                  <>
                    Your previous rental request is <strong>{existing.status}</strong>. Submitting again re-opens it for staff
                    review.
                  </>
                ) : (
                  <>
                    Your previous request is <strong>{existing.status}</strong>. Submitting again re-opens it for staff
                    review.
                  </>
                )}
              </div>
            )}

            {isRental ? (
              <div className="form-group">
                <label htmlFor="bk-pref">Payment Plan *</label>
                <select
                  id="bk-pref"
                  value={rentalPlan}
                  onChange={(e) => setRentalPlan(e.target.value as RentalPaymentPlan)}
                >
                  {RENTAL_PAYMENT_PLANS.map((plan) => (
                    <option key={plan} value={plan}>
                      {plan}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
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
            )}

            <div className="form-group">
              <label htmlFor="bk-notes">Notes for our team (optional)</label>
              <textarea
                id="bk-notes"
                rows={3}
                maxLength={3000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  isRental
                    ? "Preferred move-in date, lease duration, questions…"
                    : "Preferred timelines, financing, questions…"
                }
              />
            </div>

            <label className="bj-check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                {isRental
                  ? "I confirm I would like to request a rental for this property. This is a request for staff review and does not guarantee the tenancy."
                  : "I confirm I would like to request a booking for this property. This is a request for staff review and does not guarantee the property."}
              </span>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              <SendIcon size={15} />
              <span>{submitting ? "Submitting…" : isRental ? "Submit Rental Request" : "Submit request"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const parseMoney = (raw: string, allowZero: boolean): number | null => {
  const text = raw.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  if (n > 999_999_999_999.99) return null;
  return n > 0 || (allowZero && n === 0) ? n : null;
};

/* ─── Rental Request Modal ─── */

interface RentalRequestModalProps {
  visit: PortalSiteVisit;
  match?: PortalPropertyMatch;
  rentalProperty?: EligibleRentalProperty;
  existingRequest?: RentalBookingRequest;
  onClose: () => void;
  onSubmitted: (created: RentalBookingRequest) => void | Promise<void>;
}

function RentalRequestModal({
  visit,
  match,
  rentalProperty,
  existingRequest,
  onClose,
  onSubmitted,
}: RentalRequestModalProps) {
  const propertyId = visit.property?.id || visit.property_id || "";
  const propName = visit.property?.name ?? rentalProperty?.name ?? match?.property.name ?? "Rental Property";
  const propAddress =
    [
      visit.property?.address ?? rentalProperty?.address ?? match?.property.address,
      visit.property?.city ?? rentalProperty?.city ?? match?.property.city,
      visit.property?.state ?? rentalProperty?.state ?? match?.property.state,
    ]
      .filter(Boolean)
      .join(", ") || "—";
  const propertyType =
    rentalProperty?.property_type ?? match?.property.property_type ?? visit.property?.property_type ?? "Residential";
  const listingType =
    (rentalProperty?.listing_type as "Rent" | "Lease") ??
    (match?.property.listing_type as "Rent" | "Lease") ??
    "Rent";

  // Pre-fill defaults from property or match
  const defaultRent = rentalProperty?.price
    ? String(Number(rentalProperty.price))
    : match?.property.price
    ? String(Number(match.property.price))
    : "";
  const defaultDeposit = rentalProperty?.security_deposit
    ? String(Number(rentalProperty.security_deposit))
    : "";
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const defaultDuration = rentalProperty?.minimum_term_months
    ? String(rentalProperty.minimum_term_months)
    : "12";

  const [rent, setRent] = useState(defaultRent);
  const [deposit, setDeposit] = useState(defaultDeposit);
  const [startDate, setStartDate] = useState(tomorrow);
  const [durationMonths, setDurationMonths] = useState(defaultDuration);
  const [paymentPlan, setPaymentPlan] = useState<RentalPaymentPlan>("Monthly Rent");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;

    if (!propertyId) {
      setError("Unable to identify the selected property.");
      return;
    }

    const rentValue = parseMoney(rent, false);
    if (rentValue === null || rentValue <= 0) {
      setError("Please enter a valid monthly rent amount greater than zero.");
      return;
    }

    let depositValue: number | null = null;
    if (deposit.trim() !== "") {
      depositValue = parseMoney(deposit, true);
      if (depositValue === null) {
        setError("Please enter a valid security deposit amount (0 or more).");
        return;
      }
    }

    if (!startDate) {
      setError("Please select your preferred move-in date.");
      return;
    }

    let durationNum: number | null = null;
    if (durationMonths.trim() !== "") {
      durationNum = Number(durationMonths);
      if (!Number.isInteger(durationNum) || durationNum < 1 || durationNum > 600) {
        setError("Duration must be a whole number of months between 1 and 600.");
        return;
      }
    }

    if (rentalProperty?.minimum_term_months && durationNum && durationNum < rentalProperty.minimum_term_months) {
      setError(`The minimum lease term for this property is ${rentalProperty.minimum_term_months} months.`);
      return;
    }

    if (listingType === "Lease" && !durationNum) {
      setError("Lease booking requests require a lease duration in months.");
      return;
    }

    if (!confirmed) {
      setError("Please confirm that you want to submit a rental request for this property.");
      return;
    }

    if (notes.length > 3000) {
      setError("Notes cannot exceed 3000 characters.");
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const effectiveNotes = [`Payment Plan: ${paymentPlan}`, notes.trim()].filter(Boolean).join("\n");
      const payload: RentalBookingRequestPortalCreate = {
        property_id: propertyId,
        booking_type: listingType,
        proposed_rent_amount: rentValue,
        proposed_deposit_amount: depositValue !== null ? depositValue : undefined,
        desired_start_date: startDate,
        duration_months: durationNum ?? undefined,
        property_match_id: match?.match_id ?? undefined,
        customer_notes: effectiveNotes || undefined,
      };

      const created = await createPortalRentalBookingRequest(payload);
      await onSubmitted(created);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to submit your rental request. Please try again."));
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="rental-modal-title" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <h2 id="rental-modal-title">Request Rental</h2>
            <p className="cp-req-card-sub" style={{ margin: 0 }}>Review property details and submit your rental application</p>
          </div>
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

            {/* Selected Property Review Summary */}
            <div className="bj-note" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <strong style={{ fontSize: "1.05rem" }}>{propName}</strong>
                  {match?.property.unit_number && <span> · Unit {match.property.unit_number}</span>}
                  <div style={{ color: "var(--cp-text-muted)", fontSize: "0.85rem", marginTop: 2 }}>{propAddress}</div>
                </div>
                <span className="pbn-chip">{listingType}</span>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: "0.85rem" }}>
                <span>Type: <strong>{propertyType}</strong></span>
                {(rentalProperty?.price || match?.property.price) && (
                  <span>
                    Listed Rent: <strong>{formatRent(rentalProperty?.price ?? match?.property.price, rentalProperty?.price_frequency ?? "Monthly")}</strong>
                  </span>
                )}
                {(rentalProperty?.bedrooms ?? match?.property.bedrooms) != null && (
                  <span>Beds: <strong>{rentalProperty?.bedrooms ?? match?.property.bedrooms}</strong></span>
                )}
                {(rentalProperty?.bathrooms ?? match?.property.bathrooms) != null && (
                  <span>Baths: <strong>{rentalProperty?.bathrooms ?? match?.property.bathrooms}</strong></span>
                )}
                {(rentalProperty?.furnishing ?? match?.property.furnishing) && (
                  <span>Furnishing: <strong>{rentalProperty?.furnishing ?? match?.property.furnishing}</strong></span>
                )}
                {match?.property.area && (
                  <span>Area: <strong>{match.property.area} {match.property.area_unit}</strong></span>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: "0.8125rem", color: "var(--cp-text-muted)" }}>
                Site visit: {formatBookingDateTime(visit.scheduled_start)} · Your feedback:{" "}
                <strong style={{ color: "var(--cp-text)" }}>{visit.customer_decision ?? "Interested"}</strong>
              </div>
            </div>

            {existingRequest && (
              <div className="bj-note bj-warn" style={{ marginBottom: 16 }}>
                Your previous rental request for this property is <strong>{existingRequest.status}</strong>.
                Submitting a new request will place a fresh hold on this property for staff review.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label htmlFor="rr-rent">
                  Proposed Rent ({frequencySuffix(rentalProperty?.price_frequency ?? "Monthly") || "/month"}) *
                </label>
                <input
                  id="rr-rent"
                  inputMode="decimal"
                  value={rent}
                  onChange={(e) => setRent(e.target.value)}
                  placeholder="e.g. 25000"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="rr-deposit">Security Deposit (₹)</label>
                <input
                  id="rr-deposit"
                  inputMode="decimal"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="e.g. 50000"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label htmlFor="rr-start">Preferred Move-in Date *</label>
                <input
                  id="rr-start"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="rr-duration">
                  Lease Duration (months){listingType === "Lease" ? " *" : ""}
                </label>
                <input
                  id="rr-duration"
                  inputMode="numeric"
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                  placeholder="e.g. 11 or 12"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="rr-payment-plan">Payment Plan *</label>
              <select
                id="rr-payment-plan"
                value={paymentPlan}
                onChange={(e) => setPaymentPlan(e.target.value as RentalPaymentPlan)}
              >
                {RENTAL_PAYMENT_PLANS.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="rr-notes">Notes for Staff / Landlord (optional)</label>
              <textarea
                id="rr-notes"
                rows={3}
                maxLength={3000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Preferred move-in timelines, family/occupancy details, questions…"
              />
            </div>

            <label className="bj-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I confirm I want to request a rental for <strong>{propName}</strong>. This request places an immediate temporary hold on the property for staff review.
              </span>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              <SendIcon size={15} />
              <span>{submitting ? "Submitting Request…" : "Submit Rental Request"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
