import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { TenantDetails } from "../../types/dashboard";
import { normalizeIndustry, getIndustryDisplayName } from "../../utils/industryUtils";
import { getIndustryConfig } from "../../config/industryConfig";
import "./MyStoreDropdown.css";

interface MyStoreDropdownProps {
  tenant: TenantDetails | null;
  currentIndustry?: string;
}

/**
 * Checks whether a given string is an invalid / placeholder company name.
 */
function isInvalidCompanyName(name?: string | null): boolean {
  if (!name || typeof name !== "string") return true;
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "unknown" ||
    normalized === "not available" ||
    normalized === "n/a" ||
    normalized === "null" ||
    normalized === "undefined" ||
    normalized === "mystore" ||
    normalized === "my store" ||
    normalized === "default" ||
    normalized === "none"
  );
}

/**
 * Extracts the registered company / organization name from authenticated tenant and user storage.
 * Strictly avoids personal user names (e.g. user.name, user.full_name).
 */
function extractAuthenticatedCompanyName(tenantProp: TenantDetails | null): string | null {
  // 1. Direct tenant prop
  if (tenantProp?.name && !isInvalidCompanyName(tenantProp.name)) {
    return tenantProp.name.trim();
  }

  // 2. SessionStorage 'tenant'
  try {
    const rawTenant = sessionStorage.getItem("tenant");
    if (rawTenant) {
      const parsed = JSON.parse(rawTenant);
      const name =
        parsed?.name ||
        parsed?.company_name ||
        parsed?.company ||
        parsed?.organization_name ||
        parsed?.org_name;
      if (name && typeof name === "string" && !isInvalidCompanyName(name)) {
        return name.trim();
      }
    }
  } catch {}

  // 3. LocalStorage 'tenant'
  try {
    const rawLocalTenant = localStorage.getItem("tenant");
    if (rawLocalTenant) {
      const parsed = JSON.parse(rawLocalTenant);
      const name =
        parsed?.name ||
        parsed?.company_name ||
        parsed?.company ||
        parsed?.organization_name ||
        parsed?.org_name;
      if (name && typeof name === "string" && !isInvalidCompanyName(name)) {
        return name.trim();
      }
    }
  } catch {}

  // 4. SessionStorage 'user' -> Tenant Object or Company Fields ONLY (never user.full_name or user.first_name)
  try {
    const rawUser = sessionStorage.getItem("user");
    if (rawUser) {
      const parsedUser = JSON.parse(rawUser);
      // Check user.tenant nested object
      if (parsedUser?.tenant?.name && !isInvalidCompanyName(parsedUser.tenant.name)) {
        return parsedUser.tenant.name.trim();
      }
      if (parsedUser?.tenant?.company_name && !isInvalidCompanyName(parsedUser.tenant.company_name)) {
        return parsedUser.tenant.company_name.trim();
      }
      // Check user company/organization fields
      const comp =
        parsedUser?.company ||
        parsedUser?.company_name ||
        parsedUser?.organization ||
        parsedUser?.organization_name ||
        parsedUser?.tenant_name;
      if (comp && typeof comp === "string" && !isInvalidCompanyName(comp)) {
        return comp.trim();
      }
    }
  } catch {}

  // 5. LocalStorage 'user' -> Tenant Object or Company Fields ONLY
  try {
    const rawLocalUser = localStorage.getItem("user");
    if (rawLocalUser) {
      const parsedUser = JSON.parse(rawLocalUser);
      if (parsedUser?.tenant?.name && !isInvalidCompanyName(parsedUser.tenant.name)) {
        return parsedUser.tenant.name.trim();
      }
      const comp =
        parsedUser?.company ||
        parsedUser?.company_name ||
        parsedUser?.organization ||
        parsedUser?.organization_name ||
        parsedUser?.tenant_name;
      if (comp && typeof comp === "string" && !isInvalidCompanyName(comp)) {
        return comp.trim();
      }
    }
  } catch {}

  return null;
}

export default function MyStoreDropdown({
  tenant,
  currentIndustry,
}: MyStoreDropdownProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Resolve active industry and base path
  const activeIndustry = currentIndustry || tenant?.industry || "real-estate";
  const normalized = normalizeIndustry(activeIndustry);
  const basePath = `/${normalized}`;

  // Check if current route is company view
  const isActive =
    location.pathname.endsWith("/company") ||
    location.pathname.endsWith("/mystore") ||
    location.pathname.includes("/company/") ||
    location.pathname.includes("/mystore/");

  // Dynamically tracked company name state
  const [resolvedCompanyName, setResolvedCompanyName] = useState<string | null>(() =>
    extractAuthenticatedCompanyName(tenant)
  );

  const syncCompanyName = useCallback(() => {
    const extracted = extractAuthenticatedCompanyName(tenant);
    setResolvedCompanyName(extracted);
  }, [tenant]);

  // Synchronize on prop change or route change
  useEffect(() => {
    syncCompanyName();
  }, [syncCompanyName, location.pathname, currentIndustry]);

  // Synchronize on account switch / storage events / custom update events
  useEffect(() => {
    const handleStorageChange = () => {
      syncCompanyName();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("crm:tenant-updated", handleStorageChange);
    window.addEventListener("crm:account-switched", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("crm:tenant-updated", handleStorageChange);
      window.removeEventListener("crm:account-switched", handleStorageChange);
    };
  }, [syncCompanyName]);

  // Resolve verified industry fallback name (never hardcoded "MyStore")
  const industryFallback = useMemo(() => {
    const display = getIndustryDisplayName(activeIndustry);
    if (display && display.trim()) return display;
    const config = getIndustryConfig(activeIndustry);
    if (config?.name && config.name.trim()) return config.name;
    return "Real Estate";
  }, [activeIndustry]);

  // Final displayed name: Actual registered company name OR verified industry display name
  const displayedName = resolvedCompanyName || industryFallback;

  const handleCompanyClick = () => {
    navigate(`${basePath}/company`);
  };

  return (
    <div className="mystore-dropdown-container">
      <button
        type="button"
        className={`tenant-selector mystore-btn ${isActive ? "active" : ""}`}
        onClick={handleCompanyClick}
        aria-label={`${displayedName} Company Details`}
        title={displayedName}
      >
        <svg
          className="mystore-btn-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ width: "16px", height: "16px" }}
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="mystore-label">{displayedName}</span>
        <svg
          className={`mystore-chevron ${isActive ? "active-nav" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
