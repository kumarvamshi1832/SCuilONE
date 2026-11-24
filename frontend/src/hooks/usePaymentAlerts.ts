import { useEffect, useRef } from "react";
import { emitPortalNotificationsChanged } from "../services/customerPortalNotificationService";
import { formatInr } from "../utils/money";
import type { BookingRequestDetail } from "../types/customerBookingJourney";

type Notify = (message: string, type?: "success" | "error") => void;

export interface PaymentAlertSnapshot {
  requestId: string;
  agreement: string;
  agreementVersion: number;
  payments: Map<string, string>;
}

export interface PaymentAlert {
  /** Announced at most once per page session. */
  key: string;
  message: string;
  type: "success" | "error";
}

export const snapshotOf = (detail: BookingRequestDetail): PaymentAlertSnapshot => ({
  requestId: detail.id,
  agreement: detail.agreement_status,
  agreementVersion: detail.agreement_version,
  payments: new Map((detail.payments ?? []).map((p) => [p.id, p.status])),
});

/**
 * Pure comparison of two consecutive backend snapshots of the same request. Returns what changed:
 *   agreement -> Verified          "payment is now available"
 *   agreement -> Rejected          "needs changes"
 *   payment   -> Verified          "payment verified"
 *   payment   -> Rejected/Failed   "payment rejected"
 * A payment that was not in the earlier snapshot (the customer's own new submission, or one a staff member
 * recorded) is deliberately not announced here: submissions are confirmed by the form itself.
 */
export function detectPaymentAlerts(before: PaymentAlertSnapshot, detail: BookingRequestDetail): PaymentAlert[] {
  const current = snapshotOf(detail);
  if (before.requestId !== current.requestId) return [];
  const alerts: PaymentAlert[] = [];

  if (before.agreement !== current.agreement) {
    if (current.agreement === "Verified") {
      alerts.push({
        key: `agreement:${current.requestId}:${current.agreementVersion}:Verified`,
        message: "Your signed agreement was verified. Payment is now available.",
        type: "success",
      });
    } else if (current.agreement === "Rejected") {
      alerts.push({
        key: `agreement:${current.requestId}:${current.agreementVersion}:Rejected`,
        message: "Your agreement needs changes. Please contact our team.",
        type: "error",
      });
    }
  }

  for (const payment of detail.payments ?? []) {
    const was = before.payments.get(payment.id);
    if (was === undefined || was === payment.status) continue;
    const amount = formatInr(payment.amount);
    if (payment.status === "Verified") {
      alerts.push({ key: `payment:${payment.id}:Verified`, message: `Your payment of ${amount} was verified.`, type: "success" });
    } else if (payment.status === "Rejected" || payment.status === "Failed") {
      alerts.push({
        key: `payment:${payment.id}:${payment.status}`,
        message: `Your payment of ${amount} was ${payment.status === "Rejected" ? "rejected" : "not completed"}. Please review it or contact our team.`,
        type: "error",
      });
    }
  }
  return alerts;
}

/**
 * Tells the customer, in the page, when the BACKEND moves the agreement or one of their payments to a new state
 * while they are looking at the booking (the page re-fetches every minute and when the tab regains focus).
 *
 * The backend also writes a persistent notification for each of these (shown in the notification bell and page);
 * this only adds the immediate in-page message and asks the bell to refetch. Nothing is stored on the client.
 *
 * De-duplication: a transition is announced only when two consecutive snapshots differ, and each key is announced at
 * most once per page session. The first snapshot after opening the page is never announced - the persistent
 * notification already covers anything that happened while the customer was away.
 */
export function usePaymentAlerts(detail: BookingRequestDetail | null, notify: Notify): void {
  const previous = useRef<PaymentAlertSnapshot | null>(null);
  const announced = useRef<Set<string>>(new Set());
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if (!detail) return;
    const before = previous.current;
    previous.current = snapshotOf(detail);
    if (!before) return;

    let announcedAny = false;
    for (const alert of detectPaymentAlerts(before, detail)) {
      if (announced.current.has(alert.key)) continue;
      announced.current.add(alert.key);
      notifyRef.current(alert.message, alert.type);
      announcedAny = true;
    }
    if (announcedAny) emitPortalNotificationsChanged();
  }, [detail]);
}
