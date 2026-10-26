import React, { useEffect, useState } from "react";
import type { DocumentItem } from "../../types/document";
import { downloadDocument } from "../../services/documentService";
import { formatFileSize, getFileIcon } from "./DocumentCard";
import { resolveImageUrl } from "../../utils/imageUrl";

interface DocumentPreviewModalProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
  parentLabel?: string;
  uploaderName?: string;
  onDownload: (doc: DocumentItem) => void;
  canDelete?: boolean;
  onDelete?: (doc: DocumentItem) => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  document: doc,
  isOpen,
  onClose,
  parentLabel,
  uploaderName,
  onDownload,
  canDelete,
  onDelete,
}) => {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "details">("preview");

  useEffect(() => {
    if (isOpen && doc) {
      setActiveTab("preview");
      if (doc.download_url || doc.file_url) {
        setDownloadUrl(resolveImageUrl(doc.download_url || doc.file_url));
      } else {
        setLoadingUrl(true);
        downloadDocument(doc.id)
          .then((res) => {
            setDownloadUrl(resolveImageUrl(res.download_url));
          })
          .catch((err) => {
            console.error("Failed to fetch download url:", err);
          })
          .finally(() => {
            setLoadingUrl(false);
          });
      }
    } else {
      setDownloadUrl(null);
    }
  }, [isOpen, doc]);

  if (!isOpen || !doc) return null;

  const fileMeta = getFileIcon(doc.filename, doc.content_type);
  const ext = (doc.filename.split(".").pop() || "").toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
  const isPdf = ext === "pdf" || doc.content_type.includes("pdf");
  const isText = ["txt", "csv"].includes(ext);

  const formattedCreated = doc.created_at
    ? new Date(doc.created_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const formattedUpdated = doc.updated_at
    ? new Date(doc.updated_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="modal-overlay doc-preview-overlay" onClick={onClose}>
      <div
        className="modal-card doc-preview-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="preview-header-left">
            <div className={`preview-mini-icon ${fileMeta.bgClass}`}>
              {fileMeta.iconSvg}
            </div>
            <div>
              <h3 className="preview-title" title={doc.title}>
                {doc.title}
              </h3>
              <p className="preview-filename">{doc.filename}</p>
            </div>
          </div>

          <div className="preview-header-actions">
            <button
              type="button"
              className="btn-preview-download"
              onClick={() => onDownload(doc)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download</span>
            </button>

            {canDelete && onDelete && (
              <button
                type="button"
                className="btn-preview-delete"
                title="Delete document"
                onClick={() => {
                  onDelete(doc);
                  onClose();
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}

            <button type="button" className="modal-close-btn" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {/* View Switcher Tabs (Preview / Details) */}
        <div className="preview-tabs-bar">
          <button
            type="button"
            className={`preview-tab-btn ${activeTab === "preview" ? "active" : ""}`}
            onClick={() => setActiveTab("preview")}
          >
            File Preview
          </button>
          <button
            type="button"
            className={`preview-tab-btn ${activeTab === "details" ? "active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            Document Details & Audit
          </button>
        </div>

        {/* Main Content Area */}
        <div className="preview-modal-body">
          {activeTab === "preview" ? (
            <div className="file-preview-stage">
              {loadingUrl ? (
                <div className="preview-loading-spinner">
                  <div className="spinner" />
                  <p>Loading document preview...</p>
                </div>
              ) : downloadUrl ? (
                isImage ? (
                  <div className="preview-image-container">
                    <img
                      src={downloadUrl}
                      alt={doc.title}
                      className="preview-image-element"
                    />
                  </div>
                ) : isPdf ? (
                  <iframe
                    src={`${downloadUrl}#toolbar=1`}
                    title={doc.title}
                    className="preview-iframe-element"
                  />
                ) : isText ? (
                  <iframe
                    src={downloadUrl}
                    title={doc.title}
                    className="preview-text-iframe"
                  />
                ) : (
                  <div className="preview-unsupported-box">
                    <div className={`unsupported-icon-circle ${fileMeta.bgClass}`}>
                      {fileMeta.iconSvg}
                    </div>
                    <h4>In-browser preview is not available for this format</h4>
                    <p className="unsupported-hint">
                      This document is stored securely in <strong>{fileMeta.label}</strong> format.
                      Click download below to view it using your system’s viewer.
                    </p>
                    <button
                      type="button"
                      className="btn-download-primary"
                      onClick={() => onDownload(doc)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download {doc.filename}
                    </button>
                  </div>
                )
              ) : (
                <div className="preview-unsupported-box">
                  <p>Preview URL is not available.</p>
                  <button
                    type="button"
                    className="btn-download-primary"
                    onClick={() => onDownload(doc)}
                  >
                    Download File
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="doc-details-stage">
              <div className="details-spec-grid">
                <div className="details-spec-item">
                  <span className="label">Category / Type</span>
                  <span className="value">{doc.document_type || "Other"}</span>
                </div>

                <div className="details-spec-item">
                  <span className="label">File Size</span>
                  <span className="value">{formatFileSize(doc.file_size)}</span>
                </div>

                <div className="details-spec-item">
                  <span className="label">Content Type</span>
                  <span className="value">{doc.content_type || "application/octet-stream"}</span>
                </div>

                <div className="details-spec-item">
                  <span className="label">Security Classification</span>
                  <span className="value">
                    {doc.is_confidential ? (
                      <span className="tag-confidential">Confidential</span>
                    ) : (
                      <span className="tag-standard">Standard</span>
                    )}
                  </span>
                </div>

                <div className="details-spec-item">
                  <span className="label">Version</span>
                  <span className="value">v{doc.version_number || 1}</span>
                </div>

                <div className="details-spec-item">
                  <span className="label">Related CRM Record</span>
                  <span className="value">{parentLabel || "Not linked"}</span>
                </div>

                <div className="details-spec-item">
                  <span className="label">Uploaded By</span>
                  <span className="value">{uploaderName || "Authorized User"}</span>
                </div>

                <div className="details-spec-item">
                  <span className="label">Created Date</span>
                  <span className="value">{formattedCreated}</span>
                </div>

                {formattedUpdated && (
                  <div className="details-spec-item">
                    <span className="label">Last Modified</span>
                    <span className="value">{formattedUpdated}</span>
                  </div>
                )}
              </div>

              {doc.description && (
                <div className="details-description-box">
                  <h4 className="description-label">Description / Notes</h4>
                  <p className="description-text">{doc.description}</p>
                </div>
              )}

              <div className="details-address-box">
                <div className="address-label">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Storage & Verification Metadata
                </div>
                <div className="address-value" style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>
                  Record ID: {doc.id}
                  <br />
                  Tenant ID: {doc.tenant_id}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
