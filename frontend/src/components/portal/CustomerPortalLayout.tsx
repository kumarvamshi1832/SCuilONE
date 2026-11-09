import { useEffect, useState, useRef } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LifeBuoyIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  BuildingIcon,
  CodeIcon,
  CheckIcon,
  MenuIcon,
  XIcon,
} from "../common/SupportPortalIcons";
import {
  getPortalProfile,
  portalLogout,
  getPortalCustomer,
  getPortalWorkspaces,
  portalSwitchWorkspace,
} from "../../services/customerPortalAuthService";
import {
  getPortalAvatar,
  PORTAL_AVATAR_EVENT,
} from "../../services/customerPortalAvatarService";
import type {
  PortalProfileResponse,
  PortalWorkspace,
} from "../../types/customerPortal";
import { normalizeIndustry, getIndustryDisplayName } from "../../utils/industryUtils";
import CustomerPortalSidebar from "./CustomerPortalSidebar";
import "./CustomerPortalLayout.css";

const SIDEBAR_STORAGE_KEY = "scuilone_cp_sidebar_collapsed";

export default function CustomerPortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState<PortalProfileResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<PortalWorkspace[]>([]);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("portal_theme") === "dark";
  });

  // Responsive sidebar collapse state with session storage memory
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved !== null) {
        return saved === "true";
      }
    } catch {
      // sessionStorage unavailable
    }
    // Tablet: default to collapsed state to preserve screen space
    if (typeof window !== "undefined") {
      return window.innerWidth <= 1024 && window.innerWidth > 820;
    }
    return false;
  });

  // Mobile off-canvas drawer state
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const localCustomer = getPortalCustomer();

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // sessionStorage unavailable
      }
      return next;
    });
  };

  const loadInitialData = async () => {
    try {
      const [profileData, workspacesData] = await Promise.all([
        getPortalProfile(),
        getPortalWorkspaces().catch(() => ({ current_tenant_id: "", workspaces: [] })),
      ]);
      setProfile(profileData);
      setWorkspaces(workspacesData.workspaces || []);
    } catch (err) {
      console.warn("Failed to load initial portal layout data:", err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Listen for workspace switch events across Customer Portal modules
  useEffect(() => {
    const handleWorkspaceSwitched = () => {
      loadInitialData();
    };
    window.addEventListener("portal:workspace-switched", handleWorkspaceSwitched);
    return () => {
      window.removeEventListener("portal:workspace-switched", handleWorkspaceSwitched);
    };
  }, []);

  // Synchronize profile photo/avatar across portal navigation and updates
  useEffect(() => {
    const userKey =
      profile?.id ||
      localCustomer?.id ||
      profile?.contact?.id ||
      localCustomer?.email;
    setAvatarUrl(getPortalAvatar(userKey));

    const handleAvatarUpdated = (event: Event) => {
      const customEvt = event as CustomEvent<{
        userIdentifier?: string;
        avatarUrl?: string | null;
      }>;
      setAvatarUrl(customEvt.detail?.avatarUrl ?? null);
    };

    window.addEventListener(PORTAL_AVATAR_EVENT, handleAvatarUpdated);
    return () => {
      window.removeEventListener(PORTAL_AVATAR_EVENT, handleAvatarUpdated);
    };
  }, [profile?.id, profile?.contact?.id, localCustomer?.id, localCustomer?.email]);

  // Close mobile drawer on route transition
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Ensure full viewport height and proper layout shell while Customer Portal is mounted
  useEffect(() => {
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalHtmlHeight = document.documentElement.style.height;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyHeight = document.body.style.height;
    const rootEl = document.getElementById("root");
    const originalRootOverflow = rootEl?.style.overflow;
    const originalRootHeight = rootEl?.style.height;
    const originalRootMinHeight = rootEl?.style.minHeight;

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";

    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";

    if (rootEl) {
      rootEl.style.overflow = "hidden";
      rootEl.style.height = "100%";
      rootEl.style.minHeight = "100%";
    }

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.documentElement.style.height = originalHtmlHeight;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.height = originalBodyHeight;
      if (rootEl) {
        rootEl.style.overflow = originalRootOverflow || "";
        rootEl.style.height = originalRootHeight || "";
        rootEl.style.minHeight = originalRootMinHeight || "";
      }
    };
  }, []);

  // Close workspace dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setIsWorkspaceOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile drawer on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("portal_theme", next ? "dark" : "light");
      return next;
    });
  };

  const handleLogout = async () => {
    await portalLogout();
    navigate("/portal/login", { replace: true });
  };

  const handleSwitchWorkspace = async (targetTenantId: string) => {
    if (switchingWorkspace) return;
    setSwitchingWorkspace(true);
    setSwitchError(null);
    // Optimistically update workspaces so the selected workspace and header switch immediately
    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        is_current: w.tenant_id === targetTenantId,
      }))
    );
    try {
      await portalSwitchWorkspace(targetTenantId);
      setIsWorkspaceOpen(false);
      // Reload profile and workspaces
      const [updatedProfile, updatedWs] = await Promise.all([
        getPortalProfile(true),
        getPortalWorkspaces(),
      ]);
      setProfile(updatedProfile);
      setWorkspaces(updatedWs.workspaces || []);
      // Navigate to dashboard and trigger reload
      navigate("/portal/dashboard", { replace: true });
      window.dispatchEvent(new CustomEvent("portal:workspace-switched"));
    } catch (err: any) {
      console.error("Failed to switch workspace:", err);
      setSwitchError(
        err?.response?.data?.detail || "Unable to switch into that company workspace."
      );
      // Re-fetch workspaces to restore correct active state if switch failed
      getPortalWorkspaces().then((res) => setWorkspaces(res.workspaces || [])).catch(() => {});
    } finally {
      setSwitchingWorkspace(false);
    }
  };

  const currentWorkspace =
    workspaces.find((w) => w.is_current) ||
    workspaces[0] ||
    (profile?.tenant
      ? {
          tenant_id: profile.tenant.id,
          tenant_name: profile.tenant.name,
          account_id: profile.account?.id || "",
          account_name: profile.account?.name || "",
          industry: profile.tenant.industry || profile.account?.industry || undefined,
          is_current: true,
        }
      : null);

  const contactName =
    profile?.contact?.full_name || localCustomer?.email?.split("@")[0] || "Customer";
  const accountName = profile?.account?.name || currentWorkspace?.account_name || "Client Portal";
  const initials = contactName.slice(0, 2).toUpperCase();

  // Authoritative dynamic industry resolution for current workspace
  const activeTenantId = currentWorkspace?.tenant_id || profile?.tenant?.id;
  const isProfileMatchingCurrent = Boolean(
    profile?.tenant?.id && activeTenantId && profile.tenant.id === activeTenantId
  );

  const rawIndustry =
    (currentWorkspace?.industry && currentWorkspace.industry.trim()) ||
    (isProfileMatchingCurrent ? profile?.tenant?.industry || profile?.account?.industry : null) ||
    (!currentWorkspace ? profile?.tenant?.industry || profile?.account?.industry : null) ||
    (currentWorkspace?.tenant_name?.toLowerCase().includes("real estate") ||
    currentWorkspace?.tenant_name?.toLowerCase().includes("realty")
      ? "Real Estate"
      : null) ||
    (currentWorkspace?.tenant_name?.toLowerCase().includes("software") ? "Software Company" : null) ||
    null;

  // Format industry identifier dynamically (e.g. REAL_ESTATE -> "Real Estate", SOFTWARE_COMPANY -> "Software Company")
  const industryDisplayName = getIndustryDisplayName(rawIndustry);

  // Authoritative real-estate check for industry-specific routing & sidebar navigation
  const normalizedIndustry = normalizeIndustry(rawIndustry);
  const isRealEstate =
    (Boolean(rawIndustry) && normalizedIndustry === "real-estate") ||
    Boolean(
      rawIndustry?.toLowerCase().replace(/[^a-z]/g, "").includes("realestate") ||
      rawIndustry?.toLowerCase().replace(/[^a-z]/g, "").includes("realty")
    );

  return (
    <div className={`cp-layout ${isDarkMode ? "dark" : ""}`}>
      {/* Top Header: Compact, Brand, Workspace, Controls */}
      <header className="cp-navbar">
        <div className="cp-nav-left">
          {/* Mobile Drawer Toggle Button */}
          <button
            type="button"
            className="cp-mobile-toggle-btn"
            onClick={() => setIsMobileOpen((prev) => !prev)}
            aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
            title="Toggle navigation"
          >
            {isMobileOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
          </button>

          <Link to="/portal/dashboard" className="cp-navbar-brand" title="SCuilONE Client Portal">
            <div className="cp-brand-icon">
              <LifeBuoyIcon size={20} />
            </div>
            <div className="cp-brand-text">SCuilONE</div>
            <div className="cp-header-divider" aria-hidden="true" />
            <div className="cp-portal-section">
              <span className="cp-portal-primary-label">Client Portal</span>
              {industryDisplayName && (
                <div className="cp-portal-industry-row">
                  <span
                    className={`cp-portal-industry-dot ${isRealEstate ? "dot-real-estate" : "dot-software"}`}
                    aria-hidden="true"
                  />
                  <span className="cp-portal-industry-text">{industryDisplayName}</span>
                </div>
              )}
            </div>
          </Link>

          {/* Workspace Switcher */}
          {workspaces.length > 0 && (
            <div className="cp-workspace-wrapper" ref={workspaceRef}>
              <button
                type="button"
                className="cp-workspace-btn"
                onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
                disabled={switchingWorkspace}
                title="Switch company workspace"
              >
                <BuildingIcon size={14} />
                <span className="cp-workspace-name">
                  {currentWorkspace?.tenant_name || profile?.tenant?.name || "Workspace"}
                </span>
                <span className="cp-workspace-chevron">▾</span>
              </button>

              {isWorkspaceOpen && (
                <div className="cp-workspace-dropdown">
                  <div className="cp-workspace-dropdown-header">
                    <span>Company Workspaces</span>
                  </div>
                  {switchError && (
                    <div className="cp-workspace-error">{switchError}</div>
                  )}
                  <div className="cp-workspace-list">
                    {workspaces.map((ws) => {
                      const isRealEstateWs =
                        ws.tenant_name.toLowerCase().includes("real estate") ||
                        ws.tenant_name.toLowerCase().includes("realty") ||
                        ws.industry?.toLowerCase().includes("real estate");
                      return (
                        <button
                          type="button"
                          key={ws.tenant_id}
                          className={`cp-workspace-item ${ws.is_current ? "active" : ""}`}
                          onClick={() => handleSwitchWorkspace(ws.tenant_id)}
                          disabled={switchingWorkspace}
                        >
                          <span style={{ marginRight: 8, opacity: 0.8, display: "flex", alignItems: "center" }}>
                            {isRealEstateWs ? <BuildingIcon size={15} /> : <CodeIcon size={15} />}
                          </span>
                          <div style={{ flex: 1, textAlign: "left" }}>
                            <div className="cp-ws-item-tenant">{ws.tenant_name}</div>
                            <div className="cp-ws-item-account">{ws.account_name}</div>
                          </div>
                          {ws.is_current && <CheckIcon size={14} className="cp-ws-item-check" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section: Theme Toggle, User Profile, Logout */}
        <div className="cp-nav-right">
          <button
            type="button"
            className="cp-theme-toggle-btn"
            onClick={toggleDarkMode}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle dark/light mode"
          >
            {isDarkMode ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>

          <div className="cp-user-badge">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={contactName}
                className="cp-avatar cp-avatar-img"
              />
            ) : (
              <div className="cp-avatar">{initials}</div>
            )}
            <div className="cp-user-info">
              <span className="cp-user-name">{contactName}</span>
              <span className="cp-user-account">{accountName}</span>
            </div>
          </div>

          <button
            type="button"
            className="cp-logout-btn"
            onClick={handleLogout}
            title="Sign out of Client Portal"
            aria-label="Sign out of Client Portal"
          >
            <LogOutIcon size={18} />
          </button>
        </div>
      </header>

      {/* Application Body: Left Sidebar + Main Content Area */}
      <div className="cp-body-wrapper">
        {/* Mobile Backdrop Overlay */}
        {isMobileOpen && (
          <div
            className="cp-sidebar-backdrop"
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Left Vertical Collapsible Sidebar */}
        <CustomerPortalSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleSidebar}
          isMobileOpen={isMobileOpen}
          onCloseMobile={() => setIsMobileOpen(false)}
          isRealEstate={isRealEstate}
        />

        {/* Main Content Area beside Sidebar */}
        <div className="cp-content-wrapper">
          <main className="cp-main-content">
            <Outlet context={{ isRealEstate, profile, currentWorkspace }} />
          </main>

          {/* Footer */}
          <footer className="cp-footer">
            <div>
              &copy; {new Date().getFullYear()} SCuilONE Enterprise CRM. Secure Client Portal.
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
