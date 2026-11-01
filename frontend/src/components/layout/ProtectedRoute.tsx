import { Navigate, Outlet, useLocation } from "react-router-dom";
import { normalizeIndustry } from "../../utils/industryUtils";

export default function ProtectedRoute() {
  const token = sessionStorage.getItem("access_token") || localStorage.getItem("access_token");
  const location = useLocation();

  if (!token) {
    // Redirect to login if there is no token, saving the current location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Read authenticated user role safely (supports string or role object)
  const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
  let userRole = "";
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      const rawRole =
        typeof user.role === "string"
          ? user.role
          : user.role?.name || user.role_name || "";
      userRole = String(rawRole).trim().toUpperCase();
    } catch (e) {}
  }
  const isManager = userRole === "MANAGER" || userRole.includes("MANAGER");
  const isSales = userRole === "SALES_USER" || userRole === "SALES USER" || userRole.includes("SALES");
  const isOps = userRole === "OPERATIONS_USER" || userRole === "OPERATIONS USER" || userRole.includes("OPERATIONS");
  const isSupport = userRole === "SUPPORT_USER" || userRole === "SUPPORT USER" || userRole.includes("SUPPORT");
  const isAuditor = userRole === "READ_ONLY" || userRole === "AUDITOR" || userRole === "READ ONLY" || userRole === "READ-ONLY" || userRole === "READ-ONLY / AUDITOR" || userRole === "READ ONLY / AUDITOR" || userRole === "READ_ONLY / AUDITOR" || userRole.includes("AUDITOR");
  const isTenantAdmin = !isManager && !isSales && !isOps && !isSupport && !isAuditor;

  const getExpectedDashboard = (): string | null => {
    if (isManager) return "/manager/dashboard";
    if (isSales) return "/sales/dashboard";
    if (isOps) return "/operations/dashboard";
    if (isSupport) return "/support/dashboard";
    if (isAuditor) return "/auditor/dashboard";

    const tenantStr = sessionStorage.getItem("tenant") || localStorage.getItem("tenant");
    if (tenantStr) {
      try {
        const tenant = JSON.parse(tenantStr);
        if (tenant && tenant.industry) {
          const expectedSlug = normalizeIndustry(tenant.industry);
          return `/${expectedSlug}/dashboard`;
        }
      } catch (e) {}
    }

    const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user?.tenant?.industry) {
          const expectedSlug = normalizeIndustry(user.tenant.industry);
          return `/${expectedSlug}/dashboard`;
        }
        if (user?.industry) {
          const expectedSlug = normalizeIndustry(user.industry);
          return `/${expectedSlug}/dashboard`;
        }
      } catch (e) {}
    }

    return "/real-estate/dashboard";
  };

  const expectedDashboard = getExpectedDashboard();
  const path = location.pathname;

  // For role-based users, enforce role dashboard
  if (!isTenantAdmin && expectedDashboard) {
    if (path.endsWith("/dashboard") && path !== expectedDashboard) {
      return <Navigate to={expectedDashboard} replace />;
    }
    if (
      path.endsWith("/users") ||
      path.endsWith("/roles") ||
      path.endsWith("/permissions") ||
      path.endsWith("/settings")
    ) {
      return <Navigate to={expectedDashboard} replace />;
    }
  }

  // For tenant admin, enforce correct industry dashboard and routes
  if (isTenantAdmin && expectedDashboard) {
    if (path.endsWith("/dashboard") && path !== expectedDashboard) {
      return <Navigate to={expectedDashboard} replace />;
    }

    const segments = path.split("/").filter(Boolean);
    const urlFirstSegment = segments[0] || "";
    const expectedSlug = expectedDashboard.split("/")[1];

    const knownIndustries = [
      "real-estate",
      "software-company",
      "education-consulting",
      "training-institute",
      "digital-marketing-agency",
      "insurance-agency",
    ];

    if (knownIndustries.includes(urlFirstSegment) && urlFirstSegment !== expectedSlug) {
      return <Navigate to={expectedDashboard} replace />;
    }

    const softwareOnlyRoutes = [
      "software-requirements",
      "software-estimates",
      "software-contracts",
      "software-projects",
      "software-sprints",
    ];
    if (expectedSlug !== "software-company" && softwareOnlyRoutes.includes(urlFirstSegment)) {
      return <Navigate to={expectedDashboard} replace />;
    }
  }

  return <Outlet />;
}
