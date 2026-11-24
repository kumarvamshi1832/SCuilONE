import { useCallback, useEffect, useRef, useState } from "react";
import NegotiationPanel from "../negotiation/NegotiationPanel";
import { getOffersForMatch } from "../../services/propertyOfferService";
import type { StaffRequestContext } from "../../services/customerBookingWorkflowService";
import { getUsers } from "../../services/userService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime, formatBookingMoney, parseBackendDate } from "../../utils/bookingJourney";
import { formatOfferMoney, offerStatusText } from "../../utils/offerDisplay";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import type { BookingRequestDetail } from "../../types/customerBookingJourney";
import type { PropertyOffer } from "../../types/propertyOffer";
import type { User } from "../../types/user";
import "../../pages/insights/CrmInsights.css";
import "./BookingJourney.css";

const byTime = (a: string, b: string) => (parseBackendDate(a)?.getTime() ?? 0) - (parseBackendDate(b)?.getTime() ?? 0);

/**
 * Price negotiation for the property of a booking request, using the existing property-offers API
 * (/api/v1/property-offers): buyer offer -> seller counteroffer -> accept / reject, keyed by the visit's property match.
 *
 * What this is NOT: the backend has no customer-facing offer API and the booking request itself carries no offer
 * state, so the customer cannot take part in this thread. Staff record the buyer's amounts on their behalf and then
 * approve the request (approval sets the price and booking amount the customer sees in the portal).
 */
export default function StaffPriceNegotiation({
  detail,
  context,
  contextLoading,
  onNegotiatedPrice,
  notify,
}: {
  detail: BookingRequestDetail;
  context: StaffRequestContext | null;
  contextLoading: boolean;
  /** Reports the price of an accepted offer (or null) so the approval form can suggest it. */
  onNegotiatedPrice: (price: number | null) => void;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const canView = hasFeaturePermission("buyer_requirement.view");
  const canManage = hasFeaturePermission("buyer_requirement.update");
  const matchId = context?.propertyMatchId ?? null;

  /** undefined = loading. */
  const [offers, setOffers] = useState<PropertyOffer[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const reportRef = useRef(onNegotiatedPrice);
  reportRef.current = onNegotiatedPrice;

  const load = useCallback(async () => {
    if (!matchId || !canView) {
      setOffers([]);
      reportRef.current(null);
      return;
    }
    setError(null);
    try {
      const rows = [...(await getOffersForMatch(matchId))].sort((a, b) => byTime(a.created_at, b.created_at));
      setOffers(rows);
      const accepted = [...rows].reverse().find((o) => o.status === "Accepted");
      const price = accepted ? Number(accepted.offered_price) : NaN;
      reportRef.current(Number.isFinite(price) ? price : null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load the negotiation history."));
      setOffers((prev) => prev ?? []);
    }
  }, [matchId, canView]);

  useEffect(() => {
    if (contextLoading) return;
    setOffers(undefined);
    void load();
  }, [load, contextLoading]);

  // Names for "submitted by" - optional; a user without access to the user list simply sees generic labels.
  useEffect(() => {
    if (!open) return;
    getUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [open]);
  const resolveUser = (id: string | null | undefined) => {
    if (!id) return null;
    const user = users.find((u) => u.id === id);
    return user ? user.full_name || user.email : null;
  };

  const loading = contextLoading || offers === undefined;
  const list = offers ?? [];
  const accepted = [...list].reverse().find((o) => o.status === "Accepted");

  return (
    <section className="ins-card" aria-label="Price negotiation" aria-busy={loading}>
      <h2 className="ins-card-title">Price negotiation</h2>

      {loading && <div className="ins-skeleton" style={{ minHeight: 70 }} />}

      {!loading && !canView && (
        <p className="text-muted" style={{ margin: 0 }}>You don&rsquo;t have permission to view negotiations.</p>
      )}

      {!loading && canView && !matchId && (
        <p className="text-muted" style={{ margin: 0 }}>
          The negotiation for this property could not be located (its site visit or property match was not found).
        </p>
      )}

      {error && (
        <div className="ins-alert error" role="alert" style={{ marginBottom: 12 }}>
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!loading && canView && matchId && (
        <>
          <p className="text-muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Offers and counteroffers for this property. The customer sees this thread inside their booking request and can accept it or negotiate; they
            are notified of every offer you make. Approving the request still sets the price and booking amount of the booking itself.
          </p>

          <ol className="bj-list" style={{ margin: 0 }}>
            <li>
              <div className="bj-list-main">
                <strong>Booking request submitted</strong>
                <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                  {formatBookingDateTime(detail.created_at)} · The customer asked to book this property.
                </div>
              </div>
            </li>
            {list.map((offer) => (
              <li key={offer.id}>
                <div className="bj-list-main">
                  <strong>
                    {offer.offer_type === "Seller" ? (offer.parent_offer_id ? "Staff counteroffer" : "Staff proposal") : "Customer offer"}: {formatOfferMoney(offer.offered_price, offer.price_frequency)}
                  </strong>{" "}
                  <span className="text-muted">— {offerStatusText(offer.status)}</span>
                  <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                    {formatBookingDateTime(offer.created_at)}
                    {offer.terms ? ` · ${offer.terms}` : ""}
                  </div>
                  {offer.response_notes && offer.responded_at && (
                    <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                      Response ({formatBookingDateTime(offer.responded_at)}): {offer.response_notes}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {detail.status === "Rejected" ? (
              <li>
                <div className="bj-list-main">
                  <strong>Booking request rejected</strong>
                  {detail.customer_message ? <div className="text-muted" style={{ fontSize: "0.8rem" }}>{detail.customer_message}</div> : null}
                </div>
              </li>
            ) : detail.agreed_price ? (
              <li>
                <div className="bj-list-main">
                  <strong>Request approved by staff</strong>
                  <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                    Proposed price {formatBookingMoney(detail.agreed_price)}
                    {detail.booking_amount ? ` · booking amount ${formatBookingMoney(detail.booking_amount)}` : ""}
                  </div>
                </div>
              </li>
            ) : null}
          </ol>

          {list.length === 0 && !error && (
            <p className="text-muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>No offers have been recorded for this property yet.</p>
          )}

          {accepted && detail.status === "Requested" && (
            <div className="bj-note" style={{ marginTop: 12 }}>
              An offer of <strong>{formatBookingMoney(accepted.offered_price)}</strong> was accepted. It is suggested as the proposed price when you approve this request.
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <button className="btn-secondary" onClick={() => setOpen(true)}>
              {canManage ? "Open negotiation" : "View negotiation"}
            </button>
          </div>
        </>
      )}

      {open && matchId && (
        <NegotiationPanel
          buyerName={context?.customerName ?? "Customer"}
          initialMatchId={matchId}
          options={[
            {
              matchId,
              propertyName: context?.propertyName ?? "Property",
              property: context?.propertyPrice != null ? { price: context.propertyPrice } : undefined,
            },
          ]}
          canView={canView}
          canManage={canManage}
          resolveUser={resolveUser}
          onClose={() => {
            setOpen(false);
            void load();
          }}
          notify={notify}
        />
      )}
    </section>
  );
}
