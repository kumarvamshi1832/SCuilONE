import React from "react";
import type { DocumentItem } from "../../types/document";

interface DocumentCardProps {
  document: DocumentItem;
  parentLabel?: string;
  uploaderName?: string;
  canDelete?: boolean;
  onPreview: (doc: DocumentItem) => void;
  onDownload: (doc: DocumentItem) => void;
  onDelete: (doc: DocumentItem) => void;
  onToggleShare?: (doc: DocumentItem) => void;
}

export const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export const getFileExtension = (filename?: string | null): string => {
  if (!filename || typeof filename !== "string") return "FILE";
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toUpperCase() : "FILE";
};

export const getFileIcon = (filename?: string | null, contentType?: string | null) => {
  const ext = getFileExtension(filename).toLowerCase();
  const type = String(contentType || "").toLowerCase();

  if (ext === "pdf" || type.includes("pdf")) {
    return {
      type: "pdf",
      label: "PDF",
      badgeClass: "badge-pdf",
      bgClass: "file-icon-pdf",
      iconSvg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 15h6M9 11h6" />
        </svg>
      ),
    };
  }

  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext) || type.includes("image")) {
    return {
      type: "image",
      label: ext.toUpperCase(),
      badgeClass: "badge-image",
      bgClass: "file-icon-image",
      iconSvg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ),
    };
  }

  if (["doc", "docx"].includes(ext) || type.includes("word") || type.includes("document")) {
    return {
      type: "word",
      label: "DOC",
      badgeClass: "badge-word",
      bgClass: "file-icon-word",
      iconSvg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    };
  }

  if (["xls", "xlsx", "csv"].includes(ext) || type.includes("sheet") || type.includes("csv")) {
    return {
      type: "excel",
      label: ext.toUpperCase(),
      badgeClass: "badge-excel",
      bgClass: "file-icon-excel",
      iconSvg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
          <line x1="12" y1="9" x2="12" y2="17" />
        </svg>
      ),
    };
  }

  return {
    type: "generic",
    label: ext.toUpperCase(),
    badgeClass: "badge-generic",
    bgClass: "file-icon-generic",
    iconSvg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  };
};

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document: doc,
  parentLabel,
  uploaderName,
  canDelete = true,
  onPreview,
  onDownload,
  onDelete,
  onToggleShare,
}) => {
  const safeFilename = doc?.filename || (doc as any)?.original_filename || (doc as any)?.name || "document.pdf";
  const fileMeta = getFileIcon(safeFilename, doc?.content_type);
  const formattedDate = doc?.created_at
    ? new Date(doc.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div className="document-card" onClick={() => onPreview(doc)}>
      <div className="document-card-header">
        <div className={`document-file-icon-box ${fileMeta.bgClass}`}>
          {fileMeta.iconSvg}
        </div>
        <div className="document-badge-row">
          <span className={`doc-format-badge ${fileMeta.badgeClass}`}>
            {fileMeta.label}
          </span>
          {doc?.is_confidential && (
            <span className="doc-confidential-badge" title="Confidential document">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Confidential
            </span>
          )}
          {doc?.shared_with_customer ? (
            <span
              className="doc-shared-badge"
              title="Shared with Customer Portal"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 7px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
              }}
            >
              ● Portal
            </span>
          ) : (
            <span
              className="doc-internal-badge"
              title="Internal CRM only"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 500,
                background: "rgba(100, 116, 139, 0.12)",
                color: "var(--text-muted, #94a3b8)",
              }}
            >
              Internal
            </span>
          )}
        </div>
      </div>

      <div className="document-card-body">
        <h4 className="document-title" title={doc?.title || safeFilename}>
          {doc?.title || safeFilename}
        </h4>
        <p className="document-filename" title={safeFilename}>
          {safeFilename}
        </p>

        <div className="document-metadata-grid">
          <div className="meta-item">
            <span className="meta-label">Type</span>
            <span className="meta-value">{doc.document_type || "Other"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Size</span>
            <span className="meta-value">{formatFileSize(doc.file_size)}</span>
          </div>
        </div>

        {parentLabel && (
          <div className="document-parent-tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span className="parent-text" title={parentLabel}>
              {parentLabel}
            </span>
          </div>
        )}
      </div>

      <div className="document-card-footer">
        <div className="uploader-info">
          <span className="uploader-name">{uploaderName || "Uploaded"}</span>
          <span className="upload-date">{formattedDate}</span>
        </div>

        <div className="document-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="doc-action-btn preview-btn"
            title="Preview Document"
            onClick={() => onPreview(doc)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>

          {onToggleShare && (
            <button
              type="button"
              className={`doc-action-btn share-btn ${doc.shared_with_customer ? "active-shared" : ""}`}
              title={
                doc.is_confidential
                  ? "Confidential documents cannot be shared with customer portal"
                  : !doc.account_id && !doc.contact_id
                  ? "Only documents linked to an Account or Contact can be shared with customer portal"
                  : doc.shared_with_customer
                  ? "Unshare from Customer Portal"
                  : "Share with Customer Portal"
              }
              disabled={doc.is_confidential || (!doc.account_id && !doc.contact_id)}
              onClick={() => onToggleShare(doc)}
              style={{
                opacity: doc.is_confidential || (!doc.account_id && !doc.contact_id) ? 0.4 : 1,
                cursor: doc.is_confidential || (!doc.account_id && !doc.contact_id) ? "not-allowed" : "pointer",
                color: doc.shared_with_customer ? "#10b981" : "inherit",
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
          )}

          <button
            type="button"
            className="doc-action-btn download-btn"
            title="Download Document"
            onClick={() => onDownload(doc)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          {canDelete && (
            <button
              type="button"
              className="doc-action-btn delete-btn"
              title="Delete Document"
              onClick={() => onDelete(doc)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
