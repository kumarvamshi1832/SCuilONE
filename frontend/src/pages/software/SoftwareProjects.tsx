import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import {
  getSoftwareProjects,
  createSoftwareProject,
  updateSoftwareProject,
  deleteSoftwareProject,
  getSoftwareProjectTimeSummary,
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
  ProjectTimeSummary,
} from "../../types/softwareProject";
import {
  SOFTWARE_PROJECT_STATUSES,
  SOFTWARE_PROJECT_PRIORITIES,
} from "../../types/softwareProject";
import type { SoftwareContract } from "../../types/softwareContract";
import type { User } from "../../types/user";

import SoftwareViewToggle, { SoftwareViewMode } from "./SoftwareViewToggle";
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
  const [viewMode, setViewMode] = useState<SoftwareViewMode>(
    () => (localStorage.getItem("software_projects_view_mode") as SoftwareViewMode) || "grid"
  );

  const handleViewModeChange = (mode: SoftwareViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("software_projects_view_mode", mode);
    } catch {
      // ignore
    }
  };

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

  // Time Summary State for Viewing Modal
  const [projectTimeSummary, setProjectTimeSummary] = useState<ProjectTimeSummary | null>(null);
  const [timeSummaryLoading, setTimeSummaryLoading] = useState(false);
  const [timeSummaryError, setTimeSummaryError] = useState<string | null>(null);

  const fetchTimeSummary = useCallback(async (projectId: string) => {
    setTimeSummaryLoading(true);
    setTimeSummaryError(null);
    try {
      const res = await getSoftwareProjectTimeSummary(projectId);
      if (res) {
        setProjectTimeSummary({
          total_tracked_minutes: res.total_tracked_minutes ?? 0,
          total_tracked_hours: res.total_tracked_hours ?? 0,
          approved_billable_minutes: res.approved_billable_minutes ?? 0,
          approved_billable_hours: res.approved_billable_hours ?? 0,
          non_billable_minutes: res.non_billable_minutes ?? 0,
          non_billable_hours: res.non_billable_hours ?? 0,
        });
      }
    } catch (err: any) {
      console.warn("Could not load project time summary:", err);
      setTimeSummaryError(extractBackendDetail(err) || "Failed to load time tracking summary");
    } finally {
      setTimeSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewingItem) {
      if (viewingItem.time_summary) {
        setProjectTimeSummary(viewingItem.time_summary);
      } else if (
        viewingItem.total_tracked_minutes !== undefined ||
        viewingItem.total_tracked_hours !== undefined
      ) {
        setProjectTimeSummary({
          total_tracked_minutes: viewingItem.total_tracked_minutes ?? 0,
          total_tracked_hours: viewingItem.total_tracked_hours ?? 0,
          approved_billable_minutes: viewingItem.approved_billable_minutes ?? 0,
          approved_billable_hours: viewingItem.approved_billable_hours ?? 0,
          non_billable_minutes: viewingItem.non_billable_minutes ?? 0,
          non_billable_hours: viewingItem.non_billable_hours ?? 0,
        });
      } else {
        setProjectTimeSummary(null);
      }
      void fetchTimeSummary(viewingItem.id);
    } else {
      setProjectTimeSummary(null);
      setTimeSummaryError(null);
      setTimeSummaryLoading(false);
    }
  }, [viewingItem, fetchTimeSummary]);

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
        if (updated.status === "Completed") {
          window.dispatchEvent(new CustomEvent("crm-deal-refresh", { detail: { projectId: updated.id } }));
        }
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
        if (created.status === "Completed") {
          window.dispatchEvent(new CustomEvent("crm-deal-refresh", { detail: { projectId: created.id } }));
        }
      }
      setIsModalOpen(false);
    } catch (err: any) {
      const errorMsg = extractBackendDetail(err) || err?.response?.data?.detail || err?.message || "Failed to save project";
      setFormError(errorMsg);
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <SoftwareViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
          <button className="sw-btn-primary" onClick={handleOpenCreate}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Delivery Project
          </button>
        </div>
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
        ) : viewMode === "table" ? (
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
        ) : (
          <div className="sw-grid-cards" style={{ padding: "16px" }}>
            {filteredList.map((proj) => {
              const progress = Math.min(100, Math.max(0, proj.progress_percentage || 0));
              return (
                <div key={proj.id} className="sw-grid-card">
                  <div className="sw-grid-card-header">
                    <div className="sw-grid-card-title-group">
                      <h3 className="sw-grid-card-title" title={proj.name}>
                        {proj.name}
                      </h3>
                      <div className="sw-grid-card-subtitle">
                        <span>{proj.project_number}</span>
                      </div>
                    </div>
                    <span
                      className={`sw-badge ${proj.status?.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {proj.status}
                    </span>
                  </div>

                  <div className="sw-grid-card-body">
                    <div className="sw-grid-fields-grid">
                      <div className="sw-grid-field full-width">
                        <span className="sw-grid-field-label">Contract</span>
                        <span className="sw-grid-field-val highlight">
                          {contractMap.get(proj.software_contract_id) || "Standard Delivery Contract"}
                        </span>
                      </div>
                      <div className="sw-grid-field">
                        <span className="sw-grid-field-label">Project Manager</span>
                        <span className="sw-grid-field-val">
                          {proj.project_manager_id
                            ? userMap.get(proj.project_manager_id) || "Lead PM"
                            : "Unassigned"}
                        </span>
                      </div>
                      <div className="sw-grid-field">
                        <span className="sw-grid-field-label">Priority</span>
                        <span className="sw-grid-field-val">
                          <span className={`sw-badge ${proj.priority?.toLowerCase()}`}>
                            {proj.priority}
                          </span>
                        </span>
                      </div>
                      <div className="sw-grid-field">
                        <span className="sw-grid-field-label">Budget</span>
                        <span className="sw-grid-field-val success" style={{ fontSize: "0.92rem" }}>
                          {INR.format(proj.budget)}
                        </span>
                      </div>
                      <div className="sw-grid-field">
                        <span className="sw-grid-field-label">Start Date</span>
                        <span className="sw-grid-field-val">{proj.start_date || "—"}</span>
                      </div>
                      <div className="sw-grid-field full-width">
                        <span className="sw-grid-field-label">Target End Date</span>
                        <span className="sw-grid-field-val">{proj.target_end_date || "—"}</span>
                      </div>
                    </div>

                    {/* Actual Progress (Use real backend progress) */}
                    <div className="sw-grid-progress-box">
                      <div className="sw-grid-progress-header">
                        <span>Actual Progress</span>
                        <strong>{progress}%</strong>
                      </div>
                      <div className="sw-grid-progress-track">
                        <div
                          className={`sw-grid-progress-fill ${progress === 100 ? "completed" : ""}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {proj.description && (
                      <div
                        style={{
                          fontSize: "0.76rem",
                          color: "#64748b",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                        title={proj.description}
                      >
                        {proj.description}
                      </div>
                    )}
                  </div>

                  <div className="sw-grid-card-footer">
                    <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                      ID: {proj.id.slice(0, 8)}
                    </span>
                    <div className="sw-row-actions">
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
                  </div>
                </div>
              );
            })}
          </div>
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
      {viewingItem && (() => {
        const delivery = viewingItem.delivery_summary || {
          total_tasks: viewingItem.total_tasks ?? 0,
          completed_tasks: viewingItem.completed_tasks ?? 0,
          open_tasks: viewingItem.open_tasks ?? 0,
          task_completion_percentage: viewingItem.task_completion_percentage ?? 0,
          total_sprints: viewingItem.total_sprints ?? 0,
          completed_sprints: viewingItem.completed_sprints ?? 0,
          active_sprints: viewingItem.active_sprints ?? 0,
          sprint_completion_percentage: viewingItem.sprint_completion_percentage ?? 0,
          total_milestones: viewingItem.total_milestones ?? 0,
          completed_milestones: viewingItem.completed_milestones ?? 0,
          milestone_completion_percentage: viewingItem.milestone_completion_percentage ?? 0,
        };

        const overallProgress = Math.min(100, Math.max(0, viewingItem.progress_percentage ?? 0));
        const isCompleted = viewingItem.status === "Completed" || overallProgress === 100;

        const effectiveTimeSummary = projectTimeSummary || viewingItem.time_summary || {
          total_tracked_minutes: viewingItem.total_tracked_minutes ?? 0,
          total_tracked_hours: viewingItem.total_tracked_hours ?? 0,
          approved_billable_minutes: viewingItem.approved_billable_minutes ?? 0,
          approved_billable_hours: viewingItem.approved_billable_hours ?? 0,
          non_billable_minutes: viewingItem.non_billable_minutes ?? 0,
          non_billable_hours: viewingItem.non_billable_hours ?? 0,
        };

        const hasTimeEntries = (effectiveTimeSummary?.total_tracked_minutes ?? 0) > 0;

        return (
          <div className="sw-modal-overlay" onClick={() => setViewingItem(null)}>
            <div className="sw-modal-card" style={{ maxWidth: "760px", width: "95%" }} onClick={(e) => e.stopPropagation()}>
              <div className="sw-modal-header">
                <h2>{viewingItem.project_number}: {viewingItem.name}</h2>
                <button className="sw-btn-icon" onClick={() => setViewingItem(null)}>✕</button>
              </div>
              <div className="sw-modal-body">
                {/* Status Badges */}
                <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                  <span className={`sw-badge ${viewingItem.status?.toLowerCase().replace(/\s+/g, "-")}`}>
                    Status: {viewingItem.status}
                  </span>
                  <span className={`sw-badge ${viewingItem.priority?.toLowerCase()}`}>
                    Priority: {viewingItem.priority}
                  </span>
                  <span className="sw-badge active">Budget: {INR.format(viewingItem.budget)}</span>
                  <span className="sw-badge discovery">Progress: {overallProgress}%</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "12px", fontSize: "0.88rem" }}>
                  <p style={{ margin: 0 }}><strong>Contract:</strong> {contractMap.get(viewingItem.software_contract_id) || "—"}</p>
                  <p style={{ margin: 0 }}><strong>Project Manager:</strong> {viewingItem.project_manager_id ? userMap.get(viewingItem.project_manager_id) || "PM" : "Unassigned"}</p>
                  <p style={{ margin: 0 }}><strong>Timeline:</strong> {viewingItem.start_date || "—"} to {viewingItem.target_end_date || "—"}</p>
                  {viewingItem.actual_end_date && (
                    <p style={{ margin: 0, color: "#10b981" }}>
                      <strong>Actual End Date:</strong> {viewingItem.actual_end_date}
                    </p>
                  )}
                </div>

                {viewingItem.description && (
                  <div style={{ marginBottom: "16px" }}>
                    <strong style={{ fontSize: "0.85rem" }}>Description:</strong>
                    <p style={{ marginTop: "4px", lineHeight: "1.5", fontSize: "0.85rem", color: "#64748b" }}>{viewingItem.description}</p>
                  </div>
                )}

                {/* 1. Project Delivery Progress Section */}
                <div className="sw-project-section">
                  <div className="sw-section-title-row">
                    <h3>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      Project Delivery Progress
                    </h3>
                  </div>

                  <div className="sw-progress-overview-box">
                    <div className="sw-progress-header-line">
                      <span className="sw-progress-label">Overall Delivery Completion</span>
                      <span className="sw-progress-big-pct">{overallProgress}%</span>
                    </div>
                    <div className="sw-progress-track">
                      <div
                        className={`sw-progress-fill ${isCompleted ? "completed" : ""}`}
                        style={{ width: `${overallProgress}%` }}
                      />
                    </div>
                    <div className="sw-progress-subtext">
                      {viewingItem.status === "Planned" && "Project is currently Planned (0% baseline). Progress will accrue as milestones, sprints, and tasks complete."}
                      {viewingItem.status === "Cancelled" && "Project is Cancelled."}
                      {viewingItem.status === "Completed" && "Project is 100% completed and formally signed off."}
                      {viewingItem.status !== "Planned" && viewingItem.status !== "Cancelled" && viewingItem.status !== "Completed" && (
                        "Dynamic progress calculated across contract milestones, sprints, and linked delivery tasks (capped at 95% until final project sign-off)."
                      )}
                    </div>
                  </div>

                  <div className="sw-delivery-kpi-grid">
                    {/* Tasks KPI Card */}
                    <div className="sw-delivery-kpi-card">
                      <div className="sw-delivery-kpi-title">
                        <span>Tasks</span>
                        <span className="sw-delivery-kpi-badge">{delivery.task_completion_percentage}% done</span>
                      </div>
                      <div className="sw-delivery-kpi-stats">
                        <div className="sw-stat-line">
                          <span>Total Tasks:</span>
                          <strong>{delivery.total_tasks}</strong>
                        </div>
                        <div className="sw-stat-line">
                          <span>Completed:</span>
                          <strong style={{ color: "#10b981" }}>{delivery.completed_tasks}</strong>
                        </div>
                        <div className="sw-stat-line">
                          <span>Open / Pending:</span>
                          <strong style={{ color: delivery.open_tasks > 0 ? "#f59e0b" : "#64748b" }}>{delivery.open_tasks}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Sprints KPI Card */}
                    <div className="sw-delivery-kpi-card">
                      <div className="sw-delivery-kpi-title">
                        <span>Sprints</span>
                        <span className="sw-delivery-kpi-badge">{delivery.sprint_completion_percentage}% done</span>
                      </div>
                      <div className="sw-delivery-kpi-stats">
                        <div className="sw-stat-line">
                          <span>Total Sprints:</span>
                          <strong>{delivery.total_sprints}</strong>
                        </div>
                        <div className="sw-stat-line">
                          <span>Completed:</span>
                          <strong style={{ color: "#10b981" }}>{delivery.completed_sprints}</strong>
                        </div>
                        <div className="sw-stat-line">
                          <span>Active / Planned:</span>
                          <strong style={{ color: delivery.active_sprints > 0 ? "#0ea5e9" : "#64748b" }}>{delivery.active_sprints}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Milestones KPI Card */}
                    <div className="sw-delivery-kpi-card">
                      <div className="sw-delivery-kpi-title">
                        <span>Milestones</span>
                        <span className="sw-delivery-kpi-badge">{delivery.milestone_completion_percentage}% value</span>
                      </div>
                      <div className="sw-delivery-kpi-stats">
                        <div className="sw-stat-line">
                          <span>Total Milestones:</span>
                          <strong>{delivery.total_milestones}</strong>
                        </div>
                        <div className="sw-stat-line">
                          <span>Completed / Paid:</span>
                          <strong style={{ color: "#10b981" }}>{delivery.completed_milestones}</strong>
                        </div>
                        <div className="sw-stat-line">
                          <span>Progress Rate:</span>
                          <strong>{delivery.milestone_completion_percentage}%</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Project Time Tracking Summary Section */}
                <div className="sw-project-section">
                  <div className="sw-section-title-row">
                    <h3>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Project Time Tracking Summary
                    </h3>
                    {timeSummaryLoading && (
                      <span style={{ fontSize: "0.75rem", color: "#0ea5e9" }}>Refreshing metrics...</span>
                    )}
                  </div>

                  {timeSummaryError && !hasTimeEntries ? (
                    <div className="sw-error-banner" style={{ marginBottom: "12px" }}>
                      <span>{timeSummaryError}</span>
                      <button
                        type="button"
                        className="sw-btn-secondary"
                        style={{ marginLeft: "12px", padding: "4px 10px", fontSize: "0.75rem" }}
                        onClick={() => void fetchTimeSummary(viewingItem.id)}
                      >
                        Retry
                      </button>
                    </div>
                  ) : !hasTimeEntries && !timeSummaryLoading ? (
                    <div className="sw-time-empty-card">
                      <p style={{ margin: 0, fontWeight: 600 }}>No time entries recorded for this project yet.</p>
                      <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem" }}>
                        Time entries logged in the Software Time Tracking module or associated with this project's tasks & sprints will appear here automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="sw-time-summary-grid">
                      <div className="sw-time-card">
                        <div className="sw-time-card-title">Total Logged Time</div>
                        <div className="sw-time-card-value">{effectiveTimeSummary.total_tracked_hours} hrs</div>
                        <div className="sw-time-card-sub">{effectiveTimeSummary.total_tracked_minutes} mins total</div>
                      </div>

                      <div className="sw-time-card">
                        <div className="sw-time-card-title">Approved Billable</div>
                        <div className="sw-time-card-value" style={{ color: "#10b981" }}>{effectiveTimeSummary.approved_billable_hours} hrs</div>
                        <div className="sw-time-card-sub" style={{ color: "#10b981" }}>{effectiveTimeSummary.approved_billable_minutes} mins billable</div>
                      </div>

                      <div className="sw-time-card">
                        <div className="sw-time-card-title">Non-Billable Internal</div>
                        <div className="sw-time-card-value" style={{ color: "#f59e0b" }}>{effectiveTimeSummary.non_billable_hours} hrs</div>
                        <div className="sw-time-card-sub" style={{ color: "#f59e0b" }}>{effectiveTimeSummary.non_billable_minutes} mins internal</div>
                      </div>

                      <div className="sw-time-card">
                        <div className="sw-time-card-title">Recorded Activity</div>
                        <div className="sw-time-card-value" style={{ color: "#0ea5e9" }}>{effectiveTimeSummary.total_tracked_minutes}</div>
                        <div className="sw-time-card-sub">minutes tracked</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="sw-modal-footer">
                <button className="sw-btn-secondary" onClick={() => setViewingItem(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

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

