import React, { useState, useRef, type FormEvent, type ChangeEvent, type DragEvent } from "react";
import { uploadDocument, downloadDocument } from "../../services/documentService";
import { sendRentalAgreementForSignature, updateRentalAgreementDraft } from "../../services/rentalService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatFileSize } from "../documents/DocumentCard";
import { resolveImageUrl } from "../../utils/imageUrl";

interface StaffAgreementUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  customerName: string;
  contactId?: string | null;
  leadId?: string | null;
  existingUrl?: string | null;
  mode?: "send-for-signature" | "upload-only";
  onSuccess: (message: string) => void;
}

const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const StaffAgreementUploadModal: React.FC<StaffAgreementUploadModalProps> = ({
  isOpen,
  onClose,
  agreementId,
  customerName,
  contactId,
  leadId,
  existingUrl,
  mode = "send-for-signature",
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"upload" | "url">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customUrl, setCustomUrl] = useState<string>(existingUrl || "");
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const validateFile = (file: File): boolean => {
    setFileError(null);
    setApiError(null);

    const isPdfExt = file.name.toLowerCase().endsWith(".pdf");
    const isPdfType = file.type === "application/pdf" || file.type === "";

    if (!isPdfExt && !isPdfType) {
      setFileError("Only PDF documents (.pdf) are supported. Please select a valid PDF file.");
      return false;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      setFileError(`The selected file is too large (${formatFileSize(file.size)}). Maximum allowed size is 5 MB.`);
      return false;
    }

    if (file.size === 0) {
      setFileError("The selected file is empty. Please choose a valid PDF file.");
      return false;
    }

    return true;
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
      } else {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
      } else {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);

    let finalDocumentUrl = "";

    if (activeTab === "upload") {
      if (!selectedFile) {
        setFileError("Please select a PDF document to upload.");
        return;
      }

      setIsSubmitting(true);
      setUploadProgress(10);

      try {
        // Upload via existing document service
        const uploadRes = await uploadDocument(
          {
            file: selectedFile,
            title: `Rental Agreement - ${customerName}`,
            document_type: "Contract",
            description: `Rental agreement document for ${customerName} (Agreement #${agreementId.slice(0, 8).toUpperCase()})`,
            contact_id: contactId || undefined,
            lead_id: (!contactId && leadId) ? leadId : undefined,
            shared_with_customer: true,
            is_confidential: false,
          },
          (progressEvent: any) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(Math.min(95, percent));
            }
          }
        );

        // Fetch the resolved download/file URL
        if (uploadRes?.document?.id) {
          try {
            const dlMeta = await downloadDocument(uploadRes.document.id);
            finalDocumentUrl = dlMeta.download_url || uploadRes.document.file_url || "";
          } catch {
            finalDocumentUrl = uploadRes.document.file_url || "";
          }
        } else {
          finalDocumentUrl = uploadRes.document?.file_url || "";
        }

        if (!finalDocumentUrl) {
          throw new Error("Document uploaded but no accessible URL was returned.");
        }

        setUploadProgress(100);
      } catch (err: any) {
        setApiError(getApiErrorMessage(err, "Failed to upload the agreement document. Please check file format and try again."));
        setIsSubmitting(false);
        setUploadProgress(null);
        return;
      }
    } else {
      // Manual URL
      const trimmed = customUrl.trim();
      if (!trimmed) {
        setApiError("Please provide a valid document URL.");
        return;
      }
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("/")) {
        setApiError("URL must start with https://, http://, or /");
        return;
      }
      finalDocumentUrl = trimmed;
    }

    try {
      setIsSubmitting(true);
      if (mode === "send-for-signature") {
        await sendRentalAgreementForSignature(agreementId, finalDocumentUrl);
        onSuccess("Agreement document uploaded and sent to customer for signature.");
      } else {
        await updateRentalAgreementDraft(agreementId, { agreement_document_url: finalDocumentUrl });
        onSuccess("Agreement document attached successfully.");
      }
      onClose();
    } catch (err: any) {
      setApiError(getApiErrorMessage(err, "Could not attach the agreement document to this record."));
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="ins-modal-overlay" role="presentation" onClick={onClose}>
      <form
        className="ins-modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agreement-upload-modal-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
        style={{ maxWidth: 560 }}
      >
        <div className="ins-modal-header">
          <div>
            <h2 id="agreement-upload-modal-title" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
              {mode === "send-for-signature" ? "Send Agreement for Signature" : "Upload Agreement PDF"}
            </h2>
            <p className="text-muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
              {mode === "send-for-signature"
                ? "Attach the rental agreement PDF for customer review and signature in their portal."
                : "Attach or replace the rental agreement PDF for this draft."}
            </p>
          </div>
          <button type="button" className="ins-btn-icon" onClick={onClose} aria-label="Close" disabled={isSubmitting}>
            ✕
          </button>
        </div>

        <div className="ins-modal-body" style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {apiError && (
            <div className="ins-alert error" role="alert" style={{ marginBottom: 4 }}>
              <span>{apiError}</span>
            </div>
          )}

          {/* Mode Switcher Tabs */}
          <div style={{ display: "flex", gap: 8, borderBottom: "1px solid rgba(148, 163, 184, 0.25)", paddingBottom: 8 }}>
            <button
              type="button"
              className="btn-secondary ins-btn-sm"
              style={{
                borderRadius: 6,
                fontWeight: activeTab === "upload" ? 700 : 500,
                background: activeTab === "upload" ? "rgba(99, 102, 241, 0.12)" : "transparent",
                borderColor: activeTab === "upload" ? "#6366f1" : "transparent",
                color: activeTab === "upload" ? "#6366f1" : "inherit",
              }}
              onClick={() => {
                setActiveTab("upload");
                setApiError(null);
              }}
              disabled={isSubmitting}
            >
              Upload PDF File
            </button>
            <button
              type="button"
              className="btn-secondary ins-btn-sm"
              style={{
                borderRadius: 6,
                fontWeight: activeTab === "url" ? 700 : 500,
                background: activeTab === "url" ? "rgba(99, 102, 241, 0.12)" : "transparent",
                borderColor: activeTab === "url" ? "#6366f1" : "transparent",
                color: activeTab === "url" ? "#6366f1" : "inherit",
              }}
              onClick={() => {
                setActiveTab("url");
                setApiError(null);
              }}
              disabled={isSubmitting}
            >
              Provide Document URL
            </button>
          </div>

          {activeTab === "upload" ? (
            <div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "#6366f1" : fileError ? "#ef4444" : "rgba(148, 163, 184, 0.4)"}`,
                  borderRadius: 12,
                  padding: "24px 16px",
                  textAlign: "center",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  background: isDragging ? "rgba(99, 102, 241, 0.05)" : "transparent",
                  transition: "all 0.15s ease",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                  disabled={isSubmitting}
                />

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "rgba(99, 102, 241, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#6366f1",
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: "#6366f1" }}>Choose a PDF file</span> or drag & drop here
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                    Standard PDF documents up to 5 MB
                  </div>
                </div>
              </div>

              {fileError && (
                <div style={{ marginTop: 8, color: "#ef4444", fontSize: "0.825rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>⚠️</span>
                  <span>{fileError}</span>
                </div>
              )}

              {selectedFile && !fileError && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(148, 163, 184, 0.08)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span
                      style={{
                        background: "#ef4444",
                        color: "#fff",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: "0.7rem",
                        fontWeight: 700,
                      }}
                    >
                      PDF
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selectedFile.name}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                        {formatFileSize(selectedFile.size)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary ins-btn-sm"
                    style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    disabled={isSubmitting}
                  >
                    Remove
                  </button>
                </div>
              )}

              {uploadProgress !== null && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 4 }}>
                    <span>Uploading agreement document...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(148, 163, 184, 0.2)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${uploadProgress}%`,
                        background: "#6366f1",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
                Document URL *
              </label>
              <input
                type="url"
                className="ins-prob-input"
                placeholder="https://.../rental_agreement.pdf"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={isSubmitting}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
              <p className="text-muted" style={{ fontSize: "0.775rem", margin: "6px 0 0" }}>
                Provide a direct accessible link to the hosted PDF agreement.
              </p>
            </div>
          )}

          {existingUrl && (
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 4 }}>
              Current document:{" "}
              <a href={resolveImageUrl(existingUrl)} target="_blank" rel="noreferrer" style={{ color: "#6366f1", textDecoration: "underline" }}>
                Open current PDF
              </a>
            </div>
          )}
        </div>

        <div className="ins-modal-footer" style={{ padding: "14px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting || (activeTab === "upload" && !selectedFile) || (activeTab === "url" && !customUrl.trim())}
          >
            {isSubmitting
              ? "Processing..."
              : mode === "send-for-signature"
              ? "Send for signature"
              : "Save document"}
          </button>
        </div>
      </form>
    </div>
  );
};
