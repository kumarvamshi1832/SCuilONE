import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getBookings,
  createBooking,
  updateBooking,
  cancelBooking,
  completeBooking,
} from "../../services/bookingService";
import {
  getPayments,
  createPayment,
  decidePayment,
} from "../../services/paymentService";
import {
  getRefunds,
  createRefund,
  rejectRefund,
  confirmManualRefund,
} from "../../services/paymentRefundService";
import { getProperties } from "../../services/propertyService";
import type {
  Booking,
  BookingCreate,
} from "../../types/booking";
import { BOOKING_STATUSES } from "../../types/booking";
import type {
  Payment,
  PaymentCreate,
} from "../../types/payment";
import { PAYMENT_METHODS } from "../../types/payment";
import type { PaymentRefund } from "../../types/paymentRefund";
import type { Property } from "../../types/property";
import "./Bookings.css";

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Payments & Refunds inside view modal
  const [bookingPayments, setBookingPayments] = useState<Payment[]>([]);
  const [paymentsRefundsMap, setPaymentsRefundsMap] = useState<Record<string, PaymentRefund[]>>({});
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Record Payment Modal
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);

  // Request Refund Modal
  const [refundingPayment, setRefundingPayment] = useState<Payment | null>(null);

  // Confirm Manual Refund Modal
  const [confirmingRefund, setConfirmingRefund] = useState<{
    refund: PaymentRefund;
    paymentId: string;
  } | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const formatApiError = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (typeof first === "string") return first;
      if (first && typeof first.msg === "string") {
        const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
        return field && field !== "body" && field !== "query" ? `${field}: ${first.msg}` : first.msg;
      }
    }
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
      return detail.message;
    }
    return err?.message || fallback;
  };

  // Permissions
  const userPermissions = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (!stored)
        return {
          canCreate: true,
          canUpdate: true,
          canCancel: true,
          canComplete: true,
          canPaymentCreate: true,
          canPaymentVerify: true,
          canRefundManage: true,
        };
      const parsed = JSON.parse(stored);
      const perms: string[] = Array.isArray(parsed.permissions)
        ? parsed.permissions
        : parsed.role?.permissions || [];
      const role = String(parsed.role || "").toUpperCase();
      const isSuperOrAdmin =
        role.includes("ADMIN") || role.includes("MANAGER") || role === "TENANT ADMIN";

      const has = (p: string) =>
        isSuperOrAdmin || perms.some((x) => x.toLowerCase() === p.toLowerCase());

      return {
        canCreate: has("booking.create"),
        canUpdate: has("booking.update"),
        canCancel: has("booking.cancel"),
        canComplete: has("booking.sale.complete"),
        canPaymentCreate: has("booking.payment.create"),
        canPaymentVerify: has("booking.payment.verify"),
        canRefundManage: has("booking.refund.manage"),
      };
    } catch {
      return {
        canCreate: true,
        canUpdate: true,
        canCancel: true,
        canComplete: true,
        canPaymentCreate: true,
        canPaymentVerify: true,
        canRefundManage: true,
      };
    }
  }, []);

  // Initial datasets
  useEffect(() => {
    getProperties({ limit: 100 })
      .then(setProperties)
      .catch(console.error);
  }, []);

  const propertyMap = useMemo(() => {
    const map = new Map<string, Property>();
    properties.forEach((p) => map.set(p.id, p));
    return map;
  }, [properties]);

  // Available sale properties for new bookings
  const availableSaleProperties = useMemo(() => {
    return properties.filter(
      (p) => p.listing_type === "Sale" && p.status === "Available"
    );
  }, [properties]);

  // Fetch Bookings
  const fetchBookingsList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBookings({
        status: statusFilter || undefined,
        property_id: propertyFilter || undefined,
        limit: 100,
      });
      setBookings(data);
    } catch (err: any) {
      console.error("Failed to load bookings:", err);
      setError(formatApiError(err, "Failed to load bookings."));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, propertyFilter]);

  useEffect(() => {
    fetchBookingsList();
  }, [fetchBookingsList]);

  // Load payments & refunds for a booking
  const loadPaymentsAndRefunds = useCallback(async (bookingId: string) => {
    setLoadingPayments(true);
    try {
      const paymentsData = await getPayments(bookingId);
      setBookingPayments(paymentsData);

      // Load refunds for each payment
      const refundMap: Record<string, PaymentRefund[]> = {};
      await Promise.all(
        paymentsData.map(async (pmt) => {
          try {
            const rData = await getRefunds(bookingId, pmt.id);
            refundMap[pmt.id] = rData;
          } catch {
            refundMap[pmt.id] = [];
          }
        })
      );
      setPaymentsRefundsMap(refundMap);
    } catch (err) {
      console.error("Failed to load booking payments:", err);
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  useEffect(() => {
    if (viewingBooking) {
      loadPaymentsAndRefunds(viewingBooking.id);
    } else {
      setBookingPayments([]);
      setPaymentsRefundsMap({});
    }
  }, [viewingBooking, loadPaymentsAndRefunds]);

  // Currency Formatter
  const formatINR = (val?: number | string | null) => {
    if (val === null || val === undefined) return "₹0";
    const num = Number(val);
    if (isNaN(num)) return "₹0";
    return `₹${num.toLocaleString("en-IN")}`;
  };

  // Statistics
  const stats = useMemo(() => {
    const total = bookings.length;
    const confirmed = bookings.filter((b) => b.status === "Confirmed").length;
    const pending = bookings.filter((b) => b.status === "Pending").length;
    const completed = bookings.filter((b) => b.status === "Completed").length;
    const totalAgreed = bookings.reduce(
      (sum, b) => sum + (Number(b.agreed_price) || 0),
      0
    );
    return { total, confirmed, pending, completed, totalAgreed };
  }, [bookings]);

  // Filtered Bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const buyer = b.buyer_name?.toLowerCase() || "";
        const email = b.buyer_email?.toLowerCase() || "";
        const phone = b.buyer_phone?.toLowerCase() || "";
        const prop = propertyMap.get(b.property_id);
        const propName = prop?.name?.toLowerCase() || "";
        const city = prop?.city?.toLowerCase() || "";

        if (
          !buyer.includes(q) &&
          !email.includes(q) &&
          !phone.includes(q) &&
          !propName.includes(q) &&
          !city.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [bookings, searchQuery, propertyMap]);

  // Financial calculations for viewing booking
  const financialSummary = useMemo(() => {
    if (!viewingBooking) return null;

    const agreedPrice = Number(viewingBooking.agreed_price) || 0;
    const bookingToken = Number(viewingBooking.booking_amount) || 0;

    const verifiedPayments = bookingPayments.filter((p) => p.status === "Verified");
    const totalVerified = verifiedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    let totalRefunded = 0;
    Object.values(paymentsRefundsMap).forEach((rList) => {
      rList.forEach((r) => {
        if (r.status === "Processed") {
          totalRefunded += Number(r.amount);
        }
      });
    });

    const netReceived = totalVerified - totalRefunded;
    const balanceDue = Math.max(0, agreedPrice - netReceived);
    const progressPercent =
      agreedPrice > 0 ? Math.min(100, Math.round((netReceived / agreedPrice) * 100)) : 0;
    const canCompleteSale =
      viewingBooking.status === "Confirmed" && netReceived >= agreedPrice && agreedPrice > 0;

    return {
      agreedPrice,
      bookingToken,
      totalVerified,
      totalRefunded,
      netReceived,
      balanceDue,
      progressPercent,
      canCompleteSale,
    };
  }, [viewingBooking, bookingPayments, paymentsRefundsMap]);

  // Create Booking Submit
  const handleCreateBooking = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const property_id = String(formData.get("property_id") || "");
    const buyer_name = String(formData.get("buyer_name") || "").trim();
    const buyer_email = String(formData.get("buyer_email") || "").trim() || null;
    const buyer_phone = String(formData.get("buyer_phone") || "").trim() || null;
    const booking_amount = Number(formData.get("booking_amount") || 0);
    const agreed_price = formData.get("agreed_price")
      ? Number(formData.get("agreed_price"))
      : null;

    if (!property_id || !buyer_name || booking_amount < 0) {
      setFormError("Please select a Property, enter Buyer Name, and valid Booking Amount.");
      setSubmitting(false);
      return;
    }

    try {
      const payload: BookingCreate = {
        property_id,
        buyer_name,
        buyer_email,
        buyer_phone,
        booking_amount,
        agreed_price,
      };
      const created = await createBooking(payload);
      setBookings((prev) => [created, ...prev]);
      showToast("Booking created successfully!");
      setIsCreateOpen(false);

      // Refresh properties list because property is now Reserved
      getProperties({ limit: 100 }).then(setProperties).catch(console.error);
    } catch (err: any) {
      console.error("Create booking error:", err);
      setFormError(formatApiError(err, "Failed to create booking."));
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Pending Booking
  const handleConfirmBooking = async (booking: Booking) => {
    setSubmitting(true);
    try {
      const updated = await updateBooking(booking.id, { status: "Confirmed" });
      setBookings((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b))
      );
      setViewingBooking(updated);
      showToast("Booking confirmed!");
    } catch (err: any) {
      console.error("Confirm booking error:", err);
      showToast(formatApiError(err, "Failed to confirm booking."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel Booking
  const handleCancelBooking = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cancellingBooking) return;
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const cancellation_reason = String(formData.get("cancellation_reason") || "").trim();

    if (!cancellation_reason) {
      setFormError("Please provide a cancellation reason.");
      setSubmitting(false);
      return;
    }

    try {
      const cancelled = await cancelBooking(cancellingBooking.id, { cancellation_reason });
      setBookings((prev) =>
        prev.map((b) => (b.id === cancelled.id ? cancelled : b))
      );
      if (viewingBooking && viewingBooking.id === cancelled.id) {
        setViewingBooking(cancelled);
      }
      showToast("Booking cancelled. Property has been released.");
      setCancellingBooking(null);

      // Refresh properties list because property is now Available
      getProperties({ limit: 100 }).then(setProperties).catch(console.error);
    } catch (err: any) {
      console.error("Cancel booking error:", err);
      showToast(formatApiError(err, "Failed to cancel booking."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Complete Sale
  const handleCompleteSale = async (bookingId: string) => {
    setSubmitting(true);
    try {
      const completed = await completeBooking(bookingId);
      setBookings((prev) =>
        prev.map((b) => (b.id === completed.id ? completed : b))
      );
      setViewingBooking(completed);
      showToast("Sale completed successfully! Property marked as Sold.");

      // Refresh properties list
      getProperties({ limit: 100 }).then(setProperties).catch(console.error);
    } catch (err: any) {
      console.error("Complete sale error:", err);
      showToast(formatApiError(err, "Failed to complete sale."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Record Payment Submit
  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!viewingBooking) return;
    setSubmitting(true);
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get("amount") || 0);
    const payment_method = String(formData.get("payment_method") || "Bank Transfer");
    const transaction_reference = String(formData.get("transaction_reference") || "").trim() || null;
    const payment_date = String(formData.get("payment_date") || "")
      ? new Date(String(formData.get("payment_date"))).toISOString()
      : null;
    const notes = String(formData.get("notes") || "").trim() || null;

    if (amount <= 0) {
      setFormError("Amount must be greater than zero.");
      setSubmitting(false);
      return;
    }

    try {
      const payload: PaymentCreate = {
        amount,
        payment_method,
        transaction_reference,
        payment_date,
        notes,
      };
      await createPayment(viewingBooking.id, payload);
      showToast("Payment recorded! Awaiting verification.");
      setIsRecordPaymentOpen(false);
      loadPaymentsAndRefunds(viewingBooking.id);
    } catch (err: any) {
      console.error("Record payment error:", err);
      setFormError(err?.response?.data?.detail || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  };

  // Decide Payment Submit (Verify / Reject)
  const handleDecidePayment = async (status: "Verified" | "Rejected", paymentId: string) => {
    if (!viewingBooking) return;
    setSubmitting(true);
    try {
      await decidePayment(viewingBooking.id, paymentId, {
        status,
      });
      showToast(`Payment marked as ${status}!`);
      loadPaymentsAndRefunds(viewingBooking.id);
    } catch (err: any) {
      console.error("Payment decision error:", err);
      showToast(err?.response?.data?.detail || "Action failed.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Request Refund Submit
  const handleRequestRefund = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!viewingBooking || !refundingPayment) return;
    setSubmitting(true);
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get("amount") || 0);
    const reason = String(formData.get("reason") || "").trim();

    if (amount <= 0 || !reason) {
      setFormError("Please enter a valid amount > 0 and a reason.");
      setSubmitting(false);
      return;
    }

    try {
      await createRefund(viewingBooking.id, refundingPayment.id, {
        amount,
        reason,
      });
      showToast("Refund requested!");
      setRefundingPayment(null);
      loadPaymentsAndRefunds(viewingBooking.id);
    } catch (err: any) {
      console.error("Refund request error:", err);
      setFormError(err?.response?.data?.detail || "Failed to request refund.");
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Manual Refund Submit
  const handleConfirmManualRefund = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!viewingBooking || !confirmingRefund) return;
    setSubmitting(true);
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const external_reference = String(formData.get("external_reference") || "").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (!external_reference || !notes) {
      setFormError("Bank/transaction reference and notes are required.");
      setSubmitting(false);
      return;
    }

    try {
      await confirmManualRefund(
        viewingBooking.id,
        confirmingRefund.paymentId,
        confirmingRefund.refund.id,
        {
          confirmed_returned: true,
          external_reference,
          notes,
        }
      );
      showToast("Refund confirmed processed!");
      setConfirmingRefund(null);
      loadPaymentsAndRefunds(viewingBooking.id);
      fetchBookingsList();
    } catch (err: any) {
      console.error("Confirm refund error:", err);
      setFormError(err?.response?.data?.detail || "Failed to confirm refund.");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Pending":
        return "badge-pending";
      case "Confirmed":
        return "badge-confirmed";
      case "Completed":
        return "badge-completed";
      default:
        return "badge-cancelled";
    }
  };

  return (
    <div className="bookings-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: toastMessage.type === "error" ? "#e53e3e" : "#06b6d4",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 9999,
            fontWeight: 600,
          }}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="bookings-header">
        <div className="header-titles">
          <div className="title-row">
            <h1>Property Bookings & Payments</h1>
            <span className="count-chip">{bookings.length} Bookings</span>
          </div>
          <p className="subtitle">
            Manage unit reservation deposits, milestone payments, refunds, and property sale completion
          </p>
        </div>

        <div className="header-actions">
          {/* View Mode Toggle */}
          <div className="view-mode-toggle">
            <button
              className={`toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              Table
            </button>
            <button
              className={`toggle-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Card Grid View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              Grid
            </button>
          </div>

          {userPermissions.canCreate && (
            <button
              className="btn-create-booking"
              onClick={() => {
                setFormError(null);
                setIsCreateOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Booking
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="bookings-summary-grid">
        <div className="kpi-card cyan">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Total Bookings</span>
            <span className="kpi-value">{stats.total}</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Pending Confirmation</span>
            <span className="kpi-value">{stats.pending}</span>
          </div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Active & Confirmed</span>
            <span className="kpi-value">{stats.confirmed}</span>
          </div>
        </div>

        <div className="kpi-card purple">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              <line x1="6" y1="12" x2="18" y2="12"></line>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Sales Completed</span>
            <span className="kpi-value">{stats.completed}</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bookings-filter-container">
        <div className="filter-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by buyer, phone, property name, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
              &times;
            </button>
          )}
        </div>

        <div className="filter-dropdowns-group">
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {(searchQuery || statusFilter || propertyFilter) && (
            <button
              className="btn-clear-filters"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("");
                setPropertyFilter("");
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Loading, Error or Content */}
      {loading ? (
        <div className="bookings-loading-state">
          <div className="spinner"></div>
          <p style={{ margin: 0, color: "#64748b" }}>Loading property bookings & financials...</p>
        </div>
      ) : error ? (
        <div className="bookings-error-state">
          <p style={{ margin: "0 0 12px", color: "#e53e3e", fontWeight: 600 }}>{error}</p>
          <button className="btn-create-booking" onClick={fetchBookingsList}>
            Retry Loading
          </button>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bookings-empty-card">
          <div className="empty-booking-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <h3>No Bookings Found</h3>
          <p>
            {searchQuery || statusFilter || propertyFilter
              ? "No property bookings match your filter criteria. Try resetting filters."
              : "No unit bookings have been logged yet. Create a booking to reserve an available unit and collect deposit tokens."}
          </p>
          {userPermissions.canCreate && !searchQuery && !statusFilter && !propertyFilter && (
            <button
              className="btn-create-booking"
              onClick={() => {
                setFormError(null);
                setIsCreateOpen(true);
              }}
            >
              Create Booking
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* Card Grid View */
        <div className="bookings-grid">
          {filteredBookings.map((b) => {
            const prop = propertyMap.get(b.property_id);
            const badgeClass = getStatusBadgeClass(b.status);

            return (
              <div key={b.id} className="booking-card">
                <div className="booking-card-header">
                  <div>
                    <h3 className="booking-buyer-name">{b.buyer_name}</h3>
                    <div className="booking-buyer-contact">
                      {b.buyer_email || b.buyer_phone || "Contact not provided"}
                    </div>
                  </div>
                  <span className={`badge ${badgeClass}`}>{b.status}</span>
                </div>

                <div className="booking-prop-box">
                  <div className="booking-prop-name">
                    {prop ? prop.name : `Property #${b.property_id.substring(0, 8)}`}
                  </div>
                  <div className="booking-prop-meta">
                    {prop?.unit_number && `Unit #${prop.unit_number} • `}
                    {prop?.city || "Real Estate Unit"}
                  </div>
                </div>

                <div className="booking-financial-row">
                  <span style={{ color: "#64748b" }}>Agreed Sale Price:</span>
                  <span style={{ fontWeight: 700, color: "#0891b2" }}>
                    {formatINR(b.agreed_price)}
                  </span>
                </div>

                <div className="booking-financial-row">
                  <span style={{ color: "#64748b" }}>Token / Booking Amount:</span>
                  <span style={{ fontWeight: 600 }}>{formatINR(b.booking_amount)}</span>
                </div>

                {Number(b.refund_amount) > 0 && (
                  <div className="booking-financial-row">
                    <span style={{ color: "#ef4444" }}>Total Refunded:</span>
                    <span style={{ color: "#dc2626", fontWeight: 600 }}>
                      -{formatINR(b.refund_amount)}
                    </span>
                  </div>
                )}

                <div className="booking-card-footer">
                  <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    {new Date(b.booking_date).toLocaleDateString()}
                  </span>

                  <div className="action-buttons-group">
                    <button
                      className="btn-action-icon"
                      title="Manage Payments & Details"
                      onClick={() => setViewingBooking(b)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    </button>

                    {(b.status === "Pending" || b.status === "Confirmed") &&
                      userPermissions.canCancel && (
                        <button
                          className="btn-action-icon delete"
                          title="Cancel Booking"
                          onClick={() => {
                            setCancellingBooking(b);
                            setFormError(null);
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                          </svg>
                        </button>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bookings-table-container">
          <table className="bookings-table">
            <thead>
              <tr>
                <th>Buyer Name</th>
                <th>Property</th>
                <th>Agreed Price</th>
                <th>Token Paid</th>
                <th>Refunds</th>
                <th>Status</th>
                <th>Booking Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((b) => {
                const prop = propertyMap.get(b.property_id);
                const badgeClass = getStatusBadgeClass(b.status);

                return (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{b.buyer_name}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {b.buyer_email || b.buyer_phone || "No contact info"}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {prop ? prop.name : `Property #${b.property_id.substring(0, 8)}...`}
                      </div>
                      {prop?.unit_number && (
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          Unit #{prop.unit_number} • {prop.city}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: "#0891b2" }}>
                        {formatINR(b.agreed_price)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{formatINR(b.booking_amount)}</span>
                    </td>
                    <td>
                      {Number(b.refund_amount) > 0 ? (
                        <span style={{ color: "#ef4444", fontWeight: 600 }}>
                          -{formatINR(b.refund_amount)}
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{b.status}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: "0.85rem" }}>
                        {new Date(b.booking_date).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons-group" style={{ justifyContent: "flex-end" }}>
                        <button
                          className="btn-action-icon"
                          title="Manage Payments & Details"
                          onClick={() => setViewingBooking(b)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>

                        {(b.status === "Pending" || b.status === "Confirmed") &&
                          userPermissions.canCancel && (
                            <button
                              className="btn-action-icon delete"
                              title="Cancel Booking"
                              onClick={() => {
                                setCancellingBooking(b);
                                setFormError(null);
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                              </svg>
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Create Booking Modal ─── */}
      {isCreateOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-card" style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Property Booking</h2>
              <button className="modal-close-btn" onClick={() => setIsCreateOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateBooking} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label>Select Available Property for Sale *</label>
                  {availableSaleProperties.length === 0 ? (
                    <div style={{ padding: "12px", background: "#fee2e2", color: "#991b1b", borderRadius: "8px", fontSize: "0.85rem" }}>
                      No properties with status "Available" and listing type "Sale" were found.
                    </div>
                  ) : (
                    <select name="property_id" required>
                      {availableSaleProperties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.unit_number ? `(Unit #${p.unit_number})` : ""} - ₹{Number(p.price).toLocaleString("en-IN")}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-group">
                  <label>Buyer Full Name *</label>
                  <input
                    type="text"
                    name="buyer_name"
                    placeholder="e.g. Anand Kulkarni"
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Buyer Email</label>
                    <input
                      type="email"
                      name="buyer_email"
                      placeholder="e.g. anand@example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>Buyer Phone</label>
                    <input
                      type="tel"
                      name="buyer_phone"
                      placeholder="e.g. +91 9876543210"
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Initial Token / Booking Amount (INR) *</label>
                    <input
                      type="number"
                      name="booking_amount"
                      min="0"
                      step="any"
                      placeholder="e.g. 100000"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Agreed Sale Price (Optional)</label>
                    <input
                      type="number"
                      name="agreed_price"
                      min="1"
                      step="any"
                      placeholder="Defaults to Property Listed Price"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || availableSaleProperties.length === 0}
                >
                  {submitting ? "Booking..." : "Confirm & Reserve Unit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── View Booking & Financial Drawer Modal ─── */}
      {viewingBooking && financialSummary && (
        <div className="modal-overlay" onClick={() => setViewingBooking(null)}>
          <div className="modal-card" style={{ maxWidth: "860px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Booking: {viewingBooking.buyer_name}</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  Property: {propertyMap.get(viewingBooking.property_id)?.name || "Property"} •
                  Status: <strong>{viewingBooking.status}</strong>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setViewingBooking(null)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              {/* Financial Summary Banner */}
              <div className="booking-summary-banner">
                <div className="summary-financial-grid">
                  <div className="financial-item">
                    <h5>Agreed Price</h5>
                    <div className="amount">{formatINR(financialSummary.agreedPrice)}</div>
                  </div>
                  <div className="financial-item">
                    <h5>Net Verified Paid</h5>
                    <div className="amount paid">{formatINR(financialSummary.netReceived)}</div>
                  </div>
                  <div className="financial-item">
                    <h5>Total Refunded</h5>
                    <div className="amount refunded">{formatINR(financialSummary.totalRefunded)}</div>
                  </div>
                  <div className="financial-item">
                    <h5>Balance Outstanding</h5>
                    <div className="amount balance">{formatINR(financialSummary.balanceDue)}</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 600 }}>
                    <span>Payment Completion Progress</span>
                    <span>{financialSummary.progressPercent}%</span>
                  </div>
                  <div className="booking-progress-container">
                    <div
                      className="booking-progress-bar"
                      style={{ width: `${financialSummary.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
                {viewingBooking.status === "Pending" && userPermissions.canUpdate && (
                  <button
                    className="btn-primary"
                    onClick={() => handleConfirmBooking(viewingBooking)}
                    disabled={submitting}
                  >
                    Confirm Booking
                  </button>
                )}

                {financialSummary.canCompleteSale && userPermissions.canComplete && (
                  <button
                    className="btn-primary"
                    style={{ background: "#10b981" }}
                    onClick={() => handleCompleteSale(viewingBooking.id)}
                    disabled={submitting}
                  >
                    Complete Property Sale (Sold)
                  </button>
                )}

                {(viewingBooking.status === "Pending" || viewingBooking.status === "Confirmed") &&
                  userPermissions.canCancel && (
                    <button
                      className="btn-danger"
                      onClick={() => setCancellingBooking(viewingBooking)}
                      disabled={submitting}
                    >
                      Cancel Booking
                    </button>
                  )}

                {viewingBooking.status !== "Cancelled" &&
                  viewingBooking.status !== "Completed" &&
                  userPermissions.canPaymentCreate && (
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setFormError(null);
                        setIsRecordPaymentOpen(true);
                      }}
                    >
                      + Record Payment
                    </button>
                  )}
              </div>

              {/* Payments & Refunds List */}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "1rem", color: "#0f172a" }}>
                  Payment Transactions ({bookingPayments.length})
                </h4>

                {loadingPayments ? (
                  <div style={{ color: "#64748b", fontSize: "0.85rem" }}>Loading payments...</div>
                ) : bookingPayments.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: "0.85rem", fontStyle: "italic" }}>
                    No payments logged yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {bookingPayments.map((pmt) => {
                      const refunds = paymentsRefundsMap[pmt.id] || [];
                      const pmtStatusClass =
                        pmt.status === "Verified"
                          ? "badge-confirmed"
                          : pmt.status === "Rejected"
                          ? "badge-cancelled"
                          : "badge-pending";

                      return (
                        <div
                          key={pmt.id}
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: "10px",
                            padding: "14px 16px",
                            background: "rgba(100,116,139,0.04)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                                {formatINR(pmt.amount)}
                              </span>
                              <span style={{ fontSize: "0.75rem", background: "#e2e8f0", padding: "3px 8px", borderRadius: "4px" }}>
                                {pmt.payment_method}
                              </span>
                              <span className={`badge ${pmtStatusClass}`}>{pmt.status}</span>
                            </div>

                            {/* Actions on payment */}
                            <div style={{ display: "flex", gap: "6px" }}>
                              {pmt.status === "Pending" && userPermissions.canPaymentVerify && (
                                <>
                                  <button
                                    className="btn-primary"
                                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                                    onClick={() => handleDecidePayment("Verified", pmt.id)}
                                  >
                                    Verify
                                  </button>
                                  <button
                                    className="btn-danger"
                                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                                    onClick={() => handleDecidePayment("Rejected", pmt.id)}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}

                              {pmt.status === "Verified" &&
                                viewingBooking.status !== "Completed" &&
                                userPermissions.canRefundManage && (
                                  <button
                                    className="btn-secondary"
                                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                                    onClick={() => {
                                      setRefundingPayment(pmt);
                                      setFormError(null);
                                    }}
                                  >
                                    Request Refund
                                  </button>
                                )}
                            </div>
                          </div>

                          <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                            Date: {new Date(pmt.payment_date).toLocaleDateString()}
                            {pmt.transaction_reference && ` • Ref: ${pmt.transaction_reference}`}
                            {pmt.notes && ` • ${pmt.notes}`}
                          </div>

                          {/* Refunds for this payment */}
                          {refunds.length > 0 && (
                            <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px dashed #e2e8f0" }}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "4px" }}>
                                Refund Requests
                              </div>
                              {refunds.map((r) => (
                                <div
                                  key={r.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    fontSize: "0.825rem",
                                    padding: "6px 8px",
                                    background: "rgba(245,158,11,0.08)",
                                    borderRadius: "6px",
                                    marginBottom: "4px",
                                  }}
                                >
                                  <div>
                                    <strong style={{ color: "#dc2626" }}>-{formatINR(r.amount)}</strong>
                                    <span style={{ marginLeft: "8px", color: "#64748b" }}>Reason: {r.reason}</span>
                                    {r.external_reference && (
                                      <span style={{ marginLeft: "6px", color: "#475569" }}>
                                        (Ref: {r.external_reference})
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span className={`badge ${r.status === "Processed" ? "badge-completed" : r.status === "Rejected" ? "badge-cancelled" : "badge-pending"}`}>
                                      {r.status}
                                    </span>

                                    {r.status === "Pending" && userPermissions.canRefundManage && (
                                      <>
                                        <button
                                          className="btn-primary"
                                          style={{ padding: "3px 8px", fontSize: "0.7rem", background: "#10b981" }}
                                          onClick={() => setConfirmingRefund({ refund: r, paymentId: pmt.id })}
                                        >
                                          Confirm Returned
                                        </button>
                                        <button
                                          className="btn-danger"
                                          style={{ padding: "3px 8px", fontSize: "0.7rem" }}
                                          onClick={() =>
                                            rejectRefund(viewingBooking.id, pmt.id, r.id)
                                              .then(() => {
                                                showToast("Refund rejected");
                                                loadPaymentsAndRefunds(viewingBooking.id);
                                              })
                                              .catch(console.error)
                                          }
                                        >
                                          Reject
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setViewingBooking(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Record Payment Modal ─── */}
      {isRecordPaymentOpen && viewingBooking && (
        <div className="modal-overlay" onClick={() => setIsRecordPaymentOpen(false)}>
          <div className="modal-card" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Record Booking Payment</h2>
              <button className="modal-close-btn" onClick={() => setIsRecordPaymentOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordPayment} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label>Amount (INR) *</label>
                  <input
                    type="number"
                    name="amount"
                    min="1"
                    step="any"
                    placeholder="e.g. 500000"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Payment Method *</label>
                  <select name="payment_method" defaultValue="Bank Transfer" required>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Transaction Reference / Cheque No</label>
                  <input
                    type="text"
                    name="transaction_reference"
                    placeholder="e.g. UTR / NEFT / Cheque #12345"
                  />
                </div>

                <div className="form-group">
                  <label>Payment Date</label>
                  <input
                    type="date"
                    name="payment_date"
                    defaultValue={new Date().toISOString().split("T")[0]}
                  />
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    name="notes"
                    placeholder="e.g. Received 2nd installment towards unit..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsRecordPaymentOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Request Refund Modal ─── */}
      {refundingPayment && viewingBooking && (
        <div className="modal-overlay" onClick={() => setRefundingPayment(null)}>
          <div className="modal-card" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request Payment Refund</h2>
              <button className="modal-close-btn" onClick={() => setRefundingPayment(null)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleRequestRefund} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
                    {formError}
                  </div>
                )}

                <div style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "14px" }}>
                  Verified Payment Amount: <strong>{formatINR(refundingPayment.amount)}</strong>
                </div>

                <div className="form-group">
                  <label>Refund Amount (INR) *</label>
                  <input
                    type="number"
                    name="amount"
                    min="1"
                    max={Number(refundingPayment.amount)}
                    step="any"
                    placeholder="e.g. 50000"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Reason for Refund *</label>
                  <textarea
                    name="reason"
                    placeholder="e.g. Buyer adjustment, duplicate transfer, or unit cancellation refund"
                    required
                    rows={3}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setRefundingPayment(null)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-danger" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Refund Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Confirm Manual Refund Modal ─── */}
      {confirmingRefund && viewingBooking && (
        <div className="modal-overlay" onClick={() => setConfirmingRefund(null)}>
          <div className="modal-card" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Return of Funds</h2>
              <button className="modal-close-btn" onClick={() => setConfirmingRefund(null)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmManualRefund} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
                    {formError}
                  </div>
                )}

                <p style={{ margin: "0 0 14px", fontSize: "0.9rem", color: "#475569", lineHeight: 1.5 }}>
                  Confirming this manual refund will mark it as <strong>Processed</strong> and permanently deduct{" "}
                  <strong>{formatINR(confirmingRefund.refund.amount)}</strong> from the booking net payment total.
                </p>

                <div className="form-group">
                  <label>Bank Transfer Reference / Receipt # *</label>
                  <input
                    type="text"
                    name="external_reference"
                    placeholder="e.g. UTR #129384729"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Confirmation Notes *</label>
                  <textarea
                    name="notes"
                    placeholder="e.g. Transferred back to buyer's bank account"
                    required
                    rows={2}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmingRefund(null)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Confirming..." : "Confirm Returned"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Cancel Booking Modal ─── */}
      {cancellingBooking && (
        <div className="modal-overlay" onClick={() => setCancellingBooking(null)}>
          <div className="modal-card" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cancel Booking</h2>
              <button className="modal-close-btn" onClick={() => setCancellingBooking(null)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCancelBooking} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
                    {formError}
                  </div>
                )}

                <p style={{ margin: "0 0 14px", fontSize: "0.95rem", lineHeight: "1.5" }}>
                  Are you sure you want to cancel the booking for{" "}
                  <strong>{cancellingBooking.buyer_name}</strong>?
                  <br />
                  <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    This will release the reserved property back to Available status. Any refunds must be recorded separately.
                  </span>
                </p>

                <div className="form-group">
                  <label>Cancellation Reason *</label>
                  <textarea
                    name="cancellation_reason"
                    placeholder="e.g. Buyer loan rejected, buyer changed mind..."
                    required
                    rows={3}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCancellingBooking(null)}
                  disabled={submitting}
                >
                  Close
                </button>
                <button type="submit" className="btn-danger" disabled={submitting}>
                  {submitting ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
