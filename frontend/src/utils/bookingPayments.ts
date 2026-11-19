import { sumCents, toCents } from "./money";

/**
 * Booking payment rules, mirrored from the backend so the UI can warn early. The backend remains the authority:
 * every limit here is re-checked there and its message is shown when it disagrees.
 *
 *  - routes/payments.py (staff):   payable cap = booking_amount while the booking is Pending, agreed_price once
 *                                  Confirmed. Available = cap - (Pending + Verified payments) + processed refunds.
 *  - customer_booking_journey.py:  same cap, keyed on the request status (Approved = token phase,
 *                                  Confirmed = balance phase). Instalment payments only after confirmation.
 *  - payment_plans.py:             plan total must equal agreed_price - net verified received (the token is part
 *                                  of the agreed price, never a separate instalment).
 *  - Payment statuses are exactly Pending, Verified, Rejected. Only Verified counts as paid.
 */

export interface PaymentLike {
  id: string;
  amount: string | number;
  status: string;
  installment_id?: string | null;
}

export interface PaymentTotals {
  verifiedCents: number;
  pendingCents: number;
  rejectedCents: number;
  pendingCount: number;
}

export const totalsByStatus = (payments: readonly PaymentLike[]): PaymentTotals => {
  const by = (status: string) => payments.filter((p) => p.status === status);
  return {
    verifiedCents: sumCents(by("Verified").map((p) => p.amount)),
    pendingCents: sumCents(by("Pending").map((p) => p.amount)),
    rejectedCents: sumCents(by("Rejected").map((p) => p.amount)),
    pendingCount: by("Pending").length,
  };
};

/* ───────────────────────── staff side ───────────────────────── */

/** What the backend lets a booking collect right now. */
export const staffPayableCapCents = (
  bookingStatus: string,
  bookingAmount: string | number,
  agreedPrice: string | number
): number => toCents(bookingStatus === "Pending" ? bookingAmount : agreedPrice);

export interface StaffBalance {
  capCents: number;
  verifiedCents: number;
  pendingCents: number;
  refundedCents: number;
  /** The most a new payment may be right now (never negative). */
  availableCents: number;
}

export const staffBalance = (
  booking: { status: string; booking_amount: string | number; agreed_price: string | number },
  payments: readonly PaymentLike[],
  processedRefundsCents: number
): StaffBalance => {
  const totals = totalsByStatus(payments);
  const capCents = staffPayableCapCents(booking.status, booking.booking_amount, booking.agreed_price);
  return {
    capCents,
    verifiedCents: totals.verifiedCents,
    pendingCents: totals.pendingCents,
    refundedCents: processedRefundsCents,
    availableCents: Math.max(0, capCents - (totals.verifiedCents + totals.pendingCents) + processedRefundsCents),
  };
};

/** The amount a plan has to add up to: agreed price minus verified money already received (net of refunds). */
export const planTargetCents = (
  agreedPrice: string | number,
  verifiedCents: number,
  processedRefundsCents: number
): number => Math.max(0, toCents(agreedPrice) - Math.max(0, verifiedCents - processedRefundsCents));

/* ───────────────────────── customer side ───────────────────────── */

export type CustomerInstallmentStatus = "Paid" | "Partially Paid" | "Overdue" | "Due today" | "Upcoming";

const startOfToday = (now: Date): number => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

/** Parses the API's date-only string (YYYY-MM-DD) as a local calendar day. */
export const parseDueDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Display status of an instalment for the customer. The portal API gives only the stored status
 * (Pending / Partially Paid / Paid) and the due date, so "Overdue" and "Due today" are derived from the date the
 * same way the staff API derives Overdue (due date before today and not fully paid).
 */
export const customerInstallmentStatus = (
  inst: { status: string; due_date: string },
  now: Date = new Date()
): CustomerInstallmentStatus => {
  if ((inst.status || "").toLowerCase() === "paid") return "Paid";
  const due = parseDueDate(inst.due_date);
  if (due) {
    const today = startOfToday(now);
    if (due.getTime() < today) return "Overdue";
    if (due.getTime() === today) return "Due today";
  }
  return (inst.status || "").toLowerCase() === "partially paid" ? "Partially Paid" : "Upcoming";
};

export interface ScheduleInstallment {
  id: string;
  sequence: number;
  name: string;
  amount: string;
  due_date: string;
  status: string;
}

export interface CustomerPaymentSummary {
  priceCents: number;
  bookingAmountCents: number;
  paidCents: number;
  remainingCents: number;
  pendingCents: number;
  pendingCount: number;
  refundedCents: number;
  progressPercent: number;
  /** Token / booking amount settled by verified money (the token is part of the agreed price). */
  tokenPaidCents: number;
  installmentCount: number;
  installmentsPaid: number;
  installmentsRemaining: number;
  /** First instalment that is not fully paid, by sequence. */
  next: ScheduleInstallment | null;
  /** "booking" when the figures come from the portal booking endpoint, "request" when it was unavailable. */
  source: "booking" | "request";
}

