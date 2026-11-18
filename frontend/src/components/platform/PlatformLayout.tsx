import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BuildingIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CreditCardIcon,
  FileTextIcon,
  HeadphonesIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SunIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "../common/SupportPortalIcons";
import { useTheme } from "../../context/ThemeContext";
import {
  clearPlatformSession,
  getStoredPlatformUser,
  hasPlatformPermission,
} from "../../services/platformApiClient";
import { signOutAndRedirect } from "../../services/authSession";
import { isPlatformManager } from "../../utils/platformManager";
import NotificationBell from "./notifications/NotificationBell";
import "./PlatformLayout.css";

interface NavItemConfig {
  label: string;
  to: string;
  requiredAnyPermissions?: string[];
  icon: React.ReactNode;
}

interface NavGroupConfig {
  groupLabel: string;
  items: NavItemConfig[];
}

function ScuiloneBrandMark() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="scuilHexGrad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="55%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="scuilSGrad" x1="10" y1="8" x2="22" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f5f3ff" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.2L27.8 9v14L16 29.8 4.2 23V9L16 2.2z"
        fill="rgba(124, 58, 237, 0.24)"
        stroke="url(#scuilHexGrad)"
        strokeWidth="1.9"
      />
      <path
        d="M16 5.4L25 10.6v10.8L16 26.6 7 21.4V10.6L16 5.4z"
        stroke="rgba(196, 181, 253, 0.35)"
        strokeWidth="1"
      />
      <path
        d="M19.8 11.4c-.9-.9-2.2-1.4-3.8-1.4-2.2 0-3.7 1.1-3.7 2.7 0 1.8 1.6 2.4 3.9 2.9 2.2.5 3.6 1.2 3.6 3.1 0 1.9-1.7 3.1-4 3.1-1.8 0-3.3-.6-4.2-1.6"
        stroke="url(#scuilSGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PlatformLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(() => getStoredPlatformUser());
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("platform_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncStoredUser = () => {
      setUser(getStoredPlatformUser());
    };
    syncStoredUser();
    window.addEventListener("platform-profile-updated", syncStoredUser);
    window.addEventListener("storage", syncStoredUser);
    return () => {
      window.removeEventListener("platform-profile-updated", syncStoredUser);
      window.removeEventListener("storage", syncStoredUser);
    };
  }, [location.pathname]);

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("platform_sidebar_collapsed", String(next));
      } catch {
        // Ignore storage write failures in restricted environments
      }
      return next;
    });
  };

  // Notifications are scoped to the signed-in employee; without an id the bell is not rendered.
  const notificationIdentity = String(user?.user_id || user?.id || "").trim();

  const rawFullName = (user?.full_name || user?.name || "").trim();
  const headerDisplayName = rawFullName || "Account";

  const computeInitials = (name: string, email?: string | null): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0]?.[0] || "";
      const last = parts[parts.length - 1]?.[0] || "";
      const combined = `${first}${last}`.toUpperCase();
      if (combined) return combined;
    }
    if (parts.length === 1 && parts[0]?.[0]) {
      return parts[0][0].toUpperCase();
    }
    const emailFirst = (email || "").trim()[0];
    return emailFirst ? emailFirst.toUpperCase() : "A";
  };

  const userInitials = computeInitials(rawFullName, user?.email);
  const rawAvatarUrl = String(
    user?.avatar_url ||
      user?.photo_url ||
      user?.profile_image ||
      user?.avatar ||
      ""
  ).trim();

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [rawAvatarUrl]);

  const navGroups: NavGroupConfig[] = [
    {
      groupLabel: "Overview",
      items: [
        {
          label: "Dashboard",
          to: "/platform/dashboard",
          requiredAnyPermissions: ["platform.dashboard.view"],
          icon: <LayoutDashboardIcon size={16} />,
        },
      ],
    },
    {
      groupLabel: "Platform Governance",
      items: [
        {
          label: "Tenant Companies",
          to: "/platform/tenants",
          requiredAnyPermissions: ["platform.tenants.view"],
          icon: <BuildingIcon size={16} />,
        },
        {
          label: "Employees & Industry Teams",
          to: "/platform/employees",
          requiredAnyPermissions: [
            "platform.employees.view",
            "platform.teams.view",
          ],
          icon: <UsersIcon size={16} />,
        },
        {
          label: "Roles & Permissions",
          to: "/platform/roles",
          requiredAnyPermissions: ["platform.roles.view"],
          icon: <ShieldCheckIcon size={16} />,
        },
      ],
    },
    {
      groupLabel: "Operations & Revenue",
      items: [
        {
          label: "Support & Knowledge Base",
          to: "/platform/support",
          requiredAnyPermissions: [
            "platform.tickets.view",
            "platform.kb.view",
          ],
          icon: <HeadphonesIcon size={16} />,
        },
        {
          label: "Plans, Billing & Renewals",
          to: "/platform/billing",
          requiredAnyPermissions: [
            "platform.billing.view",
            "platform.plans.view",
          ],
          icon: <CreditCardIcon size={16} />,
        },
        {
          label: "Sales & Finance",
          to: "/platform/finance",
          requiredAnyPermissions: [
            "platform.sales.view",
            "platform.finance.view",
          ],
          icon: <TrendingUpIcon size={16} />,
        },
      ],
    },
    {
      groupLabel: "SRE, Security & Insights",
      items: [
        {
          label: "Technical, Security & Audit",
          to: "/platform/operations",
          requiredAnyPermissions: [
            "platform.technical.view",
            "platform.audit.view",
            "platform.security.view",
          ],
          icon: <ShieldAlertIcon size={16} />,
        },
        {
          label: "Analytics & Settings",
          to: "/platform/analytics",
          requiredAnyPermissions: [
            "platform.analytics.view",
            "platform.settings.manage",
          ],
          icon: <FileTextIcon size={16} />,
        },
      ],
    },
    {
      groupLabel: "Account",
      items: [
        {
          label: "My Profile",
          to: "/platform/profile",
          icon: <UserIcon size={16} />,
        },
      ],
    },
  ];

  // Platform Manager gets its own grouping and branding. Items still appear only when the
  // session holds the matching permission, so nothing here grants access.
  const managerMode = isPlatformManager();
  const managerNavGroups: NavGroupConfig[] = [
    {
      groupLabel: "Overview",
      items: [
        {
          label: "Dashboard",
          to: "/platform/dashboard",
          requiredAnyPermissions: ["platform.dashboard.view"],
          icon: <LayoutDashboardIcon size={16} />,
        },
      ],
    },
    {
      groupLabel: "Platform Operations",
      items: [
        {
          label: "Tenant Companies",
          to: "/platform/tenants",
          requiredAnyPermissions: ["platform.tenants.view"],
          icon: <BuildingIcon size={16} />,
        },
        {
          label: "Employees & Industry Teams",
          to: "/platform/employees",
          requiredAnyPermissions: ["platform.employees.view", "platform.teams.view"],
          icon: <UsersIcon size={16} />,
        },
        {
          label: "Roles & Permissions",
          to: "/platform/roles",
          requiredAnyPermissions: ["platform.roles.view"],
          icon: <ShieldCheckIcon size={16} />,
        },
      ],
    },
    {
      groupLabel: "Operations & Management",
      items: [
        {
          label: "Support & Knowledge Base",
          to: "/platform/support",
          requiredAnyPermissions: ["platform.tickets.view", "platform.kb.view"],
          icon: <HeadphonesIcon size={16} />,
        },
        {
          label: "Subscription & Billing",
          to: "/platform/billing",
          requiredAnyPermissions: ["platform.billing.view", "platform.plans.view"],
          icon: <CreditCardIcon size={16} />,
        },
        {
          label: "Sales & Finance",
          to: "/platform/finance",
          requiredAnyPermissions: ["platform.sales.view", "platform.finance.view"],
          icon: <TrendingUpIcon size={16} />,
        },
      ],
    },
    {
      groupLabel: "Insights & Account",
      items: [
        {
          label: "Analytics & Reports",
          to: "/platform/analytics",
          requiredAnyPermissions: ["platform.analytics.view"],
          icon: <FileTextIcon size={16} />,
        },
        {
          label: "My Profile",
          to: "/platform/profile",
          icon: <UserIcon size={16} />,
        },
      ],
    },
  ];
  const activeNavGroups = managerMode ? managerNavGroups : navGroups;
  const brandSubtitle = managerMode ? "Platform Manager" : "Super Admin Platform";
  const topbarTitle = managerMode ? "Platform Manager Console" : "SCuilONE Platform Control";

  const handleLogout = async () => {
    await signOutAndRedirect();
    clearPlatformSession();
    navigate("/platform/login", { replace: true });
  };

  return (
    <div className={`platform-shell ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      <div
        className={`platform-backdrop ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className={`platform-sidebar ${sidebarOpen ? "open" : ""} ${
          sidebarCollapsed ? "collapsed" : ""
        }`}
      >
        <div className="platform-brand">
          <div className="platform-brand-title" title={`SCuilONE ${brandSubtitle}`}>
            <span className="platform-brand-logo">
              <ScuiloneBrandMark />
            </span>
            <span className="platform-brand-text">
              <span className="platform-brand-wordmark">
                <span>SCuilONE</span>
                <small className="platform-brand-sub">{brandSubtitle}</small>
              </span>
            </span>
          </div>
          <div className="platform-brand-actions">
            <button
              type="button"
              className="platform-collapse-btn"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebarCollapse}
            >
              {sidebarCollapsed ? (
                <ChevronRightIcon size={15} />
              ) : (
                <ChevronLeftIcon size={15} />
              )}
            </button>
            <button
              type="button"
              className="platform-mobile-toggle"
              aria-label="Close sidebar"
              onClick={() => setSidebarOpen(false)}
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>

        <nav className="platform-nav" aria-label="Platform navigation">
          {activeNavGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) =>
                !item.requiredAnyPermissions ||
                item.requiredAnyPermissions.some((p) => hasPlatformPermission(p))
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.groupLabel} className="platform-nav-group">
                <div className="platform-nav-group-label">{group.groupLabel}</div>
                <div className="platform-nav-list">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={item.label}
                      aria-label={item.label}
                      className={({ isActive }) =>
                        `platform-nav-link ${isActive ? "active" : ""}`
                      }
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="platform-nav-icon">{item.icon}</span>
                      <span className="platform-nav-label">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="platform-sidebar-footer">
          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            aria-label="Sign Out"
            className="platform-icon-btn danger platform-sidebar-logout"
          >
            <LogOutIcon size={15} />
            <span className="platform-sidebar-logout-label">Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="platform-main-wrap">
        <header className="platform-topbar">
          <div className="platform-topbar-left">
            <button
              type="button"
              className="platform-mobile-toggle"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <MenuIcon size={18} />
            </button>
            <div className="platform-topbar-heading">
              <h1 className="platform-topbar-title">{topbarTitle}</h1>
            </div>
          </div>

          <div className="platform-topbar-right">
            <div className="platform-topbar-actions">
              {notificationIdentity && <NotificationBell identityKey={notificationIdentity} />}
              <button
                type="button"
                className="platform-icon-btn"
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
                <span>{theme === "dark" ? "Light" : "Dark"}</span>
              </button>
              <button
                type="button"
                className="platform-icon-btn platform-topbar-profile-btn"
                onClick={() => navigate("/platform/profile")}
                title={headerDisplayName}
                aria-label={`${headerDisplayName} — Open My Profile`}
              >
                <span className="platform-topbar-avatar" aria-hidden="true">
                  {rawAvatarUrl && !avatarLoadFailed ? (
                    <img
                      src={rawAvatarUrl}
                      alt=""
                      className="platform-topbar-avatar-img"
                      onError={() => setAvatarLoadFailed(true)}
                    />
                  ) : (
                    <span className="platform-topbar-avatar-initials">
                      {userInitials}
                    </span>
                  )}
                </span>
                <span className="platform-topbar-profile-name">
                  {headerDisplayName}
                </span>
              </button>
            </div>
          </div>
        </header>

        <main className="platform-content">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
