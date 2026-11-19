import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders a modal into the CRM `.dashboard-wrapper` (so the light/dark theme selectors still apply)
 * instead of inside another modal, whose transforms or overflow could clip a fixed overlay.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  const host = document.querySelector(".dashboard-wrapper") ?? document.body;
  return createPortal(children, host);
}
