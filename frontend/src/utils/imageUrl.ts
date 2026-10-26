/**
 * SCuilONE CRM — Image URL Resolution & Fallback Utility
 * 
 * Handles absolute URLs, relative backend paths, and broken image fallbacks.
 */

export const getApiBaseUrl = (): string => {
  const url = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
  return url.replace(/\/+$/, "");
};

/**
 * High-contrast, theme-harmonious SVG data URI placeholder for missing or broken real estate images.
 */
export const SCUILONE_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20260%22%20fill%3D%22none%22%3E%3Crect%20width%3D%22400%22%20height%3D%22260%22%20fill%3D%22%230f172a%22%2F%3E%3Cpath%20d%3D%22M150%20180L180%20140L210%20170L240%20130L280%20180H150Z%22%20fill%3D%22%230891b2%22%20opacity%3D%220.4%22%2F%3E%3Ccircle%20cx%3D%22170%22%20cy%3D%22100%22%20r%3D%2218%22%20fill%3D%22%2322d3ee%22%20opacity%3D%220.6%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%22215%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%2394a3b8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20letter-spacing%3D%220.05em%22%3ESCuilONE%20PROPERTY%20PREVIEW%3C%2Ftext%3E%3C%2Fsvg%3E";

/**
 * Resolves any image URL returned by the backend:
 * 1. Absolute URLs (e.g. Cloudinary `https://res.cloudinary.com/...` or `https://...`) are returned directly.
 * 2. Data / Blob URLs are returned directly.
 * 3. Relative paths (e.g. `/uploads/...` or `uploads/...`) are resolved against the API base URL.
 * 4. Falsy / empty values return the fallback placeholder.
 */
export const resolveImageUrl = (rawUrl?: string | null): string => {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return SCUILONE_IMAGE_PLACEHOLDER;
  }

  const trimmed = rawUrl.trim();

  // Absolute or data URLs
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }

  const baseUrl = getApiBaseUrl();

  // Relative with leading slash
  if (trimmed.startsWith("/")) {
    return `${baseUrl}${trimmed}`;
  }

  // Relative without leading slash
  return `${baseUrl}/${trimmed}`;
};

/**
 * Standard onError image handler to prevent broken image icons from destroying layouts.
 */
export const handleImageError = (
  e: React.SyntheticEvent<HTMLImageElement, Event>
) => {
  const target = e.currentTarget;
  if (target.src !== SCUILONE_IMAGE_PLACEHOLDER) {
    target.onerror = null; // Prevent infinite fallback loops
    target.src = SCUILONE_IMAGE_PLACEHOLDER;
  }
};
