import React from "react";
import type { DocumentItem } from "../../types/document";

interface DocumentDeleteConfirmProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export const DocumentDeleteConfirm: React.FC<DocumentDeleteConfirmProps> = ({
  document: doc,
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
}) => {
  if (!isOpen || !doc) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card doc-delete-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="delete-modal-icon-row">
          <div className="delete-icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>
        </div>

        <h3 className="delete-modal-title">Delete Document</h3>
        <p className="delete-modal-message">
          Are you sure you want to delete{" "}
          <strong className="delete-target-name">{doc.title}</strong> (
          {doc.filename})? This action cannot be undone.
        </p>

        <div className="delete-modal-actions">
          <button
            type="button"
            className="btn-cancel-delete"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-confirm-delete"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Document"}
          </button>
        </div>
      </div>
    </div>
  );
};
