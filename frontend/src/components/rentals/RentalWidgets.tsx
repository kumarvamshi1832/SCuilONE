import { rentalStatusTone } from "../../utils/rentalHelpers";
import "../booking-journey/BookingJourney.css";

/** Status pill for agreements, schedule items, payments, exit requests, settlements and renewals (same colours as BookingStatusBadge). */
export function RentalStatusBadge({ status }: { status: string }) {
  const tone = rentalStatusTone(status);
  const cls = tone === "good" ? "bj-good" : tone === "bad" ? "bj-bad" : tone === "warn" ? "bj-warn" : "bj-info";
  return <span className={`bj-badge ${cls}`}>{status}</span>;
}
