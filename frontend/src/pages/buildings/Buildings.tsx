import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getBuildings,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  getBuildingImages,
  uploadBuildingImages,
  updateBuildingImage,
  deleteBuildingImage,
} from "../../services/buildingService";
import { getProjects } from "../../services/projectService";
import type {
  Building,
  BuildingCreate,
  BuildingUpdate,
  BuildingImage,
} from "../../types/building";
import {
  BUILDING_TYPES,
  BUILDING_CONSTRUCTION_STATUSES,
  BUILDING_STATUSES,
  BUILDING_IMAGE_CATEGORIES,
} from "../../types/building";
import type { Project } from "../../types/project";
import { resolveImageUrl, handleImageError } from "../../utils/imageUrl";
import "./Buildings.css";

export default function Buildings() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [buildingThumbnails, setBuildingThumbnails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [constructionFilter, setConstructionFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [viewingBuilding, setViewingBuilding] = useState<Building | null>(null);
  const [deletingBuilding, setDeletingBuilding] = useState<Building | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Image Gallery in View Modal
  const [viewTab, setViewTab] = useState<"overview" | "images">("overview");
  const [buildingImages, setBuildingImages] = useState<BuildingImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>("Exterior");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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

  // Permissions
  const userPermissions = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (!stored) return { canCreate: true, canUpdate: true, canDelete: true };
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
        canCreate: has("building.create"),
        canUpdate: has("building.update"),
        canDelete: has("building.delete"),
      };
    } catch {
      return { canCreate: true, canUpdate: true, canDelete: true };
    }
  }, []);

  // Fetch initial projects
  useEffect(() => {
    getProjects()
      .then((data) => setProjects(data))
      .catch((err) => console.error("Failed to load projects for dropdown:", err));
  }, []);

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  // Fetch Buildings
  const fetchBuildingList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBuildings({
        search: searchTerm || undefined,
        project_id: projectFilter || undefined,
        building_type: typeFilter || undefined,
        status: statusFilter || undefined,
        construction_status: constructionFilter || undefined,
        city: cityFilter || undefined,
        limit: 150,
      });
      setBuildings(data);

      // Lazily load primary images for buildings (first 15)
      data.slice(0, 20).forEach((b) => {
        getBuildingImages(b.id)
          .then((imgs) => {
            if (imgs && imgs.length > 0) {
              const primary = imgs.find((i) => i.is_primary) || imgs[0];
              if (primary?.image_url) {
                setBuildingThumbnails((prev) => ({
                  ...prev,
                  [b.id]: primary.image_url,
                }));
              }
            }
          })
          .catch(() => {});
      });
    } catch (err: any) {
      console.error("Failed to load buildings:", err);
      setError(formatApiError(err, "Unable to load buildings. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, projectFilter, typeFilter, statusFilter, constructionFilter, cityFilter]);

  useEffect(() => {
    fetchBuildingList();
  }, [fetchBuildingList]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const total = buildings.length;
    const active = buildings.filter((b) => b.status === "Active").length;
    const underConstruction = buildings.filter(
      (b) => b.construction_status === "Under Construction"
    ).length;
    const completed = buildings.filter(
      (b) => b.construction_status === "Completed"
    ).length;
    return { total, active, underConstruction, completed };
  }, [buildings]);

  // Load building images when view modal opens
  const loadImages = useCallback(async (buildingId: string) => {
    setLoadingImages(true);
    try {
      const imgs = await getBuildingImages(buildingId);
      setBuildingImages(imgs);
      const primary = imgs.find((i) => i.is_primary) || imgs[0];
      if (primary?.image_url) {
        setBuildingThumbnails((prev) => ({
          ...prev,
          [buildingId]: primary.image_url,
        }));
      }
    } catch (err) {
      console.error("Failed to load building images:", err);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  useEffect(() => {
    if (viewingBuilding) {
      setViewTab("overview");
      loadImages(viewingBuilding.id);
    } else {
      setBuildingImages([]);
    }
  }, [viewingBuilding, loadImages]);

  // Save building
  const handleSaveBuilding = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const project_id = String(formData.get("project_id") || "");
    const name = String(formData.get("name") || "").trim();
    const building_code = String(formData.get("building_code") || "").trim() || null;
    const building_type = String(formData.get("building_type") || "Residential Tower");
    const total_floors = Number(formData.get("total_floors") || 1);
    const total_units = Number(formData.get("total_units") || 0);
    const construction_status = String(formData.get("construction_status") || "Planning");
    const status = String(formData.get("status") || "Active");
    const start_date = String(formData.get("start_date") || "") || null;
    const expected_completion_date =
      String(formData.get("expected_completion_date") || "") || null;
    const description = String(formData.get("description") || "").trim() || null;

    if (!name || !project_id || total_floors < 1) {
      setFormError("Please fill in Project, Building Name, and valid Floors (min 1).");
      setSubmitting(false);
      return;
    }

    if (start_date && expected_completion_date && expected_completion_date < start_date) {
      setFormError("Expected completion date cannot be before start date.");
      setSubmitting(false);
      return;
    }

    try {
      if (editingBuilding) {
        const payload: BuildingUpdate = {
          project_id,
          name,
          building_code,
          building_type,
          total_floors,
          total_units,
          construction_status,
          status,
          start_date,
          expected_completion_date,
          description,
        };
        const updated = await updateBuilding(editingBuilding.id, payload);
        setBuildings((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        showToast("Building updated successfully!");
      } else {
        const payload: BuildingCreate = {
          project_id,
          name,
          building_code,
          building_type,
          total_floors,
          total_units,
          construction_status,
          status,
          start_date,
          expected_completion_date,
          description,
        };
        const created = await createBuilding(payload);
        setBuildings((prev) => [created, ...prev]);
        showToast("Building created successfully!");
      }
      setIsFormOpen(false);
      setEditingBuilding(null);
    } catch (err: any) {
      console.error("Save building error:", err);
      const detail = err?.response?.data?.detail;
      setFormError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: any) => d.msg).join(", ")
          : "Failed to save building. Please check your inputs."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Building
  const handleDeleteConfirm = async () => {
    if (!deletingBuilding) return;
    setSubmitting(true);
    try {
      await deleteBuilding(deletingBuilding.id);
      setBuildings((prev) => prev.filter((item) => item.id !== deletingBuilding.id));
      showToast("Building deleted successfully!");
      setDeletingBuilding(null);
    } catch (err: any) {
      console.error("Delete building error:", err);
      showToast(err?.response?.data?.detail || "Failed to delete building.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Image Upload handler
  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!viewingBuilding || !e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setUploadingImage(true);
    try {
      const uploaded = await uploadBuildingImages(
        viewingBuilding.id,
        files,
        uploadCategory
      );
      setBuildingImages((prev) => [...prev, ...uploaded]);
      const primary = uploaded.find((i) => i.is_primary) || uploaded[0];
      if (primary?.image_url) {
        setBuildingThumbnails((prev) => ({
          ...prev,
          [viewingBuilding.id]: primary.image_url,
        }));
      }
      showToast(`Uploaded ${uploaded.length} image(s)!`);
    } catch (err: any) {
      console.error("Image upload error:", err);
      showToast(err?.response?.data?.detail || "Failed to upload image(s).", "error");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  // Set Primary Image
  const handleSetPrimary = async (imageId: string) => {
    if (!viewingBuilding) return;
    try {
      await updateBuildingImage(viewingBuilding.id, imageId, { is_primary: true });
      setBuildingImages((prev) =>
        prev.map((img) => ({
          ...img,
          is_primary: img.id === imageId,
        }))
      );
      const chosen = buildingImages.find((img) => img.id === imageId);
      if (chosen?.image_url) {
        setBuildingThumbnails((prev) => ({
          ...prev,
          [viewingBuilding.id]: chosen.image_url,
        }));
      }
      showToast("Primary image updated!");
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to set primary image.", "error");
    }
  };

  // Delete Image
  const handleDeleteImage = async (imageId: string) => {
    if (!viewingBuilding) return;
    try {
      await deleteBuildingImage(viewingBuilding.id, imageId);
      setBuildingImages((prev) => prev.filter((img) => img.id !== imageId));
      showToast("Image deleted successfully!");
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to delete image.", "error");
    }
  };

  // Helper for initials
  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    const f = parts[0] || "B";
    const s = parts[1] || "";
    return (f.charAt(0) + (s ? s.charAt(0) : f.charAt(1) || "")).toUpperCase();
  };

  return (
    <div className="buildings-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`crm-toast ${toastMessage.type}`}>
          {toastMessage.type === "success" ? "✓ " : "✕ "}
          {toastMessage.text}
        </div>
      )}

      {/* ─── 1. Header ─── */}
      <div className="buildings-header">
        <div className="header-titles">
          <div className="title-row">
            <h1>Buildings & Towers</h1>
            <span className="count-chip">{buildings.length} Total</span>
          </div>
          <p className="subtitle">
            Track towers, wings, blocks, and upload architectural plans and photos.
          </p>
        </div>

        <div className="header-actions">
          {/* View Mode Toggle */}
          <div className="view-mode-toggle">
            <button
              className={`toggle-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              Grid
            </button>
            <button
              className={`toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              Table
            </button>
          </div>

          {userPermissions.canCreate && (
            <button
              className="btn-add-building"
              onClick={() => {
                setEditingBuilding(null);
                setFormError(null);
                setIsFormOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Building
            </button>
          )}
        </div>
      </div>

      {/* ─── 2. Summary Cards ─── */}
      <div className="buildings-summary-grid">
        <div className="kpi-card blue">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
              <line x1="9" y1="22" x2="9" y2="22.01"></line>
              <line x1="15" y1="22" x2="15" y2="22.01"></line>
              <line x1="8" y1="6" x2="10" y2="6"></line>
              <line x1="14" y1="6" x2="16" y2="6"></line>
              <line x1="8" y1="10" x2="10" y2="10"></line>
              <line x1="14" y1="10" x2="16" y2="10"></line>
              <line x1="8" y1="14" x2="10" y2="14"></line>
              <line x1="14" y1="14" x2="16" y2="14"></line>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Total Buildings</span>
            <span className="kpi-value">{summaryCounts.total}</span>
          </div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Active Buildings</span>
            <span className="kpi-value">{summaryCounts.active}</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Under Construction</span>
            <span className="kpi-value">{summaryCounts.underConstruction}</span>
          </div>
        </div>

        <div className="kpi-card purple">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Completed</span>
            <span className="kpi-value">{summaryCounts.completed}</span>
          </div>
        </div>
      </div>

      {/* ─── 3. Filter Toolbar ─── */}
      <div className="buildings-filter-container">
        <div className="filter-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search buildings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchTerm("")}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="filter-dropdowns-group">
          <select
            className="filter-select"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {BUILDING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {BUILDING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={constructionFilter}
            onChange={(e) => setConstructionFilter(e.target.value)}
          >
            <option value="">All Stages</option>
            {BUILDING_CONSTRUCTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input
            type="text"
            className="filter-input"
            placeholder="City..."
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
          />

          {(searchTerm || projectFilter || typeFilter || statusFilter || constructionFilter || cityFilter) && (
            <button
              className="btn-clear-filters"
              onClick={() => {
                setSearchTerm("");
                setProjectFilter("");
                setTypeFilter("");
                setStatusFilter("");
                setConstructionFilter("");
                setCityFilter("");
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* ─── 4. Main Content Area ─── */}
      {loading ? (
        <div className="buildings-loading-state">
          <div className="spinner"></div>
          <p style={{ margin: 0, color: "#64748b", fontWeight: 500 }}>
            Loading buildings and towers...
          </p>
        </div>
      ) : error ? (
        <div className="buildings-error-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" width="32" height="32" style={{ margin: "0 auto 12px" }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3 style={{ margin: "0 0 6px", color: "#dc2626" }}>Unable to load buildings</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b" }}>{error}</p>
          <button className="btn-secondary" onClick={() => fetchBuildingList()}>
            Retry
          </button>
        </div>
      ) : buildings.length === 0 ? (
        <div className="buildings-empty-card">
          <div className="empty-building-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
              <line x1="9" y1="22" x2="9" y2="22.01"></line>
              <line x1="15" y1="22" x2="15" y2="22.01"></line>
              <line x1="8" y1="6" x2="10" y2="6"></line>
              <line x1="14" y1="6" x2="16" y2="6"></line>
              <line x1="8" y1="10" x2="10" y2="10"></line>
              <line x1="14" y1="10" x2="16" y2="10"></line>
            </svg>
          </div>
          <h3>No buildings found</h3>
          <p>
            {searchTerm || projectFilter || typeFilter || statusFilter || constructionFilter || cityFilter
              ? "No buildings match your filter criteria. Try resetting filters."
              : "Create your first building to get started."}
          </p>
          {userPermissions.canCreate && (
            <button
              className="btn-add-building"
              onClick={() => {
                setEditingBuilding(null);
                setFormError(null);
                setIsFormOpen(true);
              }}
            >
              + Add Building
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* ─── Grid View ─── */
        <div className="buildings-grid">
          {buildings.map((b) => {
            const project = projectMap.get(b.project_id);
            const thumbUrl = buildingThumbnails[b.id];
            const stageClass =
              b.construction_status === "Planning"
                ? "badge-planning"
                : b.construction_status === "Under Construction"
                ? "badge-underconstruction"
                : "badge-completed";

            const statusClass =
              b.status === "Active" ? "badge-active" : "badge-inactive";

            return (
              <div key={b.id} className="building-card">
                <div className="building-card-media">
                  {thumbUrl ? (
                    <img
                      src={resolveImageUrl(thumbUrl)}
                      alt={b.name}
                      className="building-card-image"
                      onError={handleImageError}
                    />
                  ) : (
                    <div className="building-card-placeholder">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                        <line x1="9" y1="22" x2="9" y2="22.01"></line>
                        <line x1="15" y1="22" x2="15" y2="22.01"></line>
                      </svg>
                      {b.building_code && (
                        <span className="building-code-pill">{b.building_code}</span>
                      )}
                    </div>
                  )}

                  <div className="building-badge-overlay">
                    <span className={`badge ${stageClass}`}>{b.construction_status}</span>
                  </div>
                </div>

                <div className="building-card-body">
                  <div className="building-header-row">
                    <h3 className="building-title">{b.name}</h3>
                    <span className={`badge ${statusClass}`}>{b.status}</span>
                  </div>

                  <div className="building-project-name">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    {project ? `${project.name}${project.city ? ` (${project.city})` : ""}` : "Project"}
                  </div>

                  <div className="building-meta-grid">
                    <div className="building-meta-item">
                      <span className="building-meta-label">Total Floors</span>
                      <span className="building-meta-val">{b.total_floors} Floors</span>
                    </div>
                    <div className="building-meta-item">
                      <span className="building-meta-label">Total Units</span>
                      <span className="building-meta-val">{b.total_units} Units</span>
                    </div>
                    <div className="building-meta-item">
                      <span className="building-meta-label">Code / ID</span>
                      <span className="building-meta-val">{b.building_code || "—"}</span>
                    </div>
                    <div className="building-meta-item">
                      <span className="building-meta-label">Type</span>
                      <span className="building-meta-val">{b.building_type}</span>
                    </div>
                  </div>

                  <div className="building-card-footer">
                    <span className="type-tag">{b.building_type}</span>

                    <div className="action-buttons-group">
                      <button
                        className="btn-action-icon"
                        title="View Details & Photos"
                        onClick={() => setViewingBuilding(b)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>

                      {userPermissions.canUpdate && (
                        <button
                          className="btn-action-icon"
                          title="Edit Building"
                          onClick={() => {
                            setEditingBuilding(b);
                            setFormError(null);
                            setIsFormOpen(true);
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </button>
                      )}

                      {userPermissions.canDelete && (
                        <button
                          className="btn-action-icon delete"
                          title="Delete Building"
                          onClick={() => setDeletingBuilding(b)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── Table View ─── */
        <div className="buildings-table-container">
          <table className="buildings-table">
            <thead>
              <tr>
                <th>Building Name</th>
                <th>Project</th>
                <th>Type</th>
                <th>Floors & Units</th>
                <th>Construction Stage</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => {
                const project = projectMap.get(b.project_id);
                const thumbUrl = buildingThumbnails[b.id];
                const stageClass =
                  b.construction_status === "Planning"
                    ? "badge-planning"
                    : b.construction_status === "Under Construction"
                    ? "badge-underconstruction"
                    : "badge-completed";

                const statusClass =
                  b.status === "Active" ? "badge-active" : "badge-inactive";

                return (
                  <tr key={b.id}>
                    <td>
                      <div className="table-building-cell">
                        {thumbUrl ? (
                          <img
                            src={resolveImageUrl(thumbUrl)}
                            alt={b.name}
                            className="table-thumb"
                            onError={handleImageError}
                          />
                        ) : (
                          <div className="table-thumb-fallback">
                            {getInitials(b.name)}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{b.name}</div>
                          {b.building_code && (
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              Code: {b.building_code}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {project ? project.name : "Project"}
                      </div>
                      {project?.city && (
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {project.city}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="type-tag">{b.building_type}</span>
                    </td>
                    <td>
                      <div>
                        <strong>{b.total_floors}</strong> floors • <strong>{b.total_units}</strong> units
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${stageClass}`}>{b.construction_status}</span>
                    </td>
                    <td>
                      <span className={`badge ${statusClass}`}>{b.status}</span>
                    </td>
                    <td>
                      <div className="action-buttons-group" style={{ justifyContent: "flex-end" }}>
                        <button
                          className="btn-action-icon"
                          title="View Details & Photos"
                          onClick={() => setViewingBuilding(b)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>

                        {userPermissions.canUpdate && (
                          <button
                            className="btn-action-icon"
                            title="Edit Building"
                            onClick={() => {
                              setEditingBuilding(b);
                              setFormError(null);
                              setIsFormOpen(true);
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                        )}

                        {userPermissions.canDelete && (
                          <button
                            className="btn-action-icon delete"
                            title="Delete Building"
                            onClick={() => setDeletingBuilding(b)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
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
      )}

      {/* ─── Add / Edit Modal ─── */}
      {isFormOpen && (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingBuilding ? "Edit Building" : "Add New Building"}</h2>
              <button className="modal-close-btn" onClick={() => setIsFormOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveBuilding} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem", fontWeight: 500 }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label>Parent Project *</label>
                  <select
                    name="project_id"
                    defaultValue={editingBuilding?.project_id || (projects[0]?.id || "")}
                    required
                  >
                    <option value="" disabled>Select a project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.city ? `(${p.city})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Building / Tower Name *</label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={editingBuilding?.name || ""}
                      placeholder="e.g. Tower A or Wing 1"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Building Code / Identifier</label>
                    <input
                      type="text"
                      name="building_code"
                      defaultValue={editingBuilding?.building_code || ""}
                      placeholder="e.g. TWR-A"
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Building Type *</label>
                    <select
                      name="building_type"
                      defaultValue={editingBuilding?.building_type || "Residential Tower"}
                      required
                    >
                      {BUILDING_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Construction Status *</label>
                    <select
                      name="construction_status"
                      defaultValue={editingBuilding?.construction_status || "Planning"}
                      required
                    >
                      {BUILDING_CONSTRUCTION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Total Floors * (1 - 300)</label>
                    <input
                      type="number"
                      name="total_floors"
                      min="1"
                      max="300"
                      defaultValue={editingBuilding?.total_floors || 1}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Total Units</label>
                    <input
                      type="number"
                      name="total_units"
                      min="0"
                      defaultValue={editingBuilding?.total_units || 0}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Start Date</label>
                    <input
                      type="date"
                      name="start_date"
                      defaultValue={editingBuilding?.start_date || ""}
                    />
                  </div>
                  <div className="form-group">
                    <label>Expected Completion Date</label>
                    <input
                      type="date"
                      name="expected_completion_date"
                      defaultValue={editingBuilding?.expected_completion_date || ""}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    name="status"
                    defaultValue={editingBuilding?.status || "Active"}
                  >
                    {BUILDING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Description / Notes</label>
                  <textarea
                    name="description"
                    defaultValue={editingBuilding?.description || ""}
                    placeholder="Enter architectural specs, floor layouts, amenities, or notes..."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsFormOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingBuilding ? "Save Changes" : "Create Building"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── View Building & Image Gallery Modal ─── */}
      {viewingBuilding && (
        <div className="modal-overlay" onClick={() => setViewingBuilding(null)}>
          <div className="modal-card" style={{ maxWidth: "780px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{viewingBuilding.name}</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  Project: {projectMap.get(viewingBuilding.project_id)?.name || "Parent Project"}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setViewingBuilding(null)}>
                &times;
              </button>
            </div>

            <div className="modal-tabs">
              <button
                className={`modal-tab-btn ${viewTab === "overview" ? "active" : ""}`}
                onClick={() => setViewTab("overview")}
              >
                Overview & Specs
              </button>
              <button
                className={`modal-tab-btn ${viewTab === "images" ? "active" : ""}`}
                onClick={() => setViewTab("images")}
              >
                Photos & Blueprint Plans ({buildingImages.length})
              </button>
            </div>

            <div className="modal-body">
              {viewTab === "overview" ? (
                <div>
                  <div className="details-spec-grid">
                    <div className="details-spec-item">
                      <div className="label">Building Type</div>
                      <div className="value">{viewingBuilding.building_type}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Construction Stage</div>
                      <div className="value">{viewingBuilding.construction_status}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Total Floors</div>
                      <div className="value">{viewingBuilding.total_floors} Floors</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Total Units</div>
                      <div className="value">{viewingBuilding.total_units} Units</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Building Code</div>
                      <div className="value">{viewingBuilding.building_code || "—"}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Status</div>
                      <div className="value">{viewingBuilding.status}</div>
                    </div>
                  </div>

                  {viewingBuilding.description && (
                    <div style={{ marginTop: "16px" }}>
                      <h4 style={{ margin: "0 0 6px", fontSize: "0.825rem", textTransform: "uppercase", color: "#64748b" }}>
                        Description
                      </h4>
                      <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.5", color: "inherit" }}>
                        {viewingBuilding.description}
                      </p>
                    </div>
                  )}

                  <div style={{ marginTop: "20px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" }}>Start Date</div>
                      <div style={{ fontWeight: 600 }}>
                        {viewingBuilding.start_date
                          ? new Date(viewingBuilding.start_date).toLocaleDateString()
                          : "Not scheduled"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" }}>Est. Completion</div>
                      <div style={{ fontWeight: 600 }}>
                        {viewingBuilding.expected_completion_date
                          ? new Date(viewingBuilding.expected_completion_date).toLocaleDateString()
                          : "Not scheduled"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {userPermissions.canUpdate && (
                    <div style={{ marginBottom: "20px" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Image Category:</span>
                        <select
                          className="filter-select"
                          style={{ padding: "6px 12px", minWidth: "140px" }}
                          value={uploadCategory}
                          onChange={(e) => setUploadCategory(e.target.value)}
                        >
                          {BUILDING_IMAGE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <label className="image-upload-zone">
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: "none" }}
                          onChange={handleUploadImages}
                          disabled={uploadingImage}
                        />
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="17 8 12 3 7 8"></polyline>
                          <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                          {uploadingImage ? "Uploading images..." : "Click to select or drop photos to upload"}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                          Supports JPEG, PNG, WebP (Max 5MB each)
                        </div>
                      </label>
                    </div>
                  )}

                  {loadingImages ? (
                    <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                      Loading photo gallery...
                    </div>
                  ) : buildingImages.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      No photos uploaded for this building yet.
                    </div>
                  ) : (
                    <div className="images-grid">
                      {buildingImages.map((img) => (
                        <div key={img.id} className="image-card">
                          {img.is_primary && <div className="primary-badge">Cover</div>}
                          <img
                            src={resolveImageUrl(img.image_url)}
                            alt="Building asset"
                            onError={handleImageError}
                            onClick={() => setPreviewImage(resolveImageUrl(img.image_url))}
                          />
                          <div className="image-card-info">
                            <span className="category-tag">{img.image_type}</span>
                            <div className="image-actions">
                              {!img.is_primary && userPermissions.canUpdate && (
                                <button
                                  className="btn-action-icon"
                                  style={{ padding: "3px 6px", fontSize: "0.75rem", width: "auto", height: "auto" }}
                                  title="Set as Cover Photo"
                                  onClick={() => handleSetPrimary(img.id)}
                                >
                                  Make Cover
                                </button>
                              )}
                              {userPermissions.canDelete && (
                                <button
                                  className="btn-action-icon delete"
                                  style={{ padding: "3px 6px", fontSize: "0.75rem", width: "auto", height: "auto" }}
                                  title="Delete Image"
                                  onClick={() => handleDeleteImage(img.id)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setViewingBuilding(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Lightbox Modal ─── */}
      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)} style={{ zIndex: 2000 }}>
          <div style={{ maxWidth: "90vw", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
            <img
              src={resolveImageUrl(previewImage)}
              alt="Preview"
              onError={handleImageError}
              style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: "8px", display: "block" }}
            />
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {deletingBuilding && (
        <div className="modal-overlay" onClick={() => setDeletingBuilding(null)}>
          <div className="modal-card" style={{ maxWidth: "450px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Building</h2>
              <button className="modal-close-btn" onClick={() => setDeletingBuilding(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.5" }}>
                Are you sure you want to delete <strong>{deletingBuilding.name}</strong>?
                This will also remove all associated building images and unit records.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setDeletingBuilding(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteConfirm}
                disabled={submitting}
              >
                {submitting ? "Deleting..." : "Delete Building"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
