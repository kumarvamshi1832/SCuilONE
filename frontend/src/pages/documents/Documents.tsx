import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getDocuments,
  deleteDocument,
  downloadDocument,
} from "../../services/documentService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";
import { getDeals } from "../../services/dealService";
import { getUsers } from "../../services/userService";
import type { DocumentItem } from "../../types/document";
import { DOCUMENT_CATEGORIES } from "../../types/document";
import { DocumentCard, formatFileSize } from "../../components/documents/DocumentCard";
import { DocumentTable } from "../../components/documents/DocumentTable";
import { DocumentUploadModal } from "../../components/documents/DocumentUploadModal";
import { DocumentPreviewModal } from "../../components/documents/DocumentPreviewModal";
import { DocumentDeleteConfirm } from "../../components/documents/DocumentDeleteConfirm";
import type { User } from "../../types/user";
import { resolveImageUrl } from "../../utils/imageUrl";
import "./Documents.css";

interface RelatedOption {
  id: string;
  name: string;
  subtitle?: string;
}

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parent entity maps for display
  const [leads, setLeads] = useState<RelatedOption[]>([]);
  const [contacts, setContacts] = useState<RelatedOption[]>([]);
  const [accounts, setAccounts] = useState<RelatedOption[]>([]);
  const [deals, setDeals] = useState<RelatedOption[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Types");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [confidentialFilter, setConfidentialFilter] = useState<"all" | "confidential" | "standard">("all");

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<DocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = useCallback((text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Permissions
  const userPermissions = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (!stored) return { canView: true, canCreate: true, canDelete: true };
      const parsed = JSON.parse(stored);
      const perms: string[] = Array.isArray(parsed.permissions)
        ? parsed.permissions
        : parsed.role?.permissions || [];
      const role = String(parsed.role || "").toUpperCase();
      const isSuperOrAdmin =
        role.includes("ADMIN") || role.includes("MANAGER") || role === "TENANT ADMIN";

      const has = (p: string) =>
        isSuperOrAdmin || perms.some((x) => x.toLowerCase() === p.toLowerCase());

      return {
        canView: has("document.view") || has("documents"),
        canCreate: has("document.create"),
        canDelete: has("document.delete"),
      };
    } catch {
      return { canView: true, canCreate: true, canDelete: true };
    }
  }, []);

  // Fetch documents and related options
  const fetchDocumentsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docsRes = await getDocuments();
      setDocuments(docsRes.documents || []);
    } catch (err: any) {
      console.error("Failed to fetch documents:", err);
      setError(
        err?.response?.data?.detail || "Unable to load documents. Please check connection."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocumentsData();

    // Fetch related records in background for lookup tags & upload modal dropdowns
    getLeads()
      .then((data) =>
        setLeads(
          (data || []).map((l: any) => ({
            id: l.id,
            name: `${l.first_name || ""} ${l.last_name || ""}`.trim() || l.company || "Lead",
            subtitle: l.company || l.email,
          }))
        )
      )
      .catch(() => {});

    getContacts()
      .then((data) =>
        setContacts(
          (data || []).map((c: any) => ({
            id: c.id,
            name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Contact",
            subtitle: c.email || c.phone,
          }))
        )
      )
      .catch(() => {});

    getAccounts()
      .then((data) =>
        setAccounts(
          (data || []).map((a: any) => ({
            id: a.id,
            name: a.name || "Account",
            subtitle: a.industry || a.website,
          }))
        )
      )
      .catch(() => {});

    getDeals()
      .then((data) =>
        setDeals(
          (data || []).map((d: any) => ({
            id: d.id,
            name: d.title || d.name || "Deal",
            subtitle: d.value ? `₹${d.value.toLocaleString()}` : undefined,
          }))
        )
      )
      .catch(() => {});

    getUsers()
      .then((u) => setUsers(u || []))
      .catch(() => {});
  }, [fetchDocumentsData]);

  // Lookup maps
  const parentMap = useMemo(() => {
    const map = new Map<string, { name: string; type: string }>();
    leads.forEach((l) => map.set(l.id, { name: l.name, type: "Lead" }));
    contacts.forEach((c) => map.set(c.id, { name: c.name, type: "Contact" }));
    accounts.forEach((a) => map.set(a.id, { name: a.name, type: "Account" }));
    deals.forEach((d) => map.set(d.id, { name: d.name, type: "Deal" }));
    return map;
  }, [leads, contacts, accounts, deals]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => {
      const name = (u.full_name || "").trim() || u.email || "User";
      map.set(u.id, name);
    });
    return map;
  }, [users]);

  // KPI Calculations
  const stats = useMemo(() => {
    const total = documents.length;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentlyAdded = documents.filter((d) => {
      if (!d.created_at) return false;
      return new Date(d.created_at) >= sevenDaysAgo;
    }).length;

    const confidentialCount = documents.filter((d) => d.is_confidential).length;

    const totalStorageBytes = documents.reduce((sum, d) => sum + (d.file_size || 0), 0);

    return {
      total,
      recentlyAdded,
      confidentialCount,
      storageFormatted: formatFileSize(totalStorageBytes),
    };
  }, [documents]);

  // Filtered Documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Search filter (title or filename)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesTitle = doc.title.toLowerCase().includes(query);
        const matchesFile = doc.filename.toLowerCase().includes(query);
        if (!matchesTitle && !matchesFile) return false;
      }

      // Category / Type filter
      if (categoryFilter !== "All Types") {
        if ((doc.document_type || "Other").toLowerCase() !== categoryFilter.toLowerCase()) {
          return false;
        }
      }

      // Related module filter
      if (moduleFilter !== "all") {
        if (moduleFilter === "lead" && !doc.lead_id) return false;
        if (moduleFilter === "contact" && !doc.contact_id) return false;
        if (moduleFilter === "account" && !doc.account_id) return false;
        if (moduleFilter === "deal" && !doc.deal_id) return false;
      }

      // Confidential filter
      if (confidentialFilter === "confidential" && !doc.is_confidential) return false;
      if (confidentialFilter === "standard" && doc.is_confidential) return false;

      return true;
    });
  }, [documents, searchTerm, categoryFilter, moduleFilter, confidentialFilter]);

  // Download action
  const handleDownload = async (doc: DocumentItem) => {
    try {
      showToast(`Preparing download for ${doc.filename}...`);
      const res = await downloadDocument(doc.id);
      if (res?.download_url || doc.file_url) {
        const link = document.createElement("a");
        link.href = resolveImageUrl(res?.download_url || doc.file_url);
        link.download = res.filename || doc.filename;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        showToast("Download link not available.", "error");
      }
    } catch (err: any) {
      console.error("Download failed:", err);
      showToast("Download failed. Please try again.", "error");
    }
  };

  // Delete action
  const handleDeleteConfirm = async () => {
    if (!deletingDoc) return;
    setIsDeleting(true);
    try {
      await deleteDocument(deletingDoc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== deletingDoc.id));
      showToast(`Document "${deletingDoc.title}" deleted successfully.`);
      setDeletingDoc(null);
    } catch (err: any) {
      console.error("Delete failed:", err);
      showToast(
        err?.response?.data?.detail || "Failed to delete document. Please try again.",
        "error"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Clear filters
  const handleClearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("All Types");
    setModuleFilter("all");
    setConfidentialFilter("all");
  };

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    categoryFilter !== "All Types" ||
    moduleFilter !== "all" ||
    confidentialFilter !== "all";

  return (
    <div className="documents-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`crm-toast ${toastMessage.type}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            {toastMessage.type === "success" ? (
              <polyline points="20 6 9 17 4 12" />
            ) : (
              <>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </>
            )}
          </svg>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* ─── 1. Header ─── */}
      <div className="documents-header">
        <div className="header-titles">
          <div className="title-row">
            <h1>Documents</h1>
            <span className="count-chip">{documents.length} Total</span>
          </div>
          <p className="subtitle">
            Manage and organize CRM documents and files across your real estate records.
          </p>
        </div>

        <div className="header-actions">
          {/* Grid / Table Toggle */}
          <div className="view-mode-toggle">
            <button
              type="button"
              className={`toggle-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Grid</span>
            </button>
            <button
              type="button"
              className={`toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              <span>Table</span>
            </button>
          </div>

          {userPermissions.canCreate && (
            <button
              type="button"
              className="btn-upload-document"
              onClick={() => setIsUploadOpen(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Upload Document</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── 2. KPI Summary Cards ─── */}
      <div className="documents-summary-grid">
        <div className="kpi-card blue">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Total Documents</span>
            <span className="kpi-value">{stats.total}</span>
          </div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Recently Added</span>
            <span className="kpi-value">{stats.recentlyAdded}</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Confidential</span>
            <span className="kpi-value">{stats.confidentialCount}</span>
          </div>
        </div>

        <div className="kpi-card purple">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Storage Used</span>
            <span className="kpi-value">{stats.storageFormatted}</span>
          </div>
        </div>
      </div>

      {/* ─── 3. Search and Filters ─── */}
      <div className="documents-filters-bar">
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by title, filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchTerm("")}
              title="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          {DOCUMENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        >
          <option value="all">All Modules</option>
          <option value="lead">Related to Leads</option>
          <option value="contact">Related to Contacts</option>
          <option value="account">Related to Accounts</option>
          <option value="deal">Related to Deals</option>
        </select>

        <select
          className="filter-select"
          value={confidentialFilter}
          onChange={(e) =>
            setConfidentialFilter(e.target.value as "all" | "confidential" | "standard")
          }
        >
          <option value="all">All Security Levels</option>
          <option value="confidential">Confidential Only</option>
          <option value="standard">Standard Only</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            className="btn-clear-filters"
            onClick={handleClearFilters}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ─── 4. Main Documents List ─── */}
      {loading ? (
        <div className="doc-loading-container">
          <div className="documents-grid">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="doc-skeleton-card" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="doc-error-state">
          <h3>Unable to load documents</h3>
          <p>{error}</p>
          <button type="button" className="btn-retry" onClick={fetchDocumentsData}>
            Retry
          </button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="doc-empty-state">
          <div className="doc-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </div>
          <h3>No documents found</h3>
          <p>
            {hasActiveFilters
              ? "No documents match your active filter criteria. Try clearing some filters."
              : "Upload your first document to get started."}
          </p>
          {userPermissions.canCreate && (
            <button
              type="button"
              className="btn-upload-document"
              onClick={() => setIsUploadOpen(true)}
            >
              + Upload Document
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="documents-grid">
          {filteredDocuments.map((doc) => {
            const parentKey =
              doc.lead_id || doc.contact_id || doc.account_id || doc.deal_id || "";
            const parentInfo = parentMap.get(parentKey);
            const parentLabel = parentInfo
              ? `${parentInfo.type}: ${parentInfo.name}`
              : undefined;
            const uploaderName = userMap.get(doc.uploaded_by);

            return (
              <DocumentCard
                key={doc.id}
                document={doc}
                parentLabel={parentLabel}
                uploaderName={uploaderName}
                canDelete={userPermissions.canDelete}
                onPreview={(d) => setPreviewDoc(d)}
                onDownload={handleDownload}
                onDelete={(d) => setDeletingDoc(d)}
              />
            );
          })}
        </div>
      ) : (
        <DocumentTable
          documents={filteredDocuments}
          parentMap={parentMap}
          userMap={userMap}
          canDelete={userPermissions.canDelete}
          onPreview={(d) => setPreviewDoc(d)}
          onDownload={handleDownload}
          onDelete={(d) => setDeletingDoc(d)}
        />
      )}

      {/* ─── 5. Upload Document Modal ─── */}
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={(newDoc) => {
          setDocuments((prev) => [newDoc, ...prev]);
          showToast(`Document "${newDoc.title}" uploaded successfully!`);
        }}
        leads={leads}
        contacts={contacts}
        accounts={accounts}
        deals={deals}
      />

      {/* ─── 6. Preview Document Modal ─── */}
      <DocumentPreviewModal
        document={previewDoc}
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        parentLabel={
          previewDoc
            ? (() => {
                const parentKey =
                  previewDoc.lead_id ||
                  previewDoc.contact_id ||
                  previewDoc.account_id ||
                  previewDoc.deal_id ||
                  "";
                const info = parentMap.get(parentKey);
                return info ? `${info.type}: ${info.name}` : undefined;
              })()
            : undefined
        }
        uploaderName={previewDoc ? userMap.get(previewDoc.uploaded_by) : undefined}
        onDownload={handleDownload}
        canDelete={userPermissions.canDelete}
        onDelete={(d) => setDeletingDoc(d)}
      />

      {/* ─── 7. Delete Confirmation Modal ─── */}
      <DocumentDeleteConfirm
        document={deletingDoc}
        isOpen={Boolean(deletingDoc)}
        onClose={() => setDeletingDoc(null)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </div>
  );
}
