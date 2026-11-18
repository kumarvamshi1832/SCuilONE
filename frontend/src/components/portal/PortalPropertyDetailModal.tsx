import React, { useEffect } from "react";
import { XIcon } from "../common/SupportPortalIcons";
import { resolveImageUrl, handleImageError } from "../../utils/imageUrl";
import { formatPortalMoney } from "./PortalPropertyMatchCard";
import type { PortalPropertyMatch } from "../../types/customerPortalBuyerRequirement";

interface PortalPropertyDetailModalProps {
  item: PortalPropertyMatch;
  onClose: () => void;
  children?: React.ReactNode;
}

/** Read-only details of a matched property. Shows only fields returned by the portal API. */
export const PortalPropertyDetailModal: React.FC<PortalPropertyDetailModalProps> = ({
  item,
  onClose,
  children,
}) => {
  const p = item.property;
  const images = p.images || [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: Array<[string, React.ReactNode]> = [
    ["Property type", p.property_type],
    ["Listing", p.listing_type],
    ["Bedrooms", p.bedrooms ?? null],
    ["Bathrooms", p.bathrooms ?? null],
    ["Area", p.area ? `${Number(p.area).toLocaleString()} ${p.area_unit}` : null],
    ["Furnishing", p.furnishing],
    ["Unit", p.unit_number],
    ["Match status", item.match_status],
    [
      "Address",
      [p.address, p.city, p.state, p.country, p.postal_code].filter(Boolean).join(", ") || null,
    ],
  ];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog cp-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-prop-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="portal-prop-title">{p.name}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        <div className="modal-body">
          {images.length > 0 ? (
            <div className="cp-detail-gallery">
              {images.slice(0, 6).map((img, i) => (
                <img
                  key={`${img.image_url}-${i}`}
                  src={resolveImageUrl(img.image_url)}
                  alt={`${p.name} ${i + 1}`}
                  loading="lazy"
                  onError={handleImageError}
                />
              ))}
            </div>
          ) : (
            <div className="cp-detail-gallery">
              <img src={resolveImageUrl(null)} alt={p.name} />
            </div>
          )}
          <div className="cp-prop-price" style={{ margin: "12px 0" }}>
            {formatPortalMoney(p.price, p.currency)}
          </div>
          <dl className="cp-detail-facts">
            {rows
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {p.description && <p className="cp-detail-description">{p.description}</p>}
        </div>
        {children && <div className="modal-footer">{children}</div>}
      </div>
    </div>
  );
};

export default PortalPropertyDetailModal;
