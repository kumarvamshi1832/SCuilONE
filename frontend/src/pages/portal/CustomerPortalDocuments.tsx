import { useState, useEffect, useCallback } from "react";
import {
  FileTextIcon,
  RefreshIcon,
  SearchIcon,
  ExternalLinkIcon,
  ClockIcon,
  AlertCircleIcon,
} from "../../components/common/SupportPortalIcons";
import { getPortalDocuments } from "../../services/customerPortalCommercialService";
import type { PortalDocument } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export default function CustomerPortalDocuments() {
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortalDocuments();
      setDocuments(data || []);
    } catch (err: any) {
      console.error("Failed to load customer documents:", err);
      setError(
        err?.response?.data?.detail ||
        "Unable to load shared customer documents. Please verify your connection."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Unique document types for filtering
  const availableTypes = Array.from(
    new Set(documents.map((d) => d.document_type).filter(Boolean))
  );

  const filtered = documents.filter((doc) => {
    if (typeFilter && doc.document_type !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.filename.toLowerCase().includes(q) ||
      (doc.description && doc.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="cp-tickets-page">
      {/* Header */}
      <div className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Shared Documents</h1>
          <p className="cp-page-subtitle">
            Securely access contracts, specifications, delivery sign-offs, and documents shared with your account.
          </p>
        </div>
        <button
          type="button"
          className="btn-refresh"
          onClick={fetchDocuments}
          disabled={loading}
          title="Refresh documents list"
        >
          <RefreshIcon size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="cp-filter-bar">
        <div className="cp-search-box">
          <SearchIcon size={16} color="var(--cp-text-muted)" />
          <input
            type="text"
            placeholder="Search by title, filename, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {availableTypes.length > 0 && (
          <select
            className="cp-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Document Types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          className="cp-alert cp-alert-error"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 8,
            color: "#ef4444",
            marginBottom: 20,
          }}
        >
          <AlertCircleIcon size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="cp-loading-state">
          <div className="cp-spinner" />
          <p>Loading shared documents...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cp-empty-state">
          <div className="cp-empty-icon">
            <FileTextIcon size={44} color="var(--cp-text-muted)" />
          </div>
          <h3>No Shared Documents Found</h3>
          <p>
            {search || typeFilter
              ? "No documents match your filter criteria. Try clearing filters."
              : "No shared files have been published to your client portal yet. When files are shared with your account, they will appear here."}
          </p>
        </div>
      ) : (
        <div className="cp-table-card">
          <table className="cp-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Version</th>
                <th>File Size</th>
                <th>Uploaded</th>
                <th>Expires</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => {
                const isExpired = doc.expires_at
                  ? new Date(doc.expires_at) < new Date()
                  : false;

                return (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            background: "rgba(59, 130, 246, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--cp-primary)",
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          <FileTextIcon size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--cp-text-main)" }}>
                            {doc.title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--cp-text-muted)",
                              marginTop: 2,
                            }}
                          >
                            {doc.filename}
                          </div>
                          {doc.description && (
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--cp-text-muted)",
                                marginTop: 4,
                                fontStyle: "italic",
                              }}
                            >
                              {doc.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge-category">{doc.document_type}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "rgba(100, 116, 139, 0.12)",
                          color: "var(--cp-text-muted)",
                        }}
                      >
                        v{doc.version_number}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--cp-text-muted)" }}>
                      {formatBytes(doc.file_size)}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--cp-text-muted)" }}>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      {doc.expires_at ? (
                        <span
                          style={{
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: isExpired
                              ? "rgba(239, 68, 68, 0.12)"
                              : "rgba(245, 158, 11, 0.12)",
                            color: isExpired ? "#ef4444" : "#f59e0b",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <ClockIcon size={12} />
                          {isExpired
                            ? "Expired"
                            : new Date(doc.expires_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: "var(--cp-text-muted)" }}>
                          Never
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {doc.file_url ? (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-download"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 12px",
                            borderRadius: 6,
                            background: "var(--cp-primary)",
                            color: "#ffffff",
                            textDecoration: "none",
                            fontSize: 13,
                            fontWeight: 500,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <ExternalLinkIcon size={13} />
                          <span>Download</span>
                        </a>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--cp-text-muted)" }}>
                          Unavailable
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
