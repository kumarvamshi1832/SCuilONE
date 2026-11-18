import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  AlertCircleIcon,
  ReceiptIcon,
  RefreshIcon,
  SearchIcon,
} from "../../components/common/SupportPortalIcons";
import { getPortalSiteVisits } from "../../services/customerPortalCommercialService";
import { getBookingRequests } from "../../services/customerPortalJourneyService";
import { BookingStatusBadge } from "../../components/booking-journey/BookingJourneyWidgets";
import {
  describeHold,
  formatBookingDate,
  formatBookingDateTime,
  formatBookingMoney,
} from "../../utils/bookingJourney";
import { getApiErrorMessage } from "../../utils/apiError";
import type { BookingRequest } from "../../types/customerBookingJourney";
import type { PortalSiteVisit } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";
import "../../components/booking-journey/BookingJourney.css";

interface PortalOutletContext {
  isRealEstate?: boolean;
}

const shortId = (id: string): string => id.slice(0, 8).toUpperCase();

export default function CustomerPortalBookingRequests() {
  const outlet = useOutletContext<PortalOutletContext | null>();
  const isRealEstate = outlet?.isRealEstate !== false;

  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [visits, setVisits] = useState<PortalSiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await getBookingRequests());
    } catch (err) {
      // Keep the last successfully loaded requests visible; only report the failure.
      setError(getApiErrorMessage(err, "Failed to load your booking requests."));
    } finally {
      setLoading(false);
    }
    // Property names come from the site visits (the request payload only carries ids); optional.
    getPortalSiteVisits()
      .then(setVisits)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-fetch when the customer returns to this tab so a request created elsewhere is not missed.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const propertyBySiteVisit = useMemo(() => {
    const map = new Map<string, string>();
    visits.forEach((v) => {
      if (v.property?.name) map.set(v.id, v.property.name);
    });
    return map;
  }, [visits]);

  const statuses = useMemo(() => Array.from(new Set(requests.map((r) => r.status))).sort(), [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      const name = (propertyBySiteVisit.get(r.site_visit_id) || "").toLowerCase();
      return name.includes(q) || r.id.toLowerCase().includes(q) || r.status.toLowerCase().includes(q);
    });
  }, [requests, search, statusFilter, propertyBySiteVisit]);

  if (!isRealEstate) {
    return (
      <div className="cp-tickets-page">
        <div className="cp-table-card">
          <div className="cp-empty-state">
            <AlertCircleIcon size={40} />
            <h3>Booking requests are not available</h3>
            <p>This feature is available for Real Estate workspaces only.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-tickets-page">
      <div className="cp-tickets-header">
        <div>
          <h1>Booking Requests</h1>
          <p>Track every booking request, its hold, payments and agreement.</p>
        </div>
        <Link to="/portal/booking-journey" className="btn-primary" style={{ textDecoration: "none" }}>
          Start from a site visit
        </Link>
      </div>

      <div className="cp-tickets-toolbar">
        <div className="cp-search-box" style={{ flex: 1, minWidth: 220 }}>
          <SearchIcon size={16} className="cp-search-icon" />
          <input
            type="text"
            placeholder="Search by property, request ID or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search booking requests"
          />
        </div>
        <div className="cp-filters-group">
          <select
            className="cp-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {(search || statusFilter) && (
            <button
              className="btn-secondary"
              onClick={() => {
                setSearch("");
                setStatusFilter("");
              }}
            >
              Clear
            </button>
          )}
          <button className="btn-secondary" onClick={() => void load()} disabled={loading} aria-label="Refresh">
            <RefreshIcon size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{error}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="cp-table-card">
        {loading && requests.length === 0 ? (
          <div className="cp-empty-state" aria-busy="true">
            <p>Loading booking requests…</p>
          </div>
        ) : !error && requests.length === 0 ? (
          <div className="cp-empty-state">
            <ReceiptIcon size={40} />
            <h3>No booking requests yet</h3>
            <p>After a completed site visit you can request a booking from the Booking Journey page.</p>
            <Link to="/portal/booking-journey" className="btn-primary" style={{ marginTop: 16, textDecoration: "none" }}>
              Open Booking Journey
            </Link>
          </div>
        ) : requests.length > 0 && filtered.length === 0 ? (
          <div className="cp-empty-state">
            <h3>No matching requests</h3>
            <p>Try a different search or status filter.</p>
          </div>
        ) : (
          requests.length > 0 && (
            <div className="cp-table-responsive">
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Property</th>
                    <th>Requested</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Hold</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const hold = describeHold(r.hold_expires_at, r.status);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link className="cp-ticket-link" to={`/portal/booking-requests/${r.id}`}>
                            #{shortId(r.id)}
                          </Link>
                        </td>
                        <td>{propertyBySiteVisit.get(r.site_visit_id) ?? "—"}</td>
                        <td>{formatBookingDate(r.created_at)}</td>
                        <td>
                          {r.agreed_price ? (
                            <>
                              <div>{formatBookingMoney(r.agreed_price)}</div>
                              {r.booking_amount && (
                                <div className="cp-ticket-snippet">Booking: {formatBookingMoney(r.booking_amount)}</div>
                              )}
                            </>
                          ) : (
                            <span className="cp-ticket-snippet">Pending approval</span>
                          )}
                        </td>
                        <td>
                          <BookingStatusBadge status={r.status} />
                        </td>
                        <td>
                          {hold ? (
                            <div title={formatBookingDateTime(r.hold_expires_at)}>{hold}</div>
                          ) : (
                            <span className="cp-ticket-snippet">—</span>
                          )}
                        </td>
                        <td>{formatBookingDate(r.updated_at)}</td>
                        <td style={{ textAlign: "right" }}>
                          <Link className="btn-secondary" style={{ textDecoration: "none" }} to={`/portal/booking-requests/${r.id}`}>
                            View details
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
