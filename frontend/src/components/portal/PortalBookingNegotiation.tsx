import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookingFacts, BookingStatusBadge } from "../booking-journey/BookingJourneyWidgets";
import PortalOfferNegotiation from "./PortalOfferNegotiation";
import { decidePortalOffer } from "../../services/customerPortalOfferService";
import { emitPortalNotificationsChanged } from "../../services/customerPortalNotificationService";
import { loadNegotiation, loadNegotiationsForRequests, type BookingNegotiation } from "../../services/customerPortalBookingNegotiation";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDate, formatBookingDateTime, formatBookingMoney } from "../../utils/bookingJourney";
import { formatOfferMoney, offerStatusSlug, offerStatusText, summarizeNegotiation, type NegotiationSummary } from "../../utils/offerDisplay";
import type { BookingRequest } from "../../types/customerBookingJourney";
import type { PropertyOffer } from "../../types/propertyOffer";
import "../negotiation/Negotiation.css";
import "./PortalBookingNegotiation.css";

type RequestLike = Pick<BookingRequest, "id" | "property_id" | "property_match_id" | "status" | "created_at" | "updated_at"> & {
  agreed_price?: string | null;
  booking_amount?: string | null;
};

const offerTitle = (o: PropertyOffer): string =>
  o.offer_type === "Seller" ? (o.parent_offer_id ? "Our counteroffer" : "Our proposal") : o.parent_offer_id ? "Your counteroffer" : "Your offer";

/**
 * Price offer & negotiation of ONE booking request (Customer Portal > Booking Requests > a request).
 * Staff propose an amount; the customer can Accept it or Offer & Negotiate (counter, reject, see the history).
 * Everything comes from the customer property-offers API; the negotiation of the request is the thread of the
 * customer's matched property (see services/customerPortalBookingNegotiation.ts).
 */
