import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  BuildingIcon,
  RefreshIcon,
  SearchIcon,
  ClockIcon,
  AlertCircleIcon,
  EyeIcon,
  XIcon,
  ReceiptIcon,
  FileSignatureIcon,
  CheckCircleIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalBookings,
  getPortalBooking,
  getPortalSiteVisits,
} from "../../services/customerPortalCommercialService";
import { getBookingHandover, acknowledgeHandover } from "../../services/customerPortalJourneyService";
import type { PortalHandover } from "../../types/customerBookingJourney";
import { describeHold, formatBookingDateTime } from "../../utils/bookingJourney";
import type { PortalBooking, PortalSiteVisit } from "../../types/customerPortal";
import PortalSiteVisitSections from "../../components/site-visits/PortalSiteVisitSections";
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

import PortalBookingsList from "../../components/bookings/PortalBookingsList";
import CustomerPortalBuyerRequirements from "./CustomerPortalBuyerRequirements";
import { getPortalBuyerRequirements } from "../../services/customerPortalBuyerRequirementService";

export interface CustomerPortalRealEstateProps {
  initialTab?: "properties" | "bookings" | "visits" | "requirements";
}

interface PropertySummaryItem {
  id: string;
  name: string;
  propertyType?: string;
  unitNumber?: string;
  city?: string;
  address?: string;
  currency?: string;
  bookingId?: string;
  bookingStatus?: string;
  agreedPrice?: string;
  verifiedPaidAmount?: string;
  remainingBalance?: string;
}

type PortfolioTab = "properties" | "bookings" | "visits" | "requirements";

