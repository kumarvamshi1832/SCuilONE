import { useId } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import "./CrmFormModal.css";

interface CrmFormModalProps {
  title: string;
  description?: string;
  /** Called for the close button and a click on the backdrop. */
  onClose: () => void;
  /** Disables the close button (e.g. while a request is in flight). */
  closeDisabled?: boolean;
  /** Footer actions (Cancel / Save). The footer stays pinned while the body scrolls. */
  footer: ReactNode;
  children: ReactNode;
}

/**
 * Shared Create/Edit modal shell: fixed header, scrollable body, fixed footer.
 * Styles are scoped under `.crm-modal` so they cannot collide with the many
 * page-level `.modal-*` / `.form-group` rules defined elsewhere in the app.
 */
export default function CrmFormModal({
  title,
  description,
  onClose,
  closeDisabled = false,
  footer,
  children,
}: CrmFormModalProps) {
  useBodyScrollLock();
  const titleId = useId();

  // Rendered into document.body so no transformed / clipped ancestor in the dashboard layout can
  // change what `position: fixed` is relative to (the modal must always sit in the viewport).
  return createPortal(
    <div className="crm-modal-overlay" onClick={onClose}>
      <div
        className="crm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="crm-modal-header">
          <div className="crm-modal-heading">
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="crm-modal-close"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="crm-modal-body">{children}</div>

        <footer className="crm-modal-footer">{footer}</footer>
      </div>
    </div>,
    document.body
  );
}
