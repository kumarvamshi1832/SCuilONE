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
import { getLeads } from "../../services/leadService";
import type { Lead } from "../../types/lead";
import type {
  Booking,
  BookingCreate,
  PaymentPreference,
} from "../../types/booking";
import { BOOKING_STATUSES } from "../../types/booking";
import type {
  Payment,
  PaymentCreate,
} from "../../types/payment";
import { PAYMENT_METHODS } from "../../types/payment";
import type { PaymentRefund } from "../../types/paymentRefund";
import type { Property } from "../../types/property";
import type {
  PaymentPlan,
  PaymentPlanCreate,
  CollectionSummary,
  InstallmentCreate,
  OverdueInstallmentItem,
} from "../../types/paymentPlan";
import {
  getPaymentPlan,
  createPaymentPlan,
  updatePaymentPlan,
  cancelPaymentPlan,
  getCollectionSummary,
  getOverdueCollections,
} from "../../services/paymentPlanService";
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

  // Leads for Create Booking
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [buyerName, setBuyerName] = useState<string>("");
  const [buyerEmail, setBuyerEmail] = useState<string>("");
  const [buyerPhone, setBuyerPhone] = useState<string>("");

  // Payment Preference for Create Booking
  const [createPaymentPref, setCreatePaymentPref] = useState<PaymentPreference>("Full Payment");
  const [createInstallmentNotes, setCreateInstallmentNotes] = useState("");

  // Payments & Refunds inside view modal
  const [bookingPayments, setBookingPayments] = useState<Payment[]>([]);
  const [paymentsRefundsMap, setPaymentsRefundsMap] = useState<Record<string, PaymentRefund[]>>({});
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Payment Plan & Collections State
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [collectionSummary, setCollectionSummary] = useState<CollectionSummary | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<"overview" | "plan">("overview");

  // Create / Edit Payment Plan Modal
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [planInstallments, setPlanInstallments] = useState<InstallmentCreate[]>([]);
  const [planNotes, setPlanNotes] = useState("");
  const [planFormError, setPlanFormError] = useState<string | null>(null);
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [isCancelPlanModalOpen, setIsCancelPlanModalOpen] = useState(false);

  // Overdue Installments Modal
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);
  const [overdueInstallments, setOverdueInstallments] = useState<OverdueInstallmentItem[]>([]);
  const [loadingOverdue, setLoadingOverdue] = useState(false);

  // Record Payment Modal
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [selectedPaymentInstallmentId, setSelectedPaymentInstallmentId] = useState("");

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
          canPaymentPlanCreate: true,
          canPaymentPlanView: true,
          canPaymentPlanEdit: true,
          canPaymentPlanCancel: true,
        };
      const parsed = JSON.parse(stored);
      let roleName = "";
      if (typeof parsed.role === "string") {
        roleName = parsed.role.toUpperCase();
      } else if (parsed.role && typeof parsed.role.name === "string") {
        roleName = parsed.role.name.toUpperCase();
      } else if (typeof parsed.role_name === "string") {
        roleName = parsed.role_name.toUpperCase();
      }

      const isSuperOrAdmin =
        roleName.includes("ADMIN") ||
        roleName.includes("MANAGER") ||
        roleName.includes("OWNER") ||
        roleName.includes("SUPER") ||
        !roleName;

      const perms: any[] = Array.isArray(parsed.permissions)
        ? parsed.permissions
        : parsed.role?.permissions || [];

      const has = (p: string) =>
        isSuperOrAdmin ||
        perms.some((x: any) => {
          if (typeof x === "string") return x.toLowerCase() === p.toLowerCase();
          if (x && typeof x === "object" && typeof x.name === "string") {
            return x.name.toLowerCase() === p.toLowerCase();
          }
          return false;
        });

      return {
        canCreate: has("booking.create"),
        canUpdate: has("booking.update"),
        canCancel: has("booking.cancel"),
        canComplete: has("booking.sale.complete"),
        canPaymentCreate: has("booking.payment.create"),
        canPaymentVerify: has("booking.payment.verify"),
        canRefundManage: has("booking.refund.manage"),
        canPaymentPlanCreate: has("booking.payment_plan.create"),
        canPaymentPlanView: has("booking.payment_plan.view"),
        canPaymentPlanEdit: has("booking.payment_plan.edit"),
        canPaymentPlanCancel: has("booking.payment_plan.cancel"),
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
        canPaymentPlanCreate: true,
        canPaymentPlanView: true,
        canPaymentPlanEdit: true,
        canPaymentPlanCancel: true,
      };
    }
  }, []);

  // Fetch Leads
  const fetchLeads = useCallback(async () => {
    setLoadingLeads(true);
    setLeadsError(null);
    try {
      const data = await getLeads();
      setLeads(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to load leads:", err);
      setLeadsError("Failed to load leads. You can still enter buyer details manually.");
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  // Initial datasets
  useEffect(() => {
    getProperties({ limit: 100 })
      .then(setProperties)
      .catch(console.error);
    fetchLeads();
  }, [fetchLeads]);

  const propertyMap = useMemo(() => {
    const map = new Map<string, Property>();
    properties.forEach((p) => map.set(p.id, p));
    return map;
  }, [properties]);

  const leadMap = useMemo(() => {
    const map = new Map<string, Lead>();
    leads.forEach((l) => map.set(l.id, l));
    return map;
  }, [leads]);

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

  // Load payment plan & collections for a booking
  const loadPaymentPlanAndCollections = useCallback(async (bookingId: string) => {
    setLoadingPlan(true);
    setPlanError(null);
    try {
      const [planData, collData] = await Promise.all([
        getPaymentPlan(bookingId).catch((err) => {
          if (err?.response?.status === 404) return null;
          throw err;
        }),
        getCollectionSummary(bookingId).catch(() => null),
      ]);
      setPaymentPlan(planData);
      setCollectionSummary(collData);
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        setPlanError(formatApiError(err, "Failed to load payment plan."));
      } else {
        setPaymentPlan(null);
      }
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  const viewingBookingId = viewingBooking?.id;
  useEffect(() => {
    if (viewingBookingId) {
      loadPaymentsAndRefunds(viewingBookingId);
      if (userPermissions.canPaymentPlanView) {
        loadPaymentPlanAndCollections(viewingBookingId);
      }
      setActiveDetailsTab("overview");
    } else {
      setBookingPayments([]);
      setPaymentsRefundsMap({});
      setPaymentPlan(null);
      setCollectionSummary(null);
      setPlanError(null);
      setActiveDetailsTab("overview");
    }
  }, [viewingBookingId, loadPaymentsAndRefunds, loadPaymentPlanAndCollections, userPermissions.canPaymentPlanView]);

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
        const lead = b.lead_id ? leadMap.get(b.lead_id) : undefined;
        const leadName = lead?.full_name?.toLowerCase() || "";

        if (
          !buyer.includes(q) &&
          !email.includes(q) &&
          !phone.includes(q) &&
          !propName.includes(q) &&
          !city.includes(q) &&
          !leadName.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [bookings, searchQuery, propertyMap, leadMap]);

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

  // Handle Lead Selection in Create Booking Modal
  const handleLeadChange = (newLeadId: string) => {
    setSelectedLeadId(newLeadId);
    if (!newLeadId) {
      setBuyerName("");
      setBuyerEmail("");
      setBuyerPhone("");
      return;
    }

    const lead = leads.find((l) => l.id === newLeadId);
    if (lead) {
      setBuyerName(lead.full_name || "");
      setBuyerEmail(lead.email || "");
      setBuyerPhone(lead.phone || "");
    }
  };

  // Close Create Modal and Reset State
  const handleCloseCreateModal = () => {
    setIsCreateOpen(false);
    setSelectedLeadId("");
    setBuyerName("");
    setBuyerEmail("");
    setBuyerPhone("");
    setFormError(null);
    setCreatePaymentPref("Full Payment");
    setCreateInstallmentNotes("");
  };

  // Create Booking Submit
  const handleCreateBooking = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const property_id = String(formData.get("property_id") || "");
    const finalBuyerName = (buyerName || String(formData.get("buyer_name") || "")).trim();
    const finalBuyerEmail = (buyerEmail || String(formData.get("buyer_email") || "")).trim() || null;
    const finalBuyerPhone = (buyerPhone || String(formData.get("buyer_phone") || "")).trim() || null;
    const booking_amount = Number(formData.get("booking_amount") || 0);
    const agreed_price = formData.get("agreed_price")
      ? Number(formData.get("agreed_price"))
      : null;
    const lead_id = selectedLeadId.trim() ? selectedLeadId.trim() : null;

    const payment_preference = createPaymentPref;
    const installment_request_notes =
      createPaymentPref === "Installments" && createInstallmentNotes.trim()
        ? createInstallmentNotes.trim()
        : null;

    if (!property_id || !finalBuyerName || booking_amount < 0) {
      setFormError("Please select a Property, enter Buyer Name, and valid Booking Amount.");
      setSubmitting(false);
      return;
    }

    try {
      const payload: BookingCreate = {
        property_id,
        lead_id,
        buyer_name: finalBuyerName,
        buyer_email: finalBuyerEmail,
        buyer_phone: finalBuyerPhone,
        booking_amount,
        payment_preference,
        installment_request_notes,
        agreed_price,
      };
      const created = await createBooking(payload);
      setBookings((prev) => [created, ...prev]);
      showToast("Booking created successfully!");
      handleCloseCreateModal();

      // Refresh properties list because property is now Reserved
      getProperties({ limit: 100 }).then(setProperties).catch(console.error);
    } catch (err: any) {
      console.error("Create booking error:", err);
      setFormError(formatApiError(err, "Failed to create booking."));
    } finally {
      setSubmitting(false);
    }
  };

  // Open Create Payment Plan Modal
  const handleOpenCreatePlan = () => {
    if (!viewingBooking) return;
    const agreedPrice = Number(viewingBooking.agreed_price) || 0;
    const tokenAmount = Math.min(Number(viewingBooking.booking_amount) || 0, agreedPrice);
    const balance = Math.max(0, agreedPrice - tokenAmount);

    const todayStr = new Date().toISOString().split("T")[0] || "";
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().split("T")[0] || "";

    const initialInstallments: InstallmentCreate[] = [
      {
        sequence: 1,
        name: "Initial Token / Booking Deposit",
        amount: tokenAmount > 0 ? tokenAmount : Math.round(agreedPrice * 0.1),
        due_date: todayStr,
        notes: "Due upon booking confirmation",
      },
      {
        sequence: 2,
        name: "Final Settlement / Handover",
        amount: tokenAmount > 0 ? balance : Math.round(agreedPrice * 0.9),
        due_date: nextMonthStr,
        notes: "Due on possession / handover",
      },
    ];

    setPlanInstallments(initialInstallments);
    setPlanNotes("");
    setPlanFormError(null);
    setIsEditingPlan(false);
    setIsPlanModalOpen(true);
  };

  // Open Edit Payment Plan Modal
  const handleOpenEditPlan = () => {
    if (!viewingBooking || !paymentPlan) return;
    const mapped: InstallmentCreate[] = paymentPlan.installments.map((inst) => ({
      sequence: inst.sequence,
      name: inst.name,
      amount: Number(inst.amount),
      due_date: inst.due_date ? String(inst.due_date).split("T")[0] || "" : "",
      notes: inst.notes || "",
    }));
    setPlanInstallments(mapped.length > 0 ? mapped : []);
    setPlanNotes(paymentPlan.notes || "");
    setPlanFormError(null);
    setIsEditingPlan(true);
    setIsPlanModalOpen(true);
  };

  // Quick Auto Split Helper
  const handleAutoSplit = (parts: number) => {
    if (!viewingBooking) return;
    const agreedPrice = Number(viewingBooking.agreed_price) || 0;
    if (agreedPrice <= 0) return;

    const baseAmount = Math.floor((agreedPrice / parts) * 100) / 100;
    const remainder = Math.round((agreedPrice - baseAmount * (parts - 1)) * 100) / 100;

    const generated: InstallmentCreate[] = [];
    const baseDate = new Date();

    for (let i = 1; i <= parts; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));
      const isLast = i === parts;
      generated.push({
        sequence: i,
        name:
          i === 1
            ? "1st Installment (Booking / Down Payment)"
            : isLast
            ? `Final Installment #${i} (Handover)`
            : `Installment #${i}`,
        amount: isLast ? remainder : baseAmount,
        due_date: dueDate.toISOString().split("T")[0] || "",
        notes: `Milestone ${i} of ${parts}`,
      });
    }
    setPlanInstallments(generated);
  };

  // Add Installment Row
  const handleAddInstallmentRow = () => {
    const nextSeq =
      (planInstallments.length > 0
        ? Math.max(...planInstallments.map((x) => x.sequence))
        : 0) + 1;
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + planInstallments.length);

    setPlanInstallments((prev) => [
      ...prev,
      {
        sequence: nextSeq,
        name: `Installment #${nextSeq}`,
        amount: 0,
        due_date: nextDate.toISOString().split("T")[0] || "",
        notes: "",
      },
    ]);
  };

  // Remove Installment Row
  const handleRemoveInstallmentRow = (index: number) => {
    if (planInstallments.length <= 1) return;
    setPlanInstallments((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((item, idx) => ({ ...item, sequence: idx + 1 }));
    });
  };

  // Update Installment Field
  const handleInstallmentFieldChange = (
    index: number,
    field: keyof InstallmentCreate,
    value: any
  ) => {
    setPlanInstallments((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value } as InstallmentCreate;
      return copy;
    });
  };

  // Save Payment Plan (Create or Update)
  const handleSavePlan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!viewingBooking) return;
    setPlanFormError(null);
    setPlanSubmitting(true);

    const agreedPrice = Number(viewingBooking.agreed_price) || 0;
    const currentTotal = planInstallments.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );

    // Validations
    if (planInstallments.length === 0) {
      setPlanFormError("At least one installment milestone is required.");
      setPlanSubmitting(false);
      return;
    }

    const seqs = planInstallments.map((x) => x.sequence);
    if (new Set(seqs).size !== seqs.length) {
      setPlanFormError("Installment sequence numbers must be unique.");
      setPlanSubmitting(false);
      return;
    }

    for (const inst of planInstallments) {
      if (!inst.name.trim()) {
        setPlanFormError("Each installment must have a milestone name.");
        setPlanSubmitting(false);
        return;
      }
      if (!inst.amount || Number(inst.amount) <= 0) {
        setPlanFormError("Each installment must have an amount greater than 0.");
        setPlanSubmitting(false);
        return;
      }
      if (!inst.due_date) {
        setPlanFormError("Each installment must specify a due date.");
        setPlanSubmitting(false);
        return;
      }
    }

    // Cent precision difference check
    const diff = Math.abs(currentTotal - agreedPrice);
    if (diff > 0.05) {
      setPlanFormError(
        `Plan total (${formatINR(currentTotal)}) must equal the agreed price (${formatINR(agreedPrice)}). Current difference: ${formatINR(Math.abs(agreedPrice - currentTotal))}`
      );
      setPlanSubmitting(false);
      return;
    }

    try {
      const payload: PaymentPlanCreate = {
        installments: planInstallments.map((x) => ({
          sequence: Number(x.sequence),
          name: x.name.trim(),
          amount: Number(x.amount),
          due_date: x.due_date,
          notes: x.notes?.trim() || null,
        })),
        notes: planNotes.trim() || null,
      };

      if (isEditingPlan) {
        const updated = await updatePaymentPlan(viewingBooking.id, payload);
        setPaymentPlan(updated);
        showToast("Payment plan updated successfully!");
      } else {
        const created = await createPaymentPlan(viewingBooking.id, payload);
        setPaymentPlan(created);
        showToast("Payment plan created successfully!");
      }

      await loadPaymentPlanAndCollections(viewingBooking.id);
      setIsPlanModalOpen(false);
      setActiveDetailsTab("plan");
    } catch (err: any) {
      console.error("Save payment plan error:", err);
      setPlanFormError(formatApiError(err, "Failed to save payment plan."));
    } finally {
      setPlanSubmitting(false);
    }
  };

  // Cancel Payment Plan
  const handleOpenCancelPlanModal = () => {
    setIsCancelPlanModalOpen(true);
  };

  const handleConfirmCancelPlan = async () => {
    if (!viewingBooking || !paymentPlan) return;
    setSubmitting(true);
    try {
      const cancelled = await cancelPaymentPlan(viewingBooking.id);
      setPaymentPlan(cancelled);
      await loadPaymentPlanAndCollections(viewingBooking.id);
      setIsCancelPlanModalOpen(false);
      showToast("Payment plan cancelled successfully!");
    } catch (err: any) {
      console.error("Cancel plan error:", err);
      showToast(formatApiError(err, "Failed to cancel payment plan."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Open Overdue Installments Modal
  const handleOpenOverdueModal = async () => {
    setIsOverdueModalOpen(true);
    setLoadingOverdue(true);
    try {
      const data = await getOverdueCollections();
      if (data && Array.isArray(data.installments)) {
        setOverdueInstallments(data.installments as any);
      } else {
        setOverdueInstallments([]);
      }
    } catch (err: any) {
      console.error("Failed to load overdue installments:", err);
      showToast(formatApiError(err, "Failed to load overdue installments."), "error");
      setOverdueInstallments([]);
    } finally {
      setLoadingOverdue(false);
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

    const installment_id = selectedPaymentInstallmentId || null;

    if (amount <= 0) {
      setFormError("Amount must be greater than zero.");
      setSubmitting(false);
      return;
    }

    try {
      const payload: PaymentCreate = {
        installment_id,
        amount,
        payment_method,
        transaction_reference,
        payment_date,
        notes,
      };
      await createPayment(viewingBooking.id, payload);
      showToast("Payment recorded! Awaiting verification.");
      setIsRecordPaymentOpen(false);
      setSelectedPaymentInstallmentId("");
      loadPaymentsAndRefunds(viewingBooking.id);
      if (userPermissions.canPaymentPlanView) {
        loadPaymentPlanAndCollections(viewingBooking.id);
      }
    } catch (err: any) {
      console.error("Record payment error:", err);
      setFormError(formatApiError(err, "Failed to record payment."));
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

          {userPermissions.canPaymentPlanView && (
            <button
              className="btn-overdue-collections"
              onClick={handleOpenOverdueModal}
              title="View overdue installment collections across all bookings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              Overdue Collections
            </button>
          )}

          {userPermissions.canCreate && (
            <button
              className="btn-create-booking"
              onClick={() => {
                setFormError(null);
                setSelectedLeadId("");
                setBuyerName("");
                setBuyerEmail("");
                setBuyerPhone("");
                setCreatePaymentPref("Full Payment");
                setCreateInstallmentNotes("");
                setIsCreateOpen(true);
                if (leads.length === 0) {
                  fetchLeads();
                }
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
                setSelectedLeadId("");
                setBuyerName("");
                setBuyerEmail("");
                setBuyerPhone("");
                setCreatePaymentPref("Full Payment");
                setCreateInstallmentNotes("");
                setIsCreateOpen(true);
                if (leads.length === 0) {
                  fetchLeads();
                }
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
                    {b.lead_id && leadMap.get(b.lead_id) && (
                      <div style={{ fontSize: "0.72rem", color: "#0891b2", marginTop: "3px", fontWeight: 500 }}>
                        Lead: {leadMap.get(b.lead_id)?.full_name}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                    <span className={`badge ${badgeClass}`}>{b.status}</span>
                    <span
                      className={`badge-payment-pref ${
                        b.payment_preference === "Installments" ? "installments" : "full"
                      }`}
                      title={b.installment_request_notes ? `Notes: ${b.installment_request_notes}` : undefined}
                    >
                      {b.payment_preference === "Installments" ? "⚡ Installments" : "✓ Full Payment"}
                    </span>
                  </div>
                </div>

                {b.installment_request_notes && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#b45309",
                      background: "#fffbeb",
                      padding: "5px 9px",
                      borderRadius: "6px",
                      marginBottom: "10px",
                      fontStyle: "italic",
                      border: "1px solid #fde68a",
                      lineHeight: 1.35,
                    }}
                    title={b.installment_request_notes}
                  >
                    "{b.installment_request_notes.length > 55
                      ? `${b.installment_request_notes.substring(0, 55)}...`
                      : b.installment_request_notes}"
                  </div>
                )}

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
                <th>Preference</th>
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
                      {b.lead_id && leadMap.get(b.lead_id) && (
                        <div style={{ fontSize: "0.7rem", color: "#0891b2", marginTop: "2px", fontWeight: 500 }}>
                          Lead: {leadMap.get(b.lead_id)?.full_name}
                        </div>
                      )}
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
                      <span
                        className={`badge-payment-pref ${
                          b.payment_preference === "Installments" ? "installments" : "full"
                        }`}
                        title={b.installment_request_notes ? `Notes: ${b.installment_request_notes}` : undefined}
                      >
                        {b.payment_preference === "Installments" ? "⚡ Installments" : "✓ Full Payment"}
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
        <div className="modal-overlay" onClick={handleCloseCreateModal}>
          <div className="modal-card" style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Property Booking</h2>
              <button className="modal-close-btn" onClick={handleCloseCreateModal}>
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
                  <label>Related Lead</label>
                  <select
                    name="lead_id"
                    value={selectedLeadId}
                    onChange={(e) => handleLeadChange(e.target.value)}
                    disabled={submitting || loadingLeads}
                  >
                    <option value="">Select Lead</option>
                    {loadingLeads && <option value="" disabled>Loading leads...</option>}
                    {leadsError && <option value="" disabled>Error loading leads</option>}
                    {!loadingLeads && leads.length === 0 && !leadsError && (
                      <option value="" disabled>No leads available</option>
                    )}
                    {leads.map((l) => {
                      const details = [
                        l.email,
                        l.phone,
                        l.status ? `[${l.status}]` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ");
                      return (
                        <option key={l.id} value={l.id}>
                          {l.full_name}{details ? ` — ${details}` : ""}
                        </option>
                      );
                    })}
                  </select>
                  {loadingLeads && (
                    <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px", display: "block" }}>
                      Loading leads from CRM...
                    </span>
                  )}
                  {leadsError && (
                    <span style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: "4px", display: "block" }}>
                      {leadsError}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label>Buyer Full Name *</label>
                  <input
                    type="text"
                    name="buyer_name"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
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
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder="e.g. anand@example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>Buyer Phone</label>
                    <input
                      type="tel"
                      name="buyer_phone"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
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

                {/* ─── Payment Preferences Section ─── */}
                <div className="payment-preferences-section">
                  <div className="section-title-header">
                    <h4>Payment Preferences</h4>
                    <span className="section-subtitle">
                      Specify whether the buyer intends full upfront payment or an installment arrangement.
                    </span>
                  </div>

                  <div className="form-group">
                    <label>Payment Preference *</label>
                    <select
                      name="payment_preference"
                      value={createPaymentPref}
                      onChange={(e) =>
                        setCreatePaymentPref(
                          e.target.value as "Full Payment" | "Installments"
                        )
                      }
                      required
                    >
                      <option value="Full Payment">Full Payment</option>
                      <option value="Installments">Installments</option>
                    </select>
                  </div>

                  {createPaymentPref === "Installments" && (
                    <div className="form-group installment-notes-field">
                      <label>Installment Request Notes</label>
                      <textarea
                        name="installment_request_notes"
                        rows={3}
                        value={createInstallmentNotes}
                        onChange={(e) => setCreateInstallmentNotes(e.target.value)}
                        placeholder="e.g. Requesting monthly installments over 12 months"
                      />
                      <span className="field-hint">
                        Capture the buyer's requested installment arrangement. An official payment plan can be configured once the booking is created.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCloseCreateModal}
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
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <h2>Booking: {viewingBooking.buyer_name}</h2>
                  <span
                    className={`badge badge-payment-pref ${
                      viewingBooking.payment_preference === "Installments"
                        ? "installments"
                        : "full"
                    }`}
                  >
                    {viewingBooking.payment_preference === "Installments"
                      ? "⚡ Installments"
                      : "✓ Full Payment"}
                  </span>
                </div>
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
              {/* ─── Booking Details Spec Card ─── */}
              <div className="booking-spec-overview-card">
                <div className="spec-overview-item">
                  <span className="spec-label">Booking Reference</span>
                  <span className="spec-val">#{viewingBooking.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="spec-overview-item">
                  <span className="spec-label">Buyer</span>
                  <span className="spec-val">
                    <strong>{viewingBooking.buyer_name}</strong>
                    {viewingBooking.buyer_phone && (
                      <span className="spec-subval">{viewingBooking.buyer_phone}</span>
                    )}
                  </span>
                </div>
                {viewingBooking.lead_id && (
                  <div className="spec-overview-item">
                    <span className="spec-label">Related Lead</span>
                    <span className="spec-val">
                      <strong>{leadMap.get(viewingBooking.lead_id)?.full_name || "Linked Lead"}</strong>
                      {leadMap.get(viewingBooking.lead_id)?.email && (
                        <span className="spec-subval">{leadMap.get(viewingBooking.lead_id)?.email}</span>
                      )}
                    </span>
                  </div>
                )}
                <div className="spec-overview-item">
                  <span className="spec-label">Property</span>
                  <span className="spec-val">
                    {propertyMap.get(viewingBooking.property_id)?.name || "Property"}
                    {propertyMap.get(viewingBooking.property_id)?.unit_number && (
                      <span className="spec-subval">Unit {propertyMap.get(viewingBooking.property_id)?.unit_number}</span>
                    )}
                  </span>
                </div>
                <div className="spec-overview-item">
                  <span className="spec-label">Agreed Sale Price</span>
                  <span className="spec-val highlight-cyan">{formatINR(viewingBooking.agreed_price)}</span>
                </div>
                <div className="spec-overview-item">
                  <span className="spec-label">Booking Amount / Token</span>
                  <span className="spec-val">{formatINR(viewingBooking.booking_amount)}</span>
                </div>
                <div className="spec-overview-item">
                  <span className="spec-label">Payment Preference</span>
                  <span className="spec-val">
                    <span
                      className={`badge badge-payment-pref ${
                        viewingBooking.payment_preference === "Installments"
                          ? "installments"
                          : "full"
                      }`}
                    >
                      {viewingBooking.payment_preference === "Installments"
                        ? "⚡ Installments"
                        : "✓ Full Payment"}
                    </span>
                  </span>
                </div>
                <div className="spec-overview-item">
                  <span className="spec-label">Booking Status</span>
                  <span className="spec-val">
                    <span className={`badge badge-${viewingBooking.status.toLowerCase()}`}>
                      {viewingBooking.status}
                    </span>
                  </span>
                </div>
              </div>

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

              {/* Buyer's Installment Request Notes banner if present */}
              {viewingBooking.installment_request_notes && (
                <div className="installment-request-banner">
                  <span className="banner-title">Buyer's Installment Request Notes:</span>
                  <p className="banner-text">"{viewingBooking.installment_request_notes}"</p>
                </div>
              )}

              {/* Detail Tabs */}
              {userPermissions.canPaymentPlanView && (
                <div className="booking-modal-tabs">
                  <button
                    type="button"
                    className={`modal-tab-btn ${activeDetailsTab === "overview" ? "active" : ""}`}
                    onClick={() => setActiveDetailsTab("overview")}
                  >
                    Transactions & Refunds ({bookingPayments.length})
                  </button>
                  <button
                    type="button"
                    className={`modal-tab-btn ${activeDetailsTab === "plan" ? "active" : ""}`}
                    onClick={() => setActiveDetailsTab("plan")}
                  >
                    Installment Payment Plan {paymentPlan ? `(${paymentPlan.status})` : viewingBooking.payment_preference === "Installments" ? "(Not Set Up)" : "(N/A)"}
                  </button>
                </div>
              )}

              {/* TAB 1: Transactions & Refunds Overview */}
              {activeDetailsTab === "overview" && (
                <>
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

                    {viewingBooking.payment_preference === "Installments" &&
                      userPermissions.canPaymentPlanView &&
                      !paymentPlan &&
                      userPermissions.canPaymentPlanCreate &&
                      viewingBooking.status !== "Cancelled" && (
                        <button
                          className="btn-secondary"
                          style={{ borderColor: "#06B6D4", color: "#0891b2" }}
                          onClick={() => {
                            setActiveDetailsTab("plan");
                            handleOpenCreatePlan();
                          }}
                        >
                          ⚡ Set Up Payment Plan
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

                          const linkedInst = paymentPlan?.installments.find(
                            (i) => i.id === pmt.installment_id
                          );

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
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                                    {formatINR(pmt.amount)}
                                  </span>
                                  <span style={{ fontSize: "0.75rem", background: "#e2e8f0", padding: "3px 8px", borderRadius: "4px" }}>
                                    {pmt.payment_method}
                                  </span>
                                  <span className={`badge ${pmtStatusClass}`}>{pmt.status}</span>
                                  {linkedInst && (
                                    <span
                                      style={{
                                        fontSize: "0.72rem",
                                        background: "rgba(6,182,212,0.12)",
                                        color: "#0891b2",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Milestone: #{linkedInst.sequence} {linkedInst.name}
                                    </span>
                                  )}
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
                </>
              )}

              {/* TAB 2: Installment Payment Plan */}
              {activeDetailsTab === "plan" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {viewingBooking.payment_preference === "Full Payment" ? (
                    <div className="full-payment-notice-card">
                      <div style={{ fontSize: "2rem", marginBottom: "8px" }}>💳</div>
                      <h4>Full Payment Preference Selected</h4>
                      <p>
                        The buyer selected <strong>Full Payment</strong> for this booking. Milestone installment payment plans are available exclusively for bookings with <strong>Installments</strong> payment preference.
                      </p>
                      <div style={{ marginTop: "16px", display: "inline-flex", gap: "12px", background: "rgba(6,182,212,0.06)", padding: "10px 16px", borderRadius: "8px", fontSize: "0.85rem", flexWrap: "wrap", justifyContent: "center" }}>
                        <span>Agreed Price: <strong>{formatINR(viewingBooking.agreed_price)}</strong></span>
                        <span>•</span>
                        <span>Net Verified: <strong style={{ color: "#10b981" }}>{formatINR(financialSummary.netReceived)}</strong></span>
                        <span>•</span>
                        <span>Outstanding: <strong style={{ color: "#f59e0b" }}>{formatINR(financialSummary.balanceDue)}</strong></span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Plan Top Controls */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <h4 style={{ margin: "0 0 4px", fontSize: "1.05rem", color: "#0f172a" }}>
                            Installment Payment Schedule
                          </h4>
                          <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                            Authorized milestone payment schedule for this booking
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {!paymentPlan &&
                            userPermissions.canPaymentPlanCreate &&
                            (viewingBooking.status === "Pending" || viewingBooking.status === "Confirmed") && (
                              <button className="btn-primary" onClick={handleOpenCreatePlan}>
                                + Set Up Installment Plan
                              </button>
                            )}

                          {paymentPlan &&
                            paymentPlan.status === "Active" &&
                            userPermissions.canPaymentPlanEdit && (
                              <button className="btn-secondary" onClick={handleOpenEditPlan}>
                                Edit Plan
                              </button>
                            )}

                          {paymentPlan &&
                            paymentPlan.status === "Active" &&
                            userPermissions.canPaymentPlanCancel && (
                              <button
                                className="btn-danger"
                                onClick={handleOpenCancelPlanModal}
                                disabled={submitting}
                              >
                                Cancel Plan
                              </button>
                            )}
                        </div>
                      </div>

                      {loadingPlan && (
                        <div style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                          Loading payment plan and collection metrics...
                        </div>
                      )}

                      {planError && (
                        <div style={{ background: "#fee2e2", color: "#991b1b", padding: "12px", borderRadius: "8px", fontSize: "0.85rem" }}>
                          {planError}
                        </div>
                      )}

                      {!loadingPlan && !paymentPlan && (
                        <div
                          style={{
                            padding: "36px 20px",
                            textAlign: "center",
                            background: "rgba(6, 182, 212, 0.04)",
                            border: "1px dashed #cbd5e1",
                            borderRadius: "12px",
                          }}
                        >
                          <div style={{ fontSize: "2.2rem", marginBottom: "8px" }}>📋</div>
                          <h4 style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>No Payment Plan Configured Yet</h4>
                          <p style={{ margin: "0 auto 18px", color: "#64748b", fontSize: "0.85rem", maxWidth: "480px", lineHeight: 1.5 }}>
                            The buyer requested <strong>Installments</strong> upon booking creation. An authorized staff member can establish the formal milestone payment schedule.
                          </p>
                          {userPermissions.canPaymentPlanCreate && (viewingBooking.status === "Pending" || viewingBooking.status === "Confirmed") && (
                            <button className="btn-primary" onClick={handleOpenCreatePlan}>
                              + Set Up Installment Plan
                            </button>
                          )}
                        </div>
                      )}

                      {!loadingPlan && paymentPlan && (
                        <>
                          {/* Metric Stat Cards */}
                          {(() => {
                            const pendingOrUpcoming = paymentPlan.installments.filter(
                              (i) => i.status !== "Paid" && i.status !== "Cancelled"
                            );
                            const sortedNext = [...pendingOrUpcoming].sort(
                              (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
                            );
                            const nextInst = sortedNext[0];

                            return (
                              <div className="plan-summary-grid">
                                <div className="plan-stat-card">
                                  <h6>Plan Status</h6>
                                  <div className="value">
                                    <span
                                      className={`badge ${
                                        paymentPlan.status === "Active"
                                          ? "badge-confirmed"
                                          : paymentPlan.status === "Completed"
                                          ? "badge-completed"
                                          : "badge-cancelled"
                                      }`}
                                    >
                                      {paymentPlan.status}
                                    </span>
                                  </div>
                                </div>

                                <div className="plan-stat-card">
                                  <h6>Total Plan Amount</h6>
                                  <div className="value">
                                    {formatINR(
                                      collectionSummary
                                        ? collectionSummary.agreed_price
                                        : paymentPlan.total_amount
                                    )}
                                  </div>
                                </div>

                                <div className="plan-stat-card">
                                  <h6>Total Collected</h6>
                                  <div className="value collected">
                                    {formatINR(
                                      collectionSummary
                                        ? collectionSummary.net_collected
                                        : (paymentPlan.total_collected ?? 0)
                                    )}
                                  </div>
                                </div>

                                <div className="plan-stat-card">
                                  <h6>Outstanding Amount</h6>
                                  <div className="value outstanding">
                                    {formatINR(
                                      collectionSummary
                                        ? collectionSummary.outstanding_balance
                                        : (paymentPlan.total_outstanding ?? 0)
                                    )}
                                  </div>
                                </div>

                                <div className="plan-stat-card">
                                  <h6>Installments Count</h6>
                                  <div className="value">
                                    {paymentPlan.installments.length} Milestone{paymentPlan.installments.length === 1 ? "" : "s"}
                                  </div>
                                </div>

                                <div className="plan-stat-card">
                                  <h6>Next Due Date</h6>
                                  <div className="value" style={{ fontSize: nextInst ? "0.95rem" : "1.1rem" }}>
                                    {nextInst ? (
                                      <div>
                                        <span style={{ color: new Date(nextInst.due_date) < new Date() ? "#dc2626" : "inherit" }}>
                                          {new Date(nextInst.due_date).toLocaleDateString()}
                                        </span>
                                        <span style={{ display: "block", fontSize: "0.72rem", color: "#64748b", fontWeight: 500 }}>
                                          #{nextInst.sequence} {nextInst.name}
                                        </span>
                                      </div>
                                    ) : (
                                      <span style={{ color: "#10b981", fontSize: "0.9rem" }}>✓ All Completed</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Overdue alert if collection summary has overdue installments */}
                          {collectionSummary &&
                            (collectionSummary.installments || []).filter((i) => i.status === "Overdue").length > 0 && (
                            <div
                              style={{
                                background: "rgba(239,68,68,0.08)",
                                border: "1px solid #fecaca",
                                padding: "10px 14px",
                                borderRadius: "8px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: "0.85rem",
                                color: "#991b1b",
                              }}
                            >
                              <span>
                                ⚠ <strong>
                                  {(collectionSummary.installments || []).filter((i) => i.status === "Overdue").length} milestone(s)
                                </strong> are currently overdue.
                              </span>
                              <button
                                type="button"
                                className="btn-danger"
                                style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                                onClick={handleOpenOverdueModal}
                              >
                                View Overdue Report
                              </button>
                            </div>
                          )}

                          {/* Installments Schedule Table */}
                          <div className="installment-table-wrapper">
                            <table className="installment-table">
                              <thead>
                                <tr>
                                  <th style={{ width: "45px" }}>Seq</th>
                                  <th>Milestone Name</th>
                                  <th>Due Date</th>
                                  <th>Amount</th>
                                  <th>Amount Collected</th>
                                  <th>Outstanding Balance</th>
                                  <th>Payment Status</th>
                                  <th>Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {paymentPlan.installments.map((inst) => {
                                  const collected = Number(inst.net_collected ?? inst.total_verified ?? 0);
                                  const remaining =
                                    inst.outstanding_balance !== undefined
                                      ? Number(inst.outstanding_balance)
                                      : Math.max(0, Number(inst.amount) - collected);
                                  const statusClass = inst.status.toLowerCase().replace(" ", "_");

                                  return (
                                    <tr key={inst.id}>
                                      <td><strong>{inst.sequence}</strong></td>
                                      <td>
                                        <strong>{inst.name}</strong>
                                      </td>
                                      <td>
                                        {new Date(inst.due_date).toLocaleDateString()}
                                      </td>
                                      <td>{formatINR(inst.amount)}</td>
                                      <td style={{ color: collected > 0 ? "#10b981" : "#64748b" }}>
                                        {formatINR(collected)}
                                      </td>
                                      <td style={{ color: remaining > 0 ? "#f59e0b" : "#64748b", fontWeight: remaining > 0 ? 600 : 400 }}>
                                        {formatINR(remaining)}
                                      </td>
                                      <td>
                                        <span className={`inst-badge ${statusClass}`}>
                                          {inst.status}
                                        </span>
                                      </td>
                                      <td style={{ fontSize: "0.8rem", color: "#64748b" }}>
                                        {inst.notes || "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {paymentPlan.notes && (
                            <div
                              style={{
                                fontSize: "0.85rem",
                                color: "#64748b",
                                background: "rgba(100,116,139,0.05)",
                                padding: "8px 12px",
                                borderRadius: "6px",
                              }}
                            >
                              <strong>Plan Notes:</strong> {paymentPlan.notes}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
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

                {/* Optional link to payment plan installment milestone */}
                {paymentPlan && paymentPlan.status === "Active" && paymentPlan.installments.length > 0 && (
                  <div className="form-group">
                    <label>Link to Installment Milestone (Optional)</label>
                    <select
                      value={selectedPaymentInstallmentId}
                      onChange={(e) => setSelectedPaymentInstallmentId(e.target.value)}
                    >
                      <option value="">-- General Payment / Unallocated --</option>
                      {paymentPlan.installments
                        .filter((inst) => inst.status !== "Paid" && inst.status !== "Cancelled")
                        .map((inst) => {
                          const rem =
                            inst.outstanding_balance !== undefined
                              ? Number(inst.outstanding_balance)
                              : Math.max(
                                  0,
                                  Number(inst.amount) -
                                    Number(inst.net_collected ?? inst.total_verified ?? 0)
                                );
                          return (
                            <option key={inst.id} value={inst.id}>
                              #{inst.sequence} {inst.name} - Due {new Date(inst.due_date).toLocaleDateString()} ({formatINR(rem)} due)
                            </option>
                          );
                        })}
                    </select>
                  </div>
                )}

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

      {/* ─── Create / Edit Payment Plan Modal ─── */}
      {isPlanModalOpen && viewingBooking && (
        <div className="modal-overlay" onClick={() => setIsPlanModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: "780px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{isEditingPlan ? "Edit Installment Payment Plan" : "Create Installment Payment Plan"}</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  Buyer: <strong>{viewingBooking.buyer_name}</strong> • Agreed Price: <strong>{formatINR(viewingBooking.agreed_price)}</strong>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setIsPlanModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSavePlan} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
                {planFormError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
                    {planFormError}
                  </div>
                )}

                {/* Buyer request notes reminder if available */}
                {viewingBooking.installment_request_notes && (
                  <div className="installment-request-banner" style={{ marginBottom: "14px" }}>
                    <span className="banner-title">Buyer's Requested Notes:</span>
                    <p className="banner-text">"{viewingBooking.installment_request_notes}"</p>
                  </div>
                )}

                {/* Quick Split Distribution Buttons */}
                <div className="quick-split-bar">
                  <span className="quick-split-label">Quick Distribute Total:</span>
                  {[2, 3, 4, 6, 12].map((parts) => (
                    <button
                      key={parts}
                      type="button"
                      className="btn-quick-split"
                      onClick={() => handleAutoSplit(parts)}
                    >
                      {parts}x Split
                    </button>
                  ))}
                </div>

                {/* Milestones List */}
                <div style={{ marginTop: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <label style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem" }}>
                      Installment Milestones ({planInstallments.length}) *
                    </label>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                      onClick={handleAddInstallmentRow}
                    >
                      + Add Milestone
                    </button>
                  </div>

                  <div className="installment-table-wrapper" style={{ maxHeight: "300px", overflowY: "auto" }}>
                    <table className="installment-table">
                      <thead>
                        <tr>
                          <th style={{ width: "60px" }}>Seq</th>
                          <th>Milestone Name *</th>
                          <th style={{ width: "140px" }}>Amount (₹) *</th>
                          <th style={{ width: "140px" }}>Due Date *</th>
                          <th>Notes</th>
                          <th style={{ width: "50px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {planInstallments.map((inst, index) => (
                          <tr key={index}>
                            <td>
                              <input
                                type="number"
                                min="1"
                                value={inst.sequence}
                                onChange={(e) =>
                                  handleInstallmentFieldChange(index, "sequence", Number(e.target.value))
                                }
                                style={{ width: "50px", padding: "4px 6px", fontSize: "0.85rem" }}
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={inst.name}
                                placeholder="e.g. Foundation / 2nd Floor"
                                onChange={(e) =>
                                  handleInstallmentFieldChange(index, "name", e.target.value)
                                }
                                style={{ width: "100%", padding: "4px 8px", fontSize: "0.85rem" }}
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="1"
                                step="any"
                                value={inst.amount || ""}
                                placeholder="Amount"
                                onChange={(e) =>
                                  handleInstallmentFieldChange(index, "amount", Number(e.target.value))
                                }
                                style={{ width: "100%", padding: "4px 8px", fontSize: "0.85rem" }}
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                value={inst.due_date}
                                onChange={(e) =>
                                  handleInstallmentFieldChange(index, "due_date", e.target.value)
                                }
                                style={{ width: "100%", padding: "4px 6px", fontSize: "0.85rem" }}
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={inst.notes || ""}
                                placeholder="Optional notes"
                                onChange={(e) =>
                                  handleInstallmentFieldChange(index, "notes", e.target.value)
                                }
                                style={{ width: "100%", padding: "4px 8px", fontSize: "0.85rem" }}
                              />
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveInstallmentRow(index)}
                                disabled={planInstallments.length <= 1}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: planInstallments.length <= 1 ? "#cbd5e1" : "#ef4444",
                                  cursor: planInstallments.length <= 1 ? "not-allowed" : "pointer",
                                  fontSize: "1.1rem",
                                  padding: "0 4px",
                                }}
                                title="Remove row"
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Balance verification banner */}
                {(() => {
                  const agreedPrice = Number(viewingBooking.agreed_price) || 0;
                  const scheduledTotal = planInstallments.reduce(
                    (sum, item) => sum + (Number(item.amount) || 0),
                    0
                  );
                  const diff = Math.round((scheduledTotal - agreedPrice) * 100) / 100;
                  const isBalanced = Math.abs(diff) <= 0.05;

                  return (
                    <div className={`plan-balance-banner ${isBalanced ? "balanced" : "unbalanced"}`}>
                      <div>
                        <strong>Scheduled Total: {formatINR(scheduledTotal)}</strong>
                        <span style={{ margin: "0 8px" }}>|</span>
                        <span>Agreed Sale Price: {formatINR(agreedPrice)}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", marginTop: "4px" }}>
                        {isBalanced ? (
                          <span>✓ Plan total matches agreed sale price</span>
                        ) : diff > 0 ? (
                          <span>⚠ Total exceeds agreed price by {formatINR(diff)}</span>
                        ) : (
                          <span>⚠ Total is short of agreed price by {formatINR(Math.abs(diff))}</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Overall Plan Notes */}
                <div className="form-group" style={{ marginTop: "14px" }}>
                  <label>Overall Plan Terms / Notes</label>
                  <textarea
                    value={planNotes}
                    onChange={(e) => setPlanNotes(e.target.value)}
                    placeholder="e.g. Schedule approved as per construction milestones agreement..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsPlanModalOpen(false)}
                  disabled={planSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    planSubmitting ||
                    Math.abs(
                      planInstallments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) -
                        (Number(viewingBooking.agreed_price) || 0)
                    ) > 0.05
                  }
                >
                  {planSubmitting ? "Saving Plan..." : isEditingPlan ? "Update Payment Plan" : "Create Payment Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Cancel Payment Plan Confirmation Modal ─── */}
      {isCancelPlanModalOpen && viewingBooking && paymentPlan && (
        <div className="modal-overlay" onClick={() => setIsCancelPlanModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: "#dc2626" }}>Cancel Payment Plan</h2>
              <button className="modal-close-btn" onClick={() => setIsCancelPlanModalOpen(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.5 }}>
                Are you sure you want to cancel the active installment payment plan for <strong>{viewingBooking.buyer_name}</strong>?
              </p>
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "12px", fontSize: "0.85rem", color: "#991b1b" }}>
                <strong>Important Note:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
                  <li>The milestone payment schedule will be marked as <strong>Cancelled</strong>.</li>
                  <li>Existing payment transactions and receipts will <strong>not</strong> be deleted or reversed.</li>
                  <li>Future installment milestones will be deactivated.</li>
                </ul>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsCancelPlanModalOpen(false)}
                disabled={submitting}
              >
                Keep Plan
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmCancelPlan}
                disabled={submitting}
              >
                {submitting ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Overdue Collections Modal ─── */}
      {isOverdueModalOpen && (
        <div className="modal-overlay" onClick={() => setIsOverdueModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: "860px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Overdue Installments & Collections</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  Active payment plan milestones with overdue pending balances
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setIsOverdueModalOpen(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {loadingOverdue ? (
                <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                  Loading overdue collections...
                </div>
              ) : overdueInstallments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", color: "#10b981", fontWeight: 600 }}>
                  ✓ No overdue installments! All collections are up to date.
                </div>
              ) : (
                <div className="installment-table-wrapper">
                  <table className="installment-table">
                    <thead>
                      <tr>
                        <th>Buyer</th>
                        <th>Milestone</th>
                        <th>Due Date</th>
                        <th>Milestone Amount</th>
                        <th>Paid</th>
                        <th>Outstanding</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdueInstallments.map((item: any, idx) => {
                        const targetBooking = bookings.find((b) => b.id === (item.booking_id || item.booking?.id));
                        const inst = item.installment;
                        const buyerName =
                          targetBooking?.buyer_name ||
                          item.booking?.buyer_name ||
                          `Booking #${String(item.booking_id || "").slice(0, 8)}`;
                        const buyerPhone =
                          targetBooking?.buyer_phone || item.booking?.buyer_phone;
                        const overdueKey = inst?.id || `overdue-${idx}`;
                        const rem =
                          inst?.outstanding_balance !== undefined
                            ? Number(inst.outstanding_balance)
                            : Math.max(
                                0,
                                Number(inst?.amount || 0) -
                                  Number(inst?.net_collected ?? inst?.total_verified ?? 0)
                              );

                        return (
                          <tr key={overdueKey}>
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
                                {inst?.due_date ? new Date(inst.due_date).toLocaleDateString() : "—"}
                              </span>
                            </td>
                            <td>{formatINR(inst?.amount)}</td>
                            <td>{formatINR(inst?.net_collected ?? inst?.total_verified ?? 0)}</td>
                            <td style={{ color: "#dc2626", fontWeight: 700 }}>
                              {formatINR(rem)}
                            </td>
                            <td>
                              {(targetBooking || item.booking_id) && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                                  onClick={() => {
                                    setIsOverdueModalOpen(false);
                                    if (targetBooking) {
                                      setViewingBooking(targetBooking);
                                    }
                                    setActiveDetailsTab("plan");
                                  }}
                                >
                                  View Plan
                                </button>
                              )}
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
              <button type="button" className="btn-secondary" onClick={() => setIsOverdueModalOpen(false)}>
                Close
              </button>
            </div>
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
