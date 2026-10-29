import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTenantDetails } from "../../services/dashboardService";
import { getUsers } from "../../services/userService";
import { getIndustryDisplayName, normalizeIndustry } from "../../utils/industryUtils";
import { TenantDetails } from "../../types/dashboard";
import { User } from "../../types/user";
import "./CompanyProfile.css";

export default function CompanyProfile() {
  const navigate = useNavigate();
  const { industry: routeIndustry } = useParams();

  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const [tenantData, usersData] = await Promise.allSettled([
          getTenantDetails(),
          getUsers(),
        ]);

        if (isMounted) {
          if (tenantData.status === "fulfilled") {
            setTenant(tenantData.value);
          }
          if (usersData.status === "fulfilled" && Array.isArray(usersData.value)) {
            setUsers(usersData.value);
          }
        }
      } catch {
        // Silently handle error, safe fallbacks are used
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute base path for Back to Dashboard
  const activeIndustry = routeIndustry || tenant?.industry || "real-estate";
  const normalizedIndustry = normalizeIndustry(activeIndustry);
  const basePath = `/${normalizedIndustry}`;

  // 1. Company Name
  const companyName = (() => {
    if (tenant?.name && tenant.name.trim() && tenant.name !== "Unknown") {
      return tenant.name.trim();
    }
    try {
      const stored = sessionStorage.getItem("tenant");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.name && typeof parsed.name === "string" && parsed.name.trim()) {
          return parsed.name.trim();
        }
        if (parsed?.company_name && typeof parsed.company_name === "string" && parsed.company_name.trim()) {
          return parsed.company_name.trim();
        }
      }
    } catch {}
    try {
      const storedUser = sessionStorage.getItem("user");
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
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

  // 2. Industry Name
  const industryName = (() => {
    let raw = tenant?.industry;
    if (!raw) {
      try {
        const stored = sessionStorage.getItem("tenant");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.industry && typeof parsed.industry === "string") {
            raw = parsed.industry;
          }
        }
      } catch {}
    }
    if (!raw && routeIndustry) {
      raw = routeIndustry;
    }
    if (!raw) {
      try {
        const storedUser = sessionStorage.getItem("user");
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          if (parsedUser?.tenant?.industry && typeof parsedUser.tenant.industry === "string") {
            raw = parsedUser.tenant.industry;
          } else if (parsedUser?.industry && typeof parsedUser.industry === "string") {
            raw = parsedUser.industry;
          }
        }
      } catch {}
    }
    if (raw && typeof raw === "string" && raw.trim()) {
      const display = getIndustryDisplayName(raw.trim());
      if (display) return display;
    }
    return "Not available";
  })();

  // 3. Location fields (City, State, Country, Address)
  const { city, state, country, address, location } = (() => {
    let c = "";
    let s = "";
    let co = "";
    let addr = "";

    const anyTenant = tenant as any;
    if (anyTenant) {
      if (anyTenant.city) c = anyTenant.city;
      if (anyTenant.state) s = anyTenant.state;
      if (anyTenant.country) co = anyTenant.country;
      if (anyTenant.address) addr = anyTenant.address;
      else if (anyTenant.location) addr = anyTenant.location;
    }

    try {
      const stored = sessionStorage.getItem("tenant");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!c && parsed?.city) c = parsed.city;
        if (!s && parsed?.state) s = parsed.state;
        if (!co && parsed?.country) co = parsed.country;
        if (!addr && parsed?.address) addr = parsed.address;
        else if (!addr && parsed?.location) addr = parsed.location;
      }
    } catch {}

    try {
      const storedUser = sessionStorage.getItem("user");
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        const uTenant = parsedUser?.tenant;
        if (uTenant) {
          if (!c && uTenant.city) c = uTenant.city;
          if (!s && uTenant.state) s = uTenant.state;
          if (!co && uTenant.country) co = uTenant.country;
          if (!addr && uTenant.address) addr = uTenant.address;
          else if (!addr && uTenant.location) addr = uTenant.location;
        }
      }
    } catch {}

    const resolvedCity = c.trim() ? c.trim() : "Not available";
    const resolvedState = s.trim() ? s.trim() : "Not available";
    const resolvedCountry = co.trim() ? co.trim() : "Not available";
    const resolvedAddress = addr.trim() ? addr.trim() : "Not available";

    let loc = "Not available";
    if (resolvedCity !== "Not available" && resolvedState !== "Not available") {
      loc = `${resolvedCity}, ${resolvedState}`;
    } else if (resolvedCity !== "Not available") {
      loc = resolvedCity;
    } else if (resolvedState !== "Not available") {
      loc = resolvedState;
    } else if (resolvedAddress !== "Not available") {
      loc = resolvedAddress;
    }

    return {
      city: resolvedCity,
      state: resolvedState,
      country: resolvedCountry,
      address: resolvedAddress,
      location: loc,
    };
  })();

  // 4. Tenant Owner
  const { ownerName, ownerEmail, ownerRole } = (() => {
    // Check users array for Tenant Owner
    const ownerUser = users.find((u) => {
      const r = String(u.role || "").toUpperCase();
      return r === "TENANT OWNER" || r === "TENANT_OWNER" || r.includes("OWNER");
    });

    if (ownerUser) {
      return {
        ownerName: ownerUser.full_name?.trim() || "Not available",
        ownerEmail: ownerUser.email?.trim() || "Not available",
        ownerRole: ownerUser.role?.trim() || "Tenant Owner",
      };
    }

    // Check if current authenticated user is Tenant Owner
    try {
      const storedUser = sessionStorage.getItem("user");
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        const r = String(parsed?.role?.name || parsed?.role || "").toUpperCase();
        if (r === "TENANT OWNER" || r === "TENANT_OWNER" || r.includes("OWNER")) {
          return {
            ownerName: (parsed.full_name || parsed.name || "").trim() || "Not available",
            ownerEmail: (parsed.email || "").trim() || "Not available",
            ownerRole: (parsed?.role?.name || parsed?.role || "Tenant Owner").trim(),
          };
        }
      }
    } catch {}

    // Check tenant record itself
    const anyTenant = tenant as any;
    if (anyTenant) {
      const name = anyTenant.owner_name || anyTenant.tenant_owner || anyTenant.owner?.full_name;
      if (name && typeof name === "string" && name.trim()) {
        return {
          ownerName: name.trim(),
          ownerEmail: anyTenant.owner_email || anyTenant.owner?.email || "Not available",
          ownerRole: "Tenant Owner",
        };
      }
    }

    return {
      ownerName: "Not available",
      ownerEmail: "Not available",
      ownerRole: "Not available",
    };
  })();

  if (loading) {
    return (
      <div className="company-profile-page">
        <div className="profile-card profile-message">Loading company details...</div>
      </div>
    );
  }

  return (
    <div className="company-profile-page">
      {/* Header section */}
      <div className="company-page-heading">
        <div className="company-heading-text">
          <span className="profile-eyebrow">COMPANY PROFILE</span>
          <h1>Company Details</h1>
          <p>View your company information and tenant details.</p>
        </div>

        <button
          type="button"
          className="profile-secondary-button company-back-btn"
          onClick={() => navigate(`${basePath}/dashboard`)}
          title="Back to Dashboard"
          aria-label="Back to Dashboard"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: 6 }}
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Dashboard
        </button>
      </div>

      {/* Company identity card */}
      <section className="profile-card profile-summary-card company-summary-card">
        <div className="profile-identity">
          <div className="company-avatar-wrapper" aria-hidden="true">
            <svg
              className="company-avatar-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
              <path d="M9 22v-4h6v4" />
              <path d="M8 6h.01" />
              <path d="M16 6h.01" />
              <path d="M8 10h.01" />
              <path d="M16 10h.01" />
              <path d="M8 14h.01" />
              <path d="M16 14h.01" />
            </svg>
          </div>

          <div className="profile-identity-details">
            <h2>{companyName}</h2>

            <div className="company-location-row">
              <svg
                className="company-location-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{location}</span>
            </div>

            <div className="profile-badges">
              <span className="profile-role-badge">
                {industryName}
              </span>
              <span className="profile-status-badge is-active">
                <span className="profile-status-dot" />
                Active Organization
              </span>
            </div>

            <small className="profile-photo-hint">
              Verified tenant organization on SCuilONE Multi-Tenant Platform
            </small>
          </div>
        </div>
      </section>

      {/* Company information section */}
      <section className="profile-card profile-details-card company-details-card">
        <div className="profile-section-heading">
          <div>
            <h2>Company Information</h2>
            <p>General details and registered location of your tenant organization.</p>
          </div>
        </div>

        <div className="profile-fields-grid">
          <div className="profile-field">
            <label htmlFor="company_name">Company Name</label>
            <input
              id="company_name"
              value={companyName}
              disabled
              readOnly
            />
          </div>

          <div className="profile-field">
            <label htmlFor="company_industry">Industry</label>
            <input
              id="company_industry"
              value={industryName}
              disabled
              readOnly
            />
          </div>

          <div className="profile-field">
            <label htmlFor="company_city">City</label>
            <input
              id="company_city"
              value={city}
              disabled
              readOnly
            />
          </div>

          <div className="profile-field">
            <label htmlFor="company_state">State</label>
            <input
              id="company_state"
              value={state}
              disabled
              readOnly
            />
          </div>

          <div className="profile-field">
            <label htmlFor="company_country">Country</label>
            <input
              id="company_country"
              value={country}
              disabled
              readOnly
            />
          </div>

          <div className="profile-field">
            <label htmlFor="company_address">Company Address</label>
            <input
              id="company_address"
              value={address}
              disabled
              readOnly
            />
          </div>
        </div>

        {/* Tenant owner section */}
        <div className="profile-section-heading company-owner-heading">
          <div>
            <h2>Tenant Owner</h2>
            <p>Primary administrator and account owner for this tenant organization.</p>
          </div>
        </div>

        <div className="profile-fields-grid">
          <div className="profile-field">
            <label htmlFor="owner_name">Owner Full Name</label>
            <input
              id="owner_name"
              value={ownerName}
              disabled
              readOnly
            />
          </div>

          <div className="profile-field">
            <label htmlFor="owner_email">Owner Email</label>
            <input
              id="owner_email"
              value={ownerEmail}
              disabled
              readOnly
            />
          </div>

          <div className="profile-field">
            <label htmlFor="owner_role">Owner Role</label>
            <input
              id="owner_role"
              value={ownerRole}
              disabled
              readOnly
            />
          </div>
        </div>
      </section>
    </div>
  );
}
