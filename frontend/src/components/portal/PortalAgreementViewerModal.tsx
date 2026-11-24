import React, { useState, useEffect, useRef } from "react";
import { resolveImageUrl } from "../../utils/imageUrl";
import { RentalStatusBadge } from "../rentals/RentalWidgets";
import { RentalAgreementDocument } from "../rentals/RentalAgreementDocument";
import {
  DownloadIcon,
  XIcon,
  RefreshIcon,
  ExternalLinkIcon,
  AlertTriangleIcon,
  FileTextIcon,
} from "../common/SupportPortalIcons";
import type { RentalAgreement } from "../../types/rental";
import "./PortalAgreementViewerModal.css";

interface PortalAgreementViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreementUrl: string | null;
  agreementNumber: string;
  propertyName?: string | null;
  agreementType?: string;
  status?: string;
  onDownload: () => void;
  isDownloading?: boolean;
  updatedAt?: string | null;
  agreement?: RentalAgreement;
}

export const PortalAgreementViewerModal: React.FC<PortalAgreementViewerModalProps> = ({
  isOpen,
  onClose,
  agreementUrl,
  agreementNumber,
  propertyName,
  agreementType = "Rental",
  status = "Pending Signature",
  onDownload,
  isDownloading = false,
  updatedAt,
  agreement,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFitWidth, setIsFitWidth] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [retryKey, setRetryKey] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"document" | "uploaded">("document");

  const containerRef = useRef<HTMLDivElement>(null);

  // Reset states whenever modal opens or document changes
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setHasError(false);
      setZoomLevel(100);
      setIsFitWidth(true);
      // Default to document view if agreement is provided, or uploaded if only url is provided
      setViewMode(agreement ? "document" : "uploaded");
    }
  }, [isOpen, agreementUrl, retryKey, agreement]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resolvedUrl = agreementUrl ? resolveImageUrl(agreementUrl) : null;

  const handleZoomIn = () => {
    setIsFitWidth(false);
    setZoomLevel((prev) => Math.min(200, prev + 25));
  };

  const handleZoomOut = () => {
    setIsFitWidth(false);
    setZoomLevel((prev) => Math.max(50, prev - 25));
  };

  const handleResetZoom = () => {
    setZoomLevel(100);
    setIsFitWidth(false);
  };

  const handleToggleFitWidth = () => {
    setIsFitWidth((prev) => !prev);
    if (!isFitWidth) {
      setZoomLevel(100);
    }
  };

  const handleRetry = () => {
    setIsLoading(true);
    setHasError(false);
    setRetryKey((k) => k + 1);
  };

  const handleOpenInNewTab = () => {
    if (resolvedUrl) {
      window.open(resolvedUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      className="cp-pdf-modal-overlay"
      role="presentation"
      onClick={onClose}
      aria-label="Rental agreement viewer overlay"
    >
      <div
        className="cp-pdf-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-pdf-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="cp-pdf-modal-header">
          <div className="cp-pdf-title-group">
            <div className="cp-pdf-icon-badge" aria-hidden="true">
              PDF
            </div>
            <div className="cp-pdf-header-meta">
              <h2 id="cp-pdf-title" className="cp-pdf-header-title">
                {agreementType} Agreement · #{agreementNumber}
              </h2>
              <div className="cp-pdf-header-sub">
                <span>{propertyName || "Rental Property"}</span>
                {status && (
                  <>
                    <span>•</span>
                    <RentalStatusBadge status={status} />
                  </>
                )}
                {updatedAt && (
                  <>
                    <span>•</span>
                    <span>Updated {updatedAt}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Controls Toolbar */}
          <div className="cp-pdf-toolbar">
            {agreement && resolvedUrl && (
              <div
                className="cp-pdf-viewmode-switch"
                style={{
                  display: "inline-flex",
                  gap: 4,
                  background: "rgba(100, 116, 139, 0.12)",
                  padding: 2,
                  borderRadius: 8,
                }}
              >
                <button
                  type="button"
                  className={`cp-pdf-fit-btn ${viewMode === "document" ? "active" : ""}`}
                  style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                  onClick={() => setViewMode("document")}
                >
                  Document View (A4)
                </button>
                <button
                  type="button"
                  className={`cp-pdf-fit-btn ${viewMode === "uploaded" ? "active" : ""}`}
                  style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                  onClick={() => setViewMode("uploaded")}
                >
                  Original PDF
                </button>
              </div>
            )}

            {viewMode === "uploaded" && resolvedUrl && !hasError && (
              <>
                <div className="cp-pdf-zoom-group" aria-label="Zoom controls">
                  <button
                    type="button"
                    className="cp-pdf-zoom-btn"
                    onClick={handleZoomOut}
                    disabled={zoomLevel <= 50}
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    -
                  </button>
                  <span className="cp-pdf-zoom-indicator">
                    {isFitWidth ? "Fit" : `${zoomLevel}%`}
                  </span>
                  <button
                    type="button"
                    className="cp-pdf-zoom-btn"
                    onClick={handleZoomIn}
                    disabled={zoomLevel >= 200}
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className={`cp-pdf-fit-btn ${isFitWidth ? "active" : ""}`}
                  onClick={handleToggleFitWidth}
                  title="Fit to width"
                >
                  Fit Width
                </button>

                {!isFitWidth && zoomLevel !== 100 && (
                  <button
                    type="button"
                    className="cp-pdf-fit-btn"
                    onClick={handleResetZoom}
                    title="Reset zoom to 100%"
                  >
                    100%
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              className="cp-pdf-action-btn download-btn"
              onClick={onDownload}
              disabled={isDownloading}
              title="Download agreement document"
            >
              <DownloadIcon size={14} />
              <span>{isDownloading ? "Downloading..." : "Download"}</span>
            </button>

            {resolvedUrl && viewMode === "uploaded" && (
              <button
                type="button"
                className="cp-pdf-fit-btn"
                onClick={handleOpenInNewTab}
                title="Open document in a new tab"
                aria-label="Open in new window"
              >
                <ExternalLinkIcon size={13} />
              </button>
            )}

            <button
              type="button"
              className="cp-pdf-close-btn"
              onClick={onClose}
              aria-label="Close PDF viewer"
              title="Close (Esc)"
            >
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body / PDF Canvas */}
        <div className="cp-pdf-viewer-body" ref={containerRef}>
          {agreement && (viewMode === "document" || !resolvedUrl) ? (
            <div
              className="cp-pdf-document-scroll"
              style={{
                width: "100%",
                height: "100%",
                overflowY: "auto",
                display: "flex",
                justifyContent: "center",
                padding: "20px 16px",
                boxSizing: "border-box",
              }}
            >
              <RentalAgreementDocument
                agreement={agreement}
                propertyName={propertyName}
                onDownloadPdf={onDownload}
                isDownloading={isDownloading}
              />
            </div>
          ) : (
            <>
              {/* Loading Indicator */}
              {isLoading && resolvedUrl && !hasError && (
                <div className="cp-pdf-loading-overlay">
                  <div className="cp-pdf-spinner" aria-hidden="true" />
                  <span>Loading agreement document...</span>
                </div>
              )}

              {/* No Agreement Uploaded State */}
              {!resolvedUrl && (
                <div className="cp-pdf-error-state" role="alert">
                  <div
                    className="cp-pdf-error-icon"
                    style={{ background: "rgba(245, 158, 11, 0.12)", color: "#D97706" }}
                  >
                    <FileTextIcon size={24} />
                  </div>
                  <h3>Agreement Document Not Available</h3>
                  <p>
                    Our team has not uploaded the signed or draft agreement PDF for this rental yet.
                    Once uploaded, you will be able to review all pages and download your copy here.
                  </p>
                  <button type="button" className="btn-secondary" onClick={onClose}>
                    Close Viewer
                  </button>
                </div>
              )}

              {/* Loading Failure State */}
              {resolvedUrl && hasError && (
                <div className="cp-pdf-error-state" role="alert">
                  <div className="cp-pdf-error-icon">
                    <AlertTriangleIcon size={24} />
                  </div>
                  <h3>Unable to Display PDF Preview</h3>
                  <p>
                    The document preview could not be loaded in the embedded viewer. This can occur due to
                    browser security policies, network interruption, or document permission restrictions.
                  </p>
                  <div className="cp-pdf-error-actions">
                    <button type="button" className="btn-secondary" onClick={handleRetry}>
                      <RefreshIcon size={14} />
                      <span>Retry Loading</span>
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleOpenInNewTab}>
                      <ExternalLinkIcon size={14} />
                      <span>Open in New Tab</span>
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={onDownload}
                      disabled={isDownloading}
                    >
                      <DownloadIcon size={14} />
                      <span>Download Original PDF</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Active PDF Viewer */}
              {resolvedUrl && !hasError && (
                <div
                  className="cp-pdf-stage-wrapper"
                  style={{
                    width: isFitWidth ? "100%" : `${zoomLevel}%`,
                    maxWidth: isFitWidth ? "100%" : "none",
                  }}
                >
                  <iframe
                    key={`pdf-${retryKey}-${resolvedUrl}`}
                    src={`${resolvedUrl}#view=FitH&toolbar=0`}
                    title={`Rental Agreement ${agreementNumber}`}
                    className="cp-pdf-iframe"
                    onLoad={() => setIsLoading(false)}
                    onError={() => {
                      setIsLoading(false);
                      setHasError(true);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="cp-pdf-modal-footer">
          <div>
            <span>Scroll vertically to read multi-page documents. Use the zoom controls above or download for offline access.</span>
          </div>
          <div className="cp-pdf-footer-actions">
            {resolvedUrl && (
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "6px 14px", fontSize: "0.825rem" }}
                onClick={onDownload}
                disabled={isDownloading}
              >
                <DownloadIcon size={14} />
                <span>{isDownloading ? "Downloading..." : "Download Original PDF"}</span>
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: "6px 14px", fontSize: "0.825rem" }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
