import { useNavigate, useLocation } from "react-router-dom";
import { TenantDetails } from "../../types/dashboard";
import { normalizeIndustry } from "../../utils/industryUtils";
import "./MyStoreDropdown.css";

interface MyStoreDropdownProps {
  tenant: TenantDetails | null;
  currentIndustry?: string;
}

export default function MyStoreDropdown({
  tenant,
  currentIndustry,
}: MyStoreDropdownProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Resolve base path for the tenant's current industry
  const activeIndustry = currentIndustry || tenant?.industry || "real-estate";
  const normalized = normalizeIndustry(activeIndustry);
  const basePath = `/${normalized}`;

  // Check if current route is company / mystore view
  const isActive =
    location.pathname.endsWith("/company") ||
    location.pathname.endsWith("/mystore") ||
    location.pathname.includes("/company/") ||
    location.pathname.includes("/mystore/");

  // Resolve Company Name for tooltip title
  const companyName = (() => {
    if (tenant?.name && tenant.name.trim() && tenant.name !== "Unknown") {
      return tenant.name.trim();
    }
    try {
      const rawTenant = sessionStorage.getItem("tenant");
      if (rawTenant) {
        const parsed = JSON.parse(rawTenant);
        if (parsed?.name && typeof parsed.name === "string" && parsed.name.trim()) {
          return parsed.name.trim();
        }
        if (parsed?.company_name && typeof parsed.company_name === "string" && parsed.company_name.trim()) {
          return parsed.company_name.trim();
        }
      }
    } catch {}
    try {
      const rawUser = sessionStorage.getItem("user");
      if (rawUser) {
        const parsedUser = JSON.parse(rawUser);
        if (parsedUser?.tenant?.name && typeof parsedUser.tenant.name === "string" && parsedUser.tenant.name.trim()) {
          return parsedUser.tenant.name.trim();
        }
        if (parsedUser?.company && typeof parsedUser.company === "string" && parsedUser.company.trim()) {
          return parsedUser.company.trim();
        }
      }
    } catch {}
    return "Not available";
  })();

  const handleMyStoreClick = () => {
    navigate(`${basePath}/company`);
  };

  return (
    <div className="mystore-dropdown-container">
      <button
        type="button"
        className={`tenant-selector mystore-btn ${isActive ? "active" : ""}`}
        onClick={handleMyStoreClick}
        aria-label="MyStore Company Details"
        title={companyName !== "Not available" ? `MyStore - ${companyName}` : "MyStore"}
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
        <span className="mystore-label">MyStore</span>
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
