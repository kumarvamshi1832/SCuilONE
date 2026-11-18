import React from "react";
import { resolveImageUrl, handleImageError } from "../../utils/imageUrl";
import type { PortalPropertyMatch } from "../../types/customerPortalBuyerRequirement";

export const formatPortalMoney = (
  amount: string | number | null | undefined,
  currency = "INR"
): string => {
  if (amount === null || amount === undefined || amount === "") return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return "-";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(num);
  } catch {
    return `${currency} ${num.toLocaleString()}`;
  }
};

interface PortalPropertyMatchCardProps {
  item: PortalPropertyMatch;
  /** Extra line shown under the title (e.g. the requirement a shortlisted property belongs to). */
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}

/** Read-only property card used for matched and shortlisted properties. */
export const PortalPropertyMatchCard: React.FC<PortalPropertyMatchCardProps> = ({
  item,
  subtitle,
  children,
}) => {
  const p = item.property;
  const primary = p.images?.find((img) => img.is_primary) || p.images?.[0];

  return (
    <article className="cp-prop-card">
      <div className="cp-prop-media">
        <img
          src={resolveImageUrl(primary?.image_url)}
          alt={p.name}
          loading="lazy"
          onError={handleImageError}
        />
        <span className="cp-prop-chip">{p.listing_type}</span>
        {item.match_status && <span className="cp-prop-status">{item.match_status}</span>}
      </div>
      <div className="cp-prop-body">
        <h3 className="cp-prop-title" title={p.name}>
          {p.name}
        </h3>
        {subtitle && <div className="cp-prop-subtitle">{subtitle}</div>}
        <div className="cp-prop-price">{formatPortalMoney(p.price, p.currency)}</div>
        <p className="cp-prop-location">
          {[p.unit_number ? `Unit ${p.unit_number}` : null, p.city, p.state]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <ul className="cp-prop-facts">
          <li>{p.property_type}</li>
          {p.bedrooms !== null && p.bedrooms !== undefined && <li>{p.bedrooms} bed</li>}
          {p.bathrooms !== null && p.bathrooms !== undefined && <li>{p.bathrooms} bath</li>}
          {p.area && (
            <li>
              {Number(p.area).toLocaleString()} {p.area_unit}
            </li>
          )}
          <li>{p.furnishing}</li>
        </ul>
        {children && <div className="cp-prop-actions">{children}</div>}
      </div>
    </article>
  );
};

export default PortalPropertyMatchCard;
