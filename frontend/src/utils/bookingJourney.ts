import type { BookingRequestDetail } from "../types/customerBookingJourney";

export const formatBookingMoney = (
  amount: string | number | null | undefined,
  currency = "INR"
): string => {
  if (amount === null || amount === undefined || amount === "") return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(num);
  } catch {
    return `${currency} ${num.toLocaleString()}`;
  }
};

/** The backend stores naive UTC timestamps; treat values without a zone as UTC. */
export const parseBackendDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatBookingDateTime = (value: string | null | undefined): string => {
  const date = parseBackendDate(value);
  return date
    ? date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
};

export const formatBookingDate = (value: string | null | undefined): string => {
  const date = parseBackendDate(value);
  return date ? date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
};

/** Human-readable time left on a hold, or null when there is no active hold. */
export const describeHold = (holdExpiresAt: string | null | undefined, status: string): string | null => {
  if (status !== "Approved") return null;
  const expiry = parseBackendDate(holdExpiresAt);
  if (!expiry) return null;
  const ms = expiry.getTime() - Date.now();
  if (ms <= 0) return "Hold expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`;
};

export const statusTone = (status: string): string => {
  const s = status.toLowerCase();
  if (s === "approved" || s === "verified" || s === "confirmed" || s === "completed") return "good";
  if (s === "requested" || s === "prepared" || s === "customer acknowledged" || s === "pending") return "info";
  if (s.startsWith("expired") || s === "not prepared") return "warn";
  if (s === "rejected" || s === "cancelled") return "bad";
  return "neutral";
};

export type TimelineState = "done" | "current" | "pending" | "failed" | "skipped";

export interface TimelineStep {
  key: string;
  label: string;
  state: TimelineState;
  detail?: string;
}

/**
 * Builds the lifecycle timeline strictly from fields the backend returns (request status, hold,
 * payment instructions, payments, agreement status/timestamps). Steps that do not apply to the
 * actual outcome (for example after a rejection) are not shown.
 */
/** Facts from other endpoints that extend the timeline. `undefined` = not loaded (the step is omitted, never guessed). */
export interface TimelineExtras {
  /** Instalment schedule of the booking: null = the booking has no active schedule. */
  schedule?: { total: number; paid: number } | null;
  /** Handover record: null = none scheduled yet. */
  handover?: { status: string; scheduled_at: string | null; completed_at: string | null } | null;
}

