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
import { getPortalRentalProperties } from "../../services/customerPortalRentalService";
import { BookingStatusBadge } from "../../components/booking-journey/BookingJourneyWidgets";
import { PortalOfferAlerts, useRequestNegotiations } from "../../components/portal/PortalBookingNegotiation";
import { resolveRequestOfferDetails } from "../../utils/offerDisplay";
import {
  describeHold,
  formatBookingDate,
  formatBookingDateTime,
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
  const [rentalPropertyIds, setRentalPropertyIds] = useState<Set<string>>(new Set());
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
    getPortalRentalProperties()
      .then((props) => setRentalPropertyIds(new Set(props.map((p) => p.id))))
      .catch(() => undefined);
  }, []);

  const isRentalRequest = useCallback(
    (r: BookingRequest): boolean => {
      const v = visits.find((item) => item.id === r.site_visit_id);
      const pid = v?.property?.id || v?.property_id;
      if (pid && rentalPropertyIds.has(pid)) return true;
      const pt = (v?.property?.property_type || "").toLowerCase();
      if (pt.includes("rent") || pt.includes("lease")) return true;
      const ptitle = (v?.property?.name || v?.property_title || "").toLowerCase();
      if (ptitle.includes("rent") || ptitle.includes("lease")) return true;
      if (r.customer_notes?.includes("Payment Plan:")) return true;
      return false;
    },
    [visits, rentalPropertyIds]
  );

  const hasRentals = useMemo(() => requests.some(isRentalRequest), [requests, isRentalRequest]);
  const hasOnlyRentals = useMemo(() => requests.length > 0 && requests.every(isRentalRequest), [requests, isRentalRequest]);

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

  // Offers and counteroffers made by staff on these requests (customer property-offers API).
  const { items: negotiations } = useRequestNegotiations(requests, isRealEstate);
  const propertyNameByRequest = useMemo(() => {
    const map = new Map<string, string>();
    requests.forEach((r) => {
      const name = propertyBySiteVisit.get(r.site_visit_id);
      if (name) map.set(r.id, name);
    });
    return map;
  }, [requests, propertyBySiteVisit]);

  const propertyImageByRequest = useMemo(() => {
    const map = new Map<string, string>();
    requests.forEach((r) => {
      const v = visits.find((item) => item.id === r.site_visit_id);
      const img =
        (v?.property as any)?.images?.[0]?.image_url ||
        (v?.property as any)?.image_url ||
        (v?.property as any)?.primary_image_url;
      if (img) map.set(r.id, img);
    });
    return map;
  }, [requests, visits]);

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
          <h1>{hasOnlyRentals ? "Rental Requests" : hasRentals ? "Booking & Rental Requests" : "Booking Requests"}</h1>
          <p>
            {hasOnlyRentals
              ? "Track every rental request, its hold, payments and agreement."
              : "Track every booking and rental request, its hold, payments and agreement."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/portal/booking-journey" className="btn-primary" style={{ textDecoration: "none" }}>
            Start from a site visit
          </Link>
          <Link to="/portal/rentals" className="btn-secondary" style={{ textDecoration: "none" }}>
            My rentals
          </Link>
        </div>
      </div>

      <PortalOfferAlerts
        requests={requests}
        items={negotiations}
        propertyNames={propertyNameByRequest}
        propertyImages={propertyImageByRequest}
      />

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
            <h3>No requests yet</h3>
            <p>After a completed site visit you can request a booking or rental from the Booking &amp; Rental Journey page.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Link to="/portal/booking-journey" className="btn-primary" style={{ textDecoration: "none" }}>
                Open Journey
              </Link>
              <Link to="/portal/rentals" className="btn-secondary" style={{ textDecoration: "none" }}>
                My Rentals &amp; Leases
              </Link>
            </div>
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
                    const isRental = isRentalRequest(r);
                    const hold = describeHold(r.hold_expires_at, r.status);
                    const entry = negotiations.get(r.id);
                    const currency = entry?.negotiation.match.property.currency || "INR";
                    const offerInfo = resolveRequestOfferDetails(r, entry?.summary, currency, isRental);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link className="cp-ticket-link" to={`/portal/booking-requests/${r.id}`}>
                            #{shortId(r.id)}
                          </Link>
                          {isRental && (
                            <span className="pbn-chip" style={{ marginLeft: 6 }}>
                              Rental
                            </span>
                          )}
                        </td>
                        <td>{propertyBySiteVisit.get(r.site_visit_id) ?? "—"}</td>
                        <td>{formatBookingDate(r.created_at)}</td>
                        <td>
                          {offerInfo.formattedPrice ? (
                            <>
                              <div>{offerInfo.formattedPrice}</div>
                              {offerInfo.formattedBookingAmount && (
                                <div className="cp-ticket-snippet">
                                  {isRental ? "Deposit: " : "Booking: "}
                                  {offerInfo.formattedBookingAmount}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="cp-ticket-snippet">Pending approval</span>
                              {offerInfo.formattedBookingAmount && (
                                <div className="cp-ticket-snippet">
                                  {isRental ? "Deposit: " : "Booking: "}
                                  {offerInfo.formattedBookingAmount}
                                </div>
                              )}
                            </>
                          )}
                          {offerInfo.statusLabel && (
                            <div>
                              <span className="pbn-chip">{offerInfo.statusLabel}</span>
                            </div>
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
