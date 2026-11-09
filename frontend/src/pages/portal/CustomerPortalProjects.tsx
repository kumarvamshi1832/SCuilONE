import { useState, useEffect, useCallback } from "react";
import {
  CheckCircleIcon,
  RefreshIcon,
  AlertCircleIcon,
  XIcon,
  SearchIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalProjects,
  getPortalProject,
} from "../../services/customerPortalCommercialService";
import type { PortalProject, PortalProjectDetailResponse } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";

export default function CustomerPortalProjects() {
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedProject, setSelectedProject] = useState<PortalProjectDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortalProjects();
      setProjects(data || []);
    } catch (err: any) {
      console.error("Failed to load projects:", err);
      setError(err?.response?.data?.detail || "Unable to load software delivery projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleOpenDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await getPortalProject(id);
      setSelectedProject(data);
    } catch (err: any) {
      console.error("Failed to load project details:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const filtered = projects.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.project_number.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Active":
      case "In Progress":
        return <span className="badge-status status-in-progress">{status}</span>;
      case "Planned":
        return <span className="badge-status status-open">Planned</span>;
      case "Completed":
        return <span className="badge-status status-resolved">Completed</span>;
      case "On Hold":
        return <span className="badge-status status-waiting">On Hold</span>;
      default:
        return <span className="badge-status">{status}</span>;
    }
  };

  return (
    <div className="cp-tickets-page">
      <div className="cp-tickets-header">
        <div>
          <h1>Contracted Software Projects</h1>
          <p>
            Monitor real-time development progress, sprint iterations, and planned deliverables for your active projects.
          </p>
        </div>
        <button className="btn-secondary" onClick={fetchProjects} title="Refresh projects">
          <RefreshIcon size={16} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="cp-tickets-toolbar">
        <div className="cp-search-box" style={{ flex: 1 }}>
          <SearchIcon size={16} className="cp-search-icon" />
          <input
            type="text"
            placeholder="Search by project #, title or keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="cp-tickets-card">
        {error ? (
          <div className="support-alert error">
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#64748b" }}>
            <RefreshIcon size={24} className="animate-spin" style={{ margin: "0 auto 10px" }} />
            <div>Loading projects...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cp-empty-state">
            <CheckCircleIcon size={36} style={{ color: "#94a3b8", margin: "0 auto 12px" }} />
            <h3>No software projects found</h3>
            <p>There are no active or completed projects linked to your account agreements.</p>
          </div>
        ) : (
          <div className="cp-table-responsive">
            <table className="cp-tickets-table">
              <thead>
                <tr>
                  <th>Project #</th>
                  <th>Project Name</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Currency</th>
                  <th>Start Date</th>
                  <th>Target End</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "var(--cp-accent)" }}>{item.project_number}</strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      {item.description && (
                        <small style={{ color: "var(--cp-text-muted)" }}>
                          {item.description.slice(0, 60)}
                          {item.description.length > 60 ? "..." : ""}
                        </small>
                      )}
                    </td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td>
                      <span className={`badge-priority prio-${item.priority.toLowerCase()}`}>
                        {item.priority}
                      </span>
                    </td>
                    <td>{item.currency}</td>
                    <td style={{ color: "var(--cp-text-muted)", fontSize: "0.8125rem" }}>{item.start_date || "—"}</td>
                    <td style={{ color: "var(--cp-text-muted)", fontSize: "0.8125rem" }}>{item.target_end_date || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleOpenDetail(item.id)}
                        disabled={loadingDetail}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Project Detail Modal */}
      {selectedProject && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 840, width: "100%" }}>
            <div className="modal-header">
              <div>
                <h2>{selectedProject.name} (#{selectedProject.project_number})</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 2 }}>
                  Status: {getStatusBadge(selectedProject.status)} &bull; Priority: {selectedProject.priority}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedProject(null)}>
                <XIcon size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
              {/* Quick Info Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Project Currency</small>
                  <strong>{selectedProject.currency}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Start Date</small>
                  <strong>{selectedProject.start_date || "—"}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Target Delivery</small>
                  <strong>{selectedProject.target_end_date || "—"}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Actual Completed</small>
                  <strong>{selectedProject.actual_end_date || "In Progress"}</strong>
                </div>
              </div>

              {selectedProject.description && (
                <div style={{ marginBottom: 18 }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 6px 0" }}>Project Overview</h3>
                  <div style={{ background: "rgba(0,0,0,0.02)", padding: 12, borderRadius: 8, fontSize: "0.875rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {selectedProject.description}
                  </div>
                </div>
              )}

              {/* Scope & Deliverables */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 6px 0" }}>Scope of Work</h3>
                  <div style={{ background: "rgba(0,0,0,0.02)", padding: 12, borderRadius: 8, fontSize: "0.8125rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {selectedProject.scope_of_work}
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 6px 0" }}>Target Deliverables</h3>
                  <div style={{ background: "rgba(0,0,0,0.02)", padding: 12, borderRadius: 8, fontSize: "0.8125rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {selectedProject.deliverables}
                  </div>
                </div>
              </div>

              {/* Associated Sprints */}
              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "16px 0 8px 0" }}>
                Delivery Sprints & Iterations ({selectedProject.sprints?.length || 0})
              </h3>
              {(!selectedProject.sprints || selectedProject.sprints.length === 0) ? (
                <div style={{ color: "#64748b", fontStyle: "italic", padding: 12, background: "rgba(0,0,0,0.02)", borderRadius: 8 }}>
                  No development sprints planned yet.
                </div>
              ) : (
                <div className="cp-table-responsive" style={{ border: "1px solid #e2e8f0", borderRadius: 8 }}>
                  <table className="cp-tickets-table">
                    <thead>
                      <tr>
                        <th>Sprint Name</th>
                        <th>Sprint Goal</th>
                        <th>Status</th>
                        <th>Start Date</th>
                        <th>End Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProject.sprints.map((sp) => (
                        <tr key={sp.id}>
                          <td><strong>{sp.name}</strong></td>
                          <td style={{ fontSize: "0.8125rem", color: "#475569" }}>{sp.goal || "—"}</td>
                          <td>{getStatusBadge(sp.status)}</td>
                          <td style={{ color: "#64748b", fontSize: "0.8125rem" }}>{sp.start_date}</td>
                          <td style={{ color: "#64748b", fontSize: "0.8125rem" }}>{sp.end_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setSelectedProject(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

