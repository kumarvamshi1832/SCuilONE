
import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { getTenantDetails } from "../../services/dashboardService";
import { getMyProfile } from "../../services/profileService";
import { TenantDetails } from "../../types/dashboard";
import "./DashboardLayout.css";

interface DashboardLayoutProps {
  children: ReactNode;
}

type NavItem = {
  label: string;
  path: string;
  icon: string;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { industry } = useParams();

  const tenantStr = sessionStorage.getItem("tenant");
  let tenantIndustry = "real-estate";

  if (tenantStr) {
    try {
      const t = JSON.parse(tenantStr);
      if (t?.industry) {
        tenantIndustry = t.industry.toLowerCase().replace(/\s+/g, "-");
      }
    } catch {
      // Ignore invalid tenant data.
    }
  }

  const currentIndustry = industry || tenantIndustry;
  const basePath = `/${currentIndustry}`;

  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // Load the profile photo from the backend.
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        const profile = await getMyProfile();

        if (isMounted) {
          setProfilePhoto(profile.photo_url || null);

          // Keep the header name synchronized with the profile.
          setUser((previousUser) => ({
            name: profile.full_name || previousUser?.name || "User",
            role: profile.role || previousUser?.role || "Tenant Admin",
          }));
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    getTenantDetails()
      .then(setTenant)
      .catch(() => setTenant(null));

    const storedUser = sessionStorage.getItem("user");

    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);

        const parsedRole =
          typeof parsed.role === "string"
            ? parsed.role
            : parsed.role?.name || parsed.role_name || "Tenant Admin";

        setUser({
          name:
            parsed.full_name ||
            parsed.first_name ||
            parsed.name ||
            "User",
          role: parsedRole,
        });
      } catch {
        setUser({ name: "User", role: "Tenant Admin" });
      }
    } else {
      setUser({ name: "User", role: "Tenant Admin" });
    }
  }, []);

  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/login");
  };

  const role = (user?.role || "").toUpperCase();
  const isManager = role.includes("MANAGER");
  const isSales =
    role === "SALES_USER" ||
    role === "SALES USER" ||
    role.includes("SALES");
  const isOps =
    role === "OPERATIONS_USER" ||
    role === "OPERATIONS USER" ||
    role.includes("OPERATIONS");
  const isSupport =
    role === "SUPPORT_USER" ||
    role === "SUPPORT USER" ||
    role.includes("SUPPORT");
  const isAuditor =
    role === "READ_ONLY" ||
    role === "AUDITOR" ||
    role === "READ ONLY" ||
    role === "READ-ONLY" ||
    role === "READ-ONLY / AUDITOR" ||
    role === "READ ONLY / AUDITOR" ||
    role === "READ_ONLY / AUDITOR" ||
    role.includes("AUDITOR");

  const hasPermission = (perm: string) => {
    const userStr = sessionStorage.getItem("user");
    if (!userStr) return false;

    try {
      const u = JSON.parse(userStr);
      let perms: any[] = [];

      if (Array.isArray(u.permissions)) {
        perms = u.permissions;
      } else if (u.role && Array.isArray(u.role.permissions)) {
        perms = u.role.permissions;
      } else if (Array.isArray(u.role_permissions)) {
        perms = u.role_permissions;
      }

      return perms.some((p) => {
        if (typeof p === "string") {
          return p.toLowerCase() === perm.toLowerCase();
        }

        if (p && typeof p === "object" && p.name) {
          return p.name.toLowerCase() === perm.toLowerCase();
        }

        return false;
      });
    } catch {
      return false;
    }
  };

  const getNavItems = (): NavItem[] => {
    const dashboardIcon =
      "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
    const peopleIcon =
      "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z";
    const accountIcon =
      "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
    const dealIcon =
      "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6";
    const activityIcon = "M22 12h-4l-3 9L9 3l-3 9H2";
    const reportIcon = "M18 20V10 M12 20V4 M6 20v-4";
    const pipelineIcon =
      "M3 3h7v7H3z M14 3h7v7h-7z M8.5 14h7v7h-7z M6.5 10v2h5.5v2 M17.5 10v2h-5v2";
    const roleIcon =
      "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z";
    const userIcon = peopleIcon;
    const settingsIcon =
      "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";

    const pipelineItem: NavItem = {
      label: "Pipelines",
      path: `${basePath}/pipelines`,
      icon: pipelineIcon,
    };

    if (currentIndustry === "education-consulting") {
      return [
        { label: "Dashboard", path: `${basePath}/dashboard`, icon: dashboardIcon },
        { label: "Leads", path: `${basePath}/leads`, icon: peopleIcon },
        { label: "Students", path: `${basePath}/students`, icon: peopleIcon },
        { label: "Applications", path: `${basePath}/applications`, icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" },
        { label: "Universities", path: `${basePath}/universities`, icon: accountIcon },
        { label: "Programs", path: `${basePath}/programs`, icon: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
        { label: "Counselors", path: `${basePath}/counselors`, icon: peopleIcon },
        { label: "Consultations", path: `${basePath}/consultations`, icon: activityIcon },
        { label: "Follow-ups", path: `${basePath}/follow-ups`, icon: activityIcon },
        { label: "Tasks", path: `${basePath}/tasks`, icon: activityIcon },
        { label: "Reports", path: `${basePath}/reports`, icon: reportIcon },
        { label: "Settings", path: `${basePath}/settings`, icon: settingsIcon },
      ];
    }

    if (isManager) {
      return [
        { label: "Dashboard", path: "/manager/dashboard", icon: dashboardIcon },
        { label: "Leads", path: `${basePath}/leads`, icon: peopleIcon },
        { label: "Contacts", path: `${basePath}/contacts`, icon: peopleIcon },
        { label: "Accounts", path: `${basePath}/accounts`, icon: accountIcon },
        { label: "Deals", path: `${basePath}/deals`, icon: dealIcon },
        pipelineItem,
        { label: "Activities", path: `${basePath}/activities`, icon: activityIcon },
        { label: "Reports", path: `${basePath}/reports`, icon: reportIcon },
      ];
    }

    if (isSales) {
      const salesNav: NavItem[] = [
        { label: "Dashboard", path: "/sales/dashboard", icon: dashboardIcon },
      ];

      if (hasPermission("lead.view")) salesNav.push({ label: "Leads", path: `${basePath}/leads`, icon: peopleIcon });
      if (hasPermission("contact.view")) salesNav.push({ label: "Contacts", path: `${basePath}/contacts`, icon: peopleIcon });
      if (hasPermission("account.view")) salesNav.push({ label: "Accounts", path: `${basePath}/accounts`, icon: accountIcon });
      if (hasPermission("deal.view")) salesNav.push({ label: "Deals", path: `${basePath}/deals`, icon: dealIcon });
      if (hasPermission("pipeline.view")) salesNav.push(pipelineItem);
      if (hasPermission("task.view")) salesNav.push({ label: "Tasks", path: `${basePath}/tasks`, icon: activityIcon });

      return salesNav;
    }

    if (isOps) {
      const opsNav: NavItem[] = [
        { label: "Dashboard", path: "/operations/dashboard", icon: dashboardIcon },
      ];

      if (hasPermission("lead.view")) opsNav.push({ label: "Leads", path: `${basePath}/leads`, icon: peopleIcon });
      if (hasPermission("contact.view")) opsNav.push({ label: "Contacts", path: `${basePath}/contacts`, icon: peopleIcon });
      if (hasPermission("account.view")) opsNav.push({ label: "Accounts", path: `${basePath}/accounts`, icon: accountIcon });
      if (hasPermission("deal.view")) opsNav.push({ label: "Deals", path: `${basePath}/deals`, icon: dealIcon });
      if (hasPermission("pipeline.view")) opsNav.push(pipelineItem);
      if (hasPermission("task.view")) opsNav.push({ label: "Tasks", path: `${basePath}/tasks`, icon: activityIcon });

      return opsNav;
    }

    if (isSupport || isAuditor) {
      const customNav: NavItem[] = [
        {
          label: "Dashboard",
          path: isSupport ? "/support/dashboard" : "/auditor/dashboard",
          icon: dashboardIcon,
        },
      ];

      if (hasPermission("lead.view")) customNav.push({ label: "Leads", path: `${basePath}/leads`, icon: peopleIcon });
      if (hasPermission("contact.view")) customNav.push({ label: "Contacts", path: `${basePath}/contacts`, icon: peopleIcon });
      if (hasPermission("account.view")) customNav.push({ label: "Accounts", path: `${basePath}/accounts`, icon: accountIcon });
      if (hasPermission("deal.view")) customNav.push({ label: "Deals", path: `${basePath}/deals`, icon: dealIcon });
      if (hasPermission("pipeline.view")) customNav.push(pipelineItem);
      if (hasPermission("task.view")) customNav.push({ label: "Tasks", path: `${basePath}/tasks`, icon: activityIcon });
      if (hasPermission("activity.view")) customNav.push({ label: "Activities", path: `${basePath}/activities`, icon: activityIcon });
      if (isSupport && hasPermission("property.view")) customNav.push({ label: "Properties", path: `${basePath}/properties`, icon: accountIcon });
      if (hasPermission("user.view")) customNav.push({ label: "Users", path: `${basePath}/users`, icon: userIcon });
      if (hasPermission("role.view")) customNav.push({ label: "Roles", path: `${basePath}/roles`, icon: roleIcon });
      if (hasPermission("permission.view")) {
        customNav.push({ label: "Permissions", path: `${basePath}/permissions`, icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" });
      }
      if (hasPermission("report.view")) customNav.push({ label: "Reports", path: `${basePath}/reports`, icon: reportIcon });
      if (isSupport && hasPermission("settings")) customNav.push({ label: "Settings", path: `${basePath}/settings`, icon: settingsIcon });

      return customNav;
    }

    return [
      { label: "Dashboard", path: `${basePath}/dashboard`, icon: dashboardIcon },
      { label: "Leads", path: `${basePath}/leads`, icon: peopleIcon },
      { label: "Contacts", path: `${basePath}/contacts`, icon: peopleIcon },
      { label: "Accounts", path: `${basePath}/accounts`, icon: accountIcon },
      { label: "Deals", path: `${basePath}/deals`, icon: dealIcon },
      pipelineItem,
      { label: "Activities", path: `${basePath}/activities`, icon: activityIcon },
      { label: "Reports", path: `${basePath}/reports`, icon: reportIcon },
      { label: "Users", path: `${basePath}/users`, icon: userIcon },
      { label: "Roles", path: `${basePath}/roles`, icon: roleIcon },
      {
        label: "Permissions",
        path: `${basePath}/permissions`,
        icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
      },
      { label: "Settings", path: `${basePath}/settings`, icon: settingsIcon },
      {
  label: "Form Builder",
  path: `${basePath}/form-builder`,
  icon: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
},
    ];
  };

  const navItems = getNavItems();

  return (
    <div className={`dashboard-wrapper ${theme}`}>
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`dashboard-sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-logo-text" style={{ display: "flex", alignItems: "center" }}>
            {currentIndustry === "education-consulting" && (
              <svg
                className="brand-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: "8px", width: "24px", height: "24px", flexShrink: 0 }}
              >
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            )}
            <h2 style={{ margin: 0 }}>
              <span className="text-blue">SCuilONE</span>
            </h2>
          </div>

          <div
            className="brand-subtitle"
            style={{
              fontSize: "0.75rem",
              color: "#a0aec0",
              marginTop: "4px",
              textAlign: "left",
              width: "100%",
              paddingLeft: currentIndustry === "education-consulting" ? "32px" : "0",
            }}
          >
            {currentIndustry === "education-consulting" ? "Education Consulting" : "CRM"}
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname.startsWith(item.path) ? "active" : ""}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <svg
                className="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <Link to="/help" className="nav-item">
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help
          </Link>

          <button className="nav-item logout-btn" onClick={handleLogout}>
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open Menu"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="tenant-selector">
              <span>
                {tenant
                  ? tenant.name
                  : currentIndustry === "education-consulting"
                    ? "Education Consulting"
                    : "Loading..."}
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            <div className="search-box">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder={
                  currentIndustry === "education-consulting"
                    ? "Search leads, students, universities, programs..."
                    : "Search..."
                }
                style={currentIndustry === "education-consulting" ? { width: "300px" } : {}}
              />
            </div>
          </div>

          <div className="header-right">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </button>

            <button className="notification-btn" aria-label="Notifications">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            <button
              type="button"
              className="user-profile"
              onClick={() => navigate(`${basePath}/profile`)}
              aria-label="Open My Profile"
              title="My Profile"
            >
              <div className="avatar">
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt="Profile"
                    className="header-profile-photo"
                    onError={() => setProfilePhoto(null)}
                  />
                ) : (
                  user?.name?.charAt(0).toUpperCase() || "U"
                )}
              </div>

              <div className="user-info">
                <span className="user-name">{user?.name || "User"}</span>
                <span className="user-role">{user?.role || "Tenant Admin"}</span>
              </div>
            </button>
          </div>
        </header>

        <div className="dashboard-content">{children}</div>
      </main>
    </div>
  );
}