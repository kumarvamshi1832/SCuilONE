import React from "react";
import type { DocumentItem } from "../../types/document";
import { formatFileSize, getFileIcon } from "./DocumentCard";

interface DocumentTableProps {
  documents: DocumentItem[];
  parentMap: Map<string, { name: string; type: string }>;
  userMap: Map<string, string>;
  canDelete?: boolean;
  onPreview: (doc: DocumentItem) => void;
  onDownload: (doc: DocumentItem) => void;
  onDelete: (doc: DocumentItem) => void;
}

export const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  parentMap,
  userMap,
  canDelete = true,
  onPreview,
  onDownload,
  onDelete,
}) => {
  return (
    <div className="document-table-container">
      <table className="document-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Type</th>
            <th>Related To</th>
            <th>Uploaded By</th>
            <th>Uploaded On</th>
            <th>Size</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const fileMeta = getFileIcon(doc.filename, doc.content_type);
            const parentKey =
              doc.lead_id || doc.contact_id || doc.account_id || doc.deal_id || "";
            const parent = parentMap.get(parentKey);
            const uploader = userMap.get(doc.uploaded_by) || "Staff";

            const formattedDate = doc.created_at
              ? new Date(doc.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "—";

            return (
              <tr key={doc.id} onClick={() => onPreview(doc)}>
                <td>
                  <div className="table-doc-cell">
                    <div className={`table-doc-icon ${fileMeta.bgClass}`}>
                      {fileMeta.iconSvg}
                    </div>
                    <div className="table-doc-meta">
                      <div className="table-doc-title-row">
                        <span className="table-doc-title" title={doc.title}>
                          {doc.title}
                        </span>
                        {doc.is_confidential && (
                          <span className="table-confidential-pill">Confidential</span>
                        )}
                      </div>
                      <span className="table-doc-filename" title={doc.filename}>
                        {doc.filename}
                      </span>
                    </div>
                  </div>
                </td>

                <td>
                  <span className="table-type-badge">
                    {doc.document_type || "Other"}
                  </span>
                </td>

                <td>
                  {parent ? (
                    <div className="table-parent-info">
                      <span className="table-parent-type">{parent.type}</span>
                      <span className="table-parent-name" title={parent.name}>
                        {parent.name}
                      </span>
                    </div>
                  ) : (
                    <span className="table-parent-unlinked">—</span>
                  )}
                </td>

                <td>
                  <div className="table-uploader-cell">
                    <span className="table-uploader-avatar">
                      {uploader.charAt(0).toUpperCase()}
                    </span>
                    <span>{uploader}</span>
                  </div>
                </td>

                <td>
                  <span className="table-date">{formattedDate}</span>
                </td>

                <td>
                  <span className="table-size">{formatFileSize(doc.file_size)}</span>
                </td>

                <td style={{ textAlign: "right" }}>
                  <div className="table-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="doc-table-btn preview"
                      title="Preview"
                      onClick={() => onPreview(doc)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="doc-table-btn download"
                      title="Download"
                      onClick={() => onDownload(doc)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>

                    {canDelete && (
                      <button
                        type="button"
                        className="doc-table-btn delete"
                        title="Delete"
                        onClick={() => onDelete(doc)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
