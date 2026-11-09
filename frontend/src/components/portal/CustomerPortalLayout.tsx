import { useEffect, useState, useRef } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LifeBuoyIcon,
  LayoutDashboardIcon,
  TicketIcon,
  UserIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  BuildingIcon,
  CheckIcon,
} from "../common/SupportPortalIcons";
import {
  getPortalProfile,
  portalLogout,
  getPortalCustomer,
  getPortalWorkspaces,
  portalSwitchWorkspace,
} from "../../services/customerPortalAuthService";
import type {
  PortalProfileResponse,
  PortalWorkspace,
} from "../../types/customerPortal";
import "./CustomerPortalLayout.css";

export default function CustomerPortalLayout() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PortalProfileResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<PortalWorkspace[]>([]);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("portal_theme") === "dark";
  });

  const workspaceRef = useRef<HTMLDivElement>(null);
  const localCustomer = getPortalCustomer();

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
          is_current: true,
        }
      : null);

  const contactName =
    profile?.contact?.full_name || localCustomer?.email?.split("@")[0] || "Customer";
  const accountName = profile?.account?.name || currentWorkspace?.account_name || "Client Portal";
  const initials = contactName.slice(0, 2).toUpperCase();

  // Determine if tenant industry supports Real Estate modules
  const isRealEstate =
    profile?.tenant?.industry?.toLowerCase().includes("real estate") || false;

  return (
    <div className={`cp-layout ${isDarkMode ? "dark" : ""}`}>
      {/* Top Navbar */}
      <header className="cp-navbar">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/portal/dashboard" className="cp-navbar-brand">
            <div className="cp-brand-icon">
              <LifeBuoyIcon size={20} />
            </div>
            <div>
              <div className="cp-brand-text">SCuilONE</div>
            </div>
            <span className="cp-brand-tag">Client Portal</span>
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
                    {workspaces.map((ws) => (
                      <button
                        type="button"
                        key={ws.tenant_id}
                        className={`cp-workspace-item ${ws.is_current ? "active" : ""}`}
                        onClick={() => handleSwitchWorkspace(ws.tenant_id)}
                        disabled={switchingWorkspace}
                      >
                        <div style={{ flex: 1, textAlign: "left" }}>
                          <div className="cp-ws-item-tenant">{ws.tenant_name}</div>
                          <div className="cp-ws-item-account">{ws.account_name}</div>
                        </div>
                        {ws.is_current && <CheckIcon size={14} className="cp-ws-item-check" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="cp-nav-links">
          <NavLink
            to="/portal/dashboard"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <LayoutDashboardIcon size={16} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink
            to="/portal/estimates"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <span>Estimates</span>
          </NavLink>
          <NavLink
            to="/portal/contracts"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <span>Contracts</span>
          </NavLink>
          <NavLink
            to="/portal/projects"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <span>Projects</span>
          </NavLink>
          <NavLink
            to="/portal/invoices"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <span>Invoices</span>
          </NavLink>
          <NavLink
            to="/portal/documents"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <span>Documents</span>
          </NavLink>
          <NavLink
            to="/portal/tickets"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <TicketIcon size={16} />
            <span>Tickets</span>
          </NavLink>

          {isRealEstate && (
            <NavLink
              to="/portal/real-estate"
              className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
            >
              <span>Real Estate</span>
            </NavLink>
          )}

          <NavLink
            to="/portal/profile"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <UserIcon size={16} />
            <span>Profile</span>
          </NavLink>
        </nav>

        {/* Right Section: Theme Toggle, User Profile, Logout */}
        <div className="cp-nav-right">
          <button
            className="cp-logout-btn"
            onClick={toggleDarkMode}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle dark/light mode"
          >
            {isDarkMode ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>

          <div className="cp-user-badge">
            <div className="cp-avatar">{initials}</div>
            <div className="cp-user-info">
              <span className="cp-user-name">{contactName}</span>
              <span className="cp-user-account">{accountName}</span>
            </div>
          </div>

          <button
            className="cp-logout-btn"
            onClick={handleLogout}
            title="Sign out of Client Portal"
            aria-label="Sign out of Client Portal"
          >
            <LogOutIcon size={18} />
          </button>
        </div>
      </header>

      {/* Main Page Body */}
      <main className="cp-main-content">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="cp-footer">
        <div>
          &copy; {new Date().getFullYear()} SCuilONE Enterprise CRM. Secure Client Portal.
        </div>
      </footer>
    </div>
  );
}
