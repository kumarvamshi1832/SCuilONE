import { useMemo } from "react";
import type { Payment } from "../../types/payment";
import type { PaymentPlan } from "../../types/paymentPlan";
import { staffBalance } from "../../utils/bookingPayments";
import { formatInrCents, toCents } from "../../utils/money";
import "./BookingPayments.css";

interface StaffPaymentOverviewProps {
  booking: { status: string; booking_amount: string | number; agreed_price: string | number; payment_preference?: string };
  payments: readonly Payment[];
  refundedCents: number;
  plan: PaymentPlan | null;
}

/**
 * Staff-side payment position of one booking, with "recorded" (Pending) kept visibly apart from "verified".
 * Everything is derived from the payment list and plan the API returned.
 */
export default function StaffPaymentOverview({ booking, payments, refundedCents, plan }: StaffPaymentOverviewProps) {
  const bal = useMemo(() => staffBalance(booking, payments, refundedCents), [booking, payments, refundedCents]);
  const tokenCents = toCents(booking.booking_amount);
  const netVerified = Math.max(0, bal.verifiedCents - bal.refundedCents);
  const tokenPaid = Math.min(netVerified, tokenCents);
  const tokenStatus =
    tokenCents === 0
      ? "Not required"
      : tokenPaid >= tokenCents
      ? "Received & verified"
      : bal.pendingCents > 0
      ? "Awaiting verification"
      : "Not received";
  const installments = plan && plan.status === "Active" ? plan.installments : [];
  const paidInstallments = installments.filter((i) => i.status === "Paid").length;

  return (
    <section className="pw-root pw-section" aria-label="Booking payment position" style={{ marginBottom: 16 }}>
      <div className="pw-cards">
        <div className="pw-card">
          <div className="pw-card-label">Booking / token amount</div>
          <div className="pw-card-value">{formatInrCents(tokenCents)}</div>
          <div className="pw-card-note">{tokenStatus} · part of the agreed price</div>
        </div>
        <div className={`pw-card ${bal.pendingCents > 0 ? "warn" : ""}`}>
          <div className="pw-card-label">Awaiting verification</div>
          <div className="pw-card-value">{formatInrCents(bal.pendingCents)}</div>
          <div className="pw-card-note">Recorded, not yet counted as paid</div>
        </div>
        <div className="pw-card good">
          <div className="pw-card-label">Verified (net)</div>
          <div className="pw-card-value">{formatInrCents(netVerified)}</div>
          <div className="pw-card-note">Counted as paid</div>
        </div>
        <div className="pw-card">
          <div className="pw-card-label">Can be recorded now</div>
          <div className="pw-card-value">{formatInrCents(bal.availableCents)}</div>
          <div className="pw-card-note">{booking.status === "Pending" ? "Capped at the booking amount until confirmed" : "Capped at the agreed price"}</div>
        </div>
        {installments.length > 0 && (
          <div className="pw-card">
            <div className="pw-card-label">Instalments</div>
            <div className="pw-card-value">{paidInstallments} / {installments.length}</div>
            <div className="pw-card-note">{installments.length - paidInstallments} remaining</div>
          </div>
        )}
      </div>
    </section>
  );
}