interface SummaryInput {
  booking: {
    agreed_price?: string;
    booking_amount?: string;
    verified_paid_amount?: string;
    remaining_balance?: string;
    refunded_amount?: string;
    payments?: Array<{ amount: string; status: string }>;
    payment_plan?: { status: string; installments: ScheduleInstallment[] } | null;
  } | null;
  request: {
    agreed_price: string | null;
    booking_amount: string | null;
    payments: Array<{ amount: string; status: string }>;
  };
}

/**
 * Customer payment summary.
 *   Total paid  = verified payments only (net of processed refunds, as the backend reports it).
 *   Remaining   = agreed price - total paid.
 * Pending and rejected payments never count as paid. The booking amount is part of the agreed price, so it is not
 * added on top of the paid total (no double counting).
 */
export const customerPaymentSummary = ({ booking, request }: SummaryInput): CustomerPaymentSummary => {
  const payments = booking?.payments ?? request.payments;
  const totals = totalsByStatus(payments.map((p, i) => ({ id: String(i), amount: p.amount, status: p.status })));

  const priceCents = toCents(booking?.agreed_price ?? request.agreed_price);
  const bookingAmountCents = toCents(booking?.booking_amount ?? request.booking_amount);
  const refundedCents = toCents(booking?.refunded_amount);
  const paidCents = booking?.verified_paid_amount !== undefined
    ? toCents(booking.verified_paid_amount)
    : Math.max(0, totals.verifiedCents - refundedCents);
  const remainingCents = booking?.remaining_balance !== undefined
    ? toCents(booking.remaining_balance)
    : Math.max(0, priceCents - paidCents);

  const plan = booking?.payment_plan && booking.payment_plan.status === "Active" ? booking.payment_plan : null;
  const installments = [...(plan?.installments ?? [])].sort((a, b) => a.sequence - b.sequence);
  const paidCount = installments.filter((i) => (i.status || "").toLowerCase() === "paid").length;
  const next = installments.find((i) => (i.status || "").toLowerCase() !== "paid") ?? null;

  return {
    priceCents,
    bookingAmountCents,
    paidCents,
    remainingCents,
    pendingCents: totals.pendingCents,
    pendingCount: totals.pendingCount,
    refundedCents,
    progressPercent: priceCents > 0 ? Math.max(0, Math.min(100, Math.floor((paidCents / priceCents) * 100))) : 0,
    tokenPaidCents: Math.min(paidCents, bookingAmountCents),
    installmentCount: installments.length,
    installmentsPaid: paidCount,
    installmentsRemaining: installments.length - paidCount,
    next,
    source: booking ? "booking" : "request",
  };
};

/**
 * What the customer may pay right now, following customer_booking_journey.customer_submit_booking_payment.
 * `maxCents` is null when only the backend can tell (a part-paid instalment), so the form defers to its message.
 */
export interface CustomerPayability {
  allowed: boolean;
  /** Why payment is not possible (shown to the customer). */
  reason: string | null;
  /** "token" while the request is Approved, "balance" once Confirmed. */
  phase: "token" | "balance" | null;
  needsInstallment: boolean;
  maxCents: number | null;
}

export const customerPayability = (args: {
  requestStatus: string;
  holdExpired: boolean;
  buyerDetailsSubmitted: boolean;
  hasBooking: boolean;
  paymentPreference: string;
  /** null = could not be determined (portal booking endpoint failed). */
  planActive: boolean | null;
  summary: CustomerPaymentSummary;
}): CustomerPayability => {
  const no = (reason: string): CustomerPayability => ({ allowed: false, reason, phase: null, needsInstallment: false, maxCents: 0 });
  const { requestStatus, summary } = args;
  if (!args.hasBooking) return no("Payments open once your booking request is approved.");
  if (requestStatus !== "Approved" && requestStatus !== "Confirmed") {
    return no("Payments can be submitted while the booking is approved or confirmed.");
  }
  if (requestStatus === "Approved") {
    if (args.holdExpired) return no("The booking hold has expired. Contact our team before submitting payment.");
    if (!args.buyerDetailsSubmitted) return no("Submit your buyer and nominee details first — they are required before a booking payment.");
    const room = Math.max(0, summary.bookingAmountCents - summary.paidCents - summary.pendingCents);
    if (room <= 0) {
      return no(
        summary.pendingCount > 0
          ? "Your booking amount has been submitted and is awaiting verification by our finance team."
          : "The booking amount has been received. Our team will confirm your booking."
      );
    }
    return { allowed: true, reason: null, phase: "token", needsInstallment: false, maxCents: room };
  }
  // Confirmed
  if (args.paymentPreference === "Installments") {
    if (args.planActive === null) {
      return no("Your instalment schedule could not be loaded. Refresh the page to try again.");
    }
    if (!args.planActive) {
      return no("Your instalment schedule has not been created yet. Our team must create it before you can pay an instalment.");
    }
    return { allowed: true, reason: null, phase: "balance", needsInstallment: true, maxCents: null };
  }
  const room = Math.max(0, summary.priceCents - summary.paidCents - summary.pendingCents);
  if (room <= 0) {
    return no(summary.pendingCount > 0 ? "Your remaining balance has been submitted and is awaiting verification." : "Your booking is fully paid.");
  }
  return { allowed: true, reason: null, phase: "balance", needsInstallment: false, maxCents: room };
};

