import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getProperties,
  createProperty,
  updateProperty,
  deleteProperty,
  getPropertyImages,
  uploadPropertyImages,
  updatePropertyImage,
  deletePropertyImage,
} from "../../services/propertyService";
import { getBuildings } from "../../services/buildingService";
import { getUsers } from "../../services/userService";
import { getMatchesForProperty } from "../../services/propertyMatchService";
import type {
  Property,
  PropertyCreate,
  PropertyUpdate,
  PropertyImage,
  PropertyImageCategory,
} from "../../types/property";
import {
  PROPERTY_TYPES,
  LISTING_TYPES,
  PROPERTY_STATUSES,
  FURNISHING_TYPES,
  AREA_UNITS,
  PROPERTY_IMAGE_CATEGORIES,
} from "../../types/property";
import type { Building } from "../../types/building";
import type { User } from "../../types/user";
import type { PropertyMatch } from "../../types/propertyMatch";
import { resolveImageUrl, handleImageError } from "../../utils/imageUrl";
import "./Properties.css";

interface StagedPropertyImage {
  id: string;
  file: File;
  previewUrl: string;
  category: PropertyImageCategory;
  name: string;
  sizeFormatted: string;
}

export default function Properties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [propertyThumbnails, setPropertyThumbnails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [listingFilter, setListingFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [viewingProperty, setViewingProperty] = useState<Property | null>(null);
  const [deletingProperty, setDeletingProperty] = useState<Property | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Selected building in form (to dynamically check if unit_number is required)
  const [formBuildingId, setFormBuildingId] = useState<string>("");

  // Staged and existing images for Add & Edit Property form
  const [stagedImages, setStagedImages] = useState<StagedPropertyImage[]>([]);
  const [stagedCategory, setStagedCategory] = useState<PropertyImageCategory>("Exterior");
  const [isDragOver, setIsDragOver] = useState(false);
  const [existingFormImages, setExistingFormImages] = useState<PropertyImage[]>([]);
  const [loadingExistingImages, setLoadingExistingImages] = useState(false);
  const [deletingFormImageId, setDeletingFormImageId] = useState<string | null>(null);
  const formFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Tabbed view in modal
  const [viewTab, setViewTab] = useState<"overview" | "images" | "matches">("overview");
  const [propertyImages, setPropertyImages] = useState<PropertyImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>("Exterior");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Matches for property
  const [propertyMatches, setPropertyMatches] = useState<PropertyMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

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
        canCreate: has("property.create"),
        canUpdate: has("property.update"),
        canDelete: has("property.delete"),
      };
    } catch {
      return { canCreate: true, canUpdate: true, canDelete: true };
    }
  }, []);

  // Fetch Buildings and Users for dropdowns
  useEffect(() => {
    getBuildings().then(setBuildings).catch(console.error);
    getUsers().then(setUsers).catch(console.error);
  }, []);

  const buildingMap = useMemo(() => {
    const map = new Map<string, string>();
    buildings.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [buildings]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.full_name || u.email));
    return map;
  }, [users]);

  // Fetch Properties
  const fetchPropertiesList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProperties({
        search: searchTerm || undefined,
        property_type: typeFilter || undefined,
        listing_type: listingFilter || undefined,
        status: statusFilter || undefined,
        building_id: buildingFilter || undefined,
        city: cityFilter || undefined,
        limit: 100,
      });
      setProperties(data);

      // Lazily fetch primary images for first 20 properties
      data.slice(0, 20).forEach((prop) => {
        getPropertyImages(prop.id)
          .then((imgs) => {
            if (imgs && imgs.length > 0) {
              const primary = imgs.find((i) => i.is_primary) || imgs[0];
              if (primary?.image_url) {
                setPropertyThumbnails((prev) => ({
                  ...prev,
                  [prop.id]: primary.image_url,
                }));
              }
            }
          })
          .catch(() => {});
      });
    } catch (err: any) {
      console.error("Failed to load properties:", err);
      setError(formatApiError(err, "Unable to load properties. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, typeFilter, listingFilter, statusFilter, buildingFilter, cityFilter]);

  useEffect(() => {
    fetchPropertiesList();
  }, [fetchPropertiesList]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const total = properties.length;
    const available = properties.filter((p) => p.status === "Available").length;
    const reserved = properties.filter((p) => p.status === "Reserved").length;
    const sold = properties.filter((p) => p.status === "Sold").length;
    return { total, available, reserved, sold };
  }, [properties]);

  // Load property images & matches when view modal opens
  const loadImages = useCallback(async (propId: string) => {
    setLoadingImages(true);
    try {
      const imgs = await getPropertyImages(propId);
      setPropertyImages(imgs);
      const primary = imgs.find((i) => i.is_primary) || imgs[0];
      if (primary?.image_url) {
        setPropertyThumbnails((prev) => ({
          ...prev,
          [propId]: primary.image_url,
        }));
      }
    } catch (err) {
      console.error("Failed to load property images:", err);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const loadMatches = useCallback(async (propId: string) => {
    setLoadingMatches(true);
    try {
      const matches = await getMatchesForProperty(propId);
      setPropertyMatches(matches);
    } catch (err) {
      console.error("Failed to load property matches:", err);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  useEffect(() => {
    if (viewingProperty) {
      setViewTab("overview");
      loadImages(viewingProperty.id);
      loadMatches(viewingProperty.id);
    } else {
      setPropertyImages([]);
      setPropertyMatches([]);
    }
  }, [viewingProperty, loadImages, loadMatches]);

  // Staged image helpers
  const clearStagedImages = useCallback(() => {
    setStagedImages((prev) => {
      prev.forEach((item) => {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {}
      });
      return [];
    });
  }, []);

  useEffect(() => {
    return () => {
      stagedImages.forEach((item) => {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {}
      });
    };
  }, [stagedImages]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAddFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB per backend contract
    const MAX_COUNT = 50; // 50 images max per property
    const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

    const currentTotal = stagedImages.length + existingFormImages.length;
    if (currentTotal + files.length > MAX_COUNT) {
      showToast(`A property can have at most ${MAX_COUNT} images in total.`, "error");
      return;
    }

    const newItems: StagedPropertyImage[] = [];
    let warningMsg = "";

    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.type.toLowerCase())) {
        warningMsg = `"${file.name}" has an unsupported format. Only JPG, PNG, and WebP are allowed.`;
        continue;
      }

      if (file.size > MAX_SIZE) {
        warningMsg = `"${file.name}" exceeds the 5 MB limit (${formatFileSize(file.size)}).`;
        continue;
      }

      const isDup = stagedImages.some(
        (s) => s.file.name === file.name && s.file.size === file.size
      );
      if (isDup) {
        continue;
      }

      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        category: stagedCategory,
        name: file.name,
        sizeFormatted: formatFileSize(file.size),
      });
    }

    if (warningMsg) {
      showToast(warningMsg, "error");
    }

    if (newItems.length > 0) {
      setStagedImages((prev) => [...prev, ...newItems]);
    }
  };

  const handleRemoveStagedImage = (id: string) => {
    setStagedImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {}
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDeleteExistingFormImage = async (imageId: string) => {
    if (!editingProperty) return;
    setDeletingFormImageId(imageId);
    try {
      await deletePropertyImage(editingProperty.id, imageId);
      setExistingFormImages((prev) => prev.filter((img) => img.id !== imageId));
      setPropertyThumbnails((prev) => {
        const next = { ...prev };
        const remaining = existingFormImages.filter((img) => img.id !== imageId);
        if (remaining.length > 0) {
          const nextPrimary = remaining.find((r) => r.is_primary) || remaining[0];
          if (nextPrimary?.image_url) {
            next[editingProperty.id] = nextPrimary.image_url;
          } else {
            delete next[editingProperty.id];
          }
        } else {
          delete next[editingProperty.id];
        }
        return next;
      });
      showToast("Property image deleted successfully!");
    } catch (err: any) {
      console.error("Delete form image error:", err);
      showToast(formatApiError(err, "Failed to delete property image."), "error");
    } finally {
      setDeletingFormImageId(null);
    }
  };

  const handleSetPrimaryFormImage = async (imageId: string) => {
    if (!editingProperty) return;
    try {
      await updatePropertyImage(editingProperty.id, imageId, { is_primary: true });
      setExistingFormImages((prev) =>
        prev.map((img) => ({
          ...img,
          is_primary: img.id === imageId,
        }))
      );
      const chosen = existingFormImages.find((img) => img.id === imageId);
      if (chosen?.image_url) {
        setPropertyThumbnails((prev) => ({
          ...prev,
          [editingProperty.id]: chosen.image_url,
        }));
      }
      showToast("Primary image updated!");
    } catch (err: any) {
      console.error("Set primary image error:", err);
      showToast(formatApiError(err, "Failed to update primary image."), "error");
    }
  };

  const handleOpenAddProperty = () => {
    setEditingProperty(null);
    setFormBuildingId("");
    setFormError(null);
    clearStagedImages();
    setExistingFormImages([]);
    setIsFormOpen(true);
  };

  const handleOpenEditProperty = (p: Property) => {
    setEditingProperty(p);
    setFormBuildingId(p.building_id || "");
    setFormError(null);
    clearStagedImages();
    setIsFormOpen(true);
    setLoadingExistingImages(true);
    getPropertyImages(p.id)
      .then((imgs) => setExistingFormImages(imgs || []))
      .catch((err) => console.error("Failed to load existing images for edit:", err))
      .finally(() => setLoadingExistingImages(false));
  };

  const handleCloseForm = () => {
    clearStagedImages();
    setExistingFormImages([]);
    setIsFormOpen(false);
    setEditingProperty(null);
  };

  // Save Property
  const handleSaveProperty = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const building_id = String(formData.get("building_id") || "") || null;
    const unit_number = String(formData.get("unit_number") || "").trim() || null;
    const property_type = String(formData.get("property_type") || "Apartment");
    const listing_type = String(formData.get("listing_type") || "Sale");
    const address = String(formData.get("address") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const state = String(formData.get("state") || "").trim();
    const country = String(formData.get("country") || "India").trim();
    const postal_code = String(formData.get("postal_code") || "").trim() || null;
    const price = Number(formData.get("price") || 0);
    const currency = String(formData.get("currency") || "INR").toUpperCase();
    const areaVal = formData.get("area");
    const area = areaVal ? Number(areaVal) : null;
    const area_unit = String(formData.get("area_unit") || "sqft");
    const bedVal = formData.get("bedrooms");
    const bedrooms = bedVal !== "" && bedVal !== null ? Number(bedVal) : null;
    const bathVal = formData.get("bathrooms");
    const bathrooms = bathVal !== "" && bathVal !== null ? Number(bathVal) : null;
    const furnishing = String(formData.get("furnishing") || "Unfurnished");
    const status = String(formData.get("status") || "Available");
    const owner_name = String(formData.get("owner_name") || "").trim() || null;
    const developer_name = String(formData.get("developer_name") || "").trim() || null;
    const assigned_to = String(formData.get("assigned_to") || "") || null;
    const description = String(formData.get("description") || "").trim() || null;

    // Backend validation: Unit number is required when building is selected
    if (building_id && !unit_number) {
      setFormError("Unit number is required when a building is selected.");
      setSubmitting(false);
      return;
    }

    if (!name || !address || !city || !state || price < 0) {
      setFormError("Please fill in all required fields (Name, Address, City, State, valid Price).");
      setSubmitting(false);
      return;
    }

    try {
      let targetPropertyId = "";

      if (editingProperty) {
        targetPropertyId = editingProperty.id;
        const payload: PropertyUpdate = {
          building_id,
          unit_number,
          name,
          property_type,
          listing_type,
          address,
          city,
          state,
          country,
          postal_code,
          price,
          currency,
          area,
          area_unit,
          bedrooms,
          bathrooms,
          furnishing,
          status,
          owner_name,
          developer_name,
          assigned_to,
          description,
        };
        const updated = await updateProperty(editingProperty.id, payload);
        setProperties((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      } else {
        const payload: PropertyCreate = {
          building_id,
          unit_number,
          name,
          property_type,
          listing_type,
          address,
          city,
          state,
          country,
          postal_code,
          price,
          currency,
          area,
          area_unit,
          bedrooms,
          bathrooms,
          furnishing,
          status,
          owner_name,
          developer_name,
          assigned_to,
          description,
        };
        const created = await createProperty(payload);
        targetPropertyId = created.id;
        setProperties((prev) => [created, ...prev]);
      }

      // If there are staged images to upload:
      if (stagedImages.length > 0 && targetPropertyId) {
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
        let newPrimaryUrl = "";

        for (const [cat, fileList] of categoryMap.entries()) {
          try {
            const uploaded = await uploadPropertyImages(targetPropertyId, fileList, cat);
            uploadedTotal += uploaded.length;
            const primary = uploaded.find((i) => i.is_primary) || uploaded[0];
            if (primary?.image_url && !newPrimaryUrl) {
              newPrimaryUrl = primary.image_url;
            }
          } catch (uploadErr: any) {
            console.error(`Failed uploading images for category "${cat}":`, uploadErr);
            uploadFailedCount += fileList.length;
            lastUploadError = formatApiError(uploadErr, "Upload failed");
          }
        }

        if (newPrimaryUrl) {
          setPropertyThumbnails((prev) => ({
            ...prev,
            [targetPropertyId]: newPrimaryUrl,
          }));
        }

        clearStagedImages();

        if (uploadFailedCount > 0) {
          showToast(
            `${editingProperty ? "Property updated" : "Property created"}, but ${uploadFailedCount} image(s) failed: ${lastUploadError}`,
            "error"
          );
        } else {
          showToast(
            `${editingProperty ? "Property updated" : "Property created"} with ${uploadedTotal} image(s) successfully!`
          );
        }
      } else {
        showToast(
          editingProperty ? "Property updated successfully!" : "Property created successfully!"
        );
      }

      handleCloseForm();
    } catch (err: any) {
      console.error("Save property error:", err);
      const detail = err?.response?.data?.detail;
      setFormError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: any) => d.msg).join(", ")
          : "Failed to save property. Please check inputs."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Property
  const handleDeleteConfirm = async () => {
    if (!deletingProperty) return;
    setSubmitting(true);
    try {
      await deleteProperty(deletingProperty.id);
      setProperties((prev) => prev.filter((p) => p.id !== deletingProperty.id));
      showToast("Property deleted successfully!");
      setDeletingProperty(null);
    } catch (err: any) {
      console.error("Delete property error:", err);
      showToast(formatApiError(err, "Failed to delete property."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Image Upload handler
  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!viewingProperty || !e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setUploadingImage(true);
    try {
      const uploaded = await uploadPropertyImages(
        viewingProperty.id,
        files,
        uploadCategory
      );
      setPropertyImages((prev) => [...prev, ...uploaded]);
      const primary = uploaded.find((i) => i.is_primary) || uploaded[0];
      if (primary?.image_url) {
        setPropertyThumbnails((prev) => ({
          ...prev,
          [viewingProperty.id]: primary.image_url,
        }));
      }
      showToast(`Uploaded ${uploaded.length} image(s)!`);
    } catch (err: any) {
      console.error("Image upload error:", err);
      showToast(formatApiError(err, "Failed to upload image(s)."), "error");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  // Set Primary Image
  const handleSetPrimary = async (imageId: string) => {
    if (!viewingProperty) return;
    try {
      await updatePropertyImage(viewingProperty.id, imageId, { is_primary: true });
      setPropertyImages((prev) =>
        prev.map((img) => ({
          ...img,
          is_primary: img.id === imageId,
        }))
      );
      const chosen = propertyImages.find((img) => img.id === imageId);
      if (chosen?.image_url) {
        setPropertyThumbnails((prev) => ({
          ...prev,
          [viewingProperty.id]: chosen.image_url,
        }));
      }
      showToast("Primary image updated!");
    } catch (err: any) {
      showToast(formatApiError(err, "Failed to set primary image."), "error");
    }
  };

  // Delete Image
  const handleDeleteImage = async (imageId: string) => {
    if (!viewingProperty) return;
    try {
      await deletePropertyImage(viewingProperty.id, imageId);
      setPropertyImages((prev) => prev.filter((img) => img.id !== imageId));
      showToast("Image deleted successfully!");
    } catch (err: any) {
      showToast(formatApiError(err, "Failed to delete image."), "error");
    }
  };

  // Format price helper
  const formatPrice = (val: number | string, curr: string = "INR") => {
    const num = Number(val);
    if (isNaN(num)) return `${curr} 0`;
    if (curr === "INR") {
      if (num >= 10000000) return `₹ ${(num / 10000000).toFixed(2)} Cr`;
      if (num >= 100000) return `₹ ${(num / 100000).toFixed(2)} Lakh`;
      return `₹ ${num.toLocaleString("en-IN")}`;
    }
    return `${curr} ${num.toLocaleString()}`;
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    const f = parts[0] || "P";
    const s = parts[1] || "";
    return (f.charAt(0) + (s ? s.charAt(0) : f.charAt(1) || "")).toUpperCase();
  };

  return (
    <div className="properties-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`crm-toast ${toastMessage.type}`}>
          {toastMessage.type === "success" ? "✓ " : "✕ "}
          {toastMessage.text}
        </div>
      )}

      {/* ─── 1. Header ─── */}
      <div className="properties-header">
        <div className="header-titles">
          <div className="title-row">
            <h1>Properties</h1>
            <span className="count-chip">{properties.length} Total</span>
          </div>
          <p className="subtitle">
            Manage residential and commercial properties.
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
              className="btn-add-property"
              onClick={handleOpenAddProperty}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Property
            </button>
          )}
        </div>
      </div>

      {/* ─── 2. Summary Cards ─── */}
      <div className="properties-summary-grid">
        <div className="kpi-card blue">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Total Properties</span>
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
            <span className="kpi-label">Available</span>
            <span className="kpi-value">{summaryCounts.available}</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Reserved</span>
            <span className="kpi-value">{summaryCounts.reserved}</span>
          </div>
        </div>

        <div className="kpi-card purple">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Sold</span>
            <span className="kpi-value">{summaryCounts.sold}</span>
          </div>
        </div>
      </div>

      {/* ─── 3. Filter Toolbar ─── */}
      <div className="properties-filter-container">
        <div className="filter-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by property/unit..."
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
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
          >
            <option value="">All Buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={listingFilter}
            onChange={(e) => setListingFilter(e.target.value)}
          >
            <option value="">All Listings</option>
            {LISTING_TYPES.map((l) => (
              <option key={l} value={l}>
                For {l}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {PROPERTY_STATUSES.map((s) => (
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

          {(searchTerm || buildingFilter || typeFilter || listingFilter || statusFilter || cityFilter) && (
            <button
              className="btn-clear-filters"
              onClick={() => {
                setSearchTerm("");
                setBuildingFilter("");
                setTypeFilter("");
                setListingFilter("");
                setStatusFilter("");
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
        <div className="properties-loading-state">
          <div className="spinner"></div>
          <p style={{ margin: 0, color: "#64748b", fontWeight: 500 }}>
            Loading properties...
          </p>
        </div>
      ) : error ? (
        <div className="properties-error-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" width="32" height="32" style={{ margin: "0 auto 12px" }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3 style={{ margin: "0 0 6px", color: "#dc2626" }}>Unable to load properties</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b" }}>{error}</p>
          <button className="btn-secondary" onClick={() => fetchPropertiesList()}>
            Retry
          </button>
        </div>
      ) : properties.length === 0 ? (
        <div className="properties-empty-card">
          <div className="empty-property-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <h3>No properties found</h3>
          <p>
            {searchTerm || buildingFilter || typeFilter || listingFilter || statusFilter || cityFilter
              ? "No properties match your filter criteria. Try resetting filters."
              : "Add your first property to begin managing listings."}
          </p>
          {userPermissions.canCreate && (
            <button
              className="btn-add-property"
              onClick={handleOpenAddProperty}
            >
              + Add Property
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* ─── Grid View ─── */
        <div className="properties-grid">
          {properties.map((p) => {
            const thumbUrl = propertyThumbnails[p.id];
            const buildingName = p.building_id ? buildingMap.get(p.building_id) : null;
            const statusClass =
              p.status === "Available"
                ? "badge-available"
                : p.status === "Reserved"
                ? "badge-reserved"
                : p.status === "Sold"
                ? "badge-sold"
                : p.status === "Rented"
                ? "badge-rented"
                : "badge-inactive";

            return (
              <div key={p.id} className="property-card">
                <div className="property-card-cover">
                  {thumbUrl ? (
                    <img
                      src={resolveImageUrl(thumbUrl)}
                      alt={p.name}
                      onError={handleImageError}
                    />
                  ) : (
                    <div className="property-card-placeholder">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
                      <span>{p.property_type}</span>
                    </div>
                  )}

                  <div className="property-badge-group">
                    <span className={`listing-badge ${p.listing_type === "Sale" ? "sale" : "rent"}`}>
                      {p.listing_type}
                    </span>
                    <span className={`badge ${statusClass}`}>{p.status}</span>
                  </div>

                  <div className="property-price-tag">
                    {formatPrice(p.price, p.currency)}
                  </div>
                </div>

                <div className="property-card-body">
                  <div className="property-title-row">
                    <h3 className="property-card-title">{p.name}</h3>
                    {p.unit_number && (
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2563eb" }}>
                        Unit {p.unit_number}
                      </span>
                    )}
                  </div>

                  <div className="property-location">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>{p.city}, {p.state}</span>
                    {buildingName && <span> • {buildingName}</span>}
                  </div>

                  <div className="property-specs-pills">
                    {p.bedrooms !== null && p.bedrooms !== undefined && (
                      <div className="property-spec-item" title="Bedrooms">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"></path>
                        </svg>
                        <span>{p.bedrooms} BHK</span>
                      </div>
                    )}
                    {p.bathrooms !== null && p.bathrooms !== undefined && (
                      <div className="property-spec-item" title="Bathrooms">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 6h6v3H9zM7 9h10v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"></path>
                        </svg>
                        <span>{p.bathrooms} Baths</span>
                      </div>
                    )}
                    {p.area && (
                      <div className="property-spec-item" title="Area">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 3h18v18H3zM9 3v18M3 9h18"></path>
                        </svg>
                        <span>{p.area} {p.area_unit}</span>
                      </div>
                    )}
                  </div>

                  <div className="property-footer-row">
                    <span className="property-building-tag">
                      {p.property_type}
                    </span>

                    <div className="action-buttons-group">
                      <button
                        className="btn-action-icon"
                        title="View Details, Photos & Matches"
                        onClick={() => setViewingProperty(p)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>

                      {userPermissions.canUpdate && (
                        <button
                          className="btn-action-icon"
                          title="Edit Property"
                          onClick={() => handleOpenEditProperty(p)}
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
                          title="Delete Property"
                          onClick={() => setDeletingProperty(p)}
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
        <div className="properties-table-container">
          <table className="properties-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Building & City</th>
                <th>Type / Listing</th>
                <th>Configuration</th>
                <th>Price</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const thumbUrl = propertyThumbnails[p.id];
                const buildingName = p.building_id ? buildingMap.get(p.building_id) : null;
                const statusClass =
                  p.status === "Available"
                    ? "badge-available"
                    : p.status === "Reserved"
                    ? "badge-reserved"
                    : p.status === "Sold"
                    ? "badge-sold"
                    : p.status === "Rented"
                    ? "badge-rented"
                    : "badge-inactive";

                return (
                  <tr key={p.id}>
                    <td>
                      <div className="table-property-cell">
                        {thumbUrl ? (
                          <img
                            src={resolveImageUrl(thumbUrl)}
                            alt={p.name}
                            className="table-thumb"
                            onError={handleImageError}
                          />
                        ) : (
                          <div className="table-thumb-fallback">
                            {getInitials(p.name)}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          {p.unit_number && (
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              Unit: {p.unit_number}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {buildingName || "Standalone"}
                      </div>
                      <div className="table-location-text">
                        {p.city}, {p.state}
                      </div>
                    </td>
                    <td>
                      <div>{p.property_type}</div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: p.listing_type === "Sale" ? "#2563eb" : "#7c3aed" }}>
                        For {p.listing_type}
                      </span>
                    </td>
                    <td>
                      <div>
                        {p.bedrooms ? `${p.bedrooms} BHK` : "—"}
                        {p.bathrooms ? ` • ${p.bathrooms} Baths` : ""}
                      </div>
                      {p.area && (
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {p.area} {p.area_unit}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {formatPrice(p.price, p.currency)}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${statusClass}`}>{p.status}</span>
                    </td>
                    <td>
                      <div className="action-buttons-group" style={{ justifyContent: "flex-end" }}>
                        <button
                          className="btn-action-icon"
                          title="View Details & Photos"
                          onClick={() => setViewingProperty(p)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>

                        {userPermissions.canUpdate && (
                          <button
                            className="btn-action-icon"
                            title="Edit Property"
                            onClick={() => handleOpenEditProperty(p)}
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
                            title="Delete Property"
                            onClick={() => setDeletingProperty(p)}
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
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div className="modal-card" style={{ maxWidth: "800px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingProperty ? "Edit Property" : "Add New Property"}</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  {editingProperty
                    ? `Update listing details & photos for ${editingProperty.name}`
                    : "Create a new property listing with specifications, pricing & photos"}
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseForm}
                title="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveProperty} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem", fontWeight: 500 }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label>Property Name / Title *</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingProperty?.name || ""}
                    placeholder="e.g. Luxury 3BHK Apartment - Tower A"
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Building / Project (Optional)</label>
                    <select
                      name="building_id"
                      value={formBuildingId}
                      onChange={(e) => setFormBuildingId(e.target.value)}
                    >
                      <option value="">No Building (Standalone)</option>
                      {buildings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>
                      Unit Number {formBuildingId ? "*" : "(Optional)"}
                    </label>
                    <input
                      type="text"
                      name="unit_number"
                      defaultValue={editingProperty?.unit_number || ""}
                      placeholder="e.g. Unit 402 or Villa 12"
                      required={!!formBuildingId}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Property Type *</label>
                    <select
                      name="property_type"
                      defaultValue={editingProperty?.property_type || "Apartment"}
                      required
                    >
                      {PROPERTY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Listing Type *</label>
                    <select
                      name="listing_type"
                      defaultValue={editingProperty?.listing_type || "Sale"}
                      required
                    >
                      {LISTING_TYPES.map((l) => (
                        <option key={l} value={l}>
                          For {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Price *</label>
                    <input
                      type="number"
                      name="price"
                      min="0"
                      step="any"
                      defaultValue={editingProperty?.price || 0}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Currency</label>
                    <input
                      type="text"
                      name="currency"
                      maxLength={3}
                      defaultValue={editingProperty?.currency || "INR"}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Area</label>
                    <input
                      type="number"
                      name="area"
                      min="0"
                      step="any"
                      defaultValue={editingProperty?.area ?? ""}
                      placeholder="e.g. 1450"
                    />
                  </div>
                  <div className="form-group">
                    <label>Area Unit</label>
                    <select
                      name="area_unit"
                      defaultValue={editingProperty?.area_unit || "sqft"}
                    >
                      {AREA_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>Bedrooms (BHK)</label>
                    <input
                      type="number"
                      name="bedrooms"
                      min="0"
                      max="100"
                      defaultValue={editingProperty?.bedrooms ?? ""}
                      placeholder="e.g. 3"
                    />
                  </div>
                  <div className="form-group">
                    <label>Bathrooms</label>
                    <input
                      type="number"
                      name="bathrooms"
                      min="0"
                      max="100"
                      defaultValue={editingProperty?.bathrooms ?? ""}
                      placeholder="e.g. 2"
                    />
                  </div>
                  <div className="form-group">
                    <label>Furnishing</label>
                    <select
                      name="furnishing"
                      defaultValue={editingProperty?.furnishing || "Unfurnished"}
                    >
                      {FURNISHING_TYPES.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Address *</label>
                  <input
                    type="text"
                    name="address"
                    defaultValue={editingProperty?.address || ""}
                    placeholder="Full street address"
                    required
                  />
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>City *</label>
                    <input
                      type="text"
                      name="city"
                      defaultValue={editingProperty?.city || ""}
                      placeholder="City"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>State *</label>
                    <input
                      type="text"
                      name="state"
                      defaultValue={editingProperty?.state || ""}
                      placeholder="State"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Postal Code</label>
                    <input
                      type="text"
                      name="postal_code"
                      defaultValue={editingProperty?.postal_code || ""}
                      placeholder="ZIP / PIN"
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      name="status"
                      defaultValue={editingProperty?.status || "Available"}
                    >
                      {PROPERTY_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assigned Agent / Salesperson</label>
                    <select
                      name="assigned_to"
                      defaultValue={editingProperty?.assigned_to || ""}
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Owner Name</label>
                    <input
                      type="text"
                      name="owner_name"
                      defaultValue={editingProperty?.owner_name || ""}
                      placeholder="Landlord / Owner name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Developer Name</label>
                    <input
                      type="text"
                      name="developer_name"
                      defaultValue={editingProperty?.developer_name || ""}
                      placeholder="Real estate builder / developer"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Description / Notes</label>
                  <textarea
                    name="description"
                    defaultValue={editingProperty?.description || ""}
                    placeholder="Enter key highlights, furnishing details, floor location, orientation..."
                  />
                </div>

                {/* ─── Property Images Section ─── */}
                <div className="form-images-section">
                  <div className="form-images-header">
                    <div className="form-images-title-group">
                      <h4 className="form-images-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                          <circle cx="12" cy="13" r="4"></circle>
                        </svg>
                        Property Images
                      </h4>
                      {(stagedImages.length > 0 || existingFormImages.length > 0) && (
                        <span className="form-images-count-badge">
                          {stagedImages.length + existingFormImages.length} image{stagedImages.length + existingFormImages.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <div className="category-select-wrapper">
                      <label htmlFor="property-image-category">Upload Category:</label>
                      <select
                        id="property-image-category"
                        value={stagedCategory}
                        onChange={(e) => setStagedCategory(e.target.value as PropertyImageCategory)}
                      >
                        {PROPERTY_IMAGE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    className={`image-dropzone ${isDragOver ? "drag-active" : ""}`}
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
                      Upload Property Images
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
                  {editingProperty && (
                    <div className="images-preview-block" style={{ marginTop: "18px" }}>
                      <div className="images-preview-subheading">
                        <span>
                          Existing Property Photos ({existingFormImages.length})
                          {loadingExistingImages && " — Loading..."}
                        </span>
                      </div>

                      {existingFormImages.length === 0 && !loadingExistingImages ? (
                        <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "4px 0" }}>
                          No photos have been uploaded for this property yet.
                        </p>
                      ) : (
                        <div className="images-grid-thumbnails">
                          {existingFormImages.map((img) => (
                            <div key={img.id} className="image-thumb-card">
                              <div className="image-thumb-media">
                                <img
                                  src={resolveImageUrl(img.image_url)}
                                  alt={img.image_type}
                                  className="image-thumb-img"
                                  onError={handleImageError}
                                />
                                <span className="image-thumb-category-tag">{img.image_type}</span>
                                {img.is_primary && (
                                  <span className="image-thumb-primary-tag">Primary</span>
                                )}
                                <button
                                  type="button"
                                  className="btn-thumb-remove"
                                  title="Delete existing photo"
                                  aria-label="Delete photo"
                                  disabled={deletingFormImageId === img.id}
                                  onClick={() => handleDeleteExistingFormImage(img.id)}
                                >
                                  {deletingFormImageId === img.id ? "…" : "×"}
                                </button>
                              </div>
                              <div className="image-thumb-meta">
                                <span className="image-thumb-filename">
                                  {img.image_type} Photo
                                </span>
                                {!img.is_primary && (
                                  <button
                                    type="button"
                                    className="btn-thumb-set-primary"
                                    onClick={() => handleSetPrimaryFormImage(img.id)}
                                  >
                                    Set as Primary
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
                  onClick={handleCloseForm}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting
                    ? stagedImages.length > 0
                      ? "Uploading & Saving..."
                      : "Saving..."
                    : editingProperty
                    ? "Save Changes"
                    : "Create Property"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── View Property & Gallery Modal ─── */}
      {viewingProperty && (
        <div className="modal-overlay" onClick={() => setViewingProperty(null)}>
          <div className="modal-card" style={{ maxWidth: "800px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{viewingProperty.name}</h2>
                <div className="modal-header-location">
                  {viewingProperty.unit_number ? `Unit ${viewingProperty.unit_number} • ` : ""}
                  {viewingProperty.city}, {viewingProperty.state}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setViewingProperty(null)}>
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
                Photos ({propertyImages.length})
              </button>
              <button
                className={`modal-tab-btn ${viewTab === "matches" ? "active" : ""}`}
                onClick={() => setViewTab("matches")}
              >
                Matched Buyers ({propertyMatches.length})
              </button>
            </div>

            <div className="modal-body">
              {viewTab === "overview" ? (
                <div>
                  <div className="details-spec-grid">
                    <div className="details-spec-item">
                      <div className="label">Price</div>
                      <div className="value" style={{ color: "#2563eb", fontWeight: 700 }}>
                        {formatPrice(viewingProperty.price, viewingProperty.currency)}
                      </div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Listing Type</div>
                      <div className="value">For {viewingProperty.listing_type}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Status</div>
                      <div className="value">{viewingProperty.status}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Property Type</div>
                      <div className="value">{viewingProperty.property_type}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Configuration</div>
                      <div className="value">
                        {viewingProperty.bedrooms ? `${viewingProperty.bedrooms} BHK` : "—"}
                        {viewingProperty.bathrooms ? ` / ${viewingProperty.bathrooms} Baths` : ""}
                      </div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Area</div>
                      <div className="value">
                        {viewingProperty.area ? `${viewingProperty.area} ${viewingProperty.area_unit}` : "—"}
                      </div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Building</div>
                      <div className="value">
                        {viewingProperty.building_id ? buildingMap.get(viewingProperty.building_id) || "Building" : "Standalone"}
                      </div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Furnishing</div>
                      <div className="value">{viewingProperty.furnishing}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Assigned Agent</div>
                      <div className="value">
                        {viewingProperty.assigned_to ? userMap.get(viewingProperty.assigned_to) || "Assigned" : "Unassigned"}
                      </div>
                    </div>
                  </div>

                  {viewingProperty.description && (
                    <div className="details-description-box">
                      <h4 className="description-label">Description</h4>
                      <p className="description-text">{viewingProperty.description}</p>
                    </div>
                  )}

                  <div className="details-address-box">
                    <div className="address-label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                      Address
                    </div>
                    <div className="address-value">
                      {viewingProperty.address}, {viewingProperty.city}, {viewingProperty.state} {viewingProperty.postal_code || ""}
                    </div>
                  </div>
                </div>
              ) : viewTab === "images" ? (
                <div>
                  {userPermissions.canUpdate && (
                    <div style={{ marginBottom: "20px" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Category:</span>
                        <select
                          className="filter-select"
                          style={{ padding: "6px 12px", minWidth: "140px" }}
                          value={uploadCategory}
                          onChange={(e) => setUploadCategory(e.target.value)}
                        >
                          {PROPERTY_IMAGE_CATEGORIES.map((c) => (
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
                          {uploadingImage ? "Uploading photos..." : "Click to select or drop property photos"}
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
                  ) : propertyImages.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      No photos uploaded for this property yet.
                    </div>
                  ) : (
                    <div className="images-grid">
                      {propertyImages.map((img) => (
                        <div key={img.id} className="image-card">
                          {img.is_primary && <div className="primary-badge">Cover</div>}
                          <img
                            src={resolveImageUrl(img.image_url)}
                            alt="Property asset"
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
              ) : (
                /* Matched Buyers Tab */
                <div>
                  {loadingMatches ? (
                    <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                      Loading matched buyer requirements...
                    </div>
                  ) : propertyMatches.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      No buyer requirements currently matched to this property.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {propertyMatches.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            padding: "12px 16px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>Buyer Match: {m.buyer_name || "Lead / Contact"}</div>
                            <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                              Matched on: {new Date(m.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <span className="badge badge-available">{m.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setViewingProperty(null)}>
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
              alt="Enlarged preview"
              onError={handleImageError}
              style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: "8px", display: "block" }}
            />
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {deletingProperty && (
        <div className="modal-overlay" onClick={() => setDeletingProperty(null)}>
          <div className="modal-card" style={{ maxWidth: "450px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Property</h2>
              <button className="modal-close-btn" onClick={() => setDeletingProperty(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.5" }}>
                Are you sure you want to delete <strong>{deletingProperty.name}</strong>?
                This action cannot be undone and will delete all property images.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setDeletingProperty(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteConfirm}
                disabled={submitting}
              >
                {submitting ? "Deleting..." : "Delete Property"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
