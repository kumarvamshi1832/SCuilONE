import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { getProperties } from "../../services/propertyService";
import type {
  Building,
  BuildingCreate,
  BuildingUpdate,
  BuildingImage,
  BuildingImageCategory,
} from "../../types/building";
import {
  BUILDING_TYPES,
  BUILDING_CONSTRUCTION_STATUSES,
  BUILDING_STATUSES,
  BUILDING_IMAGE_CATEGORIES,
} from "../../types/building";
import type { Project } from "../../types/project";
import type { Property } from "../../types/property";
import { BuildingCard } from "../../components/buildings/BuildingCard";
import { resolveImageUrl, handleImageError } from "../../utils/imageUrl";
import "./Buildings.css";

interface StagedBuildingImage {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  sizeFormatted: string;
  category: BuildingImageCategory;
}

export default function Buildings() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [buildingThumbnails, setBuildingThumbnails] = useState<Record<string, string>>({});
  const [buildingImagesMap, setBuildingImagesMap] = useState<Record<string, BuildingImage[]>>({});
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
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

  // Staged Images for Add / Edit Modal
  const [stagedImages, setStagedImages] = useState<StagedBuildingImage[]>([]);
  const [stagedCategory, setStagedCategory] = useState<BuildingImageCategory>("Exterior");
  const [isDragOver, setIsDragOver] = useState(false);
  const formFileInputRef = useRef<HTMLInputElement>(null);
  const [existingFormImages, setExistingFormImages] = useState<BuildingImage[]>([]);
  const [loadingExistingImages, setLoadingExistingImages] = useState(false);

  // Image Gallery in View Modal
  const [viewTab, setViewTab] = useState<"overview" | "images">("overview");
  const [buildingImages, setBuildingImages] = useState<BuildingImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>("Exterior");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);

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

      // Load images for all returned buildings
      data.forEach((b) => {
        getBuildingImages(b.id)
          .then((imgs) => {
            if (imgs && imgs.length > 0) {
              const sorted = [...imgs].sort((a, b) => {
                if (a.is_primary && !b.is_primary) return -1;
                if (!a.is_primary && b.is_primary) return 1;
                return (a.sort_order ?? 0) - (b.sort_order ?? 0);
              });
              setBuildingImagesMap((prev) => ({
                ...prev,
                [b.id]: sorted,
              }));
              const primary = sorted[0];
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

  // Load real properties to compute Total Properties count and per-building links
  useEffect(() => {
    let isMounted = true;
    setLoadingProperties(true);
    getProperties({ limit: 100 })
      .then((props) => {
        if (isMounted) {
          setAllProperties(props || []);
        }
      })
      .catch((err) => {
        console.error("Failed to load properties for building stats:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingProperties(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Per-building property counts
  const buildingPropertyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allProperties.forEach((p) => {
      if (p.building_id) {
        counts[p.building_id] = (counts[p.building_id] || 0) + 1;
      }
    });
    return counts;
  }, [allProperties]);

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
    const totalProperties = allProperties.length;
    return { total, active, underConstruction, completed, totalProperties };
  }, [buildings, allProperties]);

  // Load building images when view modal opens
  const loadImages = useCallback(async (buildingId: string) => {
    setLoadingImages(true);
    try {
      const imgs = await getBuildingImages(buildingId);
      setBuildingImages(imgs);
      setActiveGalleryIndex(0);
      const sorted = [...imgs].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
      setBuildingImagesMap((prev) => ({
        ...prev,
        [buildingId]: sorted,
      }));
      const primary = sorted[0];
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
      setActiveGalleryIndex(0);
      loadImages(viewingBuilding.id);
    } else {
      setBuildingImages([]);
      setActiveGalleryIndex(0);
    }
  }, [viewingBuilding, loadImages]);

  // Modal open/close helpers
  const openAddModal = () => {
    setEditingBuilding(null);
    setExistingFormImages([]);
    clearStagedImages();
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (b: Building) => {
    setEditingBuilding(b);
    clearStagedImages();
    setFormError(null);
    setIsFormOpen(true);
    setLoadingExistingImages(true);
    getBuildingImages(b.id)
      .then((imgs) => setExistingFormImages(imgs))
      .catch(() => setExistingFormImages([]))
      .finally(() => setLoadingExistingImages(false));
  };

  const closeFormModal = () => {
    clearStagedImages();
    setEditingBuilding(null);
    setExistingFormImages([]);
    setFormError(null);
    setIsFormOpen(false);
  };

  // Staged Images File Helpers
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAddFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
    const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp"];
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

    const totalAllowed = 50;
    const currentCount = (editingBuilding ? existingFormImages.length : 0) + stagedImages.length;

    const newStaged: StagedBuildingImage[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (currentCount + newStaged.length >= totalAllowed) {
        errors.push(`Maximum ${totalAllowed} images allowed per building.`);
        break;
      }

      const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
      const isAllowedType = ALLOWED_MIME.includes(file.type) || ALLOWED_EXT.includes(ext);

      if (!isAllowedType) {
        errors.push(`"${file.name}" has an unsupported format. Only JPG, PNG, and WebP are allowed.`);
        continue;
      }

      if (file.size > MAX_SIZE) {
        errors.push(`"${file.name}" exceeds 5 MB (${formatFileSize(file.size)}).`);
        continue;
      }

      newStaged.push({
        id: `staged-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
        sizeFormatted: formatFileSize(file.size),
        category: stagedCategory,
      });
    }

    if (errors.length > 0 && errors[0]) {
      showToast(errors[0], "error");
    }

    if (newStaged.length > 0) {
      setStagedImages((prev) => [...prev, ...newStaged]);
    }
  };

  const handleRemoveStagedImage = (stagedId: string) => {
    setStagedImages((prev) => {
      const target = prev.find((i) => i.id === stagedId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((i) => i.id !== stagedId);
    });
  };

  const clearStagedImages = () => {
    stagedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setStagedImages([]);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  // Delete existing image while in Edit modal
  const handleDeleteExistingFormImage = async (imageId: string) => {
    if (!editingBuilding) return;
    try {
      await deleteBuildingImage(editingBuilding.id, imageId);
      const updated = existingFormImages.filter((img) => img.id !== imageId);
      setExistingFormImages(updated);
      setBuildingImagesMap((prev) => ({
        ...prev,
        [editingBuilding.id]: updated,
      }));
      const primary = updated.find((i) => i.is_primary) || updated[0];
      setBuildingThumbnails((prev) => ({
        ...prev,
        [editingBuilding.id]: primary?.image_url || "",
      }));
      showToast("Image deleted successfully!");
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to delete image.", "error");
    }
  };

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
      let targetBuildingId = "";
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
        targetBuildingId = updated.id;
        setBuildings((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
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
        targetBuildingId = created.id;
        setBuildings((prev) => [created, ...prev]);
      }

      // If there are staged images to upload:
      if (stagedImages.length > 0 && targetBuildingId) {
        const categoryMap = new Map<string, File[]>();
        stagedImages.forEach((item) => {
          const cat = item.category || "Exterior";
          const list = categoryMap.get(cat) || [];
          list.push(item.file);
          categoryMap.set(cat, list);
        });

        let uploadedTotal = 0;
        let uploadFailedCount = 0;
        let lastUploadError = "";

        for (const [cat, fileList] of categoryMap.entries()) {
          try {
            const uploaded = await uploadBuildingImages(targetBuildingId, fileList, cat);
            uploadedTotal += uploaded.length;
          } catch (uploadErr: any) {
            console.error(`Failed uploading building images for category "${cat}":`, uploadErr);
            uploadFailedCount += fileList.length;
            lastUploadError = formatApiError(uploadErr, "Upload failed");
          }
        }

        // Refresh images for targetBuildingId
        try {
          const freshImages = await getBuildingImages(targetBuildingId);
          if (freshImages && freshImages.length > 0) {
            const sorted = [...freshImages].sort((a, b) => {
              if (a.is_primary && !b.is_primary) return -1;
              if (!a.is_primary && b.is_primary) return 1;
              return (a.sort_order ?? 0) - (b.sort_order ?? 0);
            });
            setBuildingImagesMap((prev) => ({
              ...prev,
              [targetBuildingId]: sorted,
            }));
            const primary = sorted[0];
            if (primary?.image_url) {
              setBuildingThumbnails((prev) => ({
                ...prev,
                [targetBuildingId]: primary.image_url,
              }));
            }
          }
        } catch (fetchErr) {
          console.error("Failed to refresh building images after upload:", fetchErr);
        }

        if (uploadFailedCount > 0) {
          showToast(
            `${editingBuilding ? "Building updated" : "Building created"}, but ${uploadFailedCount} image(s) failed: ${lastUploadError}`,
            "error"
          );
        } else {
          showToast(
            `${editingBuilding ? "Building updated" : "Building created"} with ${uploadedTotal} image(s) successfully!`
          );
        }
      } else {
        showToast(editingBuilding ? "Building updated successfully!" : "Building created successfully!");
      }

      closeFormModal();
    } catch (err: any) {
      console.error("Save building error:", err);
      setFormError(formatApiError(err, "Failed to save building. Please check your inputs."));
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
      const updated = [...buildingImages, ...uploaded];
      const sorted = [...updated].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
      setBuildingImages(updated);
      setBuildingImagesMap((prev) => ({
        ...prev,
        [viewingBuilding.id]: sorted,
      }));
      const primary = sorted.find((i) => i.is_primary) || sorted[0];
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
      const updated = buildingImages.map((img) => ({
        ...img,
        is_primary: img.id === imageId,
      }));
      const sorted = [...updated].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
      setBuildingImages(updated);
      setBuildingImagesMap((prev) => ({
        ...prev,
        [viewingBuilding.id]: sorted,
      }));
      const primary = sorted[0];
      if (primary?.image_url) {
        setBuildingThumbnails((prev) => ({
          ...prev,
          [viewingBuilding.id]: primary.image_url,
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
      const updated = buildingImages.filter((img) => img.id !== imageId);
      const sorted = [...updated].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
      setBuildingImages(updated);
      setBuildingImagesMap((prev) => ({
        ...prev,
        [viewingBuilding.id]: sorted,
      }));
      const primary = sorted[0];
      setBuildingThumbnails((prev) => ({
        ...prev,
        [viewingBuilding.id]: primary?.image_url || "",
      }));
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
              onClick={openAddModal}
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

        <div className="kpi-card teal">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Total Properties</span>
            <span className="kpi-value">{loadingProperties ? "..." : summaryCounts.totalProperties}</span>
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
              onClick={openAddModal}
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
            const bImages = buildingImagesMap[b.id];
            const stageClass =
              b.construction_status === "Planning"
                ? "badge-planning"
                : b.construction_status === "Under Construction"
                ? "badge-underconstruction"
                : "badge-completed";

            const statusClass =
              b.status === "Active" ? "badge-active" : "badge-inactive";

            const linkedCount = buildingPropertyCounts[b.id] ?? 0;

            return (
              <BuildingCard
                key={b.id}
                building={b}
                images={bImages}
                thumbUrl={thumbUrl}
                projectName={
                  project ? `${project.name}${project.city ? ` (${project.city})` : ""}` : undefined
                }
                linkedPropertiesCount={linkedCount}
                stageClass={stageClass}
                statusClass={statusClass}
                userPermissions={userPermissions}
                onView={(building) => setViewingBuilding(building)}
                onEdit={(building) => openEditModal(building)}
                onDelete={(building) => setDeletingBuilding(building)}
              />
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
                            onClick={() => openEditModal(b)}
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
        <div className="modal-overlay" onClick={closeFormModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingBuilding ? "Edit Building" : "Add New Building"}</h2>
              <button className="modal-close-btn" onClick={closeFormModal}>
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

                {/* ─── Building Images & Gallery Section ─── */}
                <div className="building-form-images-section">
                  <div className="building-form-images-header">
                    <h3 className="building-form-images-title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                      Building Images & Gallery
                    </h3>

                    <div className="building-category-select-wrapper">
                      <label htmlFor="building-image-category">Category:</label>
                      <select
                        id="building-image-category"
                        value={stagedCategory}
                        onChange={(e) => setStagedCategory(e.target.value as BuildingImageCategory)}
                      >
                        {BUILDING_IMAGE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    className={`building-image-dropzone ${isDragOver ? "drag-active" : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDropFiles}
                    onClick={() => formFileInputRef.current?.click()}
                  >
                    <input
                      ref={formFileInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files) {
                          handleAddFiles(e.target.files);
                          e.target.value = "";
                        }
                      }}
                    />

                    <div className="dropzone-icon-circle">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                    </div>

                    <p className="dropzone-prompt">Drag & drop images here</p>
                    <span className="dropzone-divider-text">or</span>

                    <button
                      type="button"
                      className="btn-upload-browse"
                      onClick={(e) => {
                        e.stopPropagation();
                        formFileInputRef.current?.click();
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      Browse Images
                    </button>

                    <p className="dropzone-help-text">
                      Supports JPG, JPEG, PNG, WEBP • Max 5 MB per file • Up to 50 images
                    </p>
                  </div>

                  {/* Selected / Staged Images Previews */}
                  {stagedImages.length > 0 && (
                    <div className="images-preview-block">
                      <div className="images-preview-subheading">
                        <span>Selected Images ({stagedImages.length})</span>
                        <button
                          type="button"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#ef4444",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          onClick={clearStagedImages}
                        >
                          Clear All
                        </button>
                      </div>

                      <div className="images-grid-thumbnails">
                        {stagedImages.map((item) => (
                          <div key={item.id} className="image-thumb-card">
                            <div className="image-thumb-media">
                              <img src={item.previewUrl} alt={item.name} className="image-thumb-img" />
                              <span className="image-thumb-category-tag">{item.category}</span>
                              <button
                                type="button"
                                className="btn-thumb-remove"
                                title="Remove image"
                                aria-label="Remove image"
                                onClick={() => handleRemoveStagedImage(item.id)}
                              >
                                &times;
                              </button>
                            </div>
                            <div className="image-thumb-meta">
                              <span className="image-thumb-filename" title={item.name}>
                                {item.name}
                              </span>
                              <span className="image-thumb-subtext">{item.sizeFormatted}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Existing Images in Edit Mode */}
                  {editingBuilding && (
                    <div className="images-preview-block" style={{ marginTop: "18px" }}>
                      <div className="images-preview-subheading">
                        <span>
                          Existing Building Photos ({existingFormImages.length})
                          {loadingExistingImages && " — Loading..."}
                        </span>
                      </div>

                      {existingFormImages.length === 0 && !loadingExistingImages ? (
                        <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "4px 0" }}>
                          No photos have been uploaded for this building yet.
                        </p>
                      ) : (
                        <div className="images-grid-thumbnails">
                          {existingFormImages.map((img) => (
                            <div key={img.id} className="image-thumb-card">
                              <div className="image-thumb-media">
                                <img
                                  src={resolveImageUrl(img.image_url)}
                                  alt="Existing building photo"
                                  className="image-thumb-img"
                                  onError={handleImageError}
                                />
                                <span className="image-thumb-category-tag">{img.image_type}</span>
                                {img.is_primary && (
                                  <span className="image-thumb-primary-tag">Cover</span>
                                )}
                                {userPermissions.canDelete && (
                                  <button
                                    type="button"
                                    className="btn-thumb-remove"
                                    title="Delete image"
                                    aria-label="Delete image"
                                    onClick={() => handleDeleteExistingFormImage(img.id)}
                                  >
                                    &times;
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeFormModal}
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
                  {buildingThumbnails[viewingBuilding.id] && (
                    <div className="building-overview-banner">
                      <img
                        src={resolveImageUrl(buildingThumbnails[viewingBuilding.id])}
                        alt={viewingBuilding.name}
                        onError={handleImageError}
                      />
                      <div className="building-overview-banner-overlay">
                        <div className="building-overview-banner-text">
                          <h3>{viewingBuilding.name}</h3>
                          <p>
                            {viewingBuilding.building_code ? `Code: ${viewingBuilding.building_code} • ` : ""}
                            {viewingBuilding.total_floors} Floors • {viewingBuilding.construction_status}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

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
                  {/* Featured Large Hero Preview if images exist */}
                  {buildingImages.length > 0 && (
                    <>
                      <div className="building-gallery-hero">
                        <div className="building-gallery-hero-badges">
                          <span className="building-gallery-hero-category">
                            {buildingImages[activeGalleryIndex]?.image_type || "Photo"}
                          </span>
                          {buildingImages[activeGalleryIndex]?.is_primary && (
                            <span className="building-gallery-hero-primary">Cover</span>
                          )}
                        </div>

                        <img
                          src={resolveImageUrl(buildingImages[activeGalleryIndex]?.image_url)}
                          alt={`${viewingBuilding.name} - Photo ${activeGalleryIndex + 1}`}
                          className="building-gallery-hero-img"
                          onError={handleImageError}
                          onClick={() =>
                            setPreviewImage(resolveImageUrl(buildingImages[activeGalleryIndex]?.image_url))
                          }
                          title="Click to view full size"
                        />

                        {buildingImages.length > 1 && (
                          <>
                            <button
                              type="button"
                              className="building-gallery-hero-nav prev"
                              onClick={() =>
                                setActiveGalleryIndex(
                                  (prev) => (prev - 1 + buildingImages.length) % buildingImages.length
                                )
                              }
                              title="Previous photo"
                              aria-label="Previous photo"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                                <polyline points="15 18 9 12 15 6"></polyline>
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="building-gallery-hero-nav next"
                              onClick={() =>
                                setActiveGalleryIndex((prev) => (prev + 1) % buildingImages.length)
                              }
                              title="Next photo"
                              aria-label="Next photo"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                                <polyline points="9 18 15 12 9 6"></polyline>
                              </svg>
                            </button>
                          </>
                        )}

                        <div className="building-gallery-hero-counter">
                          {activeGalleryIndex + 1} / {buildingImages.length}
                        </div>
                      </div>

                      {/* Horizontal Thumbnail Navigation Strip */}
                      {buildingImages.length > 1 && (
                        <div className="building-gallery-thumbnails-strip">
                          {buildingImages.map((img, idx) => (
                            <div
                              key={img.id}
                              className={`building-gallery-thumb-item ${idx === activeGalleryIndex ? "active" : ""}`}
                              onClick={() => setActiveGalleryIndex(idx)}
                              title={`Photo ${idx + 1}`}
                            >
                              <img
                                src={resolveImageUrl(img.image_url)}
                                alt={`Thumbnail ${idx + 1}`}
                                onError={handleImageError}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

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
