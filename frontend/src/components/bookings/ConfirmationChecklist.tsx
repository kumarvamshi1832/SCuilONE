import type { ConfirmationCheck } from "../../utils/bookingPayments";
import "./BookingPayments.css";

interface ConfirmationChecklistProps {
  title: string;
  checks: ConfirmationCheck[];
  /** Short sentence under the title. */
  intro?: string;
}

/**
 * Lists the conditions the backend enforces before a booking can be confirmed, with what is still missing.
 * Confirmation itself is always performed by the backend (staff action); this only explains the state.
 */
export default function ConfirmationChecklist({ title, checks, intro }: ConfirmationChecklistProps) {
  const open = checks.filter((c) => !c.met).length;
  return (
    <section className="pw-root pw-section" aria-label={title}>
      <h3>{title}</h3>
      {intro && <p className="pw-hint" style={{ margin: 0, fontSize: "0.82rem", color: "var(--pw-muted)" }}>{intro}</p>}
      <ul className="pw-checklist">
        {checks.map((c) => (
          <li key={c.key} className={c.met ? "met" : "unmet"}>
            <span className="pw-check-icon" aria-hidden="true">
              {c.met ? "✓" : "!"}
            </span>
            <span>
              <strong>{c.label}</strong>
              <span className="pw-visually-hidden"> — {c.met ? "done" : "not done"}</span>
              {!c.met && <span className="pw-hint">{c.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className={`pw-notice ${open === 0 ? "ok" : "warn"}`} role="status">
        {open === 0
          ? "All requirements are met."
          : `${open} requirement${open === 1 ? "" : "s"} still outstanding. Confirmation will be rejected until ${open === 1 ? "it is" : "they are"} completed.`}
      </div>
    </section>
  );
}