export function PortalBookingNegotiation({
  request,
  propertyName,
  notify,
  negotiation: propNegotiation,
  onNegotiationChange,
}: {
  request: RequestLike;
  propertyName: string | null;
  notify: (message: string, type?: "success" | "error") => void;
  negotiation?: BookingNegotiation | null;
  onNegotiationChange?: (neg: BookingNegotiation | null) => void;
}) {
  const [searchParams] = useSearchParams();
  const autoRespond = searchParams.get("respond") === "true" || Boolean(searchParams.get("offer"));
  /** undefined = loading, null = this property has no negotiation available. */
  const [negotiation, setNegotiation] = useState<BookingNegotiation | null | undefined>(propNegotiation);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(autoRespond);
  const [confirm, setConfirm] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (propNegotiation !== undefined) {
      setNegotiation(propNegotiation);
    }
  }, [propNegotiation]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const loaded = await loadNegotiation(request.property_id, undefined, request.property_match_id);
      setNegotiation(loaded);
      onNegotiationChange?.(loaded);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load the price negotiation."));
      setNegotiation((prev) => prev ?? null);
    }
  }, [request.property_id, request.property_match_id, onNegotiationChange]);

  useEffect(() => {
    void load();
  }, [load, request.updated_at]);
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const summary: NegotiationSummary | null = useMemo(() => (negotiation ? summarizeNegotiation(negotiation.offers) : null), [negotiation]);
  const closedRequest = ["Rejected", "Cancelled", "Expired"].includes(request.status);

  const accept = async () => {
    const offer = summary?.state.open;
    if (!offer || busy) return;
    setBusy(true);
    setConfirmError(null);
    try {
      await decidePortalOffer(offer.id, { decision: "Accepted", response_notes: confirmNotes.trim() || null });
      setConfirm(false);
      setConfirmNotes("");
      notify("You accepted the offer. Our team has been notified.");
      emitPortalNotificationsChanged();
      await load();
    } catch (err) {
      setConfirmError(getApiErrorMessage(err, "Your acceptance could not be saved."));
      if ((err as { response?: { status?: number } })?.response?.status === 409) void load();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    const offer = summary?.state.open;
    if (!offer || busy) return;
    setBusy(true);
    setRejectError(null);
    try {
      await decidePortalOffer(offer.id, { decision: "Rejected", response_notes: rejectNotes.trim() || null });
      setRejectConfirm(false);
      setRejectNotes("");
      notify("You declined the offer. Our team has been notified.");
      emitPortalNotificationsChanged();
      await load();
    } catch (err) {
      setRejectError(getApiErrorMessage(err, "Your rejection could not be saved."));
      if ((err as { response?: { status?: number } })?.response?.status === 409) void load();
    } finally {
      setBusy(false);
    }
  };

  const money = (o: PropertyOffer) => formatOfferMoney(o.offered_price, o.price_frequency, negotiation?.match.property.currency || "INR");
  const loading = negotiation === undefined;
  const staffOffer = summary?.staffOffer;

  return (
    <section className="cp-panel" aria-label="Price offer and negotiation" aria-busy={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className="cp-panel-title" style={{ margin: 0 }}>Price offer &amp; negotiation</h2>
        {summary && (
          <span className={`neg-badge neg-badge-${summary.awaiting === "customer" ? "submitted" : offerStatusSlug(summary.state.accepted ? "Accepted" : summary.state.latest?.status ?? "Submitted")}`}>
            {summary.negotiationStatus}
          </span>
        )}
      </div>

      {loading && <div className="neg-skeleton" style={{ marginTop: 12 }} />}

      {error && (
        <div className="support-alert error" role="alert" style={{ marginTop: 12 }}>
          <span>{error}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {negotiation === null && !error && (
        <p className="cp-ticket-snippet" style={{ margin: "10px 0 0" }}>
          {request.status === "Requested"
            ? "No price has been proposed yet. Once our team reviews your request, any price they propose will appear here."
            : "We couldn't open the price discussion for this property here. If our team has sent you a price, you will also find it in your notifications — please contact them to continue."}
        </p>
      )}

      {negotiation && summary && (
        <>
          <BookingFacts
            items={[
              { label: "Property", value: propertyName ?? negotiation.match.property.name },
              { label: "Booking request", value: `#${request.id.slice(0, 8).toUpperCase()}` },
              { label: "Request submitted", value: formatBookingDate(request.created_at) },
              { label: "Request status", value: <BookingStatusBadge status={request.status} /> },
              { label: "Staff-proposed amount", value: staffOffer ? money(staffOffer) : "Not proposed yet" },
              { label: "Offer status", value: summary.offerStatus ? offerStatusText(summary.offerStatus) : "—" },
              { label: "Negotiation status", value: summary.negotiationStatus },
              {
                label: "Latest message",
                value: summary.latestMessage ? (
                  <span>
                    “{summary.latestMessage.text}” <span className="cp-ticket-snippet">— {summary.latestMessage.from}, {formatBookingDateTime(summary.latestMessage.at)}</span>
                  </span>
                ) : (
                  "No messages yet"
                ),
              },
            ]}
          />

          {summary.state.accepted && (
            <div className="neg-banner neg-banner-accepted" role="status" style={{ marginTop: 12 }}>
              <strong>Agreed at {money(summary.state.accepted)}.</strong>
              {summary.state.accepted.hold_expires_at ? ` The property is held for you until ${formatBookingDateTime(summary.state.accepted.hold_expires_at)}.` : ""} Our team will confirm the next steps for
              your booking.
            </div>
          )}
          {summary.awaiting === "owner" && summary.state.pendingOwner && (
            <div className="neg-banner neg-banner-pending" role="status" style={{ marginTop: 12 }}>
              <strong>Accepted at {money(summary.state.pendingOwner)} — waiting for the owner&rsquo;s approval.</strong> We will notify you when it is confirmed.
            </div>
          )}

          {!closedRequest && (
            <div className="pbn-actions">
              {summary.awaiting === "customer" && summary.state.open ? (
                <>
                  <p className="cp-ticket-snippet pbn-actions-note">
                    Our team {summary.state.open.parent_offer_id ? "countered with" : "proposed"} <strong>{money(summary.state.open)}</strong>
                    {summary.state.open.expires_at ? ` — valid until ${formatBookingDateTime(summary.state.open.expires_at)}` : ""}.
                  </p>
                  <button type="button" className="btn-primary" onClick={() => { setConfirmError(null); setConfirm(true); }}>
                    Accept Offer
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setRejectError(null); setRejectConfirm(true); }}>
                    Reject Offer
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setModal(true)}>
                    Offer &amp; Negotiate
                  </button>
                </>
              ) : (
                <>
                  {summary.awaiting === "staff" && <p className="cp-ticket-snippet pbn-actions-note">Your offer is with our team. You will be notified when they respond.</p>}
                  {summary.awaiting === "none" && !summary.state.accepted && (
                    <p className="cp-ticket-snippet pbn-actions-note">
                      {staffOffer ? "There is no open offer right now." : "Our team has not proposed an amount yet. You will be notified when they do."}
                    </p>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => setModal(true)}>
                    {negotiation.offers.length > 0 ? "View negotiation" : "Offer & Negotiate"}
                  </button>
                </>
              )}
            </div>
          )}

          {negotiation.offers.length > 0 && (
            <details className="pbn-history">
              <summary>Negotiation history ({negotiation.offers.length})</summary>
              <ol className="neg-timeline" style={{ marginTop: 10 }}>
                {negotiation.offers.map((o) => (
                  <li key={o.id} className={`neg-event ${o.offer_type === "Seller" ? "neg-event-seller" : "neg-event-buyer"}`}>
                    <div className="neg-event-head">
                      <strong>{offerTitle(o)}</strong>
                      <span className="neg-amount">{money(o)}</span>
                      <span className={`neg-badge neg-badge-${offerStatusSlug(summary.state.lapsed?.id === o.id ? "Expired" : o.status)}`}>
                        {offerStatusText(summary.state.lapsed?.id === o.id ? "Expired" : o.status)}
                      </span>
                    </div>
                    <div className="neg-meta">{formatBookingDateTime(o.created_at)}</div>
                    {o.terms && <p className="neg-remarks">{o.terms}</p>}
                    {o.response_notes && o.responded_at && (
                      <p className="neg-remarks">
                        <strong>{o.offer_type === "Seller" ? "You" : "Our team"} replied ({formatBookingDateTime(o.responded_at)}):</strong> {o.response_notes}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}

      {modal && negotiation && (
        <PortalOfferNegotiation
          item={negotiation.match}
          onClose={() => {
            setModal(false);
            void load();
          }}
          notify={notify}
        />
      )}

      {confirm && summary?.state.open && (
        <div className="neg-overlay neg-overlay-top" onClick={() => !busy && setConfirm(false)}>
          <div className="neg-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pbn-confirm-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="pbn-confirm-title">Accept this offer?</h3>
            <p>
              You are accepting <strong>{money(summary.state.open)}</strong> for {propertyName ?? negotiation?.match.property.name}. Accepting closes the negotiation at this price and our team is notified.
            </p>
            <label className="neg-field">
              <span>Notes (optional)</span>
              <textarea rows={2} maxLength={5000} value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} />
            </label>
            {confirmError && (
              <div className="neg-alert" role="alert">
                {confirmError}
              </div>
            )}
            <div className="neg-form-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirm(false)} disabled={busy}>
                Go back
              </button>
              <button type="button" className="btn-primary" onClick={() => void accept()} disabled={busy}>
                {busy ? "Saving…" : "Yes, accept"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectConfirm && summary?.state.open && (
        <div className="neg-overlay neg-overlay-top" onClick={() => !busy && setRejectConfirm(false)}>
          <div className="neg-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pbn-reject-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="pbn-reject-title">Decline this offer?</h3>
            <p>
              Are you sure you want to decline the offer of <strong>{money(summary.state.open)}</strong> for {propertyName ?? negotiation?.match.property.name}? Declining closes this offer. You can still make a new offer or message our team afterwards.
            </p>
            <label className="neg-field">
              <span>Reason for declining (optional)</span>
              <textarea rows={2} maxLength={5000} value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} />
            </label>
            {rejectError && (
              <div className="neg-alert" role="alert">
                {rejectError}
              </div>
            )}
            <div className="neg-form-actions">
              <button type="button" className="btn-secondary" onClick={() => setRejectConfirm(false)} disabled={busy}>
                Go back
              </button>
              <button type="button" className="btn-primary" onClick={() => void reject()} disabled={busy}>
                {busy ? "Saving…" : "Yes, decline offer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Negotiation summaries for the booking requests of the list page (one matches lookup shared by all). */
export function useRequestNegotiations(requests: RequestLike[], enabled: boolean) {
  const [items, setItems] = useState<Map<string, { negotiation: BookingNegotiation; summary: NegotiationSummary }>>(new Map());
  const key = requests.map((r) => `${r.id}:${r.updated_at}`).join("|");

  const refresh = useCallback(async () => {
    if (!enabled || requests.length === 0) {
      setItems(new Map());
      return;
    }
    try {
      const raw = await loadNegotiationsForRequests(requests);
      const next = new Map<string, { negotiation: BookingNegotiation; summary: NegotiationSummary }>();
      raw.forEach((negotiation, requestId) => {
        if (negotiation && negotiation.offers.length > 0) next.set(requestId, { negotiation, summary: summarizeNegotiation(negotiation.offers) });
      });
      setItems(next);
    } catch {
      /* the list stays usable without the offer extras */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { items, refresh };
}

/**
 * "Offers waiting for you" panel of the Booking Requests dashboard: every booking request whose staff offer or
 * counteroffer needs the customer's answer, with property, amount, request details and a link to respond.
 */
export function PortalOfferAlerts({
  requests,
  items,
  propertyNames,
  propertyImages,
}: {
  requests: RequestLike[];
  items: Map<string, { negotiation: BookingNegotiation; summary: NegotiationSummary }>;
  propertyNames: Map<string, string>;
  propertyImages?: Map<string, string>;
}) {
  const waiting = requests.filter((r) => items.get(r.id)?.summary.awaiting === "customer");
  if (waiting.length === 0) return null;
  return (
    <section className="pbn-alerts" role="status" aria-label="Offers waiting for your response">
      <h2 className="pbn-alerts-title">
        {waiting.length === 1 ? "Offer is waiting for your response" : `${waiting.length} offers are waiting for your response`}
      </h2>
      <ul className="pbn-alerts-list">
        {waiting.map((r) => {
          const entry = items.get(r.id)!;
          const offer = entry.summary.state.open!;
          const currency = entry.negotiation.match.property.currency || "INR";
          const propName = propertyNames.get(r.id) ?? entry.negotiation.match.property.name ?? "Property";
          const imageUrl =
            propertyImages?.get(r.id) ||
            (entry.negotiation.match as any).property?.images?.[0]?.image_url ||
            (entry.negotiation.match as any).property?.image_url ||
            null;
          const offeredAmount = formatOfferMoney(offer.offered_price, offer.price_frequency, currency);
          const originalAmount = r.booking_amount
            ? formatBookingMoney(r.booking_amount)
            : r.agreed_price
            ? formatBookingMoney(r.agreed_price)
            : null;
          const isRental = offer.price_frequency === "Monthly" || offer.price_frequency === "Quarterly" || offer.price_frequency === "Yearly";

          return (
            <li key={r.id} className="pbn-alert">
              {imageUrl && (
                <div className="pbn-alert-thumb-wrap">
                  <img src={imageUrl} alt={propName} className="pbn-alert-thumb" />
                </div>
              )}
              <div className="pbn-alert-main">
                <div className="pbn-alert-top">
                  <strong className="pbn-alert-prop-name">{propName}</strong>
                  <span className="pbn-chip pbn-chip-status">
                    {offer.parent_offer_id ? "Counteroffer received" : "Offer received"}
                  </span>
                </div>
                <div className="pbn-alert-pricing">
                  <span className="pbn-alert-amount">{offeredAmount}</span>
                  {originalAmount && (
                    <span className="pbn-alert-original">
                      {isRental ? "Deposit: " : "Booking: "}
                      {originalAmount}
                    </span>
                  )}
                </div>
                <div className="cp-ticket-snippet pbn-alert-meta">
                  <span>Request #{r.id.slice(0, 8).toUpperCase()}</span>
                  <span>·</span>
                  <span>Submitted {formatBookingDate(offer.created_at || r.created_at)}</span>
                  {offer.expires_at && (
                    <>
                      <span>·</span>
                      <span className="pbn-alert-expiry">
                        Valid until {formatBookingDateTime(offer.expires_at)}
                      </span>
                    </>
                  )}
                </div>
                {entry.summary.latestMessage && <span className="pbn-alert-msg">“{entry.summary.latestMessage.text}”</span>}
              </div>
              <div className="pbn-alert-actions">
                <Link
                  to={
                    isRental
                      ? `/portal/rentals?respond=true&offer=${encodeURIComponent(offer.id)}`
                      : `/portal/booking-requests/${r.id}?respond=true&offer=${encodeURIComponent(offer.id)}`
                  }
                  className="btn-primary"
                  style={{ textDecoration: "none" }}
                >
                  Respond
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
