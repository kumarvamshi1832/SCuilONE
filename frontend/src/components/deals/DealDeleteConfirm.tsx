import { useState } from "react";
import type { Deal } from "../../types/deal";
import { deleteDeal } from "../../services/dealService";

interface DealDeleteConfirmProps {
  deal: Deal;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DealDeleteConfirm({
  deal,
  onClose,
  onSuccess,
}: DealDeleteConfirmProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await deleteDeal(deal.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Delete deal error:", err);
      if (err?.response?.status === 403 || err?.status === 403) {
        setError("You do not have permission to perform this action.");
        return;
      }
      const rawMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Unable to delete deal. Please try again.";
      setError(typeof rawMessage === "string" ? rawMessage : "Unable to delete deal. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{`
        .delete-modal-container {
          max-width: 460px;
          width: 90%;
        }
        .delete-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 0;
        }
        .delete-modal-header h2 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 600;
        }
        .delete-modal-body {
          padding: 12px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .delete-icon-container {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(229, 62, 62, 0.1);
          color: #e53e3e;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }
        .delete-icon-container svg {
          width: 32px;
          height: 32px;
        }
        .delete-modal-body p {
          margin: 0 0 24px 0;
          color: #718096;
          font-size: 0.95rem;
          line-height: 1.5;
        }
        .dashboard-wrapper.dark .delete-modal-body p {
          color: #a0aec0;
        }
        .delete-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 0 24px 24px;
        }
        .delete-modal-error {
          width: 100%;
          padding: 10px 14px;
          margin-bottom: 20px;
          border-radius: 6px;
          background: #fcebea;
          color: #cc0000;
          font-size: 0.875rem;
          text-align: left;
        }
      `}</style>
      
      <div className="modal-content delete-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="delete-modal-header">
          <h2>Delete Deal?</h2>
          <button className="btn-close" onClick={onClose} disabled={loading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div className="delete-modal-body">
          <div className="delete-icon-container">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          
          <p>
            Are you sure you want to delete <br/>
            <strong>"{deal.name || "this deal"}"</strong>?
            <br /><br />
            This action cannot be undone.
          </p>

          {error && (
            <div className="delete-modal-error">
              {error}
            </div>
          )}
        </div>

        <div className="delete-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn-danger" onClick={handleDelete} disabled={loading}>
            {loading ? "Deleting..." : "Delete Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
