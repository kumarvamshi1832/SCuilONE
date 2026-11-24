import { Link } from "react-router-dom";
import { BookingFacts } from "./BookingJourneyWidgets";
import { describeHold, formatBookingDateTime, formatBookingMoney } from "../../utils/bookingJourney";
import { resolveRequestOfferDetails, type NegotiationSummary } from "../../utils/offerDisplay";
import type { BookingNegotiation } from "../../services/customerPortalBookingNegotiation";
import type { BookingRequestDetail } from "../../types/customerBookingJourney";
import "./BookingJourney.css";

export interface OfferStatusView {
  label: string;
  tone: "info" | "ok" | "warn" | "error";
  /** One sentence telling the customer where they stand and what to do. */
  message: string;
}

/**
 * Plain-language status of the staff offer, mapped from the backend request status. Only statuses the backend
 * really has are used: Requested -> Approved -> Confirmed -> Completed, or Rejected / Expired / Cancelled.
 */
export const offerStatusView = (detail: Pick<BookingRequestDetail, "status" | "hold_expires_at">, holdExpired: boolean): OfferStatusView => {
  switch (detail.status) {
    case "Requested":
      return { label: "Awaiting staff review", tone: "info", message: "Your request is with our team. The proposed price and booking amount appear here once it is reviewed." };
    case "Approved":
      return holdExpired
        ? { label: "Offer expired", tone: "error", message: "The hold on this property has expired. Contact our team to ask for it to be extended." }
        : {
            label: "Offer received — action needed",
            tone: "warn",
            message: "Our team has approved your request and proposed the amounts below. Continue with the steps below before the hold ends to accept it.",
          };
    case "Confirmed":
      return { label: "Booking confirmed", tone: "ok", message: "Your booking is confirmed at the amounts below." };
    case "Completed":
      return { label: "Sale completed", tone: "ok", message: "Your booking is completed." };
    case "Rejected":
      return { label: "Booking request declined", tone: "error", message: "Our team declined this request. You can submit a new request from the Booking Journey page." };
    case "Expired":
      return { label: "Offer expired", tone: "error", message: "The hold expired and the property was released. You can request the booking again from the Booking Journey page." };
    case "Expired - Payment Review":
      return { label: "Under payment review", tone: "warn", message: "The hold expired while verified payments remain on this booking. Our team is reviewing it." };
    case "Cancelled":
      return { label: "Cancelled", tone: "error", message: "This booking request was cancelled." };
    default:
      return { label: detail.status, tone: "info", message: "" };
  }
};

/**
 * The customer's view of the offer: shows the exact negotiated offer price and booking/deposit amount,
 * mapped consistently with notification cards, the booking requests table, and negotiation modals.
 */
export default function PortalBookingOffer({
  detail,
  propertyName,
  holdExpired,
  summary,
  negotiation,
  isRental,
}: {
  detail: BookingRequestDetail;
  propertyName: string | null;
  holdExpired: boolean;
  summary?: NegotiationSummary | null;
  negotiation?: BookingNegotiation | null;
  isRental?: boolean;
}) {
  const currency = negotiation?.match.property.currency || "INR";
  const offerInfo = resolveRequestOfferDetails(detail, summary, currency, Boolean(isRental));
  const fallbackView = offerStatusView(detail, holdExpired);

  const hasNegotiation = Boolean(summary?.staffOffer || summary?.state.open || summary?.state.accepted);
  const hasOffer = hasNegotiation || (Boolean(detail.agreed_price) && detail.status !== "Requested" && detail.status !== "Rejected");
  const holdText = describeHold(detail.hold_expires_at, detail.status);

  const view: OfferStatusView = (() => {
    if (summary?.state.accepted) {
      return {
        label: "Offer agreed",
        tone: "ok",
        message: "Your offer has been agreed at the amount below.",
      };
    }
    if (summary?.state.open && summary.awaiting === "customer") {
      return {
        label: "Offer received — action needed",
        tone: "warn",
        message: `Our team has proposed ${offerInfo.formattedPrice ?? "a new amount"}. Review the offer and respond below.`,
      };
    }
    if (summary?.awaiting === "staff") {
      return {
        label: "Counteroffer under review",
        tone: "info",
        message: "Your counteroffer is currently with our team for review.",
      };
    }
    if (summary?.awaiting === "owner") {
      return {
        label: "Awaiting owner approval",
        tone: "info",
        message: "The offer has been accepted and is waiting for owner approval.",
      };
    }
    if (summary?.state.lapsed) {
      return {
        label: "Offer expired",
        tone: "error",
        message: "The proposed offer has expired. You can negotiate or submit a new offer.",
      };
    }
    return fallbackView;
  })();

  return (
    <section className="cp-panel" aria-label="Booking offer">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className="cp-panel-title" style={{ margin: 0 }}>Booking offer</h2>
        <span className={`bj-badge bj-${view.tone === "ok" ? "good" : view.tone === "error" ? "bad" : view.tone}`}>{view.label}</span>
      </div>
      <p className="cp-ticket-snippet" style={{ margin: "10px 0 0" }}>{view.message}</p>

      {hasOffer && (
        <BookingFacts
          items={[
            { label: "Property", value: propertyName ?? negotiation?.match.property.name ?? "—" },
            {
              label: summary?.state.accepted
                ? "Agreed price"
                : summary?.state.open?.offer_type === "Seller" || summary?.staffOffer
                ? "Price proposed by our team"
                : summary?.state.open?.offer_type === "Buyer"
                ? "Your counteroffer"
                : "Price proposed by our team",
              value: offerInfo.formattedPrice ?? formatBookingMoney(detail.agreed_price),
            },
            ...(offerInfo.formattedBookingAmount
              ? [{ label: isRental ? "Deposit" : "Booking amount", value: offerInfo.formattedBookingAmount }]
              : []),
            { label: "Payment terms", value: detail.payment_preference },
            ...(detail.status === "Approved" && detail.hold_expires_at
              ? [{ label: "Offer valid until", value: `${formatBookingDateTime(detail.hold_expires_at)}${holdText ? ` (${holdText})` : ""}` }]
              : summary?.state.open?.expires_at
              ? [{ label: "Offer valid until", value: formatBookingDateTime(summary.state.open.expires_at) }]
              : []),
          ]}
        />
      )}

      {detail.customer_message && (
        <div className="bj-note" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          <strong>Remarks from our team:</strong> {detail.customer_message}
        </div>
      )}

      {detail.status === "Approved" && !holdExpired && (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <p className="cp-ticket-snippet" style={{ margin: 0 }}>
            <strong>To accept:</strong> complete your buyer details, review and sign the agreement, and pay the booking amount below. Nothing is final
            until our team verifies your agreement and payment.
          </p>
          <p className="cp-ticket-snippet" style={{ margin: 0 }}>
            <strong>To discuss a different amount or decline:</strong> message our team. The booking is held for you until the offer expires.
          </p>
          <div>
            <Link to="/portal/chat" className="btn-secondary" style={{ textDecoration: "none", display: "inline-block" }}>
              Message our team about this offer
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
