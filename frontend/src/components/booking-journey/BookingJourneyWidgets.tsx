import type { ReactNode } from "react";
import { buildBookingTimeline, statusTone } from "../../utils/bookingJourney";
import type { BookingRequestDetail } from "../../types/customerBookingJourney";
import "./BookingJourney.css";

/** Coloured pill for request, agreement and payment statuses. */
export function BookingStatusBadge({ status }: { status: string }) {
  return <span className={`bj-badge bj-${statusTone(status)}`}>{status}</span>;
}

const STATE_LABEL: Record<string, string> = {
  done: "Completed",
  current: "In progress",
  pending: "Not started",
  failed: "Stopped",
  skipped: "Not applicable",
};

const STATE_ICON: Record<string, string> = {
  done: "✓",
  current: "●",
  pending: "",
  failed: "✕",
  skipped: "–",
};

/** Vertical lifecycle timeline built from the backend state (see utils/bookingJourney.ts). */
export function BookingTimeline({
  detail,
  audience,
}: {
  detail: BookingRequestDetail;
  audience: "customer" | "staff";
}) {
  const steps = buildBookingTimeline(detail, audience);
  return (
    <ol className="bj-timeline" aria-label="Booking progress">
      {steps.map((step) => (
        <li key={step.key} className={`bj-step bj-step-${step.state}`}>
          <span className="bj-step-dot" aria-hidden="true">
            {STATE_ICON[step.state]}
          </span>
          <div className="bj-step-body">
            <span className="bj-step-label">
              {step.label}
              <span className="bj-sr-only"> — {STATE_LABEL[step.state]}</span>
            </span>
            {step.detail && <span className="bj-step-detail">{step.detail}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Label / value pair list used by both detail screens. */
export function BookingFacts({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="bj-facts">
      {items.map((item) => (
        <div className="bj-fact" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
