import React, { useState, useMemo, useEffect } from "react";
import type { Building, BuildingImage } from "../../types/building";
import {
  resolveImageUrl,
  handleImageError,
  extractImageUrls,
} from "../../utils/imageUrl";

export interface BuildingCardProps {
  building: Building;
  images?: (BuildingImage | string | { url?: string; image_url?: string })[];
  thumbUrl?: string;
  projectName?: string | null;
  linkedPropertiesCount?: number;
  stageClass: string;
  statusClass: string;
  userPermissions: {
    canUpdate?: boolean;
    canDelete?: boolean;
    canCreate?: boolean;
  };
  onView: (building: Building) => void;
  onEdit: (building: Building) => void;
  onDelete: (building: Building) => void;
}

export const BuildingCard: React.FC<BuildingCardProps> = ({
  building,
  images,
  thumbUrl,
  projectName,
  linkedPropertiesCount,
  stageClass,
  statusClass,
  userPermissions,
  onView,
  onEdit,
  onDelete,
}) => {
  // Independent carousel state for each building card
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Normalize valid image URLs from any provided image structure
  const validImages = useMemo(() => {
    const rawImages =
      images && images.length > 0
        ? images
        : building.images && building.images.length > 0
        ? building.images
        : [];
    return extractImageUrls(
      rawImages,
      thumbUrl || building.image_url || building.primary_image_url
    );
  }, [building.images, images, thumbUrl, building.image_url, building.primary_image_url]);

  // Keep index within bounds if validImages changes dynamically
  useEffect(() => {
    if (currentImageIndex >= validImages.length && validImages.length > 0) {
      setCurrentImageIndex(0);
    }
  }, [validImages.length, currentImageIndex]);

  const hasMultipleImages = validImages.length > 1;
  const currentImageUrl = validImages[currentImageIndex] || null;

  // Wrap navigation: First -> Previous -> Last
  const handlePrev = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + validImages.length) % validImages.length);
  };

  // Wrap navigation: Last -> Next -> First
  const handleNext = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % validImages.length);
  };

  return (
    <div className="building-card" data-testid={`building-card-${building.id}`}>
      {/* ─── Image Area / Carousel ─── */}
      <div className="building-card-media">
        {currentImageUrl ? (
          <img
            key={currentImageUrl}
            src={resolveImageUrl(currentImageUrl)}
            alt={`${building.name}${hasMultipleImages ? ` (${currentImageIndex + 1} of ${validImages.length})` : ""}`}
            className="building-card-image building-carousel-image"
            onError={handleImageError}
          />
        ) : (
          <div className="building-card-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
              <line x1="9" y1="22" x2="9" y2="22.01"></line>
              <line x1="15" y1="22" x2="15" y2="22.01"></line>
            </svg>
            {building.building_code && (
              <span className="building-code-pill">{building.building_code}</span>
            )}
          </div>
        )}

        {/* Carousel Navigation Arrows (only rendered if 2 or more valid images exist) */}
        {hasMultipleImages && (
          <>
            <button
              type="button"
              className="carousel-btn prev"
              onClick={handlePrev}
              aria-label="Previous image"
              title="Previous image"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="16"
                height="16"
              >
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>

            <button
              type="button"
              className="carousel-btn next"
              onClick={handleNext}
              aria-label="Next image"
              title="Next image"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="16"
                height="16"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>

            {/* Carousel Indicator: 1 / N counter badge */}
            <div className="carousel-indicator" aria-live="polite">
              <span>{currentImageIndex + 1}</span>
              <span className="carousel-indicator-separator">/</span>
              <span>{validImages.length}</span>
            </div>
          </>
        )}

        <div className="building-badge-overlay">
          <span className={`badge ${stageClass}`}>{building.construction_status}</span>
        </div>
      </div>

      {/* ─── Card Body ─── */}
      <div className="building-card-body">
        <div className="building-header-row">
          <h3 className="building-title">{building.name}</h3>
          <span className={`badge ${statusClass}`}>{building.status}</span>
        </div>

        <div className="building-project-name">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          {projectName || "Project"}
        </div>

        <div className="building-meta-grid">
          <div className="building-meta-item">
            <span className="building-meta-label">Total Floors</span>
            <span className="building-meta-val">{building.total_floors} Floors</span>
          </div>
          <div className="building-meta-item">
            <span className="building-meta-label">Total Units</span>
            <span className="building-meta-val">
              {building.total_units} Units
              {typeof linkedPropertiesCount === "number" ? ` (${linkedPropertiesCount} Props)` : ""}
            </span>
          </div>
          <div className="building-meta-item">
            <span className="building-meta-label">Code / ID</span>
            <span className="building-meta-val">{building.building_code || "—"}</span>
          </div>
          <div className="building-meta-item">
            <span className="building-meta-label">Type</span>
            <span className="building-meta-val">{building.building_type}</span>
          </div>
        </div>

        <div className="building-card-footer">
          <span className="type-tag">{building.building_type}</span>

          <div className="action-buttons-group">
            <button
              type="button"
              className="btn-action-icon"
              title="View Details & Photos"
              onClick={() => onView(building)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>

            {userPermissions.canUpdate && (
              <button
                type="button"
                className="btn-action-icon"
                title="Edit Building"
                onClick={() => onEdit(building)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            )}

            {userPermissions.canDelete && (
              <button
                type="button"
                className="btn-action-icon delete"
                title="Delete Building"
                onClick={() => onDelete(building)}
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
};
