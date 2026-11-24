import { formatInrCents, toCents } from "./money";
import type { BookingRequestDetail, StaffHandover } from "../types/customerBookingJourney";

/**
 * What must be true before a property handover can be marked Completed. These mirror, in order, the checks the server
 * performs on PATCH /customer-booking-workflow/handovers/{id} with status "Completed"; the server stays the authority.
 * This only tells the user which one is outstanding instead of a single generic error.
 *
 *   1. payment      - verified payments cover the agreed price (pending / rejected payments never count)
 *   2. sale         - the sale was completed: booking status "Completed" (done with "Complete sale" on the Bookings
 *                     page, which also marks the property Sold). Full payment alone does NOT do this.
 *   3. acknowledged - the customer acknowledged possession in the portal (Portal handover), or staff recorded the walk-in
 *                     customer's acknowledgement (Walk-in handover; the customer's own acknowledgement also counts)
 *   4. checklist    - every handover checklist item is ticked
 */
export interface HandoverCheck {
  key: "payment" | "sale" | "acknowledged" | "checklist";
  label: string;
  met: boolean;
  /** Exact reason when not met; short confirmation when met. */
  detail: string;
}

export interface HandoverEligibility {
  checks: HandoverCheck[];
  /** True only when every condition is met. */
  ready: boolean;
  /** The first outstanding condition, in the server's order. */
  firstPending: HandoverCheck | null;
  /** Fully verified payment, regardless of the other conditions. */
  paymentComplete: boolean;
}

/** What the eligibility rules read from a booking: a booking request detail, or a staff (walk-in) booking adapted to the same shape. */
export type HandoverBookingContext = Pick<BookingRequestDetail, "payments" | "agreed_price" | "booking" | "status">;

export const evaluateHandoverEligibility = (
  detail: HandoverBookingContext,
  handover: Pick<StaffHandover, "customer_acknowledged_at" | "checklist"> & Partial<Pick<StaffHandover, "handover_mode" | "staff_acknowledged_at">>
): HandoverEligibility => {
  const agreed = toCents(detail.booking?.agreed_price ?? detail.agreed_price);
  const payments = detail.payments ?? [];
  const verified = payments.filter((p) => p.status === "Verified").reduce((sum, p) => sum + toCents(p.amount), 0);
  const awaiting = payments.filter((p) => p.status !== "Verified" && p.status !== "Rejected" && p.status !== "Failed");
  const awaitingCents = awaiting.reduce((sum, p) => sum + toCents(p.amount), 0);

  const paymentComplete = agreed > 0 && verified >= agreed;
  let paymentDetail: string;
  if (agreed <= 0) {
    paymentDetail = "The agreed price is not available, so payment cannot be confirmed.";
  } else if (paymentComplete) {
    paymentDetail = `Fully paid: ${formatInrCents(verified)} verified of ${formatInrCents(agreed)}.`;
  } else {
    paymentDetail = `${formatInrCents(verified)} verified of ${formatInrCents(agreed)} — ${formatInrCents(agreed - verified)} still outstanding.`;
    if (awaitingCents > 0) {
      paymentDetail += ` ${formatInrCents(awaitingCents)} is awaiting verification and is not counted yet.`;
    }
  }

  // The sale is complete when the booking (and the linked request) reached "Completed".
  const saleComplete = detail.booking?.status === "Completed" && detail.status === "Completed";
  const saleDetail = saleComplete
    ? "The sale is marked completed."
    : paymentComplete
    ? "Payment is fully verified, but the sale has not been marked completed yet. Use “Complete sale” on the booking in the Bookings page first (it needs the sale-complete permission); the handover can be completed afterwards."
    : "The sale can be marked completed only after the full price is verified.";

  const walkIn = handover.handover_mode === "Walk-in";
  const acknowledged = walkIn ? Boolean(handover.staff_acknowledged_at || handover.customer_acknowledged_at) : Boolean(handover.customer_acknowledged_at);
  const items = handover.checklist ?? [];
  const ticked = items.filter((i) => i.completed).length;
  const checklistDone = ticked === items.length;

  const checks: HandoverCheck[] = [
    { key: "payment", label: "Full payment verified", met: paymentComplete, detail: paymentDetail },
    { key: "sale", label: "Sale marked completed", met: saleComplete, detail: saleDetail },
    {
      key: "acknowledged",
      label: walkIn ? "Possession acknowledgement recorded" : "Customer acknowledged possession",
      met: acknowledged,
      detail: acknowledged
        ? walkIn
          ? "The walk-in customer's possession acknowledgement has been recorded."
          : "The customer has acknowledged possession."
        : walkIn
          ? "Record the walk-in customer's acknowledgement of possession (Record acknowledgement)."
          : "Waiting for the customer to confirm possession in their portal.",
    },
    {
      key: "checklist",
      label: "Handover checklist complete",
      met: checklistDone,
      detail: checklistDone ? `All ${items.length} checklist items are ticked.` : `${ticked} of ${items.length} checklist items are ticked — tick the remaining items.`,
    },
  ];
  const firstPending = checks.find((c) => !c.met) ?? null;
  return { checks, ready: firstPending === null, firstPending, paymentComplete };
};

/** Turns the server's generic completion error into the specific outstanding condition when it is known. */
export const explainHandoverCompletionError = (message: string, eligibility: HandoverEligibility): string => {
  if (!/fully paid and completed/i.test(message)) return message;
  if (eligibility.firstPending) return `${eligibility.firstPending.label}: ${eligibility.firstPending.detail}`;
  return "The server still reports the sale (booking status or property status) as not completed. Refresh the page and check the booking in the Bookings page.";
};

/**
 * Why a handover cannot be scheduled yet, or null when it can. Mirrors POST /customer-booking-workflow/bookings/{id}/handover:
 * the booking must be Completed (property Sold) with the whole agreed price verified, and - for a portal customer - the
 * agreement must be Verified. The server stays the authority; this only says which condition is missing.
 */
export const scheduleHandoverBlocker = (
  ctx: HandoverBookingContext & { booking_id?: string | null; agreement_status?: string | null },
  isPortalRequest: boolean
): string | null => {
  if (!ctx.booking_id) return "A handover needs a confirmed booking.";
  const check = evaluateHandoverEligibility(ctx, { customer_acknowledged_at: null, checklist: [] }).checks;
  const sale = check.find((c) => c.key === "sale");
  const payment = check.find((c) => c.key === "payment");
  if (sale && !sale.met) return `A handover can be scheduled only after the sale is completed and fully paid. ${sale.detail}`;
  if (payment && !payment.met) return `A handover can be scheduled only after the full agreed price is verified. ${payment.detail}`;
  if (isPortalRequest && ctx.agreement_status !== "Verified") return "The agreement must be verified before a handover can be scheduled.";
  return null;
};
