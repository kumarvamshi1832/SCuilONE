import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertCircleIcon } from "../common/SupportPortalIcons";
import { BookingStatusBadge } from "../booking-journey/BookingJourneyWidgets";
import { usePortalBookingRecords } from "../../hooks/usePortalBookingRecords";
import { formatBookingDate, formatBookingMoney } from "../../utils/bookingJourney";
import { countBookings, shortRef } from "../../utils/portalBookingRecords";
import "../../pages/portal/CustomerPortalTickets.css";
import "../booking-journey/BookingJourney.css";
import "./PortalBookingsList.css";

const RECENT_LIMIT = 5;

/**
 * Customer dashboard block: booking counts and the most recent bookings, from the customer-portal APIs.
 * Every figure is derived from the customer's own records; while loading or on error nothing is shown as zero.
 */
export default function PortalBookingSummary() {
  const { records, loading, error, warning, loaded, reload } = usePortalBookingRecords();
  const counts = useMemo(() => countBookings(records), [records]);
  const recent = records.slice(0, RECENT_LIMIT);

  if (error) {
    return (
      <div className="support-alert error" role="alert">
        <AlertCircleIcon size={18} />
        <span>{error}</span>
        <button type="button" className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void reload()}>
          Retry
        </button>
      </div>
    );
  }
  if (loading && !loaded) return <p className="cp-ticket-snippet" aria-busy="true">Loading your bookings…</p>;

  const stats: Array<{ label: string; value: number; to: string }> = [
    { label: "Total bookings", value: counts.total, to: "/portal/bookings" },
    { label: "Active bookings", value: counts.active, to: "/portal/bookings" },
    { label: "Pending requests", value: counts.pending, to: "/portal/booking-requests" },
    { label: "Confirmed", value: counts.confirmed, to: "/portal/bookings" },
    { label: "Cancelled / rejected", value: counts.closed, to: "/portal/bookings" },
  ];

  return (
    <div>
      {warning && (
        <div className="support-alert error" role="status" style={{ marginBottom: 12 }}>
          <AlertCircleIcon size={18} />
          <span>{warning}</span>
        </div>
      )}
      <div className="pbs-stats">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="pbs-stat">
            <div className="pbs-stat-label">{s.label}</div>
            <div className="pbs-stat-value">{s.value}</div>
          </Link>
        ))}
      </div>

      <div className="pbs-head">
        <h3>Recent bookings</h3>
        <Link to="/portal/bookings" className="btn-secondary" style={{ textDecoration: "none" }}>
          View all
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="cp-ticket-snippet">No bookings yet. After a completed site visit you can request a booking.</p>
      ) : (
        <div className="cp-table-responsive">
          <table className="cp-table">
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Property</th>
                <th>Date</th>
                <th className="pbl-num">Agreed price</th>
                <th className="pbl-num">Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.key}>
                  <td>
                    {r.requestId ? (
                      <Link className="cp-ticket-link" to={`/portal/booking-requests/${r.requestId}`}>
                        #{shortRef(r.bookingId ?? r.requestId)}
                      </Link>
                    ) : (
                      <span>#{shortRef(r.bookingId)}</span>
                    )}
                  </td>
                  <td>
                    <div className="pbl-prop">{r.propertyName ?? "—"}</div>
                    {r.unitNumber && <div className="cp-ticket-snippet">Unit {r.unitNumber}</div>}
                  </td>
                  <td>{formatBookingDate(r.date)}</td>
                  <td className="pbl-num">{r.agreedPrice === null ? "—" : formatBookingMoney(r.agreedPrice, r.currency)}</td>
                  <td className="pbl-num pbl-paid">{r.paidAmount === null ? "—" : formatBookingMoney(r.paidAmount, r.currency)}</td>
                  <td>
                    <BookingStatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
