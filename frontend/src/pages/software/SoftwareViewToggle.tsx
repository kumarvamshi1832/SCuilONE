import React from "react";

export type SoftwareViewMode = "grid" | "table";

export interface SoftwareViewToggleProps {
  viewMode: SoftwareViewMode;
  onViewModeChange: (mode: SoftwareViewMode) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Reusable segmented Grid / Table view toggle for Software Company modules.
 * Supports Dark/Light themes, accessible keyboard interaction, and clean hover/focus states.
 */
export const SoftwareViewToggle: React.FC<SoftwareViewToggleProps> = ({
  viewMode,
  onViewModeChange,
  className = "",
  ariaLabel = "View layout toggle",
}) => {
  return (
    <div
      className={`sw-view-toggle ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={`sw-view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
        onClick={() => onViewModeChange("grid")}
        title="Grid View (Cards)"
        aria-pressed={viewMode === "grid"}
        aria-label="Switch to Grid View"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
        <span>Grid</span>
      </button>

      <button
        type="button"
        className={`sw-view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
        onClick={() => onViewModeChange("table")}
        title="Table View (List)"
        aria-pressed={viewMode === "table"}
        aria-label="Switch to Table View"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span>Table</span>
      </button>
    </div>
  );
};

export default SoftwareViewToggle;