import { useState, useEffect, useCallback } from "react";
import {
  BuildingIcon,
  RefreshIcon,
  SearchIcon,
  ClockIcon,
  AlertCircleIcon,
  EyeIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalBookings,
  getPortalBooking,
  getPortalSiteVisits,
} from "../../services/customerPortalCommercialService";
import type { PortalBooking, PortalSiteVisit } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";

const formatCurrency = (amount: number | string | undefined, currency = "USD") => {
  if (amount === undefined || amount === null || amount === "") return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(num);
};

export default function CustomerPortalRealEstate() {
  const [activeTab, setActiveTab] = useState<"bookings" | "visits">("bookings");
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [siteVisits, setSiteVisits] = useState<PortalSiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedBooking, setSelectedBooking] = useState<PortalBooking | null>(null);
  const [loadingBookingDetail, setLoadingBookingDetail] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bookingsData, visitsData] = await Promise.all([
        getPortalBookings().catch(() => []),
        getPortalSiteVisits().catch(() => []),
      ]);
      setBookings(bookingsData || []);
      setSiteVisits(visitsData || []);
    } catch (err: any) {
      console.error("Failed to load real estate portal data:", err);
      setError(
        err?.response?.data?.detail || "Unable to load real estate bookings and site visits."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenBooking = async (id: string) => {
    setLoadingBookingDetail(true);
    try {
      const data = await getPortalBooking(id);
      setSelectedBooking(data);
    } catch (err: any) {
      console.error("Failed to load booking detail:", err);
      const fallback = bookings.find((b) => b.id === id) || null;
      setSelectedBooking(fallback);
    } finally {
      setLoadingBookingDetail(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Confirmed":
      case "Completed":
      case "Verified":
      case "Paid":
        return <span className="badge-status status-resolved">{status}</span>;
      case "Pending":
      case "Scheduled":
        return <span className="badge-status status-open">{status}</span>;
      case "Cancelled":
      case "Rejected":
        return (
          <span
            className="badge-status"
            style={{ background: "rgba(239, 68, 68, 0.12)", color: "#ef4444" }}
          >
            {status}
          </span>
        );
      default:
        return <span className="badge-status">{status}</span>;
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const propName = b.property?.name?.toLowerCase() || "";
    const buyer = b.buyer_name?.toLowerCase() || "";
    return propName.includes(q) || buyer.includes(q) || b.id.toLowerCase().includes(q);
  });

  const filteredVisits = siteVisits.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const propName = v.property?.name?.toLowerCase() || "";
    return propName.includes(q) || v.status.toLowerCase().includes(q);
  });

  return (
    <div className="cp-tickets-page">
      {/* Header */}
      <div className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Real Estate Portfolio</h1>
          <p className="cp-page-subtitle">
            View your property reservations, payment installment schedules, verified transactions, and site visits.
          </p>
        </div>
        <button
          type="button"
          className="btn-refresh"
          onClick={fetchData}
          disabled={loading}
          title="Refresh property data"
        >
          <RefreshIcon size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, borderBottom: "1px solid var(--cp-border)", marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setActiveTab("bookings")}
          style={{
            padding: "10px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "bookings" ? "2px solid var(--cp-primary)" : "2px solid transparent",
            color: activeTab === "bookings" ? "var(--cp-primary)" : "var(--cp-text-muted)",
            fontWeight: activeTab === "bookings" ? 600 : 500,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <BuildingIcon size={16} />
          <span>Property Bookings ({bookings.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("visits")}
          style={{
            padding: "10px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "visits" ? "2px solid var(--cp-primary)" : "2px solid transparent",
            color: activeTab === "visits" ? "var(--cp-primary)" : "var(--cp-text-muted)",
            fontWeight: activeTab === "visits" ? 600 : 500,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ClockIcon size={16} />
          <span>Site Visits ({siteVisits.length})</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="cp-filter-bar">
        <div className="cp-search-box">
          <SearchIcon size={16} color="var(--cp-text-muted)" />
          <input
            type="text"
            placeholder={
              activeTab === "bookings"
                ? "Search by property or booking..."
                : "Search site visits by property or status..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          className="cp-alert cp-alert-error"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 8,
            color: "#ef4444",
            marginBottom: 20,
          }}
        >
          <AlertCircleIcon size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="cp-loading-state">
          <div className="cp-spinner" />
          <p>Loading real estate details...</p>
        </div>
      ) : activeTab === "bookings" ? (
        filteredBookings.length === 0 ? (
          <div className="cp-empty-state">
            <div className="cp-empty-icon">
              <BuildingIcon size={44} color="var(--cp-text-muted)" />
            </div>
            <h3>No Property Bookings Found</h3>
            <p>
              {search
                ? "No property bookings match your search query."
                : "No active or historical property reservations are registered for your account."}
            </p>
          </div>
        ) : (
          <div className="cp-table-card">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Booking Date</th>
                  <th>Agreed Price</th>
                  <th>Verified Paid</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--cp-text-main)" }}>
                        {b.property?.name || "Property Unit"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--cp-text-muted)", marginTop: 2 }}>
                        {[b.property?.unit_number && `Unit ${b.property.unit_number}`, b.property?.city]
                          .filter(Boolean)
                          .join(" • ") || "Unit Information"}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--cp-text-muted)" }}>
                      {b.booking_date
                        ? new Date(b.booking_date).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--cp-text-main)" }}>
                      {formatCurrency(b.agreed_price, b.property?.currency || "USD")}
                    </td>
                    <td style={{ fontWeight: 600, color: "#10b981" }}>
                      {formatCurrency(b.verified_paid_amount, b.property?.currency || "USD")}
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--cp-text-muted)" }}>
                      {formatCurrency(b.remaining_balance, b.property?.currency || "USD")}
                    </td>
                    <td>{getStatusBadge(b.status)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn-action"
                        onClick={() => handleOpenBooking(b.id)}
                        disabled={loadingBookingDetail}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "1px solid var(--cp-border)",
                          background: "var(--cp-bg-surface)",
                          color: "var(--cp-text-main)",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        <EyeIcon size={14} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Site Visits Tab */
        filteredVisits.length === 0 ? (
          <div className="cp-empty-state">
            <div className="cp-empty-icon">
              <ClockIcon size={44} color="var(--cp-text-muted)" />
            </div>
            <h3>No Site Visits Scheduled</h3>
            <p>
              {search
                ? "No site visits match your search query."
                : "You have no scheduled or past site visits recorded on your account."}
            </p>
          </div>
        ) : (
          <div className="cp-table-card">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Location</th>
                  <th>Scheduled Window</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredVisits.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--cp-text-main)" }}>
                        {v.property?.name || "Property Visit"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--cp-text-muted)", marginTop: 2 }}>
                        {v.property?.property_type || "Property"}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--cp-text-muted)" }}>
                      {[v.property?.address, v.property?.city, v.property?.state]
                        .filter(Boolean)
                        .join(", ") || "Location details on file"}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--cp-text-muted)" }}>
                      {v.scheduled_start
                        ? new Date(v.scheduled_start).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "Scheduled"}
                      {v.scheduled_end && ` – ${new Date(v.scheduled_end).toLocaleTimeString([], { timeStyle: "short" })}`}
                    </td>
                    <td>{getStatusBadge(v.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Booking Detail Modal */}
      {selectedBooking && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setSelectedBooking(null)}
        >
          <div
            className="modal-card"
            style={{
              backgroundColor: "var(--cp-bg-surface)",
              borderRadius: 12,
              border: "1px solid var(--cp-border)",
              width: "100%",
              maxWidth: 780,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 24px",
                borderBottom: "1px solid var(--cp-border)",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: "var(--cp-text-main)" }}>
                  {selectedBooking.property?.name || "Booking Details"}
                </h2>
                <span style={{ fontSize: 12, color: "var(--cp-text-muted)" }}>
                  Booking ID: {selectedBooking.id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--cp-text-muted)",
                }}
              >
                <XIcon size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24 }}>
              {/* Financial Summary KPIs */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: "var(--cp-bg-muted)",
                    border: "1px solid var(--cp-border)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--cp-text-muted)" }}>Agreed Price</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--cp-text-main)", marginTop: 4 }}>
                    {formatCurrency(selectedBooking.agreed_price, selectedBooking.property?.currency || "USD")}
                  </div>
                </div>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: "var(--cp-bg-muted)",
                    border: "1px solid var(--cp-border)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--cp-text-muted)" }}>Booking Deposit</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--cp-text-main)", marginTop: 4 }}>
                    {formatCurrency(selectedBooking.booking_amount, selectedBooking.property?.currency || "USD")}
                  </div>
                </div>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#10b981" }}>Verified Paid</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#10b981", marginTop: 4 }}>
                    {formatCurrency(selectedBooking.verified_paid_amount, selectedBooking.property?.currency || "USD")}
                  </div>
                </div>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: "var(--cp-bg-muted)",
                    border: "1px solid var(--cp-border)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--cp-text-muted)" }}>Remaining Balance</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--cp-text-main)", marginTop: 4 }}>
                    {formatCurrency(selectedBooking.remaining_balance, selectedBooking.property?.currency || "USD")}
                  </div>
                </div>
              </div>

              {/* Installment Plan Schedule */}
              {selectedBooking.payment_plan && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--cp-text-main)", marginBottom: 12 }}>
                    Installment Plan Schedule
                  </h3>
                  <table className="cp-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Milestone / Term</th>
                        <th>Due Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBooking.payment_plan.installments?.map((inst) => (
                        <tr key={inst.id}>
                          <td>{inst.sequence}</td>
                          <td style={{ fontWeight: 500, color: "var(--cp-text-main)" }}>{inst.name}</td>
                          <td style={{ fontSize: 13, color: "var(--cp-text-muted)" }}>
                            {new Date(inst.due_date).toLocaleDateString()}
                          </td>
                          <td style={{ fontWeight: 600, color: "var(--cp-text-main)" }}>
                            {formatCurrency(inst.amount, selectedBooking.property?.currency || "USD")}
                          </td>
                          <td>{getStatusBadge(inst.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Verified Payments */}
              {selectedBooking.payments && selectedBooking.payments.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--cp-text-main)", marginBottom: 12 }}>
                    Payment History
                  </h3>
                  <table className="cp-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBooking.payments.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontSize: 13, color: "var(--cp-text-muted)" }}>
                            {p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "Recorded"}
                          </td>
                          <td>{p.payment_method}</td>
                          <td style={{ fontSize: 12, color: "var(--cp-text-muted)" }}>
                            {p.transaction_reference || "N/A"}
                          </td>
                          <td style={{ fontWeight: 600, color: "var(--cp-text-main)" }}>
                            {formatCurrency(p.amount, selectedBooking.property?.currency || "USD")}
                          </td>
                          <td>{getStatusBadge(p.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "16px 24px",
                borderTop: "1px solid var(--cp-border)",
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  border: "1px solid var(--cp-border)",
                  background: "var(--cp-bg-surface)",
                  color: "var(--cp-text-main)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

