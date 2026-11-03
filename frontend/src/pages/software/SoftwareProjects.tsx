import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import {
  getSoftwareProjects,
  createSoftwareProject,
  updateSoftwareProject,
  deleteSoftwareProject,
} from "../../services/softwareProjectService";
import { clearSoftwareForbidden, extractBackendDetail } from "../../services/softwareRequestManager";
import { getSoftwareContracts } from "../../services/softwareContractService";
import { getUsers } from "../../services/userService";

import type {
  SoftwareProject,
  SoftwareProjectCreate,
  SoftwareProjectUpdate,
  SoftwareProjectStatus,
  SoftwareProjectPriority,
} from "../../types/softwareProject";
import {
  SOFTWARE_PROJECT_STATUSES,
  SOFTWARE_PROJECT_PRIORITIES,
} from "../../types/softwareProject";
import type { SoftwareContract } from "../../types/softwareContract";
import type { User } from "../../types/user";

import "./SoftwareModules.css";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function SoftwareProjects() {
  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [contracts, setContracts] = useState<SoftwareContract[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Helper to match status string against canonical SOFTWARE_PROJECT_STATUSES
  const resolveCanonicalStatus = useCallback((val: string | null | undefined): string => {
    if (!val) return "";
    const clean = val.trim().toLowerCase();
    const found = SOFTWARE_PROJECT_STATUSES.find((s) => s.toLowerCase() === clean);
    return found || "";
  }, []);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const fromParam = searchParams.get("status");
    const fromState = (location.state as any)?.status;
    return resolveCanonicalStatus(fromParam || fromState);
  });
  const [priorityFilter, setPriorityFilter] = useState("");

  // Sync with URL query parameter changes (supports Back / Forward navigation)
  useEffect(() => {
    const fromParam = searchParams.get("status");
    const fromState = (location.state as any)?.status;
    const resolved = resolveCanonicalStatus(fromParam || fromState);
    setStatusFilter(resolved);
  }, [searchParams, location.state, resolveCanonicalStatus]);

  const handleStatusFilterChange = (newStatus: string) => {
    const resolved = resolveCanonicalStatus(newStatus);
    setStatusFilter(resolved);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (resolved) {
        next.set("status", resolved);
      } else {
        next.delete("status");
      }
      return next;
    });
  };

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SoftwareProject | null>(null);
  const [viewingItem, setViewingItem] = useState<SoftwareProject | null>(null);
  const [deletingItem, setDeletingItem] = useState<SoftwareProject | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState<SoftwareProjectCreate & { status?: SoftwareProjectStatus }>({
    software_contract_id: "",
    name: "",
    description: "",
    project_manager_id: null,
    priority: "Medium",
    start_date: new Date().toISOString().slice(0, 10),
    target_end_date: "",
    notes: "",
    status: "Planned",
  });

  const [isForbidden, setIsForbidden] = useState(false);
  const [forbiddenDetail, setForbiddenDetail] = useState<string | null>(null);

  const loadData = useCallback(async (forceRetry = false, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    if (forceRetry) {
      clearSoftwareForbidden("software_projects");
      setIsForbidden(false);
      setForbiddenDetail(null);
    }
    try {
      const [projData, contData, usersData] = await Promise.all([
        getSoftwareProjects(undefined, { signal, forceRetry }),
        getSoftwareContracts(undefined, { signal, forceRetry }).catch(() => []),
        getUsers().catch(() => []),
      ]);

      setProjects(Array.isArray(projData) ? projData : []);
      setContracts(Array.isArray(contData) ? contData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setIsForbidden(false);
      setForbiddenDetail(null);
    } catch (err: any) {
      if (err?.name === "CanceledError" || err?.name === "AbortError") {
        return;
      }
      if (err?.response?.status === 403 || err?.isCachedForbidden) {
        setIsForbidden(true);
        setForbiddenDetail(extractBackendDetail(err));
      } else {
        setError(extractBackendDetail(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const contractMap = useMemo(() => new Map(contracts.map((c) => [c.id, c.title])), [contracts]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);

  // Filtered List
  const filteredList = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter && p.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (priorityFilter && p.priority.toLowerCase() !== priorityFilter.toLowerCase()) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const contTitle = contractMap.get(p.software_contract_id)?.toLowerCase() || "";
        const matchName = p.name.toLowerCase().includes(q);
        const matchNum = p.project_number.toLowerCase().includes(q);
        const matchCont = contTitle.includes(q);
        if (!matchName && !matchNum && !matchCont) return false;
      }
      return true;
    });
  }, [projects, statusFilter, priorityFilter, searchTerm, contractMap]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormError(null);
    setFormData({
      software_contract_id: contracts[0]?.id || "",
      name: "",
      description: "",
      project_manager_id: users[0]?.id || null,
      priority: "Medium",
      start_date: new Date().toISOString().slice(0, 10),
      target_end_date: "",
      notes: "",
      status: "Planned",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: SoftwareProject) => {
    setEditingItem(item);
    setFormError(null);
    setFormData({
      software_contract_id: item.software_contract_id,
      name: item.name,
      description: item.description || "",
      project_manager_id: item.project_manager_id || null,
      priority: (item.priority as SoftwareProjectPriority) || "Medium",
      start_date: item.start_date || "",
      target_end_date: item.target_end_date || "",
      notes: item.notes || "",
      status: (item.status as SoftwareProjectStatus) || "Planned",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name?.trim()) {
      setFormError("Project name is required.");
      return;
    }
    if (!formData.software_contract_id) {
      setFormError("Please select an executing Software Contract.");
      return;
    }
    if (formData.start_date && formData.target_end_date && formData.target_end_date < formData.start_date) {
      setFormError("Target end date cannot precede start date.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        const payload: SoftwareProjectUpdate = {
          name: formData.name,
          description: formData.description,
          project_manager_id: formData.project_manager_id,
          priority: formData.priority,
          status: formData.status,
          start_date: formData.start_date || null,
          target_end_date: formData.target_end_date || null,
          notes: formData.notes,
        };
        const updated = await updateSoftwareProject(editingItem.id, payload);
        setProjects((prev) => prev.map((p) => (p.id === editingItem.id ? updated : p)));
      } else {
        const payload: SoftwareProjectCreate = {
          software_contract_id: formData.software_contract_id,
          name: formData.name,
          description: formData.description,
          project_manager_id: formData.project_manager_id,
          priority: formData.priority,
          start_date: formData.start_date || null,
          target_end_date: formData.target_end_date || null,
          notes: formData.notes,
        };
        const created = await createSoftwareProject(payload);
        setProjects((prev) => [created, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.message || "Failed to save project");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setSubmitting(true);
    try {
      await deleteSoftwareProject(deletingItem.id);
      setProjects((prev) => prev.filter((p) => p.id !== deletingItem.id));
      setDeletingItem(null);
    } catch (err: any) {
      alert("Failed to delete project: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sw-module-page">
      {/* Header */}
      <div className="sw-module-header">
        <div className="sw-module-title-box">
          <h1>
            Software Delivery Projects
            <span className="sw-count-badge">{projects.length} Total</span>
          </h1>
          <p>Track engineering deliverables, software sprints, architecture milestones, and delivery budgets.</p>
        </div>
        <button className="sw-btn-primary" onClick={handleOpenCreate}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Delivery Project
        </button>
      </div>

      {/* Filter Bar */}
      <div className="sw-filter-bar">
        <div className="sw-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="sw-search-input"
            placeholder="Search projects by name, code, or contract..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="sw-filter-select"
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
        >
          <option value="">All Statuses</option>
          {SOFTWARE_PROJECT_STATUSES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>

        <select
          className="sw-filter-select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="">All Priorities</option>
          {SOFTWARE_PROJECT_PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {(Boolean(searchTerm) || Boolean(statusFilter) || Boolean(priorityFilter)) && (
          <button
            type="button"
            className="sw-btn-secondary"
            style={{ padding: "8px 14px", fontSize: "0.82rem" }}
            onClick={() => {
              setSearchTerm("");
              handleStatusFilterChange("");
              setPriorityFilter("");
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table Card */}
      <div className="sw-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            Loading software delivery projects...
          </div>
        ) : isForbidden ? (
          <div className="sw-forbidden-card">
            <div className="sw-forbidden-icon-box">🔒</div>
            <h3>Software Projects Access Restricted</h3>
            <p>
              This module is not enabled for your tenant industry or your user role does not have view permission.
            </p>
            {forbiddenDetail && (
              <div className="sw-forbidden-detail">{forbiddenDetail}</div>
            )}
            <button
              className="sw-btn-secondary"
              style={{ marginTop: "8px" }}
              onClick={() => void loadData(true)}
            >
              Retry Access
            </button>
          </div>
        ) : error ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>
            <p style={{ marginBottom: "12px" }}>{error}</p>
            <button className="sw-btn-secondary" onClick={() => void loadData(true)}>Retry</button>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            <p>No software delivery projects found matching your criteria.</p>
            {(Boolean(searchTerm) || Boolean(statusFilter) || Boolean(priorityFilter)) && (
              <button
                type="button"
                className="sw-btn-secondary"
                style={{ marginTop: "12px", padding: "6px 14px", fontSize: "0.82rem" }}
                onClick={() => {
                  setSearchTerm("");
                  handleStatusFilterChange("");
                  setPriorityFilter("");
                }}
              >
                Reset Filters ({projects.length} available)
              </button>
            )}
          </div>
        ) : (
          <table className="sw-data-table">
            <thead>
              <tr>
                <th>Project Name / Number</th>
                <th>Contract</th>
                <th>Project Manager</th>
                <th>Priority</th>
                <th>Budget</th>
                <th>Progress</th>
                <th>Start Date</th>
                <th>Target End Date</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((proj) => (
                <tr key={proj.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{proj.name}</div>
                    <div style={{ fontSize: "0.76rem", color: "#0ea5e9" }}>{proj.project_number}</div>
                  </td>
                  <td>{contractMap.get(proj.software_contract_id) || "Standard Delivery Contract"}</td>
                  <td>{proj.project_manager_id ? userMap.get(proj.project_manager_id) || "Lead PM" : "Unassigned"}</td>
                  <td>
                    <span className={`sw-badge ${proj.priority?.toLowerCase()}`}>
                      {proj.priority}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{INR.format(proj.budget)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "100px" }}>
                      <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, Math.max(0, proj.progress_percentage || 0))}%`, height: "100%", background: "#0ea5e9" }} />
                      </div>
                      <span style={{ fontSize: "0.76rem", fontWeight: 600 }}>{proj.progress_percentage || 0}%</span>
                    </div>
                  </td>
                  <td>{proj.start_date || "—"}</td>
                  <td>{proj.target_end_date || "—"}</td>
                  <td>
                    <span className={`sw-badge ${proj.status?.toLowerCase().replace(/\s+/g, "-")}`}>
                      {proj.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="sw-row-actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="sw-btn-icon"
                        title="View Details"
                        onClick={() => setViewingItem(proj)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      <button
                        className="sw-btn-icon"
                        title="Edit Project"
                        onClick={() => handleOpenEdit(proj)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        className="sw-btn-icon danger"
                        title="Delete Project"
                        onClick={() => setDeletingItem(proj)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="sw-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="sw-modal-card" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>{editingItem ? "Edit Delivery Project" : "New Software Project"}</h2>
              <button className="sw-btn-icon" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="sw-modal-body">
                {formError && <div className="sw-error-banner">{formError}</div>}

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Project Name *</label>
                    <input
                      type="text"
                      className="sw-form-input"
                      required
                      placeholder="e.g. Fintech Mobile App Delivery"
                      value={formData.name || ""}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>Associated Contract *</label>
                    <select
                      className="sw-form-select"
                      required
                      value={formData.software_contract_id}
                      onChange={(e) => setFormData({ ...formData, software_contract_id: e.target.value })}
                    >
                      <option value="">Select Contract</option>
                      {contracts.map((c) => (
                        <option key={c.id} value={c.id}>{c.contract_number}: {c.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Project Manager</label>
                    <select
                      className="sw-form-select"
                      value={formData.project_manager_id || ""}
                      onChange={(e) => setFormData({ ...formData, project_manager_id: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>Priority</label>
                    <select
                      className="sw-form-select"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as SoftwareProjectPriority })}
                    >
                      {SOFTWARE_PROJECT_PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>Status</label>
                    <select
                      className="sw-form-select"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as SoftwareProjectStatus })}
                    >
                      {SOFTWARE_PROJECT_STATUSES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Start Date</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      value={formData.start_date || ""}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>Target End Date</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      value={formData.target_end_date || ""}
                      onChange={(e) => setFormData({ ...formData, target_end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="sw-form-group">
                  <label>Project Scope & Engineering Notes</label>
                  <textarea
                    className="sw-form-textarea"
                    placeholder="Milestone goals, architecture guidelines, repository links..."
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="sw-modal-footer">
                <button type="button" className="sw-btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="sw-btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingItem ? "Update Project" : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewingItem && (
        <div className="sw-modal-overlay" onClick={() => setViewingItem(null)}>
          <div className="sw-modal-card" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>{viewingItem.project_number}: {viewingItem.name}</h2>
              <button className="sw-btn-icon" onClick={() => setViewingItem(null)}>✕</button>
            </div>
            <div className="sw-modal-body">
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                <span className={`sw-badge ${viewingItem.status?.toLowerCase().replace(/\s+/g, "-")}`}>
                  Status: {viewingItem.status}
                </span>
                <span className={`sw-badge ${viewingItem.priority?.toLowerCase()}`}>
                  Priority: {viewingItem.priority}
                </span>
                <span className="sw-badge active">Budget: {INR.format(viewingItem.budget)}</span>
                <span className="sw-badge discovery">Progress: {viewingItem.progress_percentage || 0}%</span>
              </div>
              <p><strong>Contract:</strong> {contractMap.get(viewingItem.software_contract_id) || "—"}</p>
              <p><strong>Project Manager:</strong> {viewingItem.project_manager_id ? userMap.get(viewingItem.project_manager_id) || "PM" : "Unassigned"}</p>
              <p><strong>Timeline:</strong> {viewingItem.start_date || "—"} to {viewingItem.target_end_date || "—"}</p>
              {viewingItem.description && (
                <div>
                  <strong>Description:</strong>
                  <p style={{ marginTop: "4px", lineHeight: "1.6" }}>{viewingItem.description}</p>
                </div>
              )}
            </div>
            <div className="sw-modal-footer">
              <button className="sw-btn-secondary" onClick={() => setViewingItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingItem && (
        <div className="sw-modal-overlay" onClick={() => setDeletingItem(null)}>
          <div className="sw-modal-card" style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>Confirm Deletion</h2>
              <button className="sw-btn-icon" onClick={() => setDeletingItem(null)}>✕</button>
            </div>
            <div className="sw-modal-body">
              <p>Are you sure you want to delete project <strong>{deletingItem.name}</strong>?</p>
            </div>
            <div className="sw-modal-footer">
              <button className="sw-btn-secondary" onClick={() => setDeletingItem(null)}>Cancel</button>
              <button className="sw-btn-primary" style={{ background: "#ef4444" }} onClick={handleDelete} disabled={submitting}>
                {submitting ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

