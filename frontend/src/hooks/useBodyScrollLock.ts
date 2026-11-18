import { useEffect } from "react";

let activeLocks = 0;
let previousOverflow = "";
let previousPaddingRight = "";

/**
 * Prevents the page behind a modal from scrolling while the modal is mounted.
 * Reference-counted so stacked/nested modals restore the original state correctly.
 */
export function useBodyScrollLock(): void {
  useEffect(() => {
    const body = document.body;

    if (activeLocks === 0) {
      previousOverflow = body.style.overflow;
      previousPaddingRight = body.style.paddingRight;
      // Compensate for the disappearing scrollbar so the page does not shift sideways.
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${current + scrollbarWidth}px`;
      }
      body.style.overflow = "hidden";
    }
    activeLocks += 1;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) {
        body.style.overflow = previousOverflow;
        body.style.paddingRight = previousPaddingRight;
      }
    };
  }, []);
}