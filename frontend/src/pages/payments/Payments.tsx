import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getPayments,
  createPayment,
  decidePayment,
} from "../../services/paymentService";
import {
  getRefunds,
  createRefund,
  confirmManualRefund,
  rejectRefund,
} from "../../services/paymentRefundService";
import { getBookings } from "../../services/bookingService";
import { getProperties } from "../../services/propertyService";
import {
  getPaymentPlan,
  createPaymentPlan,
  getCollectionSummary,
  getOverdueCollections,
} from "../../services/paymentPlanService";
import type { Payment, PaymentCreate, PaymentDecision } from "../../types/payment";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "../../types/payment";
import type {
  PaymentRefund,
  PaymentRefundCreate,
  PaymentRefundManualConfirmation,
} from "../../types/paymentRefund";
import type { Booking } from "../../types/booking";
import type { Property } from "../../types/property";
import type {
  PaymentPlan,
  PaymentPlanCreate,
  InstallmentCreate,
  CollectionSummary,
  OverdueCollectionsResponse,
} from "../../types/paymentPlan";
import "./Payments.css";

interface EnrichedPayment extends Payment {
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  property_name?: string;
  unit_number?: string;
  booking_status?: string;
}

export default function Payments() {
  const [payments, setPayments] = useState<EnrichedPayment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [bookingFilter, setBookingFilter] = useState("");

  // Modals
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [recordModalTab, setRecordModalTab] = useState<"record" | "configure_plan">("record");
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [bookingPaymentPlan, setBookingPaymentPlan] = useState<PaymentPlan | null>(null);
  const [bookingCollections, setBookingCollections] = useState<CollectionSummary | null>(null);
  const [loadingBookingPlan, setLoadingBookingPlan] = useState(false);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<string>("");

  // Installment Plan Generator State
  const [genDuration, setGenDuration] = useState<number | "custom">(6);
  const [customMonths, setCustomMonths] = useState<number>(6);
  const [genStartDate, setGenStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [genFrequency, setGenFrequency] = useState<string>("Monthly");
  const [planInstallments, setPlanInstallments] = useState<InstallmentCreate[]>([]);
  const [planNotes, setPlanNotes] = useState<string>("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [planFormError, setPlanFormError] = useState<string | null>(null);

  const [viewingPayment, setViewingPayment] = useState<EnrichedPayment | null>(null);
  const [paymentRefunds, setPaymentRefunds] = useState<PaymentRefund[]>([]);
  const [loadingRefunds, setLoadingRefunds] = useState(false);

  // Verification Decision Modal State
  const [decidingPayment, setDecidingPayment] = useState<EnrichedPayment | null>(null);
  const [decisionType, setDecisionType] = useState<"Verified" | "Rejected">("Verified");
  const [decisionNotes, setDecisionNotes] = useState("");

  // Refund Modal State
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundingPayment, setRefundingPayment] = useState<EnrichedPayment | null>(null);

  // Manual Refund Confirm State
  const [confirmingRefund, setConfirmingRefund] = useState<PaymentRefund | null>(null);

  // Overdue Collections Summary
  const [overdueSummary, setOverdueSummary] = useState<OverdueCollectionsResponse | null>(null);
  const [loadingOverdue, setLoadingOverdue] = useState(false);
  const [overdueError, setOverdueError] = useState<string | null>(null);
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);

  // Loading / Submit states
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  // User Permissions
  const userPermissions = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (!stored) {
        return {
          canView: true,
          canCreate: true,
          canVerify: true,
          canRefund: true,
          canViewPaymentPlan: true,
          canPaymentPlanCreate: true,
          canPaymentPlanEdit: true,
        };
      }
      const parsed = JSON.parse(stored);
      let roleName = "";
      if (typeof parsed.role === "string") {
        roleName = parsed.role.toUpperCase();
      } else if (parsed.role && typeof parsed.role.name === "string") {
        roleName = parsed.role.name.toUpperCase();
      } else if (typeof parsed.role_name === "string") {
        roleName = parsed.role_name.toUpperCase();
      }

      if (!roleName) {
        try {
          const token = sessionStorage.getItem("access_token");
          if (token) {
            const parts = token.split(".");
            if (parts.length === 3 && parts[1]) {
              const payload = JSON.parse(atob(parts[1]));
              if (payload.role) roleName = String(payload.role).toUpperCase();
            }
          }
        } catch {}
      }

      const isPrivileged =
        roleName.includes("ADMIN") ||
        roleName.includes("MANAGER") ||
        roleName.includes("OWNER") ||
        roleName.includes("SUPER") ||
        !roleName;

      const rawPerms: any[] = Array.isArray(parsed.permissions)
        ? parsed.permissions
        : Array.isArray(parsed.role?.permissions)
        ? parsed.role.permissions
        : Array.isArray(parsed.role_permissions)
        ? parsed.role_permissions
        : [];

      const has = (p: string) =>
        isPrivileged ||
        rawPerms.some((x: any) => {
          if (typeof x === "string") return x.toLowerCase() === p.toLowerCase();
          if (x && typeof x === "object" && typeof x.name === "string") {
            return x.name.toLowerCase() === p.toLowerCase();
          }
          return false;
        });

      return {
        canView: has("booking.payment.view") || has("payments"),
        canCreate: has("booking.payment.create") || has("payments.create"),
        canVerify: has("booking.payment.verify") || has("payments.verify"),
        canRefund: has("booking.refund.create") || has("refunds.create"),
        canViewPaymentPlan: isPrivileged || has("booking.payment_plan.view"),
        canPaymentPlanCreate: isPrivileged || has("booking.payment_plan.create"),
        canPaymentPlanEdit: isPrivileged || has("booking.payment_plan.edit"),
      };
    } catch {
      return {
        canView: true,
        canCreate: true,
        canVerify: true,
        canRefund: true,
        canViewPaymentPlan: true,
        canPaymentPlanCreate: true,
        canPaymentPlanEdit: true,
      };
    }
  }, []);


  // Fetch initial lookups: bookings and properties
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bookingsData, propertiesData] = await Promise.all([
        getBookings({ limit: 100 }).catch(() => [] as Booking[]),
        getProperties({ limit: 100 }).catch(() => [] as Property[]),
      ]);

      setBookings(bookingsData);
      setProperties(propertiesData);

      const propMap = new Map<string, Property>();
      propertiesData.forEach((p) => propMap.set(p.id, p));

      const bookingMap = new Map<string, Booking>();
      bookingsData.forEach((b) => bookingMap.set(b.id, b));

      // Query payments across all bookings
      const allPayments: EnrichedPayment[] = [];
      const paymentPromises = bookingsData.map(async (b) => {
        try {
          const pmts = await getPayments(b.id);
          const prop = propMap.get(b.property_id);
          pmts.forEach((p) => {
            allPayments.push({
              ...p,
              buyer_name: b.buyer_name,
              buyer_email: b.buyer_email || undefined,
              buyer_phone: b.buyer_phone || undefined,
              property_name: prop?.name,
              unit_number: prop?.unit_number || undefined,
              booking_status: b.status,
            });
          });
        } catch {
          // ignore individual booking payment errors
        }
      });

      await Promise.all(paymentPromises);

      // Sort newest first
      allPayments.sort(
        (a, b) =>
          new Date(b.payment_date || b.created_at).getTime() -
          new Date(a.payment_date || a.created_at).getTime()
      );

      setPayments(allPayments);
    } catch (err: any) {
      console.error("Failed to load payments:", err);
      setError(formatApiError(err, "Unable to load payments list. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Fetch Overdue Collections Summary from GET /api/v1/collections/overdue
  const fetchOverdueData = useCallback(async () => {
    if (!userPermissions.canViewPaymentPlan) {
      setOverdueError("Permission required");
      return;
    }
    setLoadingOverdue(true);
    setOverdueError(null);
    try {
      const data = await getOverdueCollections();
      if (data) {
        setOverdueSummary({
          as_of_date: data.as_of_date || new Date().toISOString().slice(0, 10),
          overdue_count: Number(data.overdue_count) || 0,
          total_overdue_outstanding: Number(data.total_overdue_outstanding) || 0,
          installments: Array.isArray(data.installments) ? data.installments : [],
        });
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setOverdueError("Permission required");
      } else {
        console.error("Failed to load overdue collections:", err);
        setOverdueError("Failed to load");
      }
    } finally {
      setLoadingOverdue(false);
    }
  }, [userPermissions.canViewPaymentPlan]);

  useEffect(() => {
    fetchOverdueData();
  }, [fetchOverdueData]);

  // Load refunds for a specific payment when details modal opens
  const loadRefundsForPayment = useCallback(async (payment: EnrichedPayment) => {
    setLoadingRefunds(true);
    try {
      const refunds = await getRefunds(payment.booking_id, payment.id);
      setPaymentRefunds(refunds);
    } catch (err) {
      console.error("Failed to load payment refunds:", err);
      setPaymentRefunds([]);
    } finally {
      setLoadingRefunds(false);
    }
  }, []);

  useEffect(() => {
    if (viewingPayment) {
      loadRefundsForPayment(viewingPayment);
    } else {
      setPaymentRefunds([]);
    }
  }, [viewingPayment, loadRefundsForPayment]);

  // Summary / KPI Calculations
  const summaryKpis = useMemo(() => {
    let totalVerifiedAmount = 0;
    let verifiedCount = 0;
    let pendingCount = 0;
    let totalRefunded = 0;

    payments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (p.status === "Verified") {
        totalVerifiedAmount += amt;
        verifiedCount += 1;
      } else if (p.status === "Pending") {
        pendingCount += 1;
      }
    });

    return {
      totalVerifiedAmount,
      verifiedCount,
      pendingCount,
      totalRefunded,
    };
  }, [payments]);

  // Currency Formatter
  const formatCurrency = (val: number | string) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (methodFilter && p.payment_method !== methodFilter) return false;
      if (bookingFilter && p.booking_id !== bookingFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const buyer = (p.buyer_name || "").toLowerCase();
        const ref = (p.transaction_reference || "").toLowerCase();
        const prop = (p.property_name || "").toLowerCase();
        const bookingId = p.booking_id.toLowerCase();
        const paymentId = p.id.toLowerCase();
        return (
          buyer.includes(q) ||
          ref.includes(q) ||
          prop.includes(q) ||
          bookingId.includes(q) ||
          paymentId.includes(q)
        );
      }
      return true;
    });
  }, [payments, statusFilter, methodFilter, bookingFilter, searchQuery]);

  // Selected Booking and Installment Computed Values
  const selectedBooking = useMemo(
    () => bookings.find((b) => b.id === selectedBookingId),
    [bookings, selectedBookingId]
  );

  const selectedInstallment = useMemo(() => {
    if (!bookingPaymentPlan || !selectedInstallmentId) return null;
    return (
      bookingPaymentPlan.installments.find((i) => i.id === selectedInstallmentId) || null
    );
  }, [bookingPaymentPlan, selectedInstallmentId]);

  const selectedInstallmentRemaining = useMemo(() => {
    if (!selectedInstallment) return 0;
    const coll = Number(
      selectedInstallment.net_collected ?? selectedInstallment.total_verified ?? 0
    );
    return selectedInstallment.outstanding_balance !== undefined
      ? Number(selectedInstallment.outstanding_balance)
      : Math.max(0, Number(selectedInstallment.amount) - coll);
  }, [selectedInstallment]);

  // Helper for computing due dates with month rollover protection
  const computeDueDate = useCallback((baseDateStr: string, monthOffset: number): string => {
    if (!baseDateStr) return new Date().toISOString().slice(0, 10);
    const parts = baseDateStr.split("-").map(Number);
    const year = parts[0] || new Date().getFullYear();
    const month = (parts[1] || 1) - 1;
    const day = parts[2] || 1;

    const targetDate = new Date(year, month + monthOffset, day);
    const expectedMonth = ((month + monthOffset) % 12 + 12) % 12;
    if (targetDate.getMonth() !== expectedMonth) {
      targetDate.setDate(0);
    }
    return targetDate.toISOString().slice(0, 10);
  }, []);

  const generateProposedSchedule = useCallback(
    (agreedPrice: number, monthsCount: number, startDateStr: string): InstallmentCreate[] => {
      const count = Math.max(1, Math.min(60, monthsCount));
      const baseAmount = Math.floor(agreedPrice / count);
      const remainder = agreedPrice - baseAmount * count;

      const rows: InstallmentCreate[] = [];
      for (let i = 0; i < count; i++) {
        const seq = i + 1;
        const amount = i === count - 1 ? baseAmount + remainder : baseAmount;
        rows.push({
          sequence: seq,
          name: `Installment ${seq}`,
          amount,
          due_date: computeDueDate(startDateStr, i),
          notes: null,
        });
      }
      return rows;
    },
    [computeDueDate]
  );

  const loadBookingPaymentPlan = useCallback(async (bookingId: string) => {
    if (!bookingId) {
      setBookingPaymentPlan(null);
      setBookingCollections(null);
      return;
    }
    setLoadingBookingPlan(true);
    try {
      const [plan, collections] = await Promise.all([
        getPaymentPlan(bookingId).catch((err) => {
          if (err?.response?.status === 404 || err?.response?.status === 403) return null;
          console.warn("Notice: payment plan lookup:", err?.response?.status || err?.message);
          return null;
        }),
        getCollectionSummary(bookingId).catch(() => null),
      ]);
      setBookingPaymentPlan(plan);
      setBookingCollections(collections);

      if (plan && plan.status === "Active" && plan.installments.length > 0) {
        const firstPending = plan.installments.find(
          (i) => i.status !== "Paid" && i.status !== "Cancelled"
        );
        if (firstPending) {
          setSelectedInstallmentId(firstPending.id);
          const coll = Number(firstPending.net_collected ?? firstPending.total_verified ?? 0);
          const rem =
            firstPending.outstanding_balance !== undefined
              ? Number(firstPending.outstanding_balance)
              : Math.max(0, Number(firstPending.amount) - coll);
          setPaymentAmount(rem > 0 ? String(rem) : String(firstPending.amount));
        }
      }
    } finally {
      setLoadingBookingPlan(false);
    }
  }, []);

  const handleOpenRecordModal = useCallback(() => {
    const initialBookingId = bookingFilter || bookings[0]?.id || "";
    setSelectedBookingId(initialBookingId);
    setRecordModalTab("record");
    setFormError(null);
    setPlanFormError(null);
    setSelectedInstallmentId("");
    setPaymentAmount("");

    const targetBooking = bookings.find((b) => b.id === initialBookingId);
    if (targetBooking?.payment_preference === "Installments") {
      loadBookingPaymentPlan(initialBookingId);
    } else {
      setBookingPaymentPlan(null);
      setBookingCollections(null);
    }
    setIsRecordOpen(true);
  }, [bookingFilter, bookings, loadBookingPaymentPlan]);

  const handleBookingChange = (newBookingId: string) => {
    setSelectedBookingId(newBookingId);
    setFormError(null);
    setPlanFormError(null);
    setSelectedInstallmentId("");
    setPaymentAmount("");
    const targetBooking = bookings.find((b) => b.id === newBookingId);
    if (targetBooking?.payment_preference === "Installments") {
      loadBookingPaymentPlan(newBookingId);
    } else {
      setBookingPaymentPlan(null);
      setBookingCollections(null);
    }
  };

  const handleInstallmentSelect = (instId: string) => {
    setSelectedInstallmentId(instId);
    if (!bookingPaymentPlan) return;
    const inst = bookingPaymentPlan.installments.find((i) => i.id === instId);
    if (inst) {
      const coll = Number(inst.net_collected ?? inst.total_verified ?? 0);
      const rem =
        inst.outstanding_balance !== undefined
          ? Number(inst.outstanding_balance)
          : Math.max(0, Number(inst.amount) - coll);
      if (!paymentAmount || Number(paymentAmount) <= 0) {
        setPaymentAmount(rem > 0 ? String(rem) : String(inst.amount));
      }
    }
  };

  const initPlanGenerator = useCallback(() => {
    const targetBooking = bookings.find((b) => b.id === selectedBookingId);
    const agreedPrice = Number(targetBooking?.agreed_price || 0);
    const duration = genDuration === "custom" ? customMonths : Number(genDuration);
    const initialRows = generateProposedSchedule(agreedPrice, duration, genStartDate);
    setPlanInstallments(initialRows);
    setPlanFormError(null);
  }, [bookings, selectedBookingId, genDuration, customMonths, genStartDate, generateProposedSchedule]);

  // Automatically ensure schedule is generated when switching to configure_plan tab
  useEffect(() => {
    if (recordModalTab === "configure_plan" && planInstallments.length === 0 && selectedBooking) {
      initPlanGenerator();
    }
  }, [recordModalTab, planInstallments.length, selectedBooking, initPlanGenerator]);

  const handleDurationChange = (val: number | "custom") => {
    setGenDuration(val);
    const targetBooking = bookings.find((b) => b.id === selectedBookingId);
    if (!targetBooking) return;
    const agreedPrice = Number(targetBooking.agreed_price || 0);
    const count = val === "custom" ? customMonths : Number(val);
    setPlanInstallments(generateProposedSchedule(agreedPrice, count, genStartDate));
    setPlanFormError(null);
  };

  const handleStartDateChange = (newDate: string) => {
    setGenStartDate(newDate);
    const targetBooking = bookings.find((b) => b.id === selectedBookingId);
    if (!targetBooking) return;
    const agreedPrice = Number(targetBooking.agreed_price || 0);
    const count = genDuration === "custom" ? customMonths : Number(genDuration);
    setPlanInstallments(generateProposedSchedule(agreedPrice, count, newDate));
  };

  const handleCustomMonthsChange = (val: number) => {
    const clamped = Math.max(1, Math.min(60, val));
    setCustomMonths(clamped);
    const targetBooking = bookings.find((b) => b.id === selectedBookingId);
    if (!targetBooking) return;
    const agreedPrice = Number(targetBooking.agreed_price || 0);
    setPlanInstallments(generateProposedSchedule(agreedPrice, clamped, genStartDate));
    setPlanFormError(null);
  };

  const handleRegenerateSchedule = () => {
    const targetBooking = bookings.find((b) => b.id === selectedBookingId);
    if (!targetBooking) return;
    const agreedPrice = Number(targetBooking.agreed_price || 0);
    const count = genDuration === "custom" ? customMonths : Number(genDuration);
    const newRows = generateProposedSchedule(agreedPrice, count, genStartDate);
    setPlanInstallments(newRows);
    setPlanFormError(null);
  };

  const handleAddInstallmentRow = () => {
    setPlanInstallments((prev) => {
      const nextSeq = prev.length > 0 ? Math.max(...prev.map((r) => r.sequence)) + 1 : 1;
      const lastDueDate = prev[prev.length - 1]?.due_date || genStartDate;
      const nextDueDate = computeDueDate(lastDueDate, 1);
      return [
        ...prev,
        {
          sequence: nextSeq,
          name: `Installment ${nextSeq}`,
          amount: 0,
          due_date: nextDueDate,
          notes: null,
        },
      ];
    });
  };

  const handleRemoveInstallmentRow = (index: number) => {
    if (planInstallments.length <= 1) return;
    setPlanInstallments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateInstallmentRow = (
    index: number,
    field: keyof InstallmentCreate,
    value: any
  ) => {
    setPlanInstallments((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  };

  const scheduleMetrics = useMemo(() => {
    const total = planInstallments.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const targetBooking = bookings.find((b) => b.id === selectedBookingId);
    const target = Number(targetBooking?.agreed_price || 0);
    const diff = target - total;
    const isMatch = Math.abs(diff) < 0.01;
    const hasInvalidAmount = planInstallments.some((r) => Number(r.amount) <= 0);
    const hasInvalidDate = planInstallments.some((r) => !r.due_date);
    const hasInvalidName = planInstallments.some((r) => !r.name.trim());
    const seqs = planInstallments.map((r) => Number(r.sequence));
    const hasDuplicateSeq = new Set(seqs).size !== seqs.length || seqs.some((s) => s <= 0);

    return {
      total,
      target,
      diff,
      isMatch,
      hasInvalidAmount,
      hasInvalidDate,
      hasInvalidName,
      hasDuplicateSeq,
      isValid:
        planInstallments.length > 0 &&
        isMatch &&
        !hasInvalidAmount &&
        !hasInvalidDate &&
        !hasInvalidName &&
        !hasDuplicateSeq,
    };
  }, [planInstallments, selectedBookingId, bookings]);

  const handleSaveInstallmentPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanFormError(null);

    const targetBooking = bookings.find((b) => b.id === selectedBookingId);
    if (!targetBooking) {
      setPlanFormError("No booking selected.");
      return;
    }
    if (!userPermissions.canPaymentPlanCreate) {
      setPlanFormError("You do not have permission to create payment plans.");
      return;
    }
    let currentInstallments = planInstallments;
    if (currentInstallments.length === 0) {
      const agreedPrice = Number(targetBooking.agreed_price || 0);
      const count = genDuration === "custom" ? customMonths : Number(genDuration);
      currentInstallments = generateProposedSchedule(agreedPrice, count, genStartDate);
      setPlanInstallments(currentInstallments);
    }
    if (currentInstallments.length === 0) {
      setPlanFormError("At least one installment row is required.");
      return;
    }

    const seqSet = new Set<number>();
    let hasDuplicateSeq = false;
    let hasInvalidAmount = false;
    let hasInvalidDate = false;
    let hasInvalidName = false;
    let total = 0;

    for (const inst of currentInstallments) {
      const seq = Number(inst.sequence);
      if (isNaN(seq) || seq <= 0 || seqSet.has(seq)) hasDuplicateSeq = true;
      seqSet.add(seq);

      const amt = Number(inst.amount);
      if (isNaN(amt) || amt <= 0) hasInvalidAmount = true;
      else total += amt;

      if (!inst.due_date || isNaN(new Date(inst.due_date).getTime())) hasInvalidDate = true;
      if (!inst.name || !inst.name.trim()) hasInvalidName = true;
    }

    if (hasDuplicateSeq) {
      setPlanFormError("Sequence numbers must be unique positive integers.");
      return;
    }
    if (hasInvalidAmount) {
      setPlanFormError("All installment amounts must be positive numbers (> 0).");
      return;
    }
    if (hasInvalidDate) {
      setPlanFormError("All installment due dates must be valid.");
      return;
    }
    if (hasInvalidName) {
      setPlanFormError("All installment names must be provided.");
      return;
    }

    const targetPrice = Number(targetBooking.agreed_price || 0);
    const diff = Math.round((total - targetPrice) * 100) / 100;
    if (Math.abs(diff) > 1) {
      setPlanFormError(
        `The total of installments (${formatCurrency(total)}) must equal the agreed sale price (${formatCurrency(targetPrice)}). Difference: ${formatCurrency(Math.abs(diff))}`
      );
      return;
    }

    setSavingPlan(true);
    try {
      const payload: PaymentPlanCreate = {
        installments: currentInstallments.map((inst) => ({
          sequence: Number(inst.sequence),
          name: inst.name.trim(),
          amount: Number(inst.amount),
          due_date: inst.due_date,
          notes: inst.notes?.trim() || null,
        })),
        notes: planNotes.trim() || null,
      };

      const saved = await createPaymentPlan(targetBooking.id, payload);
      setBookingPaymentPlan(saved);
      showToast("Installment payment plan created successfully!");

      try {
        const summary = await getCollectionSummary(targetBooking.id);
        setBookingCollections(summary);
      } catch {
        // ignore
      }

      const firstPending = saved.installments.find(
        (i) => i.status !== "Paid" && i.status !== "Cancelled"
      );
      if (firstPending) {
        setSelectedInstallmentId(firstPending.id);
        const coll = Number(firstPending.net_collected ?? firstPending.total_verified ?? 0);
        const rem =
          firstPending.outstanding_balance !== undefined
            ? Number(firstPending.outstanding_balance)
            : Math.max(0, Number(firstPending.amount) - coll);
        setPaymentAmount(rem > 0 ? String(rem) : String(firstPending.amount));
      }

      setRecordModalTab("record");
      fetchOverdueData();
    } catch (err: any) {
      console.error("Create payment plan error:", err);
      setPlanFormError(formatApiError(err, "Failed to create installment payment plan."));
    } finally {
      setSavingPlan(false);
    }
  };

  // Handle Record Payment
  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const booking_id = selectedBookingId || String(formData.get("booking_id") || "");
    const amount = Number(paymentAmount || formData.get("amount") || 0);
    const payment_method = String(formData.get("payment_method") || "Bank Transfer");
    const transaction_reference =
      String(formData.get("transaction_reference") || "").trim() || null;
    const payment_date_str = String(formData.get("payment_date") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    if (!booking_id || amount <= 0) {
      setFormError("Please select a booking and enter a valid payment amount (> 0).");
      setSubmitting(false);
      return;
    }

    const currentBooking = bookings.find((b) => b.id === booking_id);
    if (
      currentBooking?.payment_preference === "Installments" &&
      bookingPaymentPlan &&
      bookingPaymentPlan.status === "Active"
    ) {
      if (!selectedInstallmentId) {
        setFormError(
          "Please select the installment milestone this payment is allocated to (required by the active payment plan)."
        );
        setSubmitting(false);
        return;
      }
    }

    try {
      const payload: PaymentCreate = {
        amount,
        payment_method,
        transaction_reference,
        payment_date: payment_date_str ? new Date(payment_date_str).toISOString() : null,
        notes,
        installment_id: selectedInstallmentId || null,
      };

      const created = await createPayment(booking_id, payload);

      // Find booking details to enrich locally
      const selectedProp = currentBooking
        ? properties.find((p) => p.id === currentBooking.property_id)
        : undefined;

      const enriched: EnrichedPayment = {
        ...created,
        buyer_name: currentBooking?.buyer_name,
        buyer_email: currentBooking?.buyer_email || undefined,
        buyer_phone: currentBooking?.buyer_phone || undefined,
        property_name: selectedProp?.name,
        unit_number: selectedProp?.unit_number || undefined,
        booking_status: currentBooking?.status,
      };

      setPayments((prev) => [enriched, ...prev]);
      showToast("Payment recorded successfully! Awaiting verification.");
      setIsRecordOpen(false);
      fetchOverdueData();
      if (currentBooking?.payment_preference === "Installments") {
        loadBookingPaymentPlan(booking_id);
      }
    } catch (err: any) {
      console.error("Create payment error:", err);
      setFormError(formatApiError(err, "Failed to record payment."));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Decision (Verify or Reject)
  const handleConfirmDecision = async () => {
    if (!decidingPayment) return;
    setSubmitting(true);
    try {
      const payload: PaymentDecision = {
        status: decisionType,
        notes: decisionNotes.trim() || null,
      };
      const updated = await decidePayment(
        decidingPayment.booking_id,
        decidingPayment.id,
        payload
      );

      setPayments((prev) =>
        prev.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                status: updated.status,
                verified_by: updated.verified_by,
                verified_at: updated.verified_at,
                notes: updated.notes,
              }
            : item
        )
      );

      if (viewingPayment?.id === updated.id) {
        setViewingPayment((prev) =>
          prev
            ? {
                ...prev,
                status: updated.status,
                verified_by: updated.verified_by,
                verified_at: updated.verified_at,
                notes: updated.notes,
              }
            : null
        );
      }

      showToast(`Payment marked as ${decisionType}!`);
      setDecidingPayment(null);
      setDecisionNotes("");
      fetchOverdueData();
    } catch (err: any) {
      console.error("Payment decision error:", err);
      showToast(formatApiError(err, "Failed to update payment status."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Create Refund
  const handleCreateRefund = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!refundingPayment) return;
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get("amount") || 0);
    const reason = String(formData.get("reason") || "").trim();

    if (amount <= 0 || !reason || reason.length < 3) {
      setFormError("Enter a valid refund amount (> 0) and reason (at least 3 characters).");
      setSubmitting(false);
      return;
    }

    try {
      const payload: PaymentRefundCreate = { amount, reason };
      const refund = await createRefund(
        refundingPayment.booking_id,
        refundingPayment.id,
        payload
      );
      setPaymentRefunds((prev) => [refund, ...prev]);
      showToast("Refund requested successfully!");
      setIsRefundModalOpen(false);
      setRefundingPayment(null);
    } catch (err: any) {
      console.error("Create refund error:", err);
      setFormError(formatApiError(err, "Failed to request refund."));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Confirm Manual Refund
  const handleConfirmManualRefund = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!confirmingRefund || !viewingPayment) return;
    setSubmitting(true);
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const external_reference = String(formData.get("external_reference") || "").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (!external_reference || !notes || notes.length < 3) {
      setFormError("Please provide an external reference / UTR and notes.");
      setSubmitting(false);
      return;
    }

    try {
      const payload: PaymentRefundManualConfirmation = {
        confirmed_returned: true,
        external_reference,
        notes,
      };

      const updatedRefund = await confirmManualRefund(
        viewingPayment.booking_id,
        viewingPayment.id,
        confirmingRefund.id,
        payload
      );

      setPaymentRefunds((prev) =>
        prev.map((r) => (r.id === updatedRefund.id ? updatedRefund : r))
      );
      showToast("Refund confirmed and processed!");
      setConfirmingRefund(null);
    } catch (err: any) {
      console.error("Confirm refund error:", err);
      setFormError(formatApiError(err, "Failed to confirm refund."));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Reject Refund
  const handleRejectRefund = async (refundId: string) => {
    if (!viewingPayment) return;
    setSubmitting(true);
    try {
      const updated = await rejectRefund(
        viewingPayment.booking_id,
        viewingPayment.id,
        refundId,
        { status: "Rejected", notes: "Refund request rejected by management." }
      );
      setPaymentRefunds((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      showToast("Refund request rejected.");
    } catch (err: any) {
      console.error("Reject refund error:", err);
      showToast(formatApiError(err, "Failed to reject refund."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="payments-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`crm-toast ${toastMessage.type}`}>
          {toastMessage.type === "success" ? "✓ " : "✕ "}
          {toastMessage.text}
        </div>
      )}

      {/* ─── 1. Header ─── */}
      <div className="payments-header">
        <div className="header-titles">
          <div className="title-row">
            <h1>Payments & Collections</h1>
            <span className="count-chip">{payments.length} Records</span>
          </div>
          <p className="subtitle">
            Manage buyer payments, transaction receipts, verification decisions, and refunds.
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
              title="Grid View"
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
              className="btn-record-payment"
              onClick={handleOpenRecordModal}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Record Payment
            </button>
          )}
        </div>
      </div>

      {/* ─── 2. KPI Summary Cards ─── */}
      <div className="payments-summary-grid">
        <div className="kpi-card blue">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Verified Collections</span>
            <span className="kpi-value">{formatCurrency(summaryKpis.totalVerifiedAmount)}</span>
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
            <span className="kpi-label">Verified Receipts</span>
            <span className="kpi-value">{summaryKpis.verifiedCount}</span>
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
            <span className="kpi-label">Pending Verification</span>
            <span className="kpi-value">{summaryKpis.pendingCount}</span>
          </div>
        </div>

        <div className="kpi-card purple">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Total Transactions</span>
            <span className="kpi-value">{payments.length}</span>
          </div>
        </div>

        <div
          className={`kpi-card red ${overdueSummary && overdueSummary.overdue_count > 0 ? "clickable" : ""}`}
          onClick={() => {
            if (overdueSummary && overdueSummary.overdue_count > 0) {
              setIsOverdueModalOpen(true);
            }
          }}
          title={
            overdueSummary && overdueSummary.overdue_count > 0
              ? "Click to view overdue installments"
              : undefined
          }
        >
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Overdue Payments</span>
            <span className="kpi-value">
              {loadingOverdue
                ? "—"
                : overdueError
                ? "—"
                : overdueSummary
                ? overdueSummary.overdue_count
                : "—"}
            </span>
            <span className="kpi-subtext">
              Outstanding:{" "}
              <span className="kpi-subtext-amount">
                {loadingOverdue
                  ? "Loading..."
                  : overdueError
                  ? overdueError
                  : overdueSummary
                  ? formatCurrency(overdueSummary.total_overdue_outstanding)
                  : "—"}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* ─── 3. Filter Toolbar ─── */}
      <div className="payments-filter-container">
        <div className="filter-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search buyer, reference, property..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ×
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
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
          >
            <option value="">All Methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={bookingFilter}
            onChange={(e) => setBookingFilter(e.target.value)}
          >
            <option value="">All Bookings</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.buyer_name} ({b.status})
              </option>
            ))}
          </select>

          {(searchQuery || statusFilter || methodFilter || bookingFilter) && (
            <button
              className="btn-clear-filters"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("");
                setMethodFilter("");
                setBookingFilter("");
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* ─── 4. Main Content Area ─── */}
      {loading ? (
        <div className="payments-loading-state">
          <div className="spinner"></div>
          <p style={{ margin: 0, color: "#64748b", fontWeight: 500 }}>
            Loading payments and receipts...
          </p>
        </div>
      ) : error ? (
        <div className="payments-error-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" width="32" height="32" style={{ margin: "0 auto 12px" }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3 style={{ margin: "0 0 6px", color: "#dc2626" }}>Unable to load payments</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b" }}>{error}</p>
          <button className="btn-secondary" onClick={() => fetchAllData()}>
            Retry
          </button>
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="payments-empty-card">
          <div className="empty-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
          </div>
          <h3>No payments found</h3>
          <p>
            {searchQuery || statusFilter || methodFilter || bookingFilter
              ? "No payments match your filter criteria. Try resetting filters."
              : "Record your first payment against an active booking to get started."}
          </p>
          {userPermissions.canCreate && (
            <button
              className="btn-record-payment"
              onClick={() => {
                setFormError(null);
                setIsRecordOpen(true);
              }}
            >
              + Record Payment
            </button>
          )}
        </div>
      ) : viewMode === "table" ? (
        /* ─── Table View ─── */
        <div className="payments-table-container">
          <table className="payments-table">
            <thead>
              <tr>
                <th>Amount</th>
                <th>Status</th>
                <th>Method</th>
                <th>Buyer & Property</th>
                <th>Reference / UTR</th>
                <th>Payment Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((pmt) => {
                const statusClass =
                  pmt.status === "Verified"
                    ? "badge-status-verified"
                    : pmt.status === "Rejected"
                    ? "badge-status-rejected"
                    : "badge-status-pending";

                return (
                  <tr key={pmt.id}>
                    <td>
                      <div className="table-amount-cell">{formatCurrency(pmt.amount)}</div>
                    </td>
                    <td>
                      <span className={statusClass}>
                        {pmt.status === "Verified" ? "✓ " : pmt.status === "Pending" ? "⏳ " : "✕ "}
                        {pmt.status}
                      </span>
                    </td>
                    <td>
                      <span className="badge-method">{pmt.payment_method}</span>
                    </td>
                    <td>
                      <div className="table-buyer-cell">
                        <span className="table-buyer-name">{pmt.buyer_name || "Buyer"}</span>
                        <span className="table-property-sub">
                          {pmt.property_name || "Property"} {pmt.unit_number ? `(${pmt.unit_number})` : ""}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: "0.825rem", color: "#475569" }}>
                        {pmt.transaction_reference || "—"}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: "0.825rem", color: "#64748b" }}>
                        {new Date(pmt.payment_date || pmt.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons-group" style={{ justifyContent: "flex-end" }}>
                        <button
                          className="btn-action-icon"
                          title="View Details & Refunds"
                          onClick={() => setViewingPayment(pmt)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>

                        {pmt.status === "Pending" && userPermissions.canVerify && (
                          <>
                            <button
                              className="btn-action-icon verify"
                              title="Verify Receipt"
                              onClick={() => {
                                setDecidingPayment(pmt);
                                setDecisionType("Verified");
                                setDecisionNotes("");
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            </button>
                            <button
                              className="btn-action-icon reject"
                              title="Reject Receipt"
                              onClick={() => {
                                setDecidingPayment(pmt);
                                setDecisionType("Rejected");
                                setDecisionNotes("");
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </>
                        )}

                        {pmt.status === "Verified" && userPermissions.canRefund && (
                          <button
                            className="btn-action-icon refund"
                            title="Issue Refund"
                            onClick={() => {
                              setRefundingPayment(pmt);
                              setFormError(null);
                              setIsRefundModalOpen(true);
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="1 4 1 10 7 10"></polyline>
                              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
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
      ) : (
        /* ─── Grid View ─── */
        <div className="payments-grid">
          {filteredPayments.map((pmt) => {
            const statusClass =
              pmt.status === "Verified"
                ? "badge-status-verified"
                : pmt.status === "Rejected"
                ? "badge-status-rejected"
                : "badge-status-pending";

            return (
              <div key={pmt.id} className="payment-card">
                <div className="card-top-row">
                  <div className="card-amount-box">
                    <span className="card-amount">{formatCurrency(pmt.amount)}</span>
                    <span className="card-date">
                      {new Date(pmt.payment_date || pmt.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={statusClass}>
                    {pmt.status === "Verified" ? "✓ " : pmt.status === "Pending" ? "⏳ " : "✕ "}
                    {pmt.status}
                  </span>
                </div>

                <div className="card-meta-list">
                  <div className="card-meta-row">
                    <span className="card-meta-label">Buyer</span>
                    <span className="card-meta-value">{pmt.buyer_name || "Buyer"}</span>
                  </div>
                  <div className="card-meta-row">
                    <span className="card-meta-label">Property</span>
                    <span className="card-meta-value">
                      {pmt.property_name || "Property"} {pmt.unit_number ? `(${pmt.unit_number})` : ""}
                    </span>
                  </div>
                  <div className="card-meta-row">
                    <span className="card-meta-label">Method</span>
                    <span className="badge-method">{pmt.payment_method}</span>
                  </div>
                  <div className="card-meta-row">
                    <span className="card-meta-label">Reference</span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                      {pmt.transaction_reference || "—"}
                    </span>
                  </div>
                </div>

                <div className="card-footer">
                  <button
                    className="btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                    onClick={() => setViewingPayment(pmt)}
                  >
                    View Details
                  </button>

                  <div className="action-buttons-group">
                    {pmt.status === "Pending" && userPermissions.canVerify && (
                      <>
                        <button
                          className="btn-action-icon verify"
                          title="Verify Receipt"
                          onClick={() => {
                            setDecidingPayment(pmt);
                            setDecisionType("Verified");
                            setDecisionNotes("");
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </button>
                        <button
                          className="btn-action-icon reject"
                          title="Reject Receipt"
                          onClick={() => {
                            setDecidingPayment(pmt);
                            setDecisionType("Rejected");
                            setDecisionNotes("");
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </>
                    )}

                    {pmt.status === "Verified" && userPermissions.canRefund && (
                      <button
                        className="btn-action-icon refund"
                        title="Issue Refund"
                        onClick={() => {
                          setRefundingPayment(pmt);
                          setFormError(null);
                          setIsRefundModalOpen(true);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="1 4 1 10 7 10"></polyline>
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Record Payment & Configure Installment Plan Modal ─── */}
      {isRecordOpen && (
        <div className="modal-overlay" onClick={() => setIsRecordOpen(false)}>
          <div
            className="modal-card"
            style={{
              maxWidth: recordModalTab === "configure_plan" ? "880px" : "640px",
              width: "100%",
              transition: "max-width 0.2s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>
                  {recordModalTab === "configure_plan"
                    ? "Configure Installment Plan"
                    : "Record Payment"}
                </h2>
                {selectedBooking && (
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    Buyer: <strong>{selectedBooking.buyer_name}</strong> • Agreed Price:{" "}
                    <strong>{formatCurrency(selectedBooking.agreed_price)}</strong>
                  </div>
                )}
              </div>
              <button className="modal-close-btn" onClick={() => setIsRecordOpen(false)}>
                &times;
              </button>
            </div>

            {/* Tab Navigation for Installments Bookings */}
            {selectedBooking?.payment_preference === "Installments" && (
              <div className="record-modal-tab-nav">
                <button
                  type="button"
                  className={`tab-btn ${recordModalTab === "record" ? "active" : ""}`}
                  onClick={() => setRecordModalTab("record")}
                >
                  <span className="tab-icon">💳</span> Record Payment
                </button>
                <button
                  type="button"
                  className={`tab-btn ${recordModalTab === "configure_plan" ? "active" : ""}`}
                  onClick={() => {
                    initPlanGenerator();
                    setRecordModalTab("configure_plan");
                  }}
                >
                  <span className="tab-icon">📅</span>
                  {bookingPaymentPlan ? "View / Update Installment Plan" : "Configure Installment Plan"}
                </button>
              </div>
            )}

            {/* TAB 1: Record Payment */}
            {recordModalTab === "record" && (
              <form
                onSubmit={handleRecordPayment}
                style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}
              >
                <div className="modal-body">
                  {formError && (
                    <div
                      style={{
                        background: "#fee2e2",
                        color: "#b91c1c",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                      }}
                    >
                      {formError}
                    </div>
                  )}

                  <div className="form-group">
                    <label>Select Booking *</label>
                    <select
                      name="booking_id"
                      value={selectedBookingId}
                      onChange={(e) => handleBookingChange(e.target.value)}
                      required
                    >
                      <option value="" disabled>Select an active booking</option>
                      {bookings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.buyer_name} — Agreed: {formatCurrency(b.agreed_price)} [{b.payment_preference || "Standard"}] ({b.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Conditional Installment Information Section */}
                  {selectedBooking?.payment_preference === "Installments" && (
                    <div className="installment-payment-details-card">
                      <div className="details-header">
                        <div className="header-title">
                          <span style={{ fontSize: "1.1rem" }}>📅</span>
                          <h4>Installment Payment Details</h4>
                          <span className="badge-installments">Installments Preference</span>
                        </div>
                        {(!bookingPaymentPlan || bookingPaymentPlan.status !== "Active") &&
                          userPermissions.canPaymentPlanCreate && (
                            <button
                              type="button"
                              className="btn-configure-plan-link"
                              onClick={() => {
                                initPlanGenerator();
                                setRecordModalTab("configure_plan");
                              }}
                            >
                              + Configure Installment Plan
                            </button>
                          )}
                      </div>

                      {loadingBookingPlan ? (
                        <div
                          style={{
                            padding: "16px",
                            textAlign: "center",
                            color: "#64748b",
                            fontSize: "0.85rem",
                          }}
                        >
                          Loading installment plan details...
                        </div>
                      ) : bookingPaymentPlan ? (
                        <>
                          <div className="plan-stats-mini-grid">
                            <div className="mini-stat">
                              <span className="mini-label">Agreed Price</span>
                              <span className="mini-val">
                                {formatCurrency(selectedBooking.agreed_price)}
                              </span>
                            </div>
                            <div className="mini-stat">
                              <span className="mini-label">Plan Status</span>
                              <span className="mini-val">
                                <span
                                  className={`badge ${
                                    bookingPaymentPlan.status === "Active"
                                      ? "badge-confirmed"
                                      : "badge-cancelled"
                                  }`}
                                >
                                  {bookingPaymentPlan.status}
                                </span>
                              </span>
                            </div>
                            <div className="mini-stat">
                              <span className="mini-label">Total Collected</span>
                              <span className="mini-val text-success">
                                {formatCurrency(
                                  bookingCollections
                                    ? bookingCollections.net_collected
                                    : bookingPaymentPlan.total_collected ?? 0
                                )}
                              </span>
                            </div>
                            <div className="mini-stat">
                              <span className="mini-label">Outstanding</span>
                              <span className="mini-val text-warning">
                                {formatCurrency(
                                  bookingCollections
                                    ? bookingCollections.outstanding_balance
                                    : bookingPaymentPlan.total_outstanding ?? 0
                                )}
                              </span>
                            </div>
                            <div className="mini-stat">
                              <span className="mini-label">Milestones</span>
                              <span className="mini-val">
                                {bookingPaymentPlan.installments.length}
                              </span>
                            </div>
                            <div className="mini-stat">
                              <span className="mini-label">Next Due Date</span>
                              <span className="mini-val text-cyan">
                                {(() => {
                                  const pending = bookingPaymentPlan.installments.filter(
                                    (i) => i.status !== "Paid" && i.status !== "Cancelled"
                                  );
                                  if (pending.length === 0)
                                    return (
                                      <span style={{ color: "#10b981", fontSize: "0.8rem" }}>
                                        ✓ Paid
                                      </span>
                                    );
                                  const sorted = [...pending].sort(
                                    (a, b) =>
                                      new Date(a.due_date).getTime() -
                                      new Date(b.due_date).getTime()
                                  );
                                  const next = sorted[0];
                                  if (!next) {
                                    return (
                                      <span style={{ color: "#10b981", fontSize: "0.8rem" }}>
                                        ✓ Paid
                                      </span>
                                    );
                                  }
                                  return (
                                    <span>
                                      {new Date(next.due_date).toLocaleDateString()}
                                      <small
                                        style={{
                                          display: "block",
                                          fontSize: "0.68rem",
                                          color: "#64748b",
                                        }}
                                      >
                                        #{next.sequence} {next.name}
                                      </small>
                                    </span>
                                  );
                                })()}
                              </span>
                            </div>
                          </div>

                          {/* Installment Milestone Allocation Selector */}
                          <div className="form-group" style={{ marginTop: "6px" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <label style={{ margin: 0 }}>
                                Allocate to Installment Milestone *
                              </label>
                              {selectedInstallment && (
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#0891b2",
                                    fontWeight: 600,
                                  }}
                                >
                                  Milestone Due: {formatCurrency(selectedInstallmentRemaining)}
                                </span>
                              )}
                            </div>
                            <select
                              value={selectedInstallmentId}
                              onChange={(e) => handleInstallmentSelect(e.target.value)}
                              required={bookingPaymentPlan.status === "Active"}
                            >
                              <option value="" disabled>-- Select Milestone for this Payment --</option>
                              {bookingPaymentPlan.installments
                                .filter((i) => i.status !== "Cancelled")
                                .map((i) => {
                                  const coll = Number(i.net_collected ?? i.total_verified ?? 0);
                                  const rem =
                                    i.outstanding_balance !== undefined
                                      ? Number(i.outstanding_balance)
                                      : Math.max(0, Number(i.amount) - coll);
                                  return (
                                    <option key={i.id} value={i.id}>
                                      #{i.sequence} {i.name} — Due {new Date(i.due_date).toLocaleDateString()} — Scheduled: {formatCurrency(i.amount)} | Due: {formatCurrency(rem)} [{i.status}]
                                    </option>
                                  );
                                })}
                            </select>
                            {selectedInstallment && selectedInstallmentRemaining > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                  marginTop: "4px",
                                }}
                              >
                                <button
                                  type="button"
                                  className="btn-quick-fill-amount"
                                  onClick={() =>
                                    setPaymentAmount(String(selectedInstallmentRemaining))
                                  }
                                >
                                  Quick Fill Due Amount ({formatCurrency(selectedInstallmentRemaining)})
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="no-plan-notice">
                          <div className="no-plan-icon">📋</div>
                          <div className="no-plan-text">
                            <h5>No Installment Plan Established</h5>
                            <p>
                              The buyer selected <strong>Installments</strong> preference for this
                              booking. You can establish the milestone schedule now.
                            </p>
                          </div>
                          {userPermissions.canPaymentPlanCreate && (
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ padding: "6px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
                              onClick={() => {
                                initPlanGenerator();
                                setRecordModalTab("configure_plan");
                              }}
                            >
                              + Configure Plan
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Amount (₹) *</label>
                      <input
                        type="number"
                        name="amount"
                        min="1"
                        step="0.01"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
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
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Transaction / Reference / UTR</label>
                      <input
                        type="text"
                        name="transaction_reference"
                        placeholder="e.g. UTR-982187319 or CHQ-0012"
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
                  </div>

                  <div className="form-group">
                    <label>Notes / Remarks</label>
                    <textarea
                      name="notes"
                      rows={3}
                      placeholder="Add installment details, branch info, or notes..."
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsRecordOpen(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? "Recording..." : "Save Payment"}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: Configure Installment Plan */}
            {recordModalTab === "configure_plan" && selectedBooking && (
              <form
                onSubmit={handleSaveInstallmentPlan}
                style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}
              >
                <div className="modal-body" style={{ maxHeight: "calc(85vh - 140px)" }}>
                  {planFormError && (
                    <div
                      style={{
                        background: "#fee2e2",
                        color: "#b91c1c",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                      }}
                    >
                      {planFormError}
                    </div>
                  )}

                  <div className="generator-settings-card">
                    <div className="settings-header">
                      <div>
                        <h4 style={{ margin: "0 0 2px" }}>Installment Plan Schedule Setup</h4>
                        <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                          Target Agreed Sale Price:{" "}
                          <strong style={{ color: "#0891b2" }}>
                            {formatCurrency(selectedBooking.agreed_price)}
                          </strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                        onClick={handleRegenerateSchedule}
                      >
                        ⚡ Generate Schedule
                      </button>
                    </div>

                    <div className="settings-grid">
                      <div className="form-group">
                        <label>Plan Duration / Months *</label>
                        <select
                          value={genDuration}
                          onChange={(e) => {
                            const val =
                              e.target.value === "custom" ? "custom" : Number(e.target.value);
                            handleDurationChange(val);
                          }}
                        >
                          <option value={3}>3 Months (3 Installments)</option>
                          <option value={6}>6 Months (6 Installments)</option>
                          <option value={12}>12 Months (1 Year)</option>
                          <option value={18}>18 Months (1.5 Years)</option>
                          <option value={24}>24 Months (2 Years)</option>
                          <option value="custom">Custom Duration...</option>
                        </select>
                      </div>

                      {genDuration === "custom" && (
                        <div className="form-group">
                          <label>Number of Installments (1-60) *</label>
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={customMonths}
                            onChange={(e) =>
                              handleCustomMonthsChange(Number(e.target.value) || 1)
                            }
                          />
                        </div>
                      )}

                      <div className="form-group">
                        <label>First Due Date *</label>
                        <input
                          type="date"
                          value={genStartDate}
                          onChange={(e) => handleStartDateChange(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Frequency</label>
                        <select
                          value={genFrequency}
                          onChange={(e) => setGenFrequency(e.target.value)}
                        >
                          <option value="Monthly">Monthly</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="schedule-table-card">
                    <div className="table-card-header">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <h5 style={{ margin: 0, fontSize: "0.95rem" }}>Installment Milestones</h5>
                        <span className="count-badge">{planInstallments.length}</span>
                      </div>
                      <button
                        type="button"
                        className="btn-add-milestone"
                        onClick={handleAddInstallmentRow}
                      >
                        + Add Milestone Row
                      </button>
                    </div>

                    <div className="table-responsive-wrapper">
                      <table className="plan-schedule-edit-table">
                        <thead>
                          <tr>
                            <th style={{ width: "55px" }}>Seq</th>
                            <th>Milestone Name *</th>
                            <th style={{ width: "150px" }}>Amount (₹) *</th>
                            <th style={{ width: "150px" }}>Due Date *</th>
                            <th>Notes</th>
                            <th style={{ width: "40px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {planInstallments.map((row, index) => (
                            <tr key={index}>
                              <td>
                                <input
                                  type="number"
                                  min={1}
                                  className="table-input"
                                  value={row.sequence}
                                  onChange={(e) =>
                                    handleUpdateInstallmentRow(index, "sequence", Number(e.target.value))
                                  }
                                  style={{ textAlign: "center" }}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="table-input"
                                  value={row.name}
                                  onChange={(e) =>
                                    handleUpdateInstallmentRow(index, "name", e.target.value)
                                  }
                                  placeholder="e.g. Booking Advance"
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={1}
                                  step="any"
                                  className="table-input"
                                  value={row.amount}
                                  onChange={(e) =>
                                    handleUpdateInstallmentRow(index, "amount", Number(e.target.value))
                                  }
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  type="date"
                                  className="table-input"
                                  value={row.due_date}
                                  onChange={(e) =>
                                    handleUpdateInstallmentRow(index, "due_date", e.target.value)
                                  }
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="table-input"
                                  value={row.notes || ""}
                                  onChange={(e) =>
                                    handleUpdateInstallmentRow(index, "notes", e.target.value)
                                  }
                                  placeholder="Optional note"
                                />
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <button
                                  type="button"
                                  className="btn-remove-row"
                                  title="Remove milestone"
                                  disabled={planInstallments.length <= 1}
                                  onClick={() => handleRemoveInstallmentRow(index)}
                                >
                                  &times;
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="reconciliation-summary-bar">
                      <div className="metric">
                        <span className="lbl">Agreed Price</span>
                        <span className="val">{formatCurrency(scheduleMetrics.target)}</span>
                      </div>
                      <div className="metric">
                        <span className="lbl">Scheduled Total</span>
                        <span
                          className={`val ${
                            scheduleMetrics.isMatch ? "text-success" : "text-warning"
                          }`}
                        >
                          {formatCurrency(scheduleMetrics.total)}
                        </span>
                      </div>
                      <div className="metric">
                        <span className="lbl">Difference</span>
                        <span
                          className={`val ${
                            scheduleMetrics.isMatch ? "text-success" : "text-danger"
                          }`}
                        >
                          {scheduleMetrics.diff === 0
                            ? "₹0 (Balanced)"
                            : formatCurrency(scheduleMetrics.diff)}
                        </span>
                      </div>
                      <div className="status-indicator">
                        {scheduleMetrics.isMatch ? (
                          <span className="pill pill-success">✓ Totals match agreed price</span>
                        ) : scheduleMetrics.diff > 0 ? (
                          <span className="pill pill-warning">
                            ⚠ Remaining: {formatCurrency(scheduleMetrics.diff)}
                          </span>
                        ) : (
                          <span className="pill pill-danger">
                            ⚠ Exceeds by: {formatCurrency(Math.abs(scheduleMetrics.diff))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: "10px" }}>
                    <label>Overall Plan Notes (Optional)</label>
                    <textarea
                      rows={2}
                      value={planNotes}
                      onChange={(e) => setPlanNotes(e.target.value)}
                      placeholder="e.g. Standard 6-month milestone payment schedule agreed with buyer..."
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setRecordModalTab("record")}
                    disabled={savingPlan}
                  >
                    Cancel & Return to Payment
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingPlan || !scheduleMetrics.isValid}
                  >
                    {savingPlan ? "Saving Plan..." : "Save Installment Plan"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── View Payment & Refunds Modal ─── */}
      {viewingPayment && (
        <div className="modal-overlay" onClick={() => setViewingPayment(null)}>
          <div className="modal-card" style={{ maxWidth: "700px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Payment Details</h2>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  ID: {viewingPayment.id}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setViewingPayment(null)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="details-spec-grid">
                <div className="details-spec-item">
                  <div className="label">Amount</div>
                  <div className="value" style={{ color: "#0891b2" }}>
                    {formatCurrency(viewingPayment.amount)}
                  </div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Status</div>
                  <div className="value">
                    <span
                      className={
                        viewingPayment.status === "Verified"
                          ? "badge-status-verified"
                          : viewingPayment.status === "Rejected"
                          ? "badge-status-rejected"
                          : "badge-status-pending"
                      }
                    >
                      {viewingPayment.status}
                    </span>
                  </div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Payment Method</div>
                  <div className="value">{viewingPayment.payment_method}</div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Transaction Reference</div>
                  <div className="value" style={{ fontFamily: "monospace" }}>
                    {viewingPayment.transaction_reference || "—"}
                  </div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Buyer</div>
                  <div className="value">{viewingPayment.buyer_name || "—"}</div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Property / Unit</div>
                  <div className="value">
                    {viewingPayment.property_name || "—"}{" "}
                    {viewingPayment.unit_number ? `(${viewingPayment.unit_number})` : ""}
                  </div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Payment Date</div>
                  <div className="value">
                    {new Date(viewingPayment.payment_date || viewingPayment.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Booking ID</div>
                  <div className="value" style={{ fontSize: "0.8rem", fontFamily: "monospace" }}>
                    {viewingPayment.booking_id}
                  </div>
                </div>
              </div>

              {viewingPayment.notes && (
                <div style={{ marginTop: "12px" }}>
                  <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
                    Notes
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "inherit" }}>
                    {viewingPayment.notes}
                  </p>
                </div>
              )}

              {/* Quick Verification Actions inside Modal */}
              {viewingPayment.status === "Pending" && userPermissions.canVerify && (
                <div style={{ background: "rgba(6, 182, 212, 0.08)", border: "1px solid rgba(6, 182, 212, 0.2)", borderRadius: "8px", padding: "12px 16px", marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Verification Action Required:</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="btn-success"
                      onClick={() => {
                        setDecidingPayment(viewingPayment);
                        setDecisionType("Verified");
                        setDecisionNotes("");
                      }}
                    >
                      ✓ Verify Receipt
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() => {
                        setDecidingPayment(viewingPayment);
                        setDecisionType("Rejected");
                        setDecisionNotes("");
                      }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Refunds Section ─── */}
              <div className="refunds-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                      Refund Records ({paymentRefunds.length})
                    </h3>
                    <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                      Track reverse settlements, credit notes, and manual confirmations.
                    </p>
                  </div>

                  {viewingPayment.status === "Verified" && userPermissions.canRefund && (
                    <button
                      className="btn-secondary"
                      style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                      onClick={() => {
                        setRefundingPayment(viewingPayment);
                        setFormError(null);
                        setIsRefundModalOpen(true);
                      }}
                    >
                      + Request Refund
                    </button>
                  )}
                </div>

                {loadingRefunds ? (
                  <div style={{ textAlign: "center", padding: "16px", color: "#64748b", fontSize: "0.85rem" }}>
                    Loading refund records...
                  </div>
                ) : paymentRefunds.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "18px", color: "#94a3b8", fontSize: "0.85rem" }}>
                    No refunds requested or issued for this payment.
                  </div>
                ) : (
                  paymentRefunds.map((ref) => (
                    <div key={ref.id} className="refund-item-card">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 700, color: "#ef4444" }}>
                            -{formatCurrency(ref.amount)}
                          </span>
                          <span
                            className={
                              ref.status === "Processed" || ref.status === "Completed"
                                ? "badge-status-verified"
                                : ref.status === "Rejected"
                                ? "badge-status-rejected"
                                : "badge-status-pending"
                            }
                          >
                            {ref.status}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "3px" }}>
                          Reason: <strong>{ref.reason}</strong>
                        </div>
                        {ref.external_reference && (
                          <div style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#0891b2" }}>
                            Ref: {ref.external_reference}
                          </div>
                        )}
                      </div>

                      {ref.status === "Pending" && (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="btn-success"
                            style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                            onClick={() => {
                              setConfirmingRefund(ref);
                              setFormError(null);
                            }}
                          >
                            Confirm Returned
                          </button>
                          <button
                            className="btn-danger"
                            style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                            onClick={() => handleRejectRefund(ref.id)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setViewingPayment(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Verification Decision Modal ─── */}
      {decidingPayment && (
        <div className="modal-overlay" onClick={() => setDecidingPayment(null)}>
          <div className="modal-card" style={{ maxWidth: "460px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{decisionType === "Verified" ? "Verify Payment" : "Reject Payment"}</h2>
              <button className="modal-close-btn" onClick={() => setDecidingPayment(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: "1.5" }}>
                Are you sure you want to mark payment of{" "}
                <strong>{formatCurrency(decidingPayment.amount)}</strong> as{" "}
                <span style={{ fontWeight: 700, color: decisionType === "Verified" ? "#10b981" : "#ef4444" }}>
                  {decisionType}
                </span>
                ?
              </p>

              <div className="form-group" style={{ marginTop: "12px" }}>
                <label>Verification Notes / Reason (Optional)</label>
                <textarea
                  rows={3}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="e.g. Bank statement matched on 26 Oct..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setDecidingPayment(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className={decisionType === "Verified" ? "btn-success" : "btn-danger"}
                onClick={handleConfirmDecision}
                disabled={submitting}
              >
                {submitting ? "Saving..." : `Confirm ${decisionType}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Request Refund Modal ─── */}
      {isRefundModalOpen && refundingPayment && (
        <div className="modal-overlay" onClick={() => setIsRefundModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request Payment Refund</h2>
              <button className="modal-close-btn" onClick={() => setIsRefundModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateRefund} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 500 }}>
                    {formError}
                  </div>
                )}

                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  Original Payment: <strong>{formatCurrency(refundingPayment.amount)}</strong> (
                  {refundingPayment.payment_method})
                </div>

                <div className="form-group">
                  <label>Refund Amount (₹) *</label>
                  <input
                    type="number"
                    name="amount"
                    min="1"
                    max={Number(refundingPayment.amount)}
                    defaultValue={Number(refundingPayment.amount)}
                    step="0.01"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Reason for Refund * (min 3 chars)</label>
                  <textarea
                    name="reason"
                    rows={3}
                    placeholder="e.g. Booking cancellation, customer excess transfer..."
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsRefundModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Requesting..." : "Submit Refund"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Confirm Manual Refund Modal ─── */}
      {confirmingRefund && viewingPayment && (
        <div className="modal-overlay" onClick={() => setConfirmingRefund(null)}>
          <div className="modal-card" style={{ maxWidth: "460px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Refund Returned</h2>
              <button className="modal-close-btn" onClick={() => setConfirmingRefund(null)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmManualRefund} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 500 }}>
                    {formError}
                  </div>
                )}

                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  Confirm manual settlement of <strong>{formatCurrency(confirmingRefund.amount)}</strong>.
                </p>

                <div className="form-group">
                  <label>Bank Reference / UTR *</label>
                  <input
                    type="text"
                    name="external_reference"
                    placeholder="e.g. UTR-REFUND-87192"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Confirmation Notes *</label>
                  <textarea
                    name="notes"
                    rows={3}
                    placeholder="Confirm bank account details or date of disbursement..."
                    required
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
                <button type="submit" className="btn-success" disabled={submitting}>
                  {submitting ? "Confirming..." : "Confirm Returned"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ─── Overdue Installments & Collections Modal ─── */}
      {isOverdueModalOpen && overdueSummary && (
        <div className="modal-overlay" onClick={() => setIsOverdueModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: "860px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Overdue Installments & Collections</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  Active payment plan installments with overdue pending balances (As of {overdueSummary.as_of_date || "Today"})
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setIsOverdueModalOpen(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {overdueSummary.installments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", color: "#10b981", fontWeight: 600 }}>
                  ✓ No overdue installments! All collections are up to date.
                </div>
              ) : (
                <div className="overdue-modal-table-wrapper">
                  <table className="overdue-modal-table">
                    <thead>
                      <tr>
                        <th>Booking / Buyer</th>
                        <th>Milestone</th>
                        <th>Due Date</th>
                        <th>Milestone Amount</th>
                        <th>Net Collected</th>
                        <th>Outstanding Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdueSummary.installments.map((row, idx) => {
                        const inst = row.installment;
                        const targetBooking = bookings.find((b) => b.id === row.booking_id);
                        const buyerName =
                          targetBooking?.buyer_name ||
                          row.booking?.buyer_name ||
                          `Booking #${row.booking_id.slice(0, 8)}`;
                        const buyerPhone =
                          targetBooking?.buyer_phone || row.booking?.buyer_phone;
                        const outstanding = Number(inst?.outstanding_balance ?? 0);

                        return (
                          <tr key={inst?.id || `overdue-${idx}`}>
                            <td>
                              <strong>{buyerName}</strong>
                              {buyerPhone && (
                                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                  {buyerPhone}
                                </div>
                              )}
                            </td>
                            <td>
                              #{inst?.sequence} {inst?.name}
                            </td>
                            <td>
                              <span style={{ color: "#ef4444", fontWeight: 700 }}>
                                {inst?.due_date
                                  ? new Date(inst.due_date).toLocaleDateString()
                                  : "—"}
                              </span>
                            </td>
                            <td>{formatCurrency(inst?.amount || 0)}</td>
                            <td>{formatCurrency(inst?.net_collected || 0)}</td>
                            <td>
                              <strong style={{ color: "#dc2626" }}>
                                {formatCurrency(outstanding)}
                              </strong>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsOverdueModalOpen(false)}
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
