import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getPropertyNameMap,
  getStaffBookingRequests,
} from "../../services/customerBookingWorkflowService";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { getApiErrorMessage } from "../../utils/apiError";
import {
  describeHold,
  formatBookingDate,
  formatBookingDateTime,
  formatBookingMoney,
  parseBackendDate,
} from "../../utils/bookingJourney";
import { BookingStatusBadge } from "../../components/booking-journey/BookingJourneyWidgets";
import { StaffCancellationQueue, StaffServiceRequestQueue } from "../../components/booking-journey/StaffLifecycleQueues";
import type { BookingRequest } from "../../types/customerBookingJourney";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";

const PAGE_SIZE = 15;

type HoldFilter = "" | "active" | "expired" | "none";

const holdKind = (r: BookingRequest): Exclude<HoldFilter, ""> => {
  if (["Requested", "Approved"].includes(r.status) && r.hold_expires_at) {
    const expiry = parseBackendDate(r.hold_expires_at);
    return expiry && expiry.getTime() > Date.now() ? "active" : "expired";
  }
  if (r.status.startsWith("Expired")) return "expired";
  return "none";
};

export default function CustomerBookingRequests() {
  const { industry } = useParams();
  const canView = useMemo(() => hasFeaturePermission("booking.view"), []);
  const canDecide = useMemo(() => hasFeaturePermission("booking.update"), []);
  const canViewService = useMemo(() => hasFeaturePermission("support_ticket.view"), []);
  const canUpdateService = useMemo(() => hasFeaturePermission("support_ticket.update"), []);
  /** Booking requests, cancellation requests and after-sales requests are separate queues of the same customer journey. */
  const [tab, setTab] = useState<"requests" | "cancellations" | "service">("requests");
  const [toast, setToast] = useState<string | null>(null);

  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agreementFilter, setAgreementFilter] = useState("");
  const [holdFilter, setHoldFilter] = useState<HoldFilter>("");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await getStaffBookingRequests();
      // Newest first (the API returns oldest first).
      setRequests([...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
    } catch (err) {
      // Keep the last successfully loaded requests visible; only report the failure.
      setError(getApiErrorMessage(err, "Failed to load customer booking requests."));
    } finally {
      setLoading(false);
    }
    getPropertyNameMap().then(setProperties);
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  // Staff revisiting the tab sees requests customers submitted in the meantime.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const statuses = useMemo(() => Array.from(new Set(requests.map((r) => r.status))).sort(), [requests]);
  const agreementStatuses = useMemo(() => Array.from(new Set(requests.map((r) => r.agreement_status))).sort(), [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (agreementFilter && r.agreement_status !== agreementFilter) return false;
      if (holdFilter && holdKind(r) !== holdFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        (properties[r.property_id] || "").toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });
  }, [requests, search, statusFilter, agreementFilter, holdFilter, properties]);

  useEffect(() => setPage(0), [search, statusFilter, agreementFilter, holdFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const counts = useMemo(
    () => ({
      awaiting: requests.filter((r) => r.status === "Requested").length,
      holds: requests.filter((r) => holdKind(r) === "active").length,
      verify: requests.filter((r) => r.agreement_status === "Customer Acknowledged").length,
      review: requests.filter((r) => r.status === "Expired - Payment Review").length,
    }),
    [requests]
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  /** booking id -> the booking request it belongs to (cancellation and service payloads only carry the booking id). */
  const bookingLinks = useMemo(() => {
    const map: Record<string, { requestId: string; propertyName: string }> = {};
    requests.forEach((r) => {
      if (r.booking_id) map[r.booking_id] = { requestId: r.id, propertyName: properties[r.property_id] || "" };
    });
    return map;
  }, [requests, properties]);

  if (!canView) {
    return (
      <div className="ins-page">
        <div className="page-header">
          <div>
            <h1>Customer Booking Requests</h1>
          </div>
        </div>
        <div className="leads-table-container">
          <div className="ins-empty">
            <h3>You do not have access to booking requests</h3>
            <p>Ask your administrator for the "View bookings" permission.</p>
          </div>
        </div>
      </div>
    );
  }

  const hasFilters = Boolean(search || statusFilter || agreementFilter || holdFilter);

  return (
    <div className="ins-page">
      <div className="page-header">
        <div>
          <h1>Customer Booking Requests</h1>
          <p className="text-muted">
            Booking requests submitted by customers from the portal: review, approve, set payment instructions,
            prepare and verify agreements.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {toast && (
        <div className="ins-alert" role="status" style={{ position: "fixed", right: 24, bottom: 24, zIndex: 2000 }}>
          <span>{toast}</span>
        </div>
      )}

      <div role="tablist" aria-label="Customer booking queues" style={{ display: "flex", gap: 8, margin: "0 0 14px", flexWrap: "wrap" }}>
        <button role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("requests")}>
          Booking requests
        </button>
        <button role="tab" aria-selected={tab === "cancellations"} className={tab === "cancellations" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("cancellations")}>
          Cancellations
        </button>
        {canViewService && (
          <button role="tab" aria-selected={tab === "service"} className={tab === "service" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("service")}>
            After-sales
          </button>
        )}
      </div>

      {tab === "cancellations" && <StaffCancellationQueue canDecide={canDecide} bookingLinks={bookingLinks} basePath={`/${industry ?? "real-estate"}`} onNotify={setToast} />}
      {tab === "service" && canViewService && <StaffServiceRequestQueue canUpdate={canUpdateService} bookingLinks={bookingLinks} basePath={`/${industry ?? "real-estate"}`} onNotify={setToast} />}

      {tab === "requests" && (
        <>
      <div className="ins-kpi-grid">
        <div className="ins-kpi amber">
          <span className="ins-kpi-label">Awaiting decision</span>
          <span className="ins-kpi-value">{counts.awaiting}</span>
        </div>
        <div className="ins-kpi green">
          <span className="ins-kpi-label">Active holds</span>
          <span className="ins-kpi-value">{counts.holds}</span>
        </div>
        <div className="ins-kpi purple">
          <span className="ins-kpi-label">Agreements to verify</span>
          <span className="ins-kpi-value">{counts.verify}</span>
        </div>
        <div className="ins-kpi red">
          <span className="ins-kpi-label">Expired — payment review</span>
          <span className="ins-kpi-value">{counts.review}</span>
        </div>
      </div>

      <div className="ins-toolbar">
        <div className="leads-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by request ID, property or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search booking requests"
          />
        </div>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="filter-select" value={holdFilter} onChange={(e) => setHoldFilter(e.target.value as HoldFilter)} aria-label="Filter by hold">
          <option value="">Any hold state</option>
          <option value="active">Hold active</option>
          <option value="expired">Hold expired</option>
          <option value="none">No hold</option>
        </select>
        <select className="filter-select" value={agreementFilter} onChange={(e) => setAgreementFilter(e.target.value)} aria-label="Filter by agreement status">
          <option value="">Any agreement status</option>
          {agreementStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setAgreementFilter("");
              setHoldFilter("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="ins-alert error" role="alert">
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="leads-table-container">
        {loading && requests.length === 0 ? (
          <div className="ins-loading" aria-busy="true">
            <div className="leads-loading-spinner" /> Loading booking requests…
          </div>
        ) : !error && requests.length === 0 ? (
          <div className="ins-empty">
            <h3>No customer booking requests yet</h3>
            <p>Requests appear here when customers ask to book a property after a completed site visit.</p>
          </div>
        ) : requests.length > 0 && filtered.length === 0 ? (
          <div className="ins-empty">
            <h3>No matching requests</h3>
            <p>Try adjusting the search or filters.</p>
          </div>
        ) : (
          requests.length > 0 && (
            <>
              <div className="ins-table-wrap">
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Property</th>
                      <th>Requested</th>
                      <th>Status</th>
                      <th>Hold</th>
                      <th>Agreement</th>
                      <th className="num">Booking amount</th>
                      <th>Payment instructions</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const hold = describeHold(r.hold_expires_at, r.status);
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>#{r.id.slice(0, 8).toUpperCase()}</td>
                          <td>{properties[r.property_id] ?? <span className="text-dim">—</span>}</td>
                          <td className="text-dim">{formatBookingDate(r.created_at)}</td>
                          <td>
                            <BookingStatusBadge status={r.status} />
                          </td>
                          <td className="text-dim" title={formatBookingDateTime(r.hold_expires_at)}>
                            {hold ?? "—"}
                          </td>
                          <td>
                            <BookingStatusBadge status={r.agreement_status} />
                          </td>
                          <td className="num">{formatBookingMoney(r.booking_amount)}</td>
                          <td className="text-dim">{r.payment_instructions ? "Provided" : "Not set"}</td>
                          <td>
                            <div className="ins-row-actions">
                              <Link
                                className="btn-secondary ins-btn-sm"
                                style={{ textDecoration: "none" }}
                                to={`/${industry}/customer-booking-requests/${r.id}`}
                              >
                                {r.status === "Requested" ? "Review" : "Manage"}
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ins-pager">
                <span>
                  {filtered.length} request{filtered.length === 1 ? "" : "s"} · page {page + 1} of {pageCount}
                </span>
                <div className="ins-pager-controls">
                  <button className="btn-secondary ins-btn-sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    Previous
                  </button>
                  <button className="btn-secondary ins-btn-sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </div>
        </>
      )}
    </div>
  );
}
