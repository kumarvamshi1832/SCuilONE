import { useState } from "react";
import { deleteLead } from "../../services/leadService";

interface LeadDeleteConfirmProps {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LeadDeleteConfirm({
  leadId,
  leadName,
  onClose,
  onSuccess,
}: LeadDeleteConfirmProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      await deleteLead(leadId);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Delete lead error:", err);
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Something went wrong. Please try again.";
      setError(typeof message === "string" ? message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "440px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Delete Lead</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div
              style={{
                padding: "10px 14px",
                marginBottom: "16px",
                borderRadius: "6px",
                background: "#fcebea",
                color: "#cc0000",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(231, 76, 60, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#e74c3c"
                strokeWidth="2"
                width="24"
                height="24"
              >
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </div>
            <p style={{ fontSize: "0.95rem", marginBottom: "4px" }}>
              Are you sure you want to delete this lead?
            </p>
            <p
              style={{
                fontWeight: 600,
                fontSize: "1rem",
                marginBottom: "4px",
              }}
            >
              {leadName}
            </p>
            <p style={{ color: "#718096", fontSize: "0.85rem" }}>
              This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: "center" }}>
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