export default function CustomerPortalRealEstate({ initialTab }: CustomerPortalRealEstateProps = {}) {
  const location = useLocation();

  const resolveTab = (): PortfolioTab => {
    const requestedTab = new URLSearchParams(location.search).get("tab");
    if (requestedTab === "requirements") return "requirements";
    if (initialTab) return initialTab;
    const path = location.pathname.toLowerCase();
    if (path.includes("properties")) return "properties";
    if (path.includes("site-visits") || path.includes("visits")) return "visits";
    if (path.includes("bookings")) return "bookings";
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    if (tabParam === "properties" || tabParam === "visits" || tabParam === "bookings") {
      return tabParam;
    }
    return "properties";
  };

  const [activeTab, setActiveTab] = useState<PortfolioTab>(resolveTab);
  /** Number of buyer requirements, reported by the embedded Buyer Requirements tab (shown once it has loaded). */
  const [requirementCount, setRequirementCount] = useState<number | null>(null);
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [siteVisits, setSiteVisits] = useState<PortalSiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedBooking, setSelectedBooking] = useState<PortalBooking | null>(null);
  const [loadingBookingDetail, setLoadingBookingDetail] = useState(false);
  const [bookingHandover, setBookingHandover] = useState<PortalHandover | null>(null);
  const [acknowledgingHandover, setAcknowledgingHandover] = useState(false);
  const [handoverNotice, setHandoverNotice] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(resolveTab());
  }, [location.pathname, location.search, initialTab]);

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
      // Count for the Buyer Requirements tab label; the tab itself reports failures when it is opened.
      getPortalBuyerRequirements().then((list) => setRequirementCount(list.length)).catch(() => undefined);
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
    setBookingHandover(null);
    setHandoverNotice(null);
    try {
      const data = await getPortalBooking(id);
      setSelectedBooking(data);
      if (data && (data.status === "Confirmed" || data.status === "Completed")) {
        getBookingHandover(id).then(setBookingHandover).catch(() => setBookingHandover(null));
      }
    } catch (err: any) {
      console.error("Failed to load booking detail:", err);
      const fallback = bookings.find((b) => b.id === id) || null;
      setSelectedBooking(fallback);
    } finally {
      setLoadingBookingDetail(false);
    }
  };

  const handleAcknowledgeHandover = async (handoverId: string) => {
    setAcknowledgingHandover(true);
    setHandoverNotice(null);
    try {
      const updated = await acknowledgeHandover(handoverId, { confirm_possession: true });
      setBookingHandover(updated);
      setHandoverNotice("Property possession successfully acknowledged!");
    } catch (err: any) {
      setHandoverNotice(err?.response?.data?.detail || "Failed to acknowledge property possession.");
    } finally {
      setAcknowledgingHandover(false);
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

  const propertyCards = useMemo(() => {
    const map = new Map<string, PropertySummaryItem>();

    bookings.forEach((b) => {
      const propId = b.property?.id || b.property_id || b.id;
      if (!map.has(propId)) {
        map.set(propId, {
          id: propId,
          name: b.property?.name || b.property_title || "Residential Unit",
          propertyType: b.property?.property_type || "Apartment / Unit",
          unitNumber: b.property?.unit_number || undefined,
          city: b.property?.city || undefined,
          address: b.property?.address || undefined,
          currency: b.property?.currency || "USD",
          bookingId: b.id,
          bookingStatus: b.status,
          agreedPrice: b.agreed_price,
          verifiedPaidAmount: b.verified_paid_amount,
          remainingBalance: b.remaining_balance,
        });
      }
    });

    siteVisits.forEach((v) => {
      const propId = v.property?.id || v.property_id || v.id;
      if (!map.has(propId)) {
        map.set(propId, {
          id: propId,
          name: v.property?.name || v.property_title || "Property Visit Location",
          propertyType: v.property?.property_type || "Residential",
          city: v.property?.city || undefined,
          address: v.property?.address || undefined,
          currency: "USD",
        });
      }
    });

    return Array.from(map.values());
  }, [bookings, siteVisits]);

  const filteredProperties = propertyCards.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.city && p.city.toLowerCase().includes(q)) ||
      (p.unitNumber && p.unitNumber.toLowerCase().includes(q)) ||
      (p.propertyType && p.propertyType.toLowerCase().includes(q))
    );
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
      <div style={{ display: "flex", gap: 10, borderBottom: "1px solid var(--cp-border)", marginBottom: 20, overflowX: "auto", whiteSpace: "nowrap" }}>
        <button
          type="button"
          onClick={() => setActiveTab("properties")}
          style={{
            padding: "10px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "properties" ? "2px solid var(--cp-primary)" : "2px solid transparent",
            color: activeTab === "properties" ? "var(--cp-primary)" : "var(--cp-text-muted)",
            fontWeight: activeTab === "properties" ? 600 : 500,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <BuildingIcon size={16} />
          <span>Properties ({propertyCards.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("requirements")}
          role="tab"
          aria-selected={activeTab === "requirements"}
          style={{
            padding: "10px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "requirements" ? "2px solid var(--cp-primary)" : "2px solid transparent",
            color: activeTab === "requirements" ? "var(--cp-primary)" : "var(--cp-text-muted)",
            fontWeight: activeTab === "requirements" ? 600 : 500,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <FileSignatureIcon size={16} />
          <span>Buyer Requirements{requirementCount !== null ? ` (${requirementCount})` : ""}</span>
        </button>
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
          <ReceiptIcon size={16} />
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
      <div className="cp-filter-bar" style={activeTab === "bookings" || activeTab === "requirements" ? { display: "none" } : undefined}>
        <div className="cp-search-box">
          <SearchIcon size={16} color="var(--cp-text-muted)" />
          <input
            type="text"
            placeholder={
              activeTab === "properties"
                ? "Search by property name, unit, or city..."
                : activeTab === "bookings"
                ? "Search by property or booking ID..."
                : "Search site visits by property or status..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Error state */}
      {error && activeTab !== "requirements" && (
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
      {activeTab === "requirements" ? (
        <CustomerPortalBuyerRequirements embedded onCountChange={setRequirementCount} />
      ) : loading ? (
        <div className="cp-loading-state">
          <div className="cp-spinner" />
          <p>Loading real estate details...</p>
        </div>
      ) : activeTab === "properties" ? (
        filteredProperties.length === 0 ? (
          <div className="cp-empty-state">
            <div className="cp-empty-icon">
              <BuildingIcon size={44} color="var(--cp-text-muted)" />
            </div>
            <h3>No Properties Found</h3>
            <p>
              {search
                ? "No property records match your search criteria."
                : "No properties are currently linked to your customer account portfolio."}
            </p>
          </div>
        ) : (
          <div className="cp-table-card">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Property & Project</th>
                  <th>Unit & Type</th>
                  <th>Location</th>
                  <th>Contracted Value</th>
                  <th>Verified Paid</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProperties.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--cp-text-main)" }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--cp-text-muted)", marginTop: 2 }}>
                        {[p.unitNumber && `Unit ${p.unitNumber}`, p.city].filter(Boolean).join(" • ") || "Portfolio Property"}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: "var(--cp-text-main)" }}>
                        {p.unitNumber ? `Unit ${p.unitNumber}` : p.propertyType || "Property Unit"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--cp-text-muted)", marginTop: 2 }}>
                        {p.propertyType || "Residential"}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--cp-text-muted)" }}>
                      {[p.address, p.city].filter(Boolean).join(", ") || "Location On Record"}
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--cp-text-main)" }}>
                      {formatCurrency(p.agreedPrice, p.currency)}
                    </td>
                    <td style={{ fontWeight: 600, color: "#10b981" }}>
                      {p.verifiedPaidAmount !== undefined
                        ? formatCurrency(p.verifiedPaidAmount, p.currency)
                        : "—"}
                    </td>
                    <td>
                      {p.bookingStatus ? (
                        getStatusBadge(p.bookingStatus)
                      ) : (
                        <span className="badge-status status-open">Listed</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {p.bookingId ? (
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => handleOpenBooking(p.bookingId!)}
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
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--cp-text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : activeTab === "bookings" ? (
        <PortalBookingsList onInspectBooking={handleOpenBooking} />
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
          <PortalSiteVisitSections visits={filteredVisits} />
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
              {/* Cancellation & Refund Notice */}
              {selectedBooking.status === "Cancelled" && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 8,
                    padding: "14px 18px",
                    marginBottom: 20,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#ef4444", fontWeight: 600, fontSize: 14 }}>
                    <AlertCircleIcon size={16} />
                    <span>Booking Cancelled</span>
                  </div>
                  {selectedBooking.cancellation_reason && (
                    <div style={{ fontSize: 13, color: "var(--cp-text-main)", marginTop: 6 }}>
                      <strong>Reason:</strong> {selectedBooking.cancellation_reason}
                    </div>
                  )}
                  {(selectedBooking.refunded_amount || selectedBooking.refund_amount) && (
                    <div style={{ fontSize: 13, color: "var(--cp-text-muted)", marginTop: 4 }}>
                      <strong>Refund Status:</strong> Processed{" "}
                      <span style={{ color: "#10b981", fontWeight: 600 }}>
                        {formatCurrency(
                          selectedBooking.refunded_amount || selectedBooking.refund_amount,
                          selectedBooking.property?.currency || "USD"
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Temporary Hold Details */}
              {selectedBooking.hold_expires_at && selectedBooking.status !== "Cancelled" && (
                <div
                  style={{
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.25)",
                    borderRadius: 8,
                    padding: "12px 16px",
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <ClockIcon size={16} color="#d97706" />
                  <div style={{ fontSize: 13, color: "var(--cp-text-main)" }}>
                    <strong>Hold Expiry:</strong> {formatBookingDateTime(selectedBooking.hold_expires_at)}
                    {selectedBooking.status && describeHold(selectedBooking.hold_expires_at, selectedBooking.status) && (
                      <span style={{ marginLeft: 6, color: "#d97706", fontWeight: 600 }}>
                        ({describeHold(selectedBooking.hold_expires_at, selectedBooking.status)})
                      </span>
                    )}
                  </div>
                </div>
              )}

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
                        {selectedBooking.payment_plan.installments?.some((i) => i.paid_amount !== undefined) && (
                          <>
                            <th>Paid (verified)</th>
                            <th>Remaining</th>
                          </>
                        )}
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
                          {selectedBooking.payment_plan?.installments?.some((i) => i.paid_amount !== undefined) && (
                            <>
                              <td style={{ color: "#10b981", fontWeight: 600 }}>
                                {formatCurrency(inst.paid_amount ?? "0", selectedBooking.property?.currency || "USD")}
                              </td>
                              <td>{formatCurrency(inst.outstanding_amount ?? inst.amount, selectedBooking.property?.currency || "USD")}</td>
                            </>
                          )}
                          <td>{getStatusBadge(inst.payment_state ?? inst.status)}</td>
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

              {/* Property Handover & Possession */}
              {bookingHandover && (
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--cp-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--cp-text-main)", margin: 0 }}>
                      Property Handover &amp; Key Possession
                    </h3>
                    <span className="badge-status status-open">{bookingHandover.status}</span>
                  </div>

                  {handoverNotice && (
                    <div style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(16, 185, 129, 0.1)", color: "#10b981", fontSize: 13, marginBottom: 12 }}>
                      {handoverNotice}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
                    <div style={{ padding: 12, borderRadius: 6, background: "var(--cp-bg-muted)", border: "1px solid var(--cp-border)" }}>
                      <div style={{ fontSize: 11, color: "var(--cp-text-muted)" }}>Scheduled Time</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cp-text-main)", marginTop: 2 }}>
                        {bookingHandover.scheduled_at ? formatBookingDateTime(bookingHandover.scheduled_at) : "Pending Schedule"}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 6, background: "var(--cp-bg-muted)", border: "1px solid var(--cp-border)" }}>
                      <div style={{ fontSize: 11, color: "var(--cp-text-muted)" }}>Handover Location</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cp-text-main)", marginTop: 2 }}>
                        {bookingHandover.location || "On-site Property Address"}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 6, background: "var(--cp-bg-muted)", border: "1px solid var(--cp-border)" }}>
                      <div style={{ fontSize: 11, color: "var(--cp-text-muted)" }}>Possession Status</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: bookingHandover.customer_acknowledged_at ? "#10b981" : "#f59e0b", marginTop: 2 }}>
                        {bookingHandover.customer_acknowledged_at ? "✓ Acknowledged" : "Awaiting Customer Acknowledgement"}
                      </div>
                    </div>
                  </div>

                  {!bookingHandover.customer_acknowledged_at &&
                    ["Scheduled", "Rescheduled", "In Progress"].includes(bookingHandover.status) && (
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handleAcknowledgeHandover(bookingHandover.id)}
                          disabled={acknowledgingHandover}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "8px 16px" }}
                        >
                          <CheckCircleIcon size={14} />
                          <span>{acknowledgingHandover ? "Confirming..." : "Acknowledge Property Possession"}</span>
                        </button>
                      </div>
                    )}
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
