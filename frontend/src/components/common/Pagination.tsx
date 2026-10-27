import React, { useEffect } from "react";
import "./Pagination.css";

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (newPage: number) => void;
  entityName?: string;
  className?: string;
  showPageIndicator?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize = 10,
  onPageChange,
  entityName = "items",
  className = "",
  showPageIndicator = false,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  // If currentPage becomes invalid, automatically notify parent with the last valid page
  useEffect(() => {
    if (currentPage > totalPages && totalPages >= 1) {
      onPageChange(totalPages);
    } else if (currentPage < 1) {
      onPageChange(1);
    }
  }, [currentPage, totalPages, onPageChange]);

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  // Generate page numbers with ellipsis
  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (safePage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    }

    if (safePage >= totalPages - 3) {
      return [
        1,
        "...",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    }

    return [1, "...", safePage - 1, safePage, safePage + 1, "...", totalPages];
  };

  const pages = getPageNumbers();

  const handlePrev = () => {
    if (safePage > 1) {
      onPageChange(safePage - 1);
    }
  };

  const handleNext = () => {
    if (safePage < totalPages) {
      onPageChange(safePage + 1);
    }
  };

  if (totalItems === 0) {
    return null;
  }

  // Singular / plural entity label
  const entityLabel =
    totalItems === 1 && entityName.endsWith("s")
      ? entityName.slice(0, -1)
      : entityName;

  return (
    <div
      className={`pagination-container ${className}`.trim()}
      role="navigation"
      aria-label="Pagination"
    >
      <div className="pagination-info">
        Showing <strong>{startItem}–{endItem}</strong> of{" "}
        <strong>{totalItems}</strong> {entityLabel}
        {showPageIndicator && totalPages > 1 && (
          <span className="pagination-page-indicator">
            (Page {safePage} of {totalPages})
          </span>
        )}
      </div>

      <nav className="pagination-nav" aria-label="Pagination Navigation">
        <button
          type="button"
          className="pagination-btn pagination-prev"
          onClick={handlePrev}
          disabled={safePage <= 1}
          aria-label="Previous page"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Previous</span>
        </button>

        <div className="pagination-pages" role="group" aria-label="Page numbers">
          {pages.map((p, idx) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="pagination-ellipsis"
                  aria-hidden="true"
                >
                  …
                </span>
              );
            }

            const pageNum = Number(p);
            const isActive = pageNum === safePage;

            return (
              <button
                key={`page-${pageNum}`}
                type="button"
                className={`pagination-page-btn ${isActive ? "active" : ""}`}
                onClick={() => onPageChange(pageNum)}
                aria-label={
                  isActive
                    ? `Page ${pageNum}, current page`
                    : `Go to page ${pageNum}`
                }
                aria-current={isActive ? "page" : undefined}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="pagination-btn pagination-next"
          onClick={handleNext}
          disabled={safePage >= totalPages}
          aria-label="Next page"
        >
          <span>Next</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </nav>
    </div>
  );
};
