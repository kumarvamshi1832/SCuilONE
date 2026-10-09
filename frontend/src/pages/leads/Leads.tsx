import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import type { Lead } from "../../types/lead";
import { User } from "../../types/user";
import { getLeads } from "../../services/leadService";
import { getUsers } from "../../services/userService";
import { getLeadPermissions } from "../../utils/leadPermissions";
import LeadFormModal from "../../components/leads/LeadFormModal";
import LeadViewModal from "../../components/leads/LeadViewModal";
import LeadDeleteConfirm from "../../components/leads/LeadDeleteConfirm";
import { formatDateTime } from "../../utils/dateFormatter";
import "../users/Users.css";
import "./Leads.css";

const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Converted", "Lost"];

function getStatusClass(status: string): string {
  switch (status) {
    case "New": return "status-new";
    case "Contacted": return "status-contacted";
    case "Qualified": return "status-qualified";
    case "Converted": return "status-converted";
    case "Lost": return "status-lost";
    default: return "";
  }
}



export default function Leads() {
  /* ─── Permissions ─── */
  const permissions = useMemo(() => getLeadPermissions(), []);
  
  const { industry } = useParams();
  const tenantStr = sessionStorage.getItem("tenant");
  let tenantIndustry = "real-estate";
  if (tenantStr) {
    try {
      const t = JSON.parse(tenantStr);
      if (t?.industry) tenantIndustry = t.industry.toLowerCase().replace(/\s+/g, '-');
    } catch(e) {}
  }
  const currentIndustry = industry || tenantIndustry;
  const isEdu = currentIndustry === "education-consulting";

  /* ─── State ─── */
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);

  // Actions dropdown
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Toast
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  /* ─── Data Fetching ─── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadsData, usersData] = await Promise.all([
        getLeads(),
        getUsers(),
      ]);
      setLeads(leadsData);
      setUsers(usersData);
    } catch (err: any) {
      console.error("Fetch leads error:", err);
      if (err?.response?.status === 401 || err?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (err?.response?.status >= 500 || err?.status >= 500) {
        setError("Something went wrong. Please try again.");
      } else {
        setError(
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load leads."
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close actions dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setOpenActionId(null);
        setDropdownPos(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenActionId(null);
        setDropdownPos(null);
      }
    };
    if (openActionId) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openActionId]);

  // Calculate dropdown position from the trigger button
  const toggleActions = (leadId: string) => {
    if (openActionId === leadId) {
      setOpenActionId(null);
      setDropdownPos(null);
      return;
    }
    const btn = triggerRefs.current[leadId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const dropdownHeight = 140; // approximate height of the 3-item menu
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropdownHeight + 8;
      setDropdownPos({
        top: openUp ? rect.top : rect.bottom + 4,
        left: rect.right - 148, // 140 min-width + 8 padding
        openUp,
      });
    }
    setOpenActionId(leadId);
  };

  /* ─── Helpers ─── */

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const getUserDisplay = (userId?: string | null): { name: string; role: string } => {
    if (!userId) return { name: "—", role: "" };
    const user = users.find((u) => u.id === userId);
    return user
      ? { name: user.full_name, role: user.role }
      : { name: "—", role: "" };
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setSourceFilter("");
    setAssignedFilter("");
  };

  const hasActiveFilters = search || statusFilter || sourceFilter || assignedFilter;

  /* ─── Filtering (client-side) ─── */

  const filteredLeads = leads.filter((lead) => {
    // Text search
    if (search) {
      const q = search.toLowerCase();
      const matchesSearch =
        (lead.full_name || "").toLowerCase().includes(q) ||
        (lead.email || "").toLowerCase().includes(q) ||
        (lead.phone || "").toLowerCase().includes(q) ||
        (lead.source || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    // Status filter
    if (statusFilter && lead.status !== statusFilter) return false;
    // Source filter
    if (sourceFilter && lead.source !== sourceFilter) return false;
    // Assigned filter
    if (assignedFilter && lead.assigned_to !== assignedFilter) return false;

    return true;
  });

  // Collect unique sources from data
  const uniqueSources = Array.from(new Set(leads.map((l) => l.source).filter(Boolean))) as string[];

  /* ─── Action Handlers ─── */

  const handleCreate = () => {
    setEditLead(null);
    setIsFormOpen(true);
  };

  const handleView = (lead: Lead) => {
    setOpenActionId(null);
    setViewLead(lead);
  };

  const handleEdit = (lead: Lead) => {
    setOpenActionId(null);
    setViewLead(null);
    setEditLead(lead);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (lead: Lead) => {
    setOpenActionId(null);
    setDeleteLead(lead);
  };

  const handleFormSuccess = (savedLead: Lead) => {
    setLeads((prev) => {
      const isExisting = prev.some((l) => l.id === savedLead.id);
      if (isExisting) {
        return prev.map((l) => (l.id === savedLead.id ? savedLead : l));
      } else {
        return [savedLead, ...prev];
      }
    });
    fetchData();
    showToast(editLead ? "Lead updated successfully" : "Lead created successfully");
  };

  const handleDeleteSuccess = () => {
    fetchData();
    showToast("Lead deleted successfully");
  };

  /* ─── Render ─── */

  return (
    <div className="leads-page">
      {/* Toast Notification */}
      {notification && (
        <div className={`notification-toast ${notification.type}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {notification.type === "success" ? (
              <>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </>
            )}
          </svg>
          {notification.message}
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Leads</h1>
          <p className="text-muted">
            {isEdu ? "Manage and track your education consulting leads." : "Manage and track your property leads."}
          </p>
        </div>
        <div className="header-actions">
          {permissions.canCreate && (
            <button className="btn-primary" onClick={handleCreate} id="create-lead-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Lead
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="leads-filter-bar">
        <div className="leads-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search leads by name, email, phone, source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="leads-search-input"
          />
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          id="leads-status-filter"
        >
          <option value="">All Statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          id="leads-source-filter"
        >
          <option value="">All Sources</option>
          {uniqueSources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={assignedFilter}
          onChange={(e) => setAssignedFilter(e.target.value)}
          id="leads-assigned-filter"
        >
          <option value="">All Users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button className="btn-clear-filters" onClick={clearFilters}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ marginRight: 4, verticalAlign: "middle" }}>
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            Clear Filters
          </button>
        )}
      </div>

      {/* Results Count */}
      {!loading && !error && (
        <div className="leads-results-bar">
          <span className="leads-results-count">
            {filteredLeads.length} {filteredLeads.length === 1 ? "lead" : "leads"}
            {hasActiveFilters ? " found" : " total"}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="leads-table-container">
        {loading ? (
          <div className="leads-loading">
            <div className="leads-loading-spinner" />
            Loading leads…
          </div>
        ) : error ? (
          <div className="error-state" style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", background: "rgba(231,76,60,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px"
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="2" width="24" height="24">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <p style={{ color: "#e74c3c", fontWeight: 500, marginBottom: 8 }}>{error}</p>
            <button className="btn-secondary" onClick={fetchData} style={{ marginTop: 8 }}>
              Retry
            </button>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="leads-empty-state">
            <div className="leads-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
            </div>
            <h3>{hasActiveFilters ? "No leads match your filters." : "No leads found"}</h3>
            <p>
              {hasActiveFilters
                ? "Try adjusting your search or filters."
                : isEdu 
                  ? "Get started by creating your first student lead."
                  : "Get started by creating your first lead."}
            </p>
            {hasActiveFilters && (
              <button className="btn-clear-filters" onClick={clearFilters} style={{ marginTop: 8 }}>
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>Lead Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Source</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <div className="lead-name-cell">
                      <div className="lead-avatar">
                        {(lead.full_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <span className="lead-name-text">{lead.full_name}</span>
                    </div>
                  </td>
                  <td className="text-dim">{lead.email || "—"}</td>
                  <td className="text-dim">{lead.phone || "—"}</td>
                  <td>
                    {lead.source ? (
                      <span className="lead-source-badge">{lead.source}</span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`lead-status-badge ${getStatusClass(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td>
                    {(() => {
                      const display = getUserDisplay(lead.assigned_to);
                      return display.role ? (
                        <div style={{ lineHeight: 1.3 }}>
                          <span style={{ fontWeight: 500 }}>{display.name}</span>
                          <br />
                          <span className="text-dim" style={{ fontSize: '0.78rem' }}>{display.role}</span>
                        </div>
                      ) : (
                        <span className="text-dim">{display.name}</span>
                      );
                    })()}
                  </td>
                  <td className="text-dim">{formatDateTime(lead.created_at)}</td>
                  <td className="actions-cell">
                    <button
                      className="btn-actions-trigger"
                      ref={(el) => { triggerRefs.current[lead.id] = el; }}
                      onClick={() => toggleActions(lead.id)}
                      id={`lead-actions-${lead.id}`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="19" cy="12" r="1"></circle>
                        <circle cx="5" cy="12" r="1"></circle>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Actions Dropdown — rendered outside the table to avoid overflow clipping */}
      {openActionId && dropdownPos && (() => {
        const targetLead = leads.find((l) => l.id === openActionId);
        if (!targetLead) return null;
        return (
          <div
            ref={actionsRef}
            className="actions-dropdown actions-dropdown-fixed"
            style={{
              position: "fixed",
              top: dropdownPos.openUp ? undefined : dropdownPos.top,
              bottom: dropdownPos.openUp ? window.innerHeight - dropdownPos.top + 4 : undefined,
              left: dropdownPos.left,
              zIndex: 9999,
            }}
          >
            <button onClick={() => handleView(targetLead)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              View
            </button>
            {permissions.canEdit && (
              <button onClick={() => handleEdit(targetLead)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit
              </button>
            )}
            {permissions.canDelete && (
              <>
                <div className="actions-dropdown-separator" />
                <button className="delete-action" onClick={() => handleDeleteClick(targetLead)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Delete
                </button>
              </>
            )}
          </div>
        );
      })()}


      {/* Create / Edit Modal */}
      {isFormOpen && (
        <LeadFormModal
          lead={editLead}
          onClose={() => {
            setIsFormOpen(false);
            setEditLead(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* View Modal */}
      {viewLead && (
        <LeadViewModal
          lead={viewLead}
          users={users}
          onClose={() => setViewLead(null)}
          onEdit={() => handleEdit(viewLead)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteLead && (
        <LeadDeleteConfirm
          leadId={deleteLead.id}
          leadName={deleteLead.full_name}
          onClose={() => setDeleteLead(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
