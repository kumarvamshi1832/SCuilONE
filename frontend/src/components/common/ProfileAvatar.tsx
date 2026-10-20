import { useState, useEffect, useRef } from "react";
import "./ProfileAvatar.css";

export interface ProfileAvatarProps {
  photoUrl?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  alt?: string;
  cacheBust?: number | string;
}

export function getSafeImageUrl(
  url?: string | null,
  cacheBust?: number | string
): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (
    trimmed.length === 0 ||
    trimmed === "null" ||
    trimmed === "undefined" ||
    trimmed === '""'
  ) {
    return "";
  }

  // Data URIs and Blob URLs must be returned verbatim without appending query params
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  // Handle relative URLs (e.g. /uploads/photo.jpg or static paths)
  let resolvedUrl = trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    const apiBase = (
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
    ).replace(/\/+$/, "");
    resolvedUrl = `${apiBase}${trimmed}`;
  }

  // Safe cache-busting for remote HTTP/HTTPS URLs (like Cloudinary)
  if (cacheBust && (resolvedUrl.startsWith("http://") || resolvedUrl.startsWith("https://"))) {
    const separator = resolvedUrl.includes("?") ? "&" : "?";
    return `${resolvedUrl}${separator}t=${cacheBust}`;
  }

  return resolvedUrl;
}

export function getInitials(name?: string | null): string {
  if (!name || typeof name !== "string") return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";
  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }
  if (first[0] && last[0]) {
    return (first[0] + last[0]).toUpperCase();
  }
  return "U";
}

export default function ProfileAvatar({
  photoUrl,
  name,
  size = 40,
  className = "",
  alt,
  cacheBust,
}: ProfileAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const cleanUrl = getSafeImageUrl(photoUrl, cacheBust);
  const isValidUrl = cleanUrl.length > 0;

  // Reset error and loading state whenever the photo URL changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [cleanUrl]);

  // Check if image is already completed (in-memory data URL or browser cache)
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      if (imgRef.current.naturalWidth > 0) {
        setIsLoaded(true);
        setHasError(false);
      } else if (imgRef.current.naturalWidth === 0 && cleanUrl) {
        setHasError(true);
        setIsLoaded(false);
      }
    }
  }, [cleanUrl]);

  const initials = getInitials(name);
  const fontSize = Math.max(12, Math.round(size * 0.38));
  const shouldTryImage = isValidUrl && !hasError;

  return (
    <div
      className={`profile-avatar ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        fontSize: `${fontSize}px`,
      }}
      aria-label={alt || name || "User profile avatar"}
    >
      {/* Initials fallback: always present as the base layer, or shown when image fails/is absent */}
      <span
        className={`profile-avatar-initials ${isLoaded ? "is-hidden" : ""}`}
        aria-hidden={shouldTryImage && isLoaded}
      >
        {initials}
      </span>

      {/* Actual user image if provided and has not failed */}
      {shouldTryImage && (
        <img
          ref={(node) => {
            imgRef.current = node;
            if (node && node.complete && node.naturalWidth > 0 && !isLoaded) {
              setIsLoaded(true);
              setHasError(false);
            }
          }}
          src={cleanUrl}
          alt={alt || name || "Profile"}
          className={`profile-avatar-img ${isLoaded ? "is-loaded" : "is-loading"}`}
          onLoad={() => {
            setIsLoaded(true);
            setHasError(false);
          }}
          onError={() => {
            setHasError(true);
            setIsLoaded(false);
          }}
        />
      )}
    </div>
  );
}
