import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
} from "../../services/projectService";
import { getBuildings } from "../../services/buildingService";
import type {
  Project,
  ProjectCreate,
  ProjectUpdate,
} from "../../types/project";
import {
  PROJECT_TYPES,
  CONSTRUCTION_STATUSES,
  PROJECT_STATUSES,
} from "../../types/project";
import type { Building } from "../../types/building";
import { normalizeIndustry } from "../../utils/industryUtils";
import { resolveImageUrl } from "../../utils/imageUrl";
import "./Projects.css";

export default function Projects() {
  const navigate = useNavigate();
  const { industry } = useParams();

  const getBasePath = () => {
    if (industry) return `/${normalizeIndustry(industry)}`;
    const tenantStr = sessionStorage.getItem("tenant");
    if (tenantStr) {
      try {
        const t = JSON.parse(tenantStr);
        if (t?.industry) return `/${normalizeIndustry(t.industry)}`;
      } catch (e) {}
    }
    return "/real-estate";
  };

  const basePath = getBasePath();

  // Data states
  const [projects, setProjects] = useState<Project[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode: "grid" | "table" with session persistence
  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    try {
      const saved = sessionStorage.getItem("projects_view_mode");
      if (saved === "table" || saved === "grid") return saved;
    } catch {}
    return "grid";
  });

  const handleSetViewMode = (mode: "grid" | "table") => {
    setViewMode(mode);
    try {
      sessionStorage.setItem("projects_view_mode", mode);
    } catch {}
  };

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [constructionFilter, setConstructionFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [viewingProject, setViewingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Associated buildings for view modal
  const [relatedBuildings, setRelatedBuildings] = useState<Building[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const formatApiError = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (typeof first === "string") return first;
      if (first && typeof first.msg === "string") {
        const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
        return field && field !== "body" && field !== "query" ? `${field}: ${first.msg}` : first.msg;
      }
    }
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
      return detail.message;
    }
    return err?.message || fallback;
  };

  // Robust permission resolution (handles string, object roles, and nested permissions)
  const userPermissions = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (!stored) return { canView: true, canCreate: true, canUpdate: true, canDelete: true };
      const parsed = JSON.parse(stored);

      const roleStr = (
        typeof parsed.role === "string"
          ? parsed.role
          : parsed.role?.name || parsed.role_name || ""
      ).toUpperCase();

      const isReadOnly =
        roleStr === "READ_ONLY" ||
        roleStr === "READ ONLY" ||
        roleStr === "AUDITOR" ||
        roleStr.includes("READ-ONLY") ||
        roleStr.includes("AUDITOR");

      if (isReadOnly) {
        return { canView: true, canCreate: false, canUpdate: false, canDelete: false };
      }

      const isSuperOrAdmin =
        roleStr.includes("ADMIN") ||
        roleStr.includes("OWNER") ||
        roleStr.includes("MANAGER") ||
        roleStr.includes("SUPER") ||
        !roleStr;

      if (isSuperOrAdmin) {
        return { canView: true, canCreate: true, canUpdate: true, canDelete: true };
      }

      let perms: any[] = [];
      if (Array.isArray(parsed.permissions)) {
        perms = parsed.permissions;
      } else if (parsed.role && Array.isArray(parsed.role.permissions)) {
        perms = parsed.role.permissions;
      } else if (Array.isArray(parsed.role_permissions)) {
        perms = parsed.role_permissions;
      }

      const has = (p: string) => {
        const target = p.toLowerCase();
        return perms.some((item) => {
          if (typeof item === "string") return item.toLowerCase() === target;
          if (item && typeof item === "object" && typeof item.name === "string") {
            return item.name.toLowerCase() === target;
          }
          return false;
        });
      };

      return {
        canView: has("project.view") || has("projects"),
        canCreate: has("project.create"),
        canUpdate: has("project.update"),
        canDelete: has("project.delete"),
      };
    } catch {
      return { canView: true, canCreate: true, canUpdate: true, canDelete: true };
    }
  }, []);

  // Fetch projects and tenant buildings
  const fetchProjectList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsData, buildingsData] = await Promise.all([
        getProjects({
          search: searchTerm || undefined,
          project_type: typeFilter || undefined,
          status: statusFilter || undefined,
          construction_status: constructionFilter || undefined,
          city: cityFilter || undefined,
          limit: 100,
        }),
        getBuildings().catch(() => []),
      ]);
      setProjects(projectsData);
      setBuildings(buildingsData);
    } catch (err: any) {
      console.error("Failed to load projects:", err);
      setError(formatApiError(err, "Failed to load projects."));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, typeFilter, statusFilter, constructionFilter, cityFilter]);

  useEffect(() => {
    fetchProjectList();
  }, [fetchProjectList]);

  // Load buildings when viewing a specific project
  useEffect(() => {
    if (!viewingProject) {
      setRelatedBuildings([]);
      return;
    }
    setLoadingBuildings(true);
    getBuildings({ project_id: viewingProject.id })
      .then((res) => setRelatedBuildings(res))
      .catch((err) => console.error("Error loading project buildings:", err))
      .finally(() => setLoadingBuildings(false));
  }, [viewingProject]);

  // Map of buildings count by project id
  const projectBuildingCountMap = useMemo(() => {
    const map = new Map<string, number>();
    buildings.forEach((b) => {
      const count = map.get(b.project_id) || 0;
      map.set(b.project_id, count + 1);
    });
    return map;
  }, [buildings]);

  // Summary KPI calculation
  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => p.status === "Active").length;
    const underConstruction = projects.filter(
      (p) => p.construction_status === "Under Construction"
    ).length;
    const completed = projects.filter(
      (p) => p.construction_status === "Completed"
    ).length;
    return { total, active, underConstruction, completed };
  }, [projects]);

  // Progress percentage helper based on construction status
  const getProgressPercentage = (status: string) => {
    switch (status) {
      case "Planning":
        return 20;
      case "Under Construction":
        return 65;
      case "Completed":
        return 100;
      case "On Hold":
        return 45;
      default:
        return 30;
    }
  };

  // Extract initials for monogram fallback
  const getProjectInitials = (name: string) => {
    if (!name) return "PR";
    const parts = name.trim().split(/\s+/);
    const first = parts[0] || "P";
    const second = parts[1] || "";
    if (parts.length === 1) return first.substring(0, 2).toUpperCase();
    return ((first[0] || "P") + (second[0] || "R")).toUpperCase();
  };

  // Dynamic gradient based on project type
  const getTypeGradient = (type: string) => {
    switch (type) {
      case "Commercial":
        return "linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)";
      case "Mixed Use":
        return "linear-gradient(135deg, #6d28d9 0%, #7c3aed 50%, #8b5cf6 100%)";
      case "Industrial":
        return "linear-gradient(135deg, #374151 0%, #4b5563 50%, #6b7280 100%)";
      case "Land Development":
        return "linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%)";
      case "Residential":
      default:
        return "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%)";
    }
  };

  // Handle Form Submit (Add / Edit)
  const handleSaveProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const developer_name = String(formData.get("developer_name") || "").trim() || null;
    const project_type = String(formData.get("project_type") || "");
    const address = String(formData.get("address") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const state = String(formData.get("state") || "").trim();
    const country = String(formData.get("country") || "India").trim();
    const postal_code = String(formData.get("postal_code") || "").trim() || null;
    const amenities = String(formData.get("amenities") || "").trim() || null;
    const description = String(formData.get("description") || "").trim() || null;
    const total_buildings = formData.get("total_buildings")
      ? Number(formData.get("total_buildings"))
      : null;
    const total_units = formData.get("total_units")
      ? Number(formData.get("total_units"))
      : null;
    const construction_status = String(formData.get("construction_status") || "Planning");
    const status = String(formData.get("status") || "Active");
    const start_date = String(formData.get("start_date") || "") || null;
    const expected_completion_date =
      String(formData.get("expected_completion_date") || "") || null;

    // Client-side validations
    if (!name) {
      setFormError("Project name is required.");
      setSubmitting(false);
      return;
    }
    if (!project_type) {
      setFormError("Please select a project type.");
      setSubmitting(false);
      return;
    }
    if (!address) {
      setFormError("Street address is required.");
      setSubmitting(false);
      return;
    }
    if (!city || !state) {
      setFormError("City and State are required.");
      setSubmitting(false);
      return;
    }

    if (total_buildings !== null && total_buildings < 0) {
      setFormError("Total buildings cannot be negative.");
      setSubmitting(false);
      return;
    }
    if (total_units !== null && total_units < 0) {
      setFormError("Total units cannot be negative.");
      setSubmitting(false);
      return;
    }

    if (start_date && expected_completion_date && expected_completion_date < start_date) {
      setFormError("Expected completion date cannot be before the start date.");
      setSubmitting(false);
      return;
    }

    try {
      if (editingProject) {
        const updateData: ProjectUpdate = {
          name,
          developer_name,
          project_type,
          address,
          city,
          state,
          country,
          postal_code,
          amenities,
          description,
          total_buildings,
          total_units,
          construction_status,
          status,
          start_date,
          expected_completion_date,
        };
        const updated = await updateProject(editingProject.id, updateData);
        setProjects((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        showToast(`Project "${updated.name}" updated successfully!`);
      } else {
        const createData: ProjectCreate = {
          name,
          developer_name,
          project_type,
          address,
          city,
          state,
          country,
          postal_code,
          amenities,
          description,
          total_buildings,
          total_units,
          construction_status,
          status,
          start_date,
          expected_completion_date,
        };
        const created = await createProject(createData);
        setProjects((prev) => [created, ...prev]);
        showToast(`Project "${created.name}" created successfully!`);
      }

      setIsFormOpen(false);
      setEditingProject(null);
    } catch (err: any) {
      console.error("Save project error:", err);
      const detail = err?.response?.data?.detail;
      setFormError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: any) => d.msg || d.detail).join(", ")
          : "Failed to save project. Please verify inputs."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Action
  const handleDeleteConfirm = async () => {
    if (!deletingProject) return;
    setSubmitting(true);
    try {
      await deleteProject(deletingProject.id);
      setProjects((prev) => prev.filter((item) => item.id !== deletingProject.id));
      showToast(`Project "${deletingProject.name}" deleted successfully.`);
      setDeletingProject(null);
    } catch (err: any) {
      console.error("Delete project error:", err);
      showToast(
        err?.response?.data?.detail || "Failed to delete project.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const hasActiveFilters = Boolean(
    searchTerm || typeFilter || statusFilter || constructionFilter || cityFilter
  );

  const clearAllFilters = () => {
    setSearchTerm("");
    setTypeFilter("");
    setStatusFilter("");
    setConstructionFilter("");
    setCityFilter("");
  };

  return (
    <div className="projects-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`projects-toast ${toastMessage.type}`}>
          <div className="toast-icon">
            {toastMessage.type === "success" ? "✓" : "!"}
          </div>
          <div className="toast-text">{toastMessage.text}</div>
        </div>
      )}

      {/* ─── 1. Page Header ─── */}
      <div className="projects-header">
        <div className="header-titles">
          <div className="title-row">
            <h1>Projects</h1>
            <span className="count-chip">{projects.length} Total</span>
          </div>
          <p className="subtitle">
            Manage master developments, townships, and residential/commercial projects
          </p>
        </div>

        <div className="header-actions">
          {/* View Toggle */}
          <div className="view-mode-toggle" role="group" aria-label="View layout toggle">
            <button
              type="button"
              className={`toggle-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => handleSetViewMode("grid")}
              title="Card Grid View"
              aria-pressed={viewMode === "grid"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              <span>Grid</span>
            </button>
            <button
              type="button"
              className={`toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => handleSetViewMode("table")}
              title="Table View"
              aria-pressed={viewMode === "table"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              <span>Table</span>
            </button>
          </div>

          {/* Primary Add Project Button */}
          {userPermissions.canCreate && (
            <button
              type="button"
              className="btn-add-project"
              onClick={() => {
                setEditingProject(null);
                setFormError(null);
                setIsFormOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add Project</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── 2. Summary KPI Cards ─── */}
      <div className="projects-summary-grid">
        <div className="kpi-card blue">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <path d="M3 21h18M3 7v14M21 7v14M6 7V3h12v4M9 11h2M9 15h2M13 11h2M13 15h2"></path>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Total Projects</span>
            <span className="kpi-value">{stats.total}</span>
          </div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Active Projects</span>
            <span className="kpi-value">{stats.active}</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <rect x="2" y="6" width="20" height="12" rx="2"></rect>
              <path d="M12 12h.01"></path>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Under Construction</span>
            <span className="kpi-value">{stats.underConstruction}</span>
          </div>
        </div>

        <div className="kpi-card purple">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Completed Projects</span>
            <span className="kpi-value">{stats.completed}</span>
          </div>
        </div>
      </div>

      {/* ─── 3. Search and Filters Bar ─── */}
      <div className="projects-filter-container">
        <div className="filter-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by project name, developer, city, address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search-btn" onClick={() => setSearchTerm("")}>
              &times;
            </button>
          )}
        </div>

        <div className="filter-dropdowns-group">
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Project Types</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={constructionFilter}
            onChange={(e) => setConstructionFilter(e.target.value)}
          >
            <option value="">All Stages</option>
            {CONSTRUCTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input
            type="text"
            className="filter-city-input"
            placeholder="Filter City..."
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
          />

          {hasActiveFilters && (
            <button className="btn-clear-filters" onClick={clearAllFilters}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── 4. Project List / Grid / Empty State ─── */}
      {loading ? (
        <div className="projects-loading-state">
          <div className="spinner"></div>
          <p>Loading projects portfolio...</p>
        </div>
      ) : error ? (
        <div className="projects-error-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="36" height="36">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3>Failed to load projects</h3>
          <p>{error}</p>
          <button className="btn-retry" onClick={fetchProjectList}>
            Retry
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* ─── Grid View ─── */
        projects.length === 0 ? (
          <div className="projects-empty-card">
            <div className="empty-blueprint-art">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                <path d="M3 21h18M3 7v14M21 7v14M6 7V3h12v4M9 11h2M9 15h2M13 11h2M13 15h2"></path>
                <line x1="9" y1="7" x2="9" y2="7.01"></line>
                <line x1="15" y1="7" x2="15" y2="7.01"></line>
              </svg>
            </div>
            <h3>{hasActiveFilters ? "No matching projects found" : "No projects created yet"}</h3>
            <p>
              {hasActiveFilters
                ? "We couldn't find any developments matching your filters. Try clearing your search parameters."
                : "Get started by adding your first real estate project or master development."}
            </p>

            <div className="empty-actions">
              {hasActiveFilters ? (
                <button type="button" className="btn-secondary" onClick={clearAllFilters}>
                  Clear All Filters
                </button>
              ) : userPermissions.canCreate ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setEditingProject(null);
                    setFormError(null);
                    setIsFormOpen(true);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Your First Project
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="projects-grid">
          {projects.map((project) => {
            const hasImage = Boolean(project.image_url || project.thumbnail_url);
            const imageUrl = project.image_url || project.thumbnail_url;
            const initials = getProjectInitials(project.name);
            const progress = getProgressPercentage(project.construction_status);
            const actualBuildingCount =
              projectBuildingCountMap.get(project.id) ?? project.total_buildings ?? 0;

            return (
              <div key={project.id} className="project-card">
                {/* Visual Banner / Thumbnail */}
                <div
                  className="project-cover"
                  style={{
                    background: hasImage ? "#1e293b" : getTypeGradient(project.project_type),
                  }}
                  onClick={() => setViewingProject(project)}
                >
                  {hasImage ? (
                    <img
                      src={resolveImageUrl(imageUrl!)}
                      alt={project.name}
                      className="project-cover-img"
                      onError={(e) => {
                        // Safe fallback on load error without broken icon
                        e.currentTarget.style.display = "none";
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.style.background = getTypeGradient(project.project_type);
                        }
                      }}
                    />
                  ) : (
                    /* Stylized Architectural Blueprint Graphic */
                    <div className="blueprint-fallback-banner">
                      <div className="blueprint-pattern-grid"></div>
                      <div className="blueprint-monogram">{initials}</div>
                      <div className="blueprint-type-label">{project.project_type}</div>
                    </div>
                  )}

                  {/* Badges on cover */}
                  <div className="cover-badge-top-left">
                    <span className="type-badge">{project.project_type}</span>
                  </div>

                  <div className="cover-badge-top-right">
                    <span
                      className={`stage-pill ${
                        project.construction_status === "Planning"
                          ? "planning"
                          : project.construction_status === "Under Construction"
                          ? "under-construction"
                          : project.construction_status === "Completed"
                          ? "completed"
                          : "on-hold"
                      }`}
                    >
                      <span className="dot"></span>
                      {project.construction_status}
                    </span>
                  </div>
                </div>

                {/* Card Content Body */}
                <div className="project-card-body">
                  <div className="title-row">
                    <h3
                      className="project-name"
                      title={project.name}
                      onClick={() => setViewingProject(project)}
                    >
                      {project.name}
                    </h3>
                  </div>

                  <div className="developer-row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>{project.developer_name || "Independent Builder"}</span>
                  </div>

                  <div className="location-row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>
                      {project.city}, {project.state}
                    </span>
                  </div>

                  {/* Units & Buildings Stats */}
                  <div className="metrics-chip-row">
                    <div className="metric-chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"></path>
                      </svg>
                      <span>
                        <strong>{actualBuildingCount}</strong> {actualBuildingCount === 1 ? "Bldg" : "Bldgs"}
                      </span>
                    </div>

                    <div className="metric-chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      </svg>
                      <span>
                        <strong>{project.total_units ?? "—"}</strong> Units
                      </span>
                    </div>

                    <div className="metric-chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                      <span>
                        {project.expected_completion_date
                          ? new Date(project.expected_completion_date).toLocaleDateString(undefined, {
                              month: "short",
                              year: "numeric",
                            })
                          : "TBD"}
                      </span>
                    </div>
                  </div>

                  {/* Construction Progress Bar */}
                  <div className="progress-section">
                    <div className="progress-labels">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="project-card-footer">
                  <span
                    className={`status-pill ${
                      project.status === "Active"
                        ? "active"
                        : project.status === "Completed"
                        ? "completed"
                        : project.status === "On Hold"
                        ? "onhold"
                        : "inactive"
                    }`}
                  >
                    {project.status}
                  </span>

                  <div className="card-actions-group">
                    <button
                      type="button"
                      className="icon-btn"
                      title="View Details"
                      onClick={() => setViewingProject(project)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="icon-btn"
                      title="View Buildings"
                      onClick={() => navigate(`${basePath}/buildings?projectId=${project.id}`)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"></path>
                        <line x1="10" y1="6" x2="10" y2="6.01"></line>
                        <line x1="14" y1="6" x2="14" y2="6.01"></line>
                        <line x1="10" y1="10" x2="10" y2="10.01"></line>
                        <line x1="14" y1="10" x2="14" y2="10.01"></line>
                      </svg>
                    </button>

                    {userPermissions.canUpdate && (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit Project"
                        onClick={() => {
                          setEditingProject(project);
                          setFormError(null);
                          setIsFormOpen(true);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                    )}

                    {userPermissions.canDelete && (
                      <button
                        type="button"
                        className="icon-btn delete"
                        title="Delete Project"
                        onClick={() => setDeletingProject(project)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )
      ) : (
        /* ─── Table View ─── */
        <div className="projects-table-wrapper">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Developer</th>
                <th>Type</th>
                <th>Location</th>
                <th>Buildings / Units</th>
                <th>Construction Stage</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty-td">
                    <div className="table-empty-content">
                      <div className="empty-table-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
                          <path d="M3 21h18M3 7v14M21 7v14M6 7V3h12v4M9 11h2M9 15h2M13 11h2M13 15h2"></path>
                          <line x1="9" y1="7" x2="9" y2="7.01"></line>
                          <line x1="15" y1="7" x2="15" y2="7.01"></line>
                        </svg>
                      </div>
                      <h4>{hasActiveFilters ? "No matching projects found" : "No projects found"}</h4>
                      <p>
                        {hasActiveFilters
                          ? "We couldn't find any developments matching your filters. Try clearing your search parameters."
                          : "Add your first project to get started."}
                      </p>
                      <div className="empty-actions">
                        {hasActiveFilters ? (
                          <button type="button" className="btn-secondary" onClick={clearAllFilters}>
                            Clear All Filters
                          </button>
                        ) : userPermissions.canCreate ? (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => {
                              setEditingProject(null);
                              setFormError(null);
                              setIsFormOpen(true);
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Add Project
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                projects.map((project) => {
                const initials = getProjectInitials(project.name);
                const actualBuildingCount =
                  projectBuildingCountMap.get(project.id) ?? project.total_buildings ?? 0;

                return (
                  <tr key={project.id}>
                    <td>
                      <div className="table-project-cell">
                        <div
                          className="table-project-avatar"
                          style={{ background: getTypeGradient(project.project_type) }}
                        >
                          {initials}
                        </div>
                        <div className="table-project-meta">
                          <span
                            className="table-project-title"
                            onClick={() => setViewingProject(project)}
                          >
                            {project.name}
                          </span>
                          <span className="table-project-sub">
                            {project.expected_completion_date
                              ? `Completion: ${new Date(
                                  project.expected_completion_date
                                ).toLocaleDateString(undefined, {
                                  month: "short",
                                  year: "numeric",
                                })}`
                              : "No completion date"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="table-text-primary">
                        {project.developer_name || <span className="text-dim">—</span>}
                      </span>
                    </td>
                    <td>
                      <span className="table-type-chip">{project.project_type}</span>
                    </td>
                    <td>
                      <div className="table-text-primary">
                        {project.city}, {project.state}
                      </div>
                      <div className="table-text-muted">{project.address}</div>
                    </td>
                    <td>
                      <span className="table-bold">
                        {actualBuildingCount} bldgs / {project.total_units || 0} units
                      </span>
                    </td>
                    <td>
                      <span
                        className={`stage-pill ${
                          project.construction_status === "Planning"
                            ? "planning"
                            : project.construction_status === "Under Construction"
                            ? "under-construction"
                            : project.construction_status === "Completed"
                            ? "completed"
                            : "on-hold"
                        }`}
                      >
                        <span className="dot"></span>
                        {project.construction_status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          project.status === "Active"
                            ? "active"
                            : project.status === "Completed"
                            ? "completed"
                            : project.status === "On Hold"
                            ? "onhold"
                            : "inactive"
                        }`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions-cell">
                        <button
                          type="button"
                          className="icon-btn"
                          title="View Details"
                          onClick={() => setViewingProject(project)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="icon-btn"
                          title="View Buildings"
                          onClick={() => navigate(`${basePath}/buildings?projectId=${project.id}`)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"></path>
                          </svg>
                        </button>

                        {userPermissions.canUpdate && (
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit Project"
                            onClick={() => {
                              setEditingProject(project);
                              setFormError(null);
                              setIsFormOpen(true);
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                        )}

                        {userPermissions.canDelete && (
                          <button
                            type="button"
                            className="icon-btn delete"
                            title="Delete Project"
                            onClick={() => setDeletingProject(project)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── 5. Add / Edit Project Modal ─── */}
      {isFormOpen && (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-box">
                <h2>{editingProject ? "Edit Project" : "Add New Project"}</h2>
                <span className="modal-subtitle">
                  {editingProject
                    ? `Update properties and timeline for ${editingProject.name}`
                    : "Create a master development or township record"}
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setIsFormOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="modal-form">
              <div className="modal-body-scrollable">
                {formError && (
                  <div className="form-error-alert">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>{formError}</span>
                  </div>
                )}

                {/* Section: General Info */}
                <div className="form-section-title">General Information</div>

                <div className="form-row-2">
                  <div className="form-field">
                    <label>
                      Project Name <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={editingProject?.name || ""}
                      placeholder="e.g. Prestige Green Valley"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>Developer / Builder</label>
                    <input
                      type="text"
                      name="developer_name"
                      defaultValue={editingProject?.developer_name || ""}
                      placeholder="e.g. Prestige Estates Ltd"
                    />
                  </div>
                </div>

                <div className="form-row-3">
                  <div className="form-field">
                    <label>
                      Project Type <span className="req">*</span>
                    </label>
                    <select
                      name="project_type"
                      defaultValue={editingProject?.project_type || "Residential"}
                      required
                    >
                      {PROJECT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label>
                      Construction Stage <span className="req">*</span>
                    </label>
                    <select
                      name="construction_status"
                      defaultValue={editingProject?.construction_status || "Planning"}
                      required
                    >
                      {CONSTRUCTION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label>
                      Status <span className="req">*</span>
                    </label>
                    <select
                      name="status"
                      defaultValue={editingProject?.status || "Active"}
                      required
                    >
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Section: Location */}
                <div className="form-section-title">Location & Address</div>

                <div className="form-field">
                  <label>
                    Street Address <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    defaultValue={editingProject?.address || ""}
                    placeholder="e.g. Survey No. 45/2, Varthur Main Road, Whitefield"
                    required
                  />
                </div>

                <div className="form-row-3">
                  <div className="form-field">
                    <label>
                      City <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      name="city"
                      defaultValue={editingProject?.city || ""}
                      placeholder="e.g. Bangalore"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      State <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      name="state"
                      defaultValue={editingProject?.state || ""}
                      placeholder="e.g. Karnataka"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>Postal Code</label>
                    <input
                      type="text"
                      name="postal_code"
                      defaultValue={editingProject?.postal_code || ""}
                      placeholder="e.g. 560066"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>Country</label>
                  <input
                    type="text"
                    name="country"
                    defaultValue={editingProject?.country || "India"}
                  />
                </div>

                {/* Section: Scale & Timeline */}
                <div className="form-section-title">Capacity & Timeline</div>

                <div className="form-row-2">
                  <div className="form-field">
                    <label>Total Planned Buildings</label>
                    <input
                      type="number"
                      name="total_buildings"
                      min="0"
                      defaultValue={editingProject?.total_buildings ?? ""}
                      placeholder="e.g. 5"
                    />
                  </div>

                  <div className="form-field">
                    <label>Total Planned Units</label>
                    <input
                      type="number"
                      name="total_units"
                      min="0"
                      defaultValue={editingProject?.total_units ?? ""}
                      placeholder="e.g. 350"
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-field">
                    <label>Start Date</label>
                    <input
                      type="date"
                      name="start_date"
                      defaultValue={editingProject?.start_date || ""}
                    />
                  </div>

                  <div className="form-field">
                    <label>Expected Completion Date</label>
                    <input
                      type="date"
                      name="expected_completion_date"
                      defaultValue={editingProject?.expected_completion_date || ""}
                    />
                  </div>
                </div>

                {/* Section: Amenities & Highlights */}
                <div className="form-section-title">Amenities & Highlights</div>

                <div className="form-field">
                  <label>Amenities (Comma-separated)</label>
                  <input
                    type="text"
                    name="amenities"
                    defaultValue={editingProject?.amenities || ""}
                    placeholder="e.g. Swimming Pool, Clubhouse, 24/7 Security, Gymnasium, Landscaped Garden"
                  />
                </div>

                <div className="form-field">
                  <label>Project Description & Features</label>
                  <textarea
                    name="description"
                    defaultValue={editingProject?.description || ""}
                    rows={3}
                    placeholder="Enter architectural highlights, connectivity landmarks, nearby metro stations..."
                  />
                </div>

                {/* Info Box explaining Building Image architecture */}
                <div className="image-info-notice">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <div>
                    <strong>Photo & Gallery Management</strong>
                    <p>
                      In this CRM architecture, high-resolution photos and floor plans are uploaded directly under the constituent <strong>Buildings & Towers</strong> module. Once your project is created, navigate to Buildings to upload and reorder images.
                    </p>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsFormOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="btn-spinner"></span>
                      Saving...
                    </>
                  ) : editingProject ? (
                    "Save Changes"
                  ) : (
                    "Create Project"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 6. View Project Details Modal ─── */}
      {viewingProject && (
        <div className="modal-overlay" onClick={() => setViewingProject(null)}>
          <div className="modal-container view-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-box">
                <h2>{viewingProject.name}</h2>
                <span className="modal-subtitle">
                  {viewingProject.developer_name
                    ? `Developed by ${viewingProject.developer_name}`
                    : "Real Estate Development"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {userPermissions.canUpdate && (
                  <button
                    type="button"
                    className="btn-edit-header"
                    onClick={() => {
                      const proj = viewingProject;
                      setViewingProject(null);
                      setEditingProject(proj);
                      setFormError(null);
                      setIsFormOpen(true);
                    }}
                  >
                    Edit
                  </button>
                )}
                <button className="modal-close-btn" onClick={() => setViewingProject(null)}>
                  &times;
                </button>
              </div>
            </div>

            <div className="modal-body-scrollable">
              {/* Hero Banner Header */}
              <div
                className="view-hero-banner"
                style={{
                  background: viewingProject.image_url
                    ? "#0f172a"
                    : getTypeGradient(viewingProject.project_type),
                }}
              >
                {viewingProject.image_url ? (
                  <img
                    src={resolveImageUrl(viewingProject.image_url)}
                    alt={viewingProject.name}
                    className="view-hero-img"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                <div className="view-hero-overlay">
                  <div className="view-hero-monogram">{getProjectInitials(viewingProject.name)}</div>
                  <div>
                    <h3 className="view-hero-title">{viewingProject.name}</h3>
                    <p className="view-hero-sub">
                      {viewingProject.city}, {viewingProject.state} • {viewingProject.project_type}
                    </p>
                  </div>
                </div>
              </div>

              {/* Spec Cards Grid */}
              <div className="view-spec-grid">
                <div className="view-spec-item">
                  <span className="spec-label">Project Type</span>
                  <span className="spec-value">{viewingProject.project_type}</span>
                </div>

                <div className="view-spec-item">
                  <span className="spec-label">Construction Stage</span>
                  <span className="spec-value">{viewingProject.construction_status}</span>
                </div>

                <div className="view-spec-item">
                  <span className="spec-label">Project Status</span>
                  <span className="spec-value">{viewingProject.status}</span>
                </div>

                <div className="view-spec-item">
                  <span className="spec-label">Total Buildings</span>
                  <span className="spec-value">
                    {relatedBuildings.length > 0
                      ? relatedBuildings.length
                      : viewingProject.total_buildings ?? "—"}
                  </span>
                </div>

                <div className="view-spec-item">
                  <span className="spec-label">Total Units</span>
                  <span className="spec-value">{viewingProject.total_units ?? "—"}</span>
                </div>

                <div className="view-spec-item">
                  <span className="spec-label">Expected Completion</span>
                  <span className="spec-value">
                    {viewingProject.expected_completion_date
                      ? new Date(viewingProject.expected_completion_date).toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Not Specified"}
                  </span>
                </div>
              </div>

              {/* Location Card */}
              <div className="view-info-card">
                <div className="card-section-header">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  <h4>Site Location</h4>
                </div>
                <p className="location-text">
                  {viewingProject.address}, {viewingProject.city}, {viewingProject.state}{" "}
                  {viewingProject.postal_code || ""}, {viewingProject.country}
                </p>
              </div>

              {/* Description */}
              {viewingProject.description && (
                <div className="view-info-card">
                  <div className="card-section-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <line x1="8" y1="6" x2="21" y2="6"></line>
                      <line x1="8" y1="12" x2="21" y2="12"></line>
                      <line x1="8" y1="18" x2="21" y2="18"></line>
                    </svg>
                    <h4>Description & Connectivity</h4>
                  </div>
                  <p className="description-text">{viewingProject.description}</p>
                </div>
              )}

              {/* Amenities */}
              {viewingProject.amenities && (
                <div className="view-info-card">
                  <div className="card-section-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    <h4>Amenities & Facilities</h4>
                  </div>
                  <div className="view-amenities-tags">
                    {viewingProject.amenities.split(",").map((item, idx) => (
                      <span key={idx} className="amenity-tag">
                        ✓ {item.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Constituent Buildings */}
              <div className="view-info-card">
                <div className="card-section-header justify-between">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"></path>
                    </svg>
                    <h4>Constituent Buildings & Towers ({relatedBuildings.length})</h4>
                  </div>

                  <button
                    type="button"
                    className="btn-link-action"
                    onClick={() => {
                      navigate(`${basePath}/buildings?projectId=${viewingProject.id}`);
                    }}
                  >
                    Go to Buildings &rarr;
                  </button>
                </div>

                {loadingBuildings ? (
                  <div className="dim-loading">Loading constituent towers...</div>
                ) : relatedBuildings.length === 0 ? (
                  <div className="empty-buildings-note">
                    <p>No buildings have been created under this project yet.</p>
                    <button
                      type="button"
                      className="btn-create-building-link"
                      onClick={() => navigate(`${basePath}/buildings`)}
                    >
                      + Add Building in Buildings Module
                    </button>
                  </div>
                ) : (
                  <div className="related-buildings-grid">
                    {relatedBuildings.map((b) => (
                      <div key={b.id} className="related-building-pill">
                        <div className="bldg-top">
                          <span className="bldg-name">{b.name}</span>
                          <span className="bldg-status">{b.construction_status}</span>
                        </div>
                        <div className="bldg-meta">
                          {b.total_floors} Floors • {b.total_units} Units
                          {b.building_code ? ` • Code: ${b.building_code}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setViewingProject(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 7. Delete Confirmation Modal ─── */}
      {deletingProject && (
        <div className="modal-overlay" onClick={() => setDeletingProject(null)}>
          <div className="modal-container delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Project</h2>
              <button className="modal-close-btn" onClick={() => setDeletingProject(null)}>
                &times;
              </button>
            </div>

            <div className="modal-body-scrollable">
              <div className="delete-warning-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <p>
                  Are you sure you want to delete <strong>{deletingProject.name}</strong>?
                </p>
              </div>
              <p className="delete-sub-warning">
                This will remove the project from the CRM directory. Please make sure that any associated buildings or properties are reassigned or removed beforehand. This action cannot be reversed.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setDeletingProject(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-confirm-delete"
                onClick={handleDeleteConfirm}
                disabled={submitting}
              >
                {submitting ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