/* ───────────────────────── confirmation readiness ───────────────────────── */

export interface ConfirmationCheck {
  key: string;
  label: string;
  met: boolean;
  /** Plain-language next step when not met. */
  hint: string;
}

/**
 * The same conditions worded for the customer. Confirmation is performed by the sales team - the backend has no
 * customer-callable confirm endpoint - so this explains where the booking stands and what the customer can do.
 */
export const customerConfirmationSteps = (args: {
  requestStatus: string;
  holdExpired: boolean;
  buyerDetailsSubmitted: boolean;
  agreementStatus: string;
  verifiedNetCents: number;
  pendingCents: number;
  bookingAmountCents: number;
}): ConfirmationCheck[] => {
  const confirmed = args.requestStatus === "Confirmed";
  const acknowledged = args.agreementStatus === "Customer Acknowledged" || args.agreementStatus === "Verified";
  const paid = args.bookingAmountCents > 0 && args.verifiedNetCents >= args.bookingAmountCents;
  return [
    {
      key: "buyer",
      label: "Buyer and nominee details submitted",
      met: confirmed || args.buyerDetailsSubmitted,
      hint: "Fill in the Buyer & nominee details section above.",
    },
    {
      key: "ack",
      label: "Agreement reviewed and acknowledged by you",
      met: confirmed || acknowledged,
      hint:
        args.agreementStatus === "Prepared"
          ? "Read the agreement, then acknowledge it and upload your signed copy in the Agreement section."
          : "Our team has not prepared the agreement yet. You will be notified when it is ready.",
    },
    {
      key: "verified",
      label: "Signed agreement verified by our team",
      met: confirmed || args.agreementStatus === "Verified",
      hint:
        args.agreementStatus === "Customer Acknowledged"
          ? "Waiting for our team to verify your signed agreement."
          : args.agreementStatus === "Rejected"
          ? "Your signed copy was not accepted. Check the message from our team and upload it again."
          : "Completed after you acknowledge the agreement and upload the signed copy.",
    },
    {
      key: "payment",
      label: "Booking amount paid and verified",
      met: confirmed || paid,
      hint:
        args.pendingCents > 0
          ? "Your payment is awaiting verification by our finance team. It counts once verified."
          : "Submit the booking amount in the Payments section. It counts once our finance team verifies it.",
    },
    {
      key: "confirmed",
      label: "Booking confirmed by our team",
      met: confirmed,
      hint: args.holdExpired
        ? "Your booking hold has expired. Contact our team to extend it."
        : "Our team confirms the booking once every step above is complete. You do not need to press a button.",
    },
  ];
};

/**
 * The conditions the backend enforces before a portal booking can be confirmed (staff action):
 * active hold, buyer + nominee details submitted, signed agreement verified, and net verified payments
 * covering the booking amount (routes/bookings.py PATCH status=Confirmed and /final-confirm).
 */
export const confirmationChecks = (args: {
  holdActive: boolean;
  buyerDetailsSubmitted: boolean;
  agreementStatus: string;
  verifiedNetCents: number;
  bookingAmountCents: number;
}): ConfirmationCheck[] => [
  {
    key: "hold",
    label: "Booking hold is active",
    met: args.holdActive,
    hint: "The 48-hour hold has expired. Extend or re-approve the hold before confirming.",
  },
  {
    key: "buyer",
    label: "Buyer and nominee details submitted",
    met: args.buyerDetailsSubmitted,
    hint: "The customer must submit their buyer and nominee details in the Customer Portal.",
  },
  {
    key: "agreement",
    label: "Signed agreement verified",
    met: args.agreementStatus === "Verified",
    hint:
      args.agreementStatus === "Customer Acknowledged"
        ? "The customer acknowledged the agreement. Verify the signed copy they uploaded."
        : args.agreementStatus === "Prepared"
        ? "Waiting for the customer to acknowledge the agreement and upload the signed copy."
        : "Prepare the agreement for the customer, then verify the signed copy.",
  },
  {
    key: "payment",
    label: "Booking amount received and verified",
    met: args.verifiedNetCents >= args.bookingAmountCents && args.bookingAmountCents > 0,
    hint: "Verify the booking-amount payment first. Pending payments do not count until verified.",
  },
];
