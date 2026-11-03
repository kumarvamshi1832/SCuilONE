import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getSoftwareSprints,
  createSoftwareSprint,
  updateSoftwareSprint,
  deleteSoftwareSprint,
} from "../../services/softwareSprintService";
import { clearSoftwareForbidden, extractBackendDetail } from "../../services/softwareRequestManager";
import { getSoftwareProjects } from "../../services/softwareProjectService";

import type {
  SoftwareSprint,
  SoftwareSprintCreate,
  SoftwareSprintUpdate,
  SoftwareSprintStatus,
} from "../../types/softwareSprint";
import { SOFTWARE_SPRINT_STATUSES } from "../../types/softwareSprint";
import type { SoftwareProject } from "../../types/softwareProject";

import "./SoftwareModules.css";

export default function SoftwareSprints() {
  const [sprints, setSprints] = useState<SoftwareSprint[]>([]);
  const [projects, setProjects] = useState<SoftwareProject[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SoftwareSprint | null>(null);
  const [viewingItem, setViewingItem] = useState<SoftwareSprint | null>(null);
  const [deletingItem, setDeletingItem] = useState<SoftwareSprint | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState<SoftwareSprintCreate>({
    software_project_id: "",
    name: "",
    goal: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    status: "Planned",
  });

  const [isForbidden, setIsForbidden] = useState(false);
  const [forbiddenDetail, setForbiddenDetail] = useState<string | null>(null);

  const loadData = useCallback(async (forceRetry = false, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    if (forceRetry) {
      clearSoftwareForbidden("software_sprints");
      setIsForbidden(false);
      setForbiddenDetail(null);
    }
    try {
      const [sprintData, projData] = await Promise.all([
        getSoftwareSprints(undefined, { signal, forceRetry }),
        getSoftwareProjects(undefined, { signal, forceRetry }).catch(() => []),
      ]);

      setSprints(Array.isArray(sprintData) ? sprintData : []);
      setProjects(Array.isArray(projData) ? projData : []);
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

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  // Filtered List
  const filteredList = useMemo(() => {
    return sprints.filter((s) => {
      if (statusFilter && s.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (projectFilter && s.software_project_id !== projectFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const projName = projectMap.get(s.software_project_id)?.toLowerCase() || "";
        const matchName = s.name.toLowerCase().includes(q);
        const matchGoal = s.goal?.toLowerCase().includes(q) || false;
        const matchProj = projName.includes(q);
        if (!matchName && !matchGoal && !matchProj) return false;
      }
      return true;
    });
  }, [sprints, statusFilter, projectFilter, searchTerm, projectMap]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormError(null);
    const today = new Date();
    const twoWeeksLater = new Date(today.getTime() + 14 * 86400000);

    setFormData({
      software_project_id: projects[0]?.id || "",
      name: "",
      goal: "",
      start_date: today.toISOString().slice(0, 10),
      end_date: twoWeeksLater.toISOString().slice(0, 10),
      status: "Planned",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: SoftwareSprint) => {
    setEditingItem(item);
    setFormError(null);
    setFormData({
      software_project_id: item.software_project_id,
      name: item.name,
      goal: item.goal || "",
      start_date: item.start_date,
      end_date: item.end_date,
      status: (item.status as SoftwareSprintStatus) || "Planned",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError("Sprint name cannot be blank.");
      return;
    }
    if (!formData.software_project_id) {
      setFormError("Please select a Software Project.");
      return;
    }
    if (formData.end_date < formData.start_date) {
      setFormError("End date cannot precede start date.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        const payload: SoftwareSprintUpdate = {
          name: formData.name,
          goal: formData.goal,
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: formData.status,
        };
        const updated = await updateSoftwareSprint(editingItem.id, payload);
        setSprints((prev) => prev.map((s) => (s.id === editingItem.id ? updated : s)));
      } else {
        const created = await createSoftwareSprint(formData);
        setSprints((prev) => [created, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.message || "Failed to save sprint");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setSubmitting(true);
    try {
      await deleteSoftwareSprint(deletingItem.id);
      setSprints((prev) => prev.filter((s) => s.id !== deletingItem.id));
      setDeletingItem(null);
    } catch (err: any) {
      alert("Failed to delete sprint: " + err.message);
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
            Software Sprints
            <span className="sw-count-badge">{sprints.length} Total</span>
          </h1>
          <p>Agile sprint iterations, velocity milestones, delivery targets, and software engineering cycles.</p>
        </div>
        <button className="sw-btn-primary" onClick={handleOpenCreate}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Sprint
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
            placeholder="Search sprints by name, goal, or project..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="sw-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          {SOFTWARE_SPRINT_STATUSES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>

        <select
          className="sw-filter-select"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Table Card */}
      <div className="sw-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            Loading software sprints...
          </div>
        ) : isForbidden ? (
          <div className="sw-forbidden-card">
            <div className="sw-forbidden-icon-box">🔒</div>
            <h3>Software Sprints Access Restricted</h3>
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
            No software sprints found matching your criteria.
          </div>
        ) : (
          <table className="sw-data-table">
            <thead>
              <tr>
                <th>Sprint Name</th>
                <th>Software Project</th>
                <th>Goal</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((sprint) => (
                <tr key={sprint.id}>
                  <td style={{ fontWeight: 700 }}>{sprint.name}</td>
                  <td>
                    <span style={{ color: "#0ea5e9", fontWeight: 600 }}>
                      {projectMap.get(sprint.software_project_id) || "Core Platform"}
                    </span>
                  </td>
                  <td style={{ maxWidth: "280px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {sprint.goal || "—"}
                  </td>
                  <td>{sprint.start_date}</td>
                  <td>{sprint.end_date}</td>
                  <td>
                    <span className={`sw-badge ${sprint.status?.toLowerCase()}`}>
                      {sprint.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="sw-row-actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="sw-btn-icon"
                        title="View Details"
                        onClick={() => setViewingItem(sprint)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      <button
                        className="sw-btn-icon"
                        title="Edit Sprint"
                        onClick={() => handleOpenEdit(sprint)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        className="sw-btn-icon danger"
                        title="Delete Sprint"
                        onClick={() => setDeletingItem(sprint)}
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
          <div className="sw-modal-card" style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>{editingItem ? "Edit Software Sprint" : "New Software Sprint"}</h2>
              <button className="sw-btn-icon" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="sw-modal-body">
                {formError && <div className="sw-error-banner">{formError}</div>}

                <div className="sw-form-group">
                  <label>Software Project *</label>
                  <select
                    className="sw-form-select"
                    required
                    value={formData.software_project_id}
                    onChange={(e) => setFormData({ ...formData, software_project_id: e.target.value })}
                  >
                    <option value="">Select Project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.project_number})</option>
                    ))}
                  </select>
                </div>

                <div className="sw-form-group">
                  <label>Sprint Name *</label>
                  <input
                    type="text"
                    className="sw-form-input"
                    required
                    placeholder="e.g. Sprint 12 - Authentication & Roles"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Start Date *</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      required
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>End Date *</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      required
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="sw-form-group">
                  <label>Status</label>
                  <select
                    className="sw-form-select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as SoftwareSprintStatus })}
                  >
                    {SOFTWARE_SPRINT_STATUSES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div className="sw-form-group">
                  <label>Sprint Goal</label>
                  <textarea
                    className="sw-form-textarea"
                    placeholder="Key deliverables and focus areas for this cycle..."
                    value={formData.goal || ""}
                    onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                  />
                </div>
              </div>

              <div className="sw-modal-footer">
                <button type="button" className="sw-btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="sw-btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingItem ? "Update Sprint" : "Create Sprint"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewingItem && (
        <div className="sw-modal-overlay" onClick={() => setViewingItem(null)}>
          <div className="sw-modal-card" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>{viewingItem.name}</h2>
              <button className="sw-btn-icon" onClick={() => setViewingItem(null)}>✕</button>
            </div>
            <div className="sw-modal-body">
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <span className={`sw-badge ${viewingItem.status?.toLowerCase()}`}>Status: {viewingItem.status}</span>
                <span className="sw-badge planned">Duration: {viewingItem.start_date} to {viewingItem.end_date}</span>
              </div>
              <p><strong>Project:</strong> {projectMap.get(viewingItem.software_project_id) || "—"}</p>
              {viewingItem.goal && (
                <div>
                  <strong>Sprint Goal:</strong>
                  <p style={{ marginTop: "4px", lineHeight: "1.6" }}>{viewingItem.goal}</p>
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
              <p>Are you sure you want to delete <strong>{deletingItem.name}</strong>?</p>
            </div>
            <div className="sw-modal-footer">
              <button className="sw-btn-secondary" onClick={() => setDeletingItem(null)}>Cancel</button>
              <button className="sw-btn-primary" style={{ background: "#ef4444" }} onClick={handleDelete} disabled={submitting}>
                {submitting ? "Deleting..." : "Delete Sprint"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

