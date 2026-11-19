import { formatBookingDateTime } from "../../utils/bookingJourney";
import type { JourneyBookingSummary } from "../../types/customerBookingJourney";
import { NomineesView } from "./NomineesEditor";
import "./BuyerNominees.css";

/** Read-only buyer details and nominees submitted by the customer, for the staff booking-request page. */
export default function RequestBuyerSummary({ booking }: { booking: JourneyBookingSummary | undefined }) {
  const submittedAt = booking?.buyer_details_submitted_at ?? null;
  const nominees = booking?.nominees ?? [];
  return (
    <section className="ins-card bn-section" aria-label="Buyer and nominee details" style={{ marginTop: 0 }}>
      <h2 className="ins-card-title" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span>Buyer &amp; nominees</span>
        <span className={`bn-status ${submittedAt ? "done" : "todo"}`}>
          {submittedAt ? `Submitted ${formatBookingDateTime(submittedAt)}` : "Not submitted by the customer yet"}
        </span>
      </h2>
      {!booking ? (
        <p className="bn-note">The booking is created when the request is approved. Buyer details appear here afterwards.</p>
      ) : (
        <>
          <dl className="bn-details">
            <div>
              <dt>Buyer name</dt>
              <dd>{booking.buyer_name || "—"}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{booking.buyer_phone || "—"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{booking.buyer_email || "—"}</dd>
            </div>
            <div className="wide">
              <dt>Address</dt>
              <dd>{booking.buyer_address || "—"}</dd>
            </div>
          </dl>
          <p className="bn-sub">Nominees ({nominees.length})</p>
          <NomineesView nominees={nominees} />
          {!submittedAt && (
            <p className="bn-note">Final confirmation requires the customer to submit buyer and nominee details first.</p>
          )}
        </>
      )}
    </section>
  );
}