export const buildBookingTimeline = (
  d: BookingRequestDetail,
  audience: "customer" | "staff",
  extras: TimelineExtras = {}
): TimelineStep[] => {
  const status = d.status;
  const rejected = status === "Rejected";
  const expired = status.startsWith("Expired");
  const cancelled = status === "Cancelled";
  const confirmed = status === "Confirmed" || status === "Completed" || Boolean(d.final_confirmed_at);
  const approved = !["Requested", "Rejected"].includes(status) || Boolean(d.booking_id);
  const reviewLabel = audience === "customer" ? "Under review by our team" : "Staff review";

  const steps: TimelineStep[] = [
    { key: "visit", label: "Site visit completed", state: "done" },
    { key: "requested", label: "Booking requested", state: "done", detail: formatBookingDateTime(d.created_at) },
    {
      key: "review",
      label: reviewLabel,
      state: status === "Requested" ? "current" : "done",
      detail: status === "Requested" ? "Waiting for a decision" : undefined,
    },
  ];

  if (rejected) {
    steps.push({
      key: "rejected",
      label: "Booking request rejected",
      state: "failed",
      detail: d.customer_message || undefined,
    });
    return steps;
  }

  steps.push({
    key: "approved",
    label: "Booking approved",
    state: approved ? "done" : "pending",
    detail: approved && d.agreed_price ? `Agreed price ${formatBookingMoney(d.agreed_price)}` : undefined,
  });

  const holdText = describeHold(d.hold_expires_at, status);
  steps.push({
    key: "hold",
    label: expired ? "Booking hold expired" : "Hold active",
    state: expired ? "failed" : confirmed ? "done" : status === "Approved" ? "current" : "pending",
    detail: status === "Approved" ? holdText ?? undefined : status === "Expired - Payment Review" ? "Under payment review by staff" : undefined,
  });

  const inactive = expired || cancelled;
  const pendingOrSkipped = (done: boolean, current: boolean): TimelineState =>
    done ? "done" : inactive ? "skipped" : current ? "current" : "pending";

  const hasInstructions = Boolean(d.payment_instructions?.trim());
  const payments = d.payments ?? [];
  const submitted = payments.length > 0;
  const verifiedPayment = payments.some((p) => p.status === "Verified");

  steps.push(
    {
      key: "instructions",
      label: "Payment instructions provided",
      state: pendingOrSkipped(hasInstructions, approved && !hasInstructions),
    },
    {
      key: "payment-submitted",
      label: "Payment submitted",
      state: pendingOrSkipped(submitted, approved && hasInstructions && !submitted),
      detail: submitted ? `${payments.length} payment${payments.length === 1 ? "" : "s"}` : undefined,
    },
    {
      key: "payment-verified",
      label: "Payment verified",
      state: pendingOrSkipped(verifiedPayment, submitted && !verifiedPayment),
      detail: submitted && !verifiedPayment ? "Awaiting finance verification" : undefined,
    }
  );

  const agreement = d.agreement_status;
  const prepared = agreement !== "Not Prepared";
  const acknowledged = Boolean(d.agreement_acknowledged_at) || agreement === "Customer Acknowledged" || agreement === "Verified";
  steps.push(
    {
      key: "agreement-prepared",
      label: "Agreement prepared",
      state: pendingOrSkipped(prepared, approved && !prepared),
      detail: prepared && d.agreement_version ? `Version ${d.agreement_version}` : undefined,
    },
    {
      key: "agreement-acknowledged",
      label: "Customer acknowledged",
      state: pendingOrSkipped(acknowledged, agreement === "Prepared"),
      detail: d.agreement_acknowledged_at ? formatBookingDateTime(d.agreement_acknowledged_at) : undefined,
    },
    {
      key: "agreement-verified",
      label: "Agreement verified",
      state:
        agreement === "Verified"
          ? "done"
          : agreement === "Rejected"
          ? "failed"
          : inactive
          ? "skipped"
          : agreement === "Customer Acknowledged"
          ? "current"
          : "pending",
      detail: agreement === "Rejected" ? "Needs changes — see staff message" : undefined,
    }
  );

  steps.push({
    key: "confirmed",
    label: status === "Completed" ? "Booking completed" : cancelled ? "Booking cancelled" : "Booking confirmed",
    state: cancelled ? "failed" : confirmed ? "done" : inactive ? "skipped" : "pending",
    detail: d.final_confirmed_at
      ? `${formatBookingDateTime(d.final_confirmed_at)}${d.final_confirmed_by ? ` by ${d.final_confirmed_by.toLowerCase()}` : ""}`
      : undefined,
  });

  // Instalment schedule (only for bookings that chose instalments, and only once the schedule state is known).
  if (d.payment_preference === "Installments" && extras.schedule !== undefined) {
    const schedule = extras.schedule;
    const allPaid = Boolean(schedule && schedule.total > 0 && schedule.paid >= schedule.total);
    steps.push({
      key: "schedule",
      label: "Instalment schedule",
      state: allPaid ? "done" : inactive ? "skipped" : schedule ? "current" : confirmed ? "current" : "pending",
      detail: schedule
        ? `${schedule.paid} of ${schedule.total} instalments paid`
        : confirmed
        ? "Waiting for our team to create your schedule"
        : undefined,
    });
  }

  // Handover (only once the handover endpoint has answered).
  if (extras.handover !== undefined) {
    const h = extras.handover;
    steps.push({
      key: "handover",
      label: "Property handover",
      state: h?.status === "Completed" ? "done" : inactive ? "skipped" : h ? "current" : "pending",
      detail: h
        ? h.status === "Completed"
          ? `Completed ${formatBookingDateTime(h.completed_at)}`
          : `${h.status}${h.scheduled_at ? ` · ${formatBookingDateTime(h.scheduled_at)}` : ""}`
        : confirmed
        ? "Not scheduled yet"
        : undefined,
    });
  }

  return steps;
};
