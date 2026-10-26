import React, { useState, useRef } from "react";
import {
  DOCUMENT_CATEGORIES,
  MAX_DOCUMENT_FILE_SIZE,
  ALLOWED_DOCUMENT_EXTENSIONS,
  type DocumentItem,
} from "../../types/document";
import { uploadDocument } from "../../services/documentService";
import { formatFileSize, getFileIcon } from "./DocumentCard";

interface RelatedOption {
  id: string;
  name: string;
  subtitle?: string;
}

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (uploadedDoc: DocumentItem) => void;
  leads: RelatedOption[];
  contacts: RelatedOption[];
  accounts: RelatedOption[];
  deals: RelatedOption[];
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  leads,
  contacts,
  accounts,
  deals,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Contract");
  const [description, setDescription] = useState("");
  const [isConfidential, setIsConfidential] = useState(false);
  const [relatedType, setRelatedType] = useState<"lead" | "contact" | "account" | "deal">("lead");
  const [relatedId, setRelatedId] = useState("");

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const getOptionsForType = (): RelatedOption[] => {
    switch (relatedType) {
      case "lead":
        return leads;
      case "contact":
        return contacts;
      case "account":
        return accounts;
      case "deal":
        return deals;
      default:
        return [];
    }
  };

  const currentOptions = getOptionsForType();

  const handleFileValidation = (candidateFile: File): boolean => {
    setError(null);

    if (candidateFile.size > MAX_DOCUMENT_FILE_SIZE) {
      setError("File is too large. Maximum file size allowed is 5 MB.");
      return false;
    }

    if (candidateFile.size === 0) {
      setError("The selected file is empty. Please select a valid document.");
      return false;
    }

    const ext = `.${candidateFile.name.split(".").pop()?.toLowerCase()}`;
    if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
      setError(
        `Unsupported file type (${ext}). Allowed formats: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, JPG, PNG, WEBP.`
      );
      return false;
    }

    setFile(candidateFile);
    if (!title.trim()) {
      // Auto-populate title with filename (without extension)
      const baseName = candidateFile.name.replace(/\.[^/.]+$/, "");
      setTitle(baseName);
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileValidation(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileValidation(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    if (!title.trim()) {
      setError("Document title is required.");
      return;
    }

    if (!relatedId) {
      setError(`Please select a related ${relatedType} record.`);
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const response = await uploadDocument(
        {
          file,
          title: title.trim(),
          document_type: category,
          description: description.trim() || undefined,
          is_confidential: isConfidential,
          lead_id: relatedType === "lead" ? relatedId : undefined,
          contact_id: relatedType === "contact" ? relatedId : undefined,
          account_id: relatedType === "account" ? relatedId : undefined,
          deal_id: relatedType === "deal" ? relatedId : undefined,
        },
        (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        }
      );

      setUploadProgress(100);
      onSuccess(response.document);
      onClose();
    } catch (err: any) {
      console.error("Document upload error:", err);
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Document upload failed. Please try again.";
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setUploading(false);
    }
  };

  const fileMeta = file ? getFileIcon(file.name, file.type) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card doc-upload-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="header-text-group">
            <h3>Upload Document</h3>
            <p className="modal-subtitle">
              Upload business agreements, KYC, floor plans, or CRM attachments.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={uploading}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="doc-upload-form">
          <div className="modal-body">
            {error && <div className="doc-modal-error-banner">{error}</div>}

            {/* Drag & Drop Area */}
            {!file ? (
              <div
                className={`doc-dropzone ${isDragging ? "dragging" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp"
                />
                <div className="dropzone-icon-circle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="26" height="26">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div className="dropzone-text">
                  <span className="dropzone-primary">Click to select file</span> or drag & drop here
                </div>
                <div className="dropzone-hints">
                  PDF, DOCX, XLSX, CSV, TXT, Images • Max 5 MB
                </div>
              </div>
            ) : (
              <div className="doc-file-selected-box">
                <div className="file-preview-left">
                  <div className={`selected-file-icon ${fileMeta?.bgClass}`}>
                    {fileMeta?.iconSvg}
                  </div>
                  <div className="selected-file-details">
                    <span className="selected-name" title={file.name}>
                      {file.name}
                    </span>
                    <span className="selected-meta">
                      {formatFileSize(file.size)} • {fileMeta?.label}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="change-file-btn"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={uploading}
                >
                  Change File
                </button>
              </div>
            )}

            {/* Form Fields */}
            <div className="form-group" style={{ marginTop: "16px" }}>
              <label>Document Title *</label>
              <input
                type="text"
                placeholder="e.g. Purchase Agreement - Unit 402"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                disabled={uploading}
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label>Document Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={uploading}
                >
                  {DOCUMENT_CATEGORIES.filter((c) => c !== "All Types").map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Related Module *</label>
                <select
                  value={relatedType}
                  onChange={(e) => {
                    const nextType = e.target.value as "lead" | "contact" | "account" | "deal";
                    setRelatedType(nextType);
                    setRelatedId("");
                  }}
                  disabled={uploading}
                >
                  <option value="lead">Lead</option>
                  <option value="contact">Contact / Buyer</option>
                  <option value="account">Account / Builder</option>
                  <option value="deal">Deal</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>
                Select Related {relatedType.toUpperCase()} Record *
              </label>
              <select
                value={relatedId}
                onChange={(e) => setRelatedId(e.target.value)}
                required
                disabled={uploading}
              >
                <option value="">
                  {currentOptions.length === 0
                    ? `No ${relatedType}s found in system`
                    : `-- Choose ${relatedType} --`}
                </option>
                {currentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name} {opt.subtitle ? `(${opt.subtitle})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Description (Optional)</label>
              <textarea
                rows={2}
                placeholder="Brief notes about the document contents or context..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={uploading}
              />
            </div>

            <div className="form-checkbox-row">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={isConfidential}
                  onChange={(e) => setIsConfidential(e.target.checked)}
                  disabled={uploading}
                />
                <span className="checkbox-custom" />
                <span className="checkbox-label">
                  Mark as confidential (Restricts visibility to authorized personnel)
                </span>
              </label>
            </div>

            {uploading && (
              <div className="upload-progress-container">
                <div className="progress-label-row">
                  <span>Uploading document...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-submit"
              disabled={uploading || !file || !title.trim() || !relatedId}
            >
              {uploading ? "Uploading..." : "Upload Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
