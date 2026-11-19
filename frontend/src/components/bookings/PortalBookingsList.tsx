import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircleIcon, ReceiptIcon, RefreshIcon, SearchIcon } from "../common/SupportPortalIcons";
import { BookingStatusBadge } from "../booking-journey/BookingJourneyWidgets";
import { usePortalBookingRecords } from "../../hooks/usePortalBookingRecords";
import { describeHold, formatBookingDate, formatBookingMoney } from "../../utils/bookingJourney";
import { countBookings, matchesFilter, shortRef } from "../../utils/portalBookingRecords";
import type { BookingFilter, BookingRecord } from "../../utils/portalBookingRecords";
import "../../pages/portal/CustomerPortalTickets.css";
import "../booking-journey/BookingJourney.css";
import "./PortalBookingsList.css";

interface PortalBookingsListProps {
  /** Opens the in-page detail for a booking that has no booking request behind it (staff-created). */
  onInspectBooking?: (bookingId: string) => void;
}

const FILTERS: Array<{ key: BookingFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending requests" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "closed", label: "Cancelled / Rejected / Expired" },
];

const money = (r: BookingRecord, value: string | null) => (value === null ? "—" : formatBookingMoney(value, r.currency));

/**
 * The customer's complete booking history: every booking and booking request, filterable by stage and searchable.
 * Data comes from the customer-portal APIs only (see usePortalBookingRecords), so a customer sees their own
 * records and nothing else.
 */
export default function PortalBookingsList({ onInspectBooking }: PortalBookingsListProps) {
  const { records, loading, error, warning, loaded, reload } = usePortalBookingRecords();
  const [filter, setFilter] = useState<BookingFilter>("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => countBookings(records), [records]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (!matchesFilter(r, filter)) return false;
      if (!q) return true;
      return [r.propertyName, r.unitNumber, r.city, r.status, r.bookingId, r.requestId, shortRef(r.bookingId), shortRef(r.requestId)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [records, filter, search]);

  const countFor = (key: BookingFilter): number => (key === "all" ? counts.total : counts[key]);

  return (
    <div className="pbl-root">
      <div className="pbl-toolbar">
        <div className="cp-search-box" style={{ flex: 1, minWidth: 220 }}>
          <SearchIcon size={16} className="cp-search-icon" />
          <input
            type="text"
            placeholder="Search by property, unit, city, booking ID or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search bookings"
          />
        </div>
        <button type="button" className="btn-secondary" onClick={() => void reload()} disabled={loading} aria-label="Refresh bookings">
          <RefreshIcon size={15} />
        </button>
      </div>

      <div className="pbl-filters" role="tablist" aria-label="Filter bookings">
        {FILTERS.filter((f) => f.key === "all" || f.key === "active" || f.key === "pending" || f.key === "confirmed" || countFor(f.key) > 0 || filter === f.key).map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`pbl-chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span className="pbl-chip-count">{countFor(f.key)}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{error}</span>
          <button type="button" className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}
      {!error && warning && (
        <div className="support-alert error" role="status">
          <AlertCircleIcon size={18} />
          <span>{warning}</span>
          <button type="button" className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}

      <div className="cp-table-card">
        {loading && !loaded ? (
          <div className="cp-empty-state" aria-busy="true">
            <p>Loading your bookings…</p>
          </div>
        ) : error ? null : records.length === 0 ? (
          <div className="cp-empty-state">
            <ReceiptIcon size={40} />
            <h3>No bookings yet</h3>
            <p>Once you request a booking after a site visit, it will appear here with its full history.</p>
            <Link to="/portal/booking-journey" className="btn-primary" style={{ marginTop: 16, textDecoration: "none" }}>
              Open Booking Journey
            </Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="cp-empty-state">
            <h3>No matching bookings</h3>
            <p>Try a different search or filter.</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="cp-table-responsive">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Property</th>
                  <th>Date</th>
                  <th className="pbl-num">Agreed price</th>
                  <th className="pbl-num">Booking amount</th>
                  <th className="pbl-num">Paid</th>
                  <th className="pbl-num">Remaining</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const hold = r.requestId ? describeHold(r.holdExpiresAt, r.status) : null;
                  return (
                    <tr key={r.key}>
                      <td>
                        {r.requestId ? (
                          <Link className="cp-ticket-link" to={`/portal/booking-requests/${r.requestId}`}>
                            #{shortRef(r.bookingId ?? r.requestId)}
                          </Link>
                        ) : (
                          <span>#{shortRef(r.bookingId)}</span>
                        )}
                        {!r.bookingId && <div className="cp-ticket-snippet">Request</div>}
                      </td>
                      <td>
                        <div className="pbl-prop">{r.propertyName ?? "—"}</div>
                        <div className="cp-ticket-snippet">
                          {[r.unitNumber && `Unit ${r.unitNumber}`, r.city].filter(Boolean).join(" • ") || " "}
                        </div>
                      </td>
                      <td>{formatBookingDate(r.date)}</td>
                      <td className="pbl-num">{r.agreedPrice === null ? <span className="cp-ticket-snippet">Pending approval</span> : money(r, r.agreedPrice)}</td>
                      <td className="pbl-num">{money(r, r.bookingAmount)}</td>
                      <td className="pbl-num pbl-paid">{money(r, r.paidAmount)}</td>
                      <td className="pbl-num">{money(r, r.remainingBalance)}</td>
                      <td>
                        <BookingStatusBadge status={r.status} />
                        {hold && <div className="cp-ticket-snippet">{hold}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {r.requestId ? (
                          <Link className="btn-secondary" style={{ textDecoration: "none" }} to={`/portal/booking-requests/${r.requestId}`}>
                            View details
                          </Link>
                        ) : r.bookingId && onInspectBooking ? (
                          <button type="button" className="btn-secondary" onClick={() => onInspectBooking(r.bookingId as string)}>
                            View details
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
