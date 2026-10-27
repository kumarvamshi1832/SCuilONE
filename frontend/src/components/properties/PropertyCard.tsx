import React, { useState, useMemo, useEffect } from "react";
import type { Property, PropertyImage } from "../../types/property";
import {
  resolveImageUrl,
  handleImageError,
  extractPropertyImageUrls,
} from "../../utils/imageUrl";
import "./PropertyCard.css";

export interface PropertyCardProps {
  property: Property;
  images?: (PropertyImage | string | { url?: string; image_url?: string })[];
  thumbUrl?: string;
  buildingName?: string | null;
  statusClass?: string;
  matchType?: "exact" | "potential" | null;
  matchLabel?: string;
  userPermissions?: {
    canUpdate?: boolean;
    canDelete?: boolean;
    canCreate?: boolean;
  };
  onView?: (property: Property) => void;
  onEdit?: (property: Property) => void;
  onDelete?: (property: Property) => void;
  formatPrice?: (val: number | string, curr?: string) => string;
}


export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  images,
  thumbUrl,
  buildingName,
  statusClass,
  matchType,
  matchLabel,
  userPermissions = {},
  onView,
  onEdit,
  onDelete,
  formatPrice,
}) => {
  // Independent carousel state for this property card
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Default formatPrice fallback if not provided
  const activeFormatPrice = useMemo(() => {
    if (formatPrice) return formatPrice;
    return (val: number | string, curr = "INR") => {
      const num = Number(val);
      if (isNaN(num)) return `${curr} ${val}`;
      if (curr === "INR") {
        if (num >= 10000000) return `₹ ${(num / 10000000).toFixed(2)} Cr`;
        if (num >= 100000) return `₹ ${(num / 100000).toFixed(2)} Lakh`;
        return `₹ ${num.toLocaleString("en-IN")}`;
      }
      return `${curr} ${num.toLocaleString()}`;
    };
  }, [formatPrice]);

  // Derived status class if none is provided
  const activeStatusClass = useMemo(() => {
    if (statusClass) return statusClass;
    switch (property.status) {
      case "Available":
        return "badge-available";
      case "Reserved":
        return "badge-reserved";
      case "Sold":
        return "badge-sold";
      case "Rented":
        return "badge-rented";
      default:
        return "badge-inactive";
    }
  }, [statusClass, property.status]);

  // Normalize valid image URLs from any provided image structure
  const validImages = useMemo(() => {
    return extractPropertyImageUrls(
      property.images || images,
      thumbUrl || property.primary_image_url
    );
  }, [property.images, images, thumbUrl, property.primary_image_url]);

  // Keep index within bounds if validImages changes dynamically
  useEffect(() => {
    if (currentImageIndex >= validImages.length && validImages.length > 0) {
      setCurrentImageIndex(0);
    }
  }, [validImages.length, currentImageIndex]);

  const hasMultipleImages = validImages.length > 1;
  const currentImageUrl = validImages[currentImageIndex] || null;

  const handlePrev = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + validImages.length) % validImages.length);
  };

  const handleNext = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % validImages.length);
  };

  const cardMatchClass =
    matchType === "exact"
      ? "match-exact"
      : matchType === "potential"
      ? "match-potential"
      : "";

  return (
    <div className={`property-card ${cardMatchClass}`} data-testid={`property-card-${property.id}`}>
      {/* ─── Image Area / Carousel ─── */}
      <div className="property-card-cover">
        {currentImageUrl ? (
          <img
            key={currentImageUrl}
            src={resolveImageUrl(currentImageUrl)}
            alt={`${property.name}${hasMultipleImages ? ` (${currentImageIndex + 1} of ${validImages.length})` : ""}`}
            className="property-carousel-image"
            onError={handleImageError}
          />
        ) : (
          <div className="property-card-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>{property.property_type}</span>
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

        {/* Badges */}
        <div className="property-badge-group">
          <span className={`listing-badge ${property.listing_type === "Sale" ? "sale" : "rent"}`}>
            {property.listing_type}
          </span>
          <span className={`badge ${activeStatusClass}`}>{property.status}</span>
          {matchType === "exact" && (
            <span className="badge badge-match-exact">✓ {matchLabel || "Matched"}</span>
          )}
          {matchType === "potential" && (
            <span className="badge badge-match-potential">⚠ {matchLabel || "Near Budget"}</span>
          )}
        </div>

        {/* Price Tag */}
        <div className="property-price-tag">
          {activeFormatPrice(property.price, property.currency)}
        </div>
      </div>

      {/* ─── Card Body ─── */}
      <div className="property-card-body">
        <div className="property-title-row">
          <h3 className="property-card-title">{property.name}</h3>
          {property.unit_number && (
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2563eb" }}>
              Unit {property.unit_number}
            </span>
          )}
        </div>

        <div className="property-location">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span>
            {property.city}, {property.state}
          </span>
          {buildingName && <span> • {buildingName}</span>}
        </div>

        <div className="property-specs-pills">
          {property.bedrooms !== null && property.bedrooms !== undefined && (
            <div className="property-spec-item" title="Bedrooms">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"></path>
              </svg>
              <span>{property.bedrooms} BHK</span>
            </div>
          )}
          {property.bathrooms !== null && property.bathrooms !== undefined && (
            <div className="property-spec-item" title="Bathrooms">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6h6v3H9zM7 9h10v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"></path>
              </svg>
              <span>{property.bathrooms} Baths</span>
            </div>
          )}
          {property.area && (
            <div className="property-spec-item" title="Area">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h18v18H3zM9 3v18M3 9h18"></path>
              </svg>
              <span>
                {property.area} {property.area_unit}
              </span>
            </div>
          )}
        </div>

        {/* Match Status Indicator */}
        {matchType === "exact" && (
          <div className="property-match-indicator exact">
            <span className="match-tag-pill exact">✓ {matchLabel || "Matched"}</span>
            <span className="match-note">Requirement match</span>
          </div>
        )}
        {matchType === "potential" && (
          <div className="property-match-indicator potential">
            <span className="match-tag-pill potential">⚠ {matchLabel || "Near Budget"}</span>
            <span className="match-note">±10% budget range</span>
          </div>
        )}

        <div className="property-footer-row">
          <span className="property-building-tag">{property.property_type}</span>

          <div className="action-buttons-group">
            {onView && (
              <button
                type="button"
                className="btn-action-icon"
                title="View Details, Photos & Matches"
                onClick={() => onView(property)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            )}

            {userPermissions.canUpdate && onEdit && (
              <button
                type="button"
                className="btn-action-icon"
                title="Edit Property"
                onClick={() => onEdit(property)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            )}

            {userPermissions.canDelete && onDelete && (
              <button
                type="button"
                className="btn-action-icon delete"
                title="Delete Property"
                onClick={() => onDelete(property)}
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

export default PropertyCard;
