import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { getTenantDetails } from "../../services/dashboardService";
import { getMyProfile, UserProfile } from "../../services/profileService";
import { TenantDetails } from "../../types/dashboard";
import { normalizeIndustry, getIndustryDisplayName } from "../../utils/industryUtils";
import ProfileAvatar from "../common/ProfileAvatar";
import "./DashboardLayout.css";

interface DashboardLayoutProps {
  children: ReactNode;
}

type NavItem = {
  label: string;
  path: string;
  icon?: string;
  renderIcon?: () => ReactNode;
};

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { industry } = useParams();

  const tenantStr = sessionStorage.getItem("tenant");
  let tenantIndustry = "";

  if (tenantStr) {
    try {
      const tenantData = JSON.parse(tenantStr);

      if (tenantData?.industry) {
        tenantIndustry = normalizeIndustry(tenantData.industry);
      }
    } catch {
      // Ignore invalid tenant data.
    }
  }

  const currentIndustry = normalizeIndustry(industry || tenantIndustry || "real-estate");
  const basePath = `/${currentIndustry}`;

  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [user, setUser] = useState<{
    name: string;
    role: string;
  } | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.photo_url || null;
      }
    } catch {
      // Ignore
    }
    return null;
  });
  const [headerCacheBust, setHeaderCacheBust] = useState<number | string>(() => Date.now());

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        const profile = await getMyProfile();

        if (isMounted) {
          setProfilePhoto(profile.photo_url || null);

          try {
            const stored = sessionStorage.getItem("user");
            if (stored) {
              const parsed = JSON.parse(stored);
              parsed.photo_url = profile.photo_url || null;
              sessionStorage.setItem("user", JSON.stringify(parsed));
            }
          } catch {
            // Ignore
          }

          setUser((previousUser) => ({
            name:
              profile.full_name ||
              previousUser?.name ||
              "User",
            role:
              profile.role ||
              previousUser?.role ||
              "Tenant Admin",
          }));
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      }
    };

    loadProfile();

    const handleProfileUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<Partial<UserProfile> & { cacheBust?: number | string }>;
      if (customEvent.detail) {
        if (customEvent.detail.photo_url !== undefined) {
          setProfilePhoto(customEvent.detail.photo_url || null);
          if (customEvent.detail.cacheBust) {
            setHeaderCacheBust(customEvent.detail.cacheBust);
          } else {
            setHeaderCacheBust(Date.now());
          }
          try {
            const stored = sessionStorage.getItem("user");
            if (stored) {
              const parsed = JSON.parse(stored);
              parsed.photo_url = customEvent.detail.photo_url || null;
              sessionStorage.setItem("user", JSON.stringify(parsed));
            }
          } catch {
            // Ignore
          }
        }
        if (customEvent.detail.full_name || customEvent.detail.role) {
          setUser((previousUser) => ({
            name:
              customEvent.detail.full_name ||
              previousUser?.name ||
              "User",
            role:
              customEvent.detail.role ||
              previousUser?.role ||
              "Tenant Admin",
          }));
        }
      }
    };

    window.addEventListener(
      "user-profile-updated",
      handleProfileUpdate as EventListener
    );

    return () => {
      isMounted = false;
      window.removeEventListener(
        "user-profile-updated",
        handleProfileUpdate as EventListener
      );
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    getTenantDetails()
      .then((details) => {
        if (isMounted) {
          setTenant(details);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTenant(null);
        }
      });

    const storedUser = sessionStorage.getItem("user");

    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);

        const parsedRole =
          typeof parsed.role === "string"
            ? parsed.role
            : parsed.role?.name ||
              parsed.role_name ||
              "Tenant Admin";

        setUser({
          name:
            parsed.full_name ||
            parsed.first_name ||
            parsed.name ||
            "User",
          role: parsedRole,
        });
      } catch {
        setUser({
          name: "User",
          role: "Tenant Admin",
        });
      }
    } else {
      setUser({
        name: "User",
        role: "Tenant Admin",
      });
    }

    return () => {
      isMounted = false;
    };
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

  const hasPermission = (permission: string): boolean => {
    const userStr = sessionStorage.getItem("user");

    if (!userStr) {
      return false;
    }

    try {
      const storedUser = JSON.parse(userStr);
      let permissions: any[] = [];

      if (Array.isArray(storedUser.permissions)) {
        permissions = storedUser.permissions;
      } else if (
        storedUser.role &&
        Array.isArray(storedUser.role.permissions)
      ) {
        permissions = storedUser.role.permissions;
      } else if (Array.isArray(storedUser.role_permissions)) {
        permissions = storedUser.role_permissions;
      }

      return permissions.some((item) => {
        if (typeof item === "string") {
          return item.toLowerCase() === permission.toLowerCase();
        }

        if (
          item &&
          typeof item === "object" &&
          typeof item.name === "string"
        ) {
          return item.name.toLowerCase() === permission.toLowerCase();
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

    const activityIcon =
      "M22 12h-4l-3 9L9 3l-3 9H2";

    const reportIcon =
      "M18 20V10 M12 20V4 M6 20v-4";

    const pipelineIcon =
      "M3 3h7v7H3z M14 3h7v7h-7z M8.5 14h7v7h-7z M6.5 10v2h5.5v2 M17.5 10v2h-5v2";

    const roleIcon =
      "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z";

    const userIcon = peopleIcon;

    const workflowIcon =
      "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z M10 7h4 M7 10v4 M14 17h-4";

    const settingsIcon =
      "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 2 2 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0l.06.06a2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";

    const pipelineItem: NavItem = {
      label: "Pipelines",
      path: `${basePath}/pipelines`,
      icon: pipelineIcon,
    };

    const workflowItem: NavItem = {
      label: "Workflows",
      path: `${basePath}/workflows`,
      icon: workflowIcon,
    };

    if (currentIndustry === "training-institute") {
      return [
        {
          label: "Dashboard",
          path: `${basePath}/dashboard`,
          icon: dashboardIcon,
        },
        {
          label: "Inquiries & Leads",
          path: `${basePath}/leads`,
          icon: peopleIcon,
        },
        {
          label: "Courses",
          path: `${basePath}/courses`,
          icon: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
        },
        {
          label: "Batches",
          path: `${basePath}/batches`,
          icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
        },
        {
          label: "Students",
          path: `${basePath}/students`,
          icon: "M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z",
        },
        {
          label: "Trainers",
          path: `${basePath}/trainers`,
          icon: peopleIcon,
        },
        {
          label: "Demo Classes",
          path: `${basePath}/demo-classes`,
          icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
        },
        {
          label: "Reports",
          path: `${basePath}/reports`,
          icon: reportIcon,
        },
        {
          label: "Users",
          path: `${basePath}/users`,
          icon: userIcon,
        },
        {
          label: "Roles",
          path: `${basePath}/roles`,
          icon: roleIcon,
        },
        {
          label: "Permissions",
          path: `${basePath}/permissions`,
          icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
        },
        workflowItem,
        {
          label: "Settings",
          path: `${basePath}/settings`,
          icon: settingsIcon,
        },
      ];
    }

    if (currentIndustry === "insurance-agency") {
      return [
        {
          label: "Dashboard",
          path: `${basePath}/dashboard`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          ),
        },
        {
          label: "Clients",
          path: `${basePath}/clients`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          ),
        },
        {
          label: "Leads & Enquiries",
          path: `${basePath}/leads`,
          renderIcon: () => (
            <svg
              className="nav-icon"
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
          ),
        },
        {
          label: "Policies",
          path: `${basePath}/policies`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          ),
        },
        {
          label: "Quotes",
          path: `${basePath}/quotes`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          ),
        },
        {
          label: "Claims",
          path: `${basePath}/claims`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          ),
        },
        {
          label: "Renewals",
          path: `${basePath}/renewals`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          ),
        },
        {
          label: "Payments",
          path: `${basePath}/payments`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          ),
        },
        {
          label: "Agents",
          path: `${basePath}/agents`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ),
        },
        {
          label: "Tasks & Activities",
          path: `${basePath}/tasks`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          ),
        },
        {
          label: "Reports",
          path: `${basePath}/reports`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          ),
        },
        {
          label: "Users",
          path: `${basePath}/users`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          ),
        },
        {
          label: "Roles",
          path: `${basePath}/roles`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          ),
        },
        {
          label: "Permissions",
          path: `${basePath}/permissions`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ),
        },
        {
          label: "Settings",
          path: `${basePath}/settings`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 2 2 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          ),
        },
      ];
    }

    if (currentIndustry === "digital-marketing-agency") {
      return [
        {
          label: "Dashboard",
          path: `${basePath}/dashboard`,
          icon: dashboardIcon,
        },
        {
          label: "Clients",
          path: `${basePath}/clients`,
          icon: accountIcon,
        },
        {
          label: "Leads",
          path: `${basePath}/leads`,
          icon: peopleIcon,
        },
        {
          label: "Campaigns",
          path: `${basePath}/campaigns`,
          icon: reportIcon,
        },
        {
          label: "Services",
          path: `${basePath}/services`,
          icon: dealIcon,
        },
        {
          label: "Deals",
          path: `${basePath}/deals`,
          icon: dealIcon,
        },
        {
          label: "Activities",
          path: `${basePath}/activities`,
          icon: activityIcon,
        },
        {
          label: "Reports",
          path: `${basePath}/reports`,
          icon: reportIcon,
        },
        {
          label: "Users",
          path: `${basePath}/users`,
          icon: userIcon,
        },
        {
          label: "Roles",
          path: `${basePath}/roles`,
          icon: roleIcon,
        },
        {
          label: "Permissions",
          path: `${basePath}/permissions`,
          icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
        },
        workflowItem,
        {
          label: "Settings",
          path: `${basePath}/settings`,
          icon: settingsIcon,
        },
      ];
    }

    if (currentIndustry === "education-consulting") {
      return [
        {
          label: "Dashboard",
          path: `${basePath}/dashboard`,
          icon: dashboardIcon,
        },
        {
          label: "Leads",
          path: `${basePath}/leads`,
          icon: peopleIcon,
        },
        {
          label: "Students",
          path: `${basePath}/students`,
          icon: peopleIcon,
        },
        {
          label: "Applications",
          path: `${basePath}/applications`,
          icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
        },
        {
          label: "Universities",
          path: `${basePath}/universities`,
          icon: accountIcon,
        },
        {
          label: "Programs",
          path: `${basePath}/programs`,
          icon: dealIcon,
        },
        {
          label: "Counselors",
          path: `${basePath}/counselors`,
          icon: peopleIcon,
        },
        {
          label: "Consultations",
          path: `${basePath}/consultations`,
          icon: activityIcon,
        },
        {
          label: "Follow-ups",
          path: `${basePath}/follow-ups`,
          icon: activityIcon,
        },
        {
          label: "Tasks",
          path: `${basePath}/tasks`,
          icon: activityIcon,
        },
        {
          label: "Reports",
          path: `${basePath}/reports`,
          icon: reportIcon,
        },
        {
          label: "Settings",
          path: `${basePath}/settings`,
          icon: settingsIcon,
        },
      ];
    }

    if (currentIndustry === "software-company") {
      return [
        {
          label: "Dashboard",
          path: `${basePath}/dashboard`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          ),
        },
        {
          label: "Leads",
          path: `${basePath}/leads`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <circle cx="8" cy="10" r="2" />
              <line x1="14" y1="9" x2="18" y2="9" />
              <line x1="14" y1="13" x2="18" y2="13" />
              <path d="M5 17c0-1.5 1.5-2 3-2s3 .5 3 2" />
            </svg>
          ),
        },
        {
          label: "Clients",
          path: `${basePath}/clients`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ),
        },
        {
          label: "Contacts",
          path: `${basePath}/contacts`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          ),
        },
        {
          label: "Projects",
          path: `${basePath}/projects`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          ),
        },
        {
          label: "Tasks",
          path: `${basePath}/tasks`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          ),
        },
        {
          label: "Team Members",
          path: `${basePath}/team-members`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          ),
        },
        {
          label: "Time Tracking",
          path: `${basePath}/time-tracking`,
          renderIcon: () => (
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
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ),
        },
        {
          label: "Invoices",
          path: `${basePath}/invoices`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
          ),
        },
        {
          label: "Proposals",
          path: `${basePath}/proposals`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          ),
        },
        {
          label: "Contracts",
          path: `${basePath}/contracts`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M9 15l2 2 4-4" />
            </svg>
          ),
        },
        {
          label: "Support Tickets",
          path: `${basePath}/support-tickets`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <circle cx="6" cy="12" r="1.5" />
              <circle cx="18" cy="12" r="1.5" />
              <line x1="10" y1="10" x2="14" y2="10" />
              <line x1="10" y1="14" x2="14" y2="14" />
            </svg>
          ),
        },
        {
          label: "Reports",
          path: `${basePath}/reports`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          ),
        },
        {
          label: "Settings",
          path: `${basePath}/settings`,
          renderIcon: () => (
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 2 2 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0l.06.06a2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          ),
        },
      ];
    }

    if (isManager) {
      return [
        {
          label: "Dashboard",
          path: "/manager/dashboard",
          icon: dashboardIcon,
        },
        {
          label: "Leads",
          path: `${basePath}/leads`,
          icon: peopleIcon,
        },
        {
          label: "Contacts",
          path: `${basePath}/contacts`,
          icon: peopleIcon,
        },
        {
          label: "Accounts",
          path: `${basePath}/accounts`,
          icon: accountIcon,
        },
        {
          label: "Deals",
          path: `${basePath}/deals`,
          icon: dealIcon,
        },
        pipelineItem,
        {
          label: "Activities",
          path: `${basePath}/activities`,
          icon: activityIcon,
        },
        {
          label: "Reports",
          path: `${basePath}/reports`,
          icon: reportIcon,
        },
        workflowItem,
      ];
    }

    if (isSales) {
      const salesNav: NavItem[] = [
        {
          label: "Dashboard",
          path: "/sales/dashboard",
          icon: dashboardIcon,
        },
      ];

      if (hasPermission("lead.view")) {
        salesNav.push({
          label: "Leads",
          path: `${basePath}/leads`,
          icon: peopleIcon,
        });
      }

      if (hasPermission("contact.view")) {
        salesNav.push({
          label: "Contacts",
          path: `${basePath}/contacts`,
          icon: peopleIcon,
        });
      }

      if (hasPermission("account.view")) {
        salesNav.push({
          label: "Accounts",
          path: `${basePath}/accounts`,
          icon: accountIcon,
        });
      }

      if (hasPermission("deal.view")) {
        salesNav.push({
          label: "Deals",
          path: `${basePath}/deals`,
          icon: dealIcon,
        });
      }

      if (hasPermission("pipeline.view")) {
        salesNav.push(pipelineItem);
      }

      if (hasPermission("task.view")) {
        salesNav.push({
          label: "Tasks",
          path: `${basePath}/tasks`,
          icon: activityIcon,
        });
      }

      return salesNav;
    }

    if (isOps) {
      const opsNav: NavItem[] = [
        {
          label: "Dashboard",
          path: "/operations/dashboard",
          icon: dashboardIcon,
        },
      ];

      if (hasPermission("lead.view")) {
        opsNav.push({
          label: "Leads",
          path: `${basePath}/leads`,
          icon: peopleIcon,
        });
      }

      if (hasPermission("contact.view")) {
        opsNav.push({
          label: "Contacts",
          path: `${basePath}/contacts`,
          icon: peopleIcon,
        });
      }

      if (hasPermission("account.view")) {
        opsNav.push({
          label: "Accounts",
          path: `${basePath}/accounts`,
          icon: accountIcon,
        });
      }

      if (hasPermission("deal.view")) {
        opsNav.push({
          label: "Deals",
          path: `${basePath}/deals`,
          icon: dealIcon,
        });
      }

      if (hasPermission("pipeline.view")) {
        opsNav.push(pipelineItem);
      }

      if (hasPermission("task.view")) {
        opsNav.push({
          label: "Tasks",
          path: `${basePath}/tasks`,
          icon: activityIcon,
        });
      }

      return opsNav;
    }

    if (isSupport || isAuditor) {
      const customNav: NavItem[] = [
        {
          label: "Dashboard",
          path: isSupport
            ? "/support/dashboard"
            : "/auditor/dashboard",
          icon: dashboardIcon,
        },
      ];

      if (hasPermission("lead.view")) {
        customNav.push({
          label: "Leads",
          path: `${basePath}/leads`,
          icon: peopleIcon,
        });
      }

      if (hasPermission("contact.view")) {
        customNav.push({
          label: "Contacts",
          path: `${basePath}/contacts`,
          icon: peopleIcon,
        });
      }

      if (hasPermission("account.view")) {
        customNav.push({
          label: "Accounts",
          path: `${basePath}/accounts`,
          icon: accountIcon,
        });
      }

      if (hasPermission("deal.view")) {
        customNav.push({
          label: "Deals",
          path: `${basePath}/deals`,
          icon: dealIcon,
        });
      }

      if (hasPermission("pipeline.view")) {
        customNav.push(pipelineItem);
      }

      if (hasPermission("task.view")) {
        customNav.push({
          label: "Tasks",
          path: `${basePath}/tasks`,
          icon: activityIcon,
        });
      }

      if (hasPermission("activity.view")) {
        customNav.push({
          label: "Activities",
          path: `${basePath}/activities`,
          icon: activityIcon,
        });
      }

      if (isSupport && hasPermission("property.view")) {
        customNav.push({
          label: "Properties",
          path: `${basePath}/properties`,
          icon: accountIcon,
        });
      }

      if (hasPermission("user.view")) {
        customNav.push({
          label: "Users",
          path: `${basePath}/users`,
          icon: userIcon,
        });
      }

      if (hasPermission("role.view")) {
        customNav.push({
          label: "Roles",
          path: `${basePath}/roles`,
          icon: roleIcon,
        });
      }

      if (hasPermission("permission.view")) {
        customNav.push({
          label: "Permissions",
          path: `${basePath}/permissions`,
          icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
        });
      }

      if (hasPermission("report.view")) {
        customNav.push({
          label: "Reports",
          path: `${basePath}/reports`,
          icon: reportIcon,
        });
      }

      if (isSupport && hasPermission("settings")) {
        customNav.push({
          label: "Settings",
          path: `${basePath}/settings`,
          icon: settingsIcon,
        });
      }

      return customNav;
    }

    return [
      {
        label: "Dashboard",
        path: `${basePath}/dashboard`,
        icon: dashboardIcon,
      },
      {
        label: "Leads",
        path: `${basePath}/leads`,
        icon: peopleIcon,
      },
      {
        label: "Contacts",
        path: `${basePath}/contacts`,
        icon: peopleIcon,
      },
      {
        label: "Accounts",
        path: `${basePath}/accounts`,
        icon: accountIcon,
      },
      {
        label: "Deals",
        path: `${basePath}/deals`,
        icon: dealIcon,
      },
      pipelineItem,
      {
        label: "Activities",
        path: `${basePath}/activities`,
        icon: activityIcon,
      },
      {
        label: "Reports",
        path: `${basePath}/reports`,
        icon: reportIcon,
      },
      {
        label: "Users",
        path: `${basePath}/users`,
        icon: userIcon,
      },
      {
        label: "Roles",
        path: `${basePath}/roles`,
        icon: roleIcon,
      },
      {
        label: "Permissions",
        path: `${basePath}/permissions`,
        icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
      },
      {
        label: "Settings",
        path: `${basePath}/settings`,
        icon: settingsIcon,
      },
      {
        label: "Form Builder",
        path: `${basePath}/form-builder`,
        icon: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
      },
      workflowItem,
    ];
  };

  const navItems = getNavItems();

  const isActiveNavItem = (path: string): boolean => {
    if (path === "/") {
      return location.pathname === "/";
    }

    if (
      path.endsWith("/clients") &&
      (location.pathname.endsWith("/accounts") ||
        location.pathname.endsWith("/clients"))
    ) {
      return true;
    }

    if (
      path.endsWith("/agents") &&
      (location.pathname.endsWith("/users") ||
        location.pathname.endsWith("/agents"))
    ) {
      return true;
    }

    if (
      path.endsWith("/team-members") &&
      (location.pathname.endsWith("/users") ||
        location.pathname.endsWith("/team") ||
        location.pathname.endsWith("/team-members"))
    ) {
      return true;
    }

    return (
      location.pathname === path ||
      location.pathname.startsWith(`${path}/`)
    );
  };

  return (
    <div className={`dashboard-wrapper ${theme} industry-${currentIndustry}`}>
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`dashboard-sidebar ${isSidebarOpen ? "open" : ""} ${
          currentIndustry === "software-company" ? "software-company-sidebar" : ""
        } ${
          currentIndustry === "insurance-agency" ? "insurance-agency-sidebar" : ""
        }`}
      >
        <div className="sidebar-brand">
          {currentIndustry === "software-company" ? (
            <div
              className="brand-logo-text software-company-brand-header"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div
                className="scuil-logo-ring"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
                  <defs>
                    <linearGradient id="scuilOrbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="45%" stopColor="#6366f1" />
                      <stop offset="80%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="20"
                    cy="20"
                    r="15"
                    stroke="url(#scuilOrbGrad)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray="68 25"
                  />
                  <circle cx="20" cy="20" r="6" fill="#ffffff" />
                </svg>
              </div>

              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.2rem",
                    fontWeight: 700,
                    color: "#ffffff",
                    lineHeight: 1.15,
                    letterSpacing: "-0.01em",
                  }}
                >
                  SCuilONE
                </h2>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "#94a3b8",
                    fontWeight: 500,
                    marginTop: "2px",
                  }}
                >
                  Software Company
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className="brand-logo-text"
                style={{
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {currentIndustry === "insurance-agency" && (
                  <svg
                    className="brand-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      marginRight: "8px",
                      width: "24px",
                      height: "24px",
                      flexShrink: 0,
                    }}
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                )}
                {currentIndustry === "education-consulting" && (
                  <svg
                    className="brand-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      marginRight: "8px",
                      width: "24px",
                      height: "24px",
                      flexShrink: 0,
                    }}
                  >
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                    <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </svg>
                )}
                {currentIndustry === "training-institute" && (
                  <svg
                    className="brand-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      marginRight: "8px",
                      width: "24px",
                      height: "24px",
                      flexShrink: 0,
                    }}
                  >
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                )}
                {currentIndustry === "digital-marketing-agency" && (
                  <svg
                    className="brand-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      marginRight: "8px",
                      width: "24px",
                      height: "24px",
                      flexShrink: 0,
                    }}
                  >
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
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
                  paddingLeft:
                    currentIndustry !== "real-estate" ? "32px" : "0",
                }}
              >
                {getIndustryDisplayName(currentIndustry)}
              </div>
            </>
          )}
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${
                isActiveNavItem(item.path) ? "active" : ""
              }`}
              onClick={() => setIsSidebarOpen(false)}
            >
              {item.renderIcon ? (
                item.renderIcon()
              ) : (
                <svg
                  className="nav-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon || ""} />
                </svg>
              )}

              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <Link
            to="/help"
            className="nav-item"
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
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help
          </Link>

          <button
            className="nav-item logout-btn"
            onClick={handleLogout}
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
                {tenant && tenant.name
                  ? tenant.name
                  : getIndustryDisplayName(currentIndustry)}
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
                <line
                  x1="21"
                  y1="21"
                  x2="16.65"
                  y2="16.65"
                />
              </svg>

              <input
                type="text"
                placeholder={
                  currentIndustry === "education-consulting"
                    ? "Search leads, students, universities, programs..."
                    : currentIndustry === "training-institute"
                      ? "Search courses, batches, trainees, inquiries..."
                      : currentIndustry === "digital-marketing-agency"
                        ? "Search clients, campaigns, leads, services..."
                        : currentIndustry === "software-company"
                          ? "Search clients, projects, deals, tasks..."
                          : currentIndustry === "insurance-agency"
                            ? "Search clients, policies, claims, renewals..."
                            : "Search..."
                }
                style={
                  currentIndustry !== "real-estate" && currentIndustry !== "insurance-agency"
                    ? { width: "300px" }
                    : {}
                }
              />
            </div>
          </div>

          <div className="header-right">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
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

            <button
              className="notification-btn"
              aria-label="Notifications"
            >
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
              {currentIndustry === "insurance-agency" && (
                <span className="notification-badge-ia">3</span>
              )}
            </button>

            <button
              type="button"
              className="user-profile"
              onClick={() => navigate(`${basePath}/profile`)}
              aria-label="Open My Profile"
              title="My Profile"
            >
              <ProfileAvatar
                photoUrl={profilePhoto}
                name={user?.name}
                size={38}
                className="header-avatar"
                cacheBust={headerCacheBust}
              />

              <div className="user-info">
                <span className="user-name">
                  {user?.name || "User"}
                </span>

                <span className="user-role">
                  {user?.role || "Tenant Admin"}
                </span>
              </div>
            </button>
          </div>
        </header>

        <div className="dashboard-content">{children}</div>
      </main>
    </div>
  );
}
