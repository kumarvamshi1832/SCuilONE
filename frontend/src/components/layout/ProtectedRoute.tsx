import { Navigate, Outlet, useLocation } from "react-router-dom";
import { normalizeIndustry } from "../../utils/industryUtils";

export default function ProtectedRoute() {
  const token = sessionStorage.getItem("access_token");
  const location = useLocation();

  if (!token) {
    // Redirect to login if there is no token, saving the current location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Read authenticated user role
  const userStr = sessionStorage.getItem("user");
  let userRole = "";
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      userRole = (user.role || "").toUpperCase();
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

    const tenantStr = sessionStorage.getItem("tenant");
    if (tenantStr) {
      try {
        const tenant = JSON.parse(tenantStr);
        if (tenant && tenant.industry) {
          const expectedSlug = normalizeIndustry(tenant.industry);
          return `/${expectedSlug}/dashboard`;
        }
      } catch (e) {}
    }

    // Do NOT default to real-estate if tenant/industry data is not yet available
    return null;
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

  // For tenant admin, if tenant industry is known, enforce correct industry dashboard and routes
  if (isTenantAdmin && expectedDashboard) {
    if (path.endsWith("/dashboard") && path !== expectedDashboard) {
      return <Navigate to={expectedDashboard} replace />;
    }

    const urlIndustry = path.split("/")[1];
    const expectedSlug = expectedDashboard.split("/")[1];
    if (urlIndustry && urlIndustry !== expectedSlug && urlIndustry !== "empty") {
      return <Navigate to={expectedDashboard} replace />;
    }
  }

  return <Outlet />;
}
