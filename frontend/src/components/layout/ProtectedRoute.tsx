import { Navigate, Outlet, useLocation } from "react-router-dom";

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

  const getExpectedDashboard = () => {
    if (isManager) return "/manager/dashboard";
    if (isSales) return "/sales/dashboard";
    if (isOps) return "/operations/dashboard";
    if (isSupport) return "/support/dashboard";
    if (isAuditor) return "/auditor/dashboard";
    
    const tenantStr = sessionStorage.getItem("tenant");
    let expectedSlug = "real-estate";
    if (tenantStr) {
      try {
        const tenant = JSON.parse(tenantStr);
        if (tenant && tenant.industry) {
          expectedSlug = tenant.industry.toLowerCase().replace(/\s+/g, "-");
        }
      } catch (e) {}
    }
    return `/${expectedSlug}/dashboard`;
  };

  const expectedDashboard = getExpectedDashboard();

  // Prevent accessing dashboards they shouldn't
  const path = location.pathname;
  if (path.endsWith("/dashboard") && path !== expectedDashboard) {
     return <Navigate to={expectedDashboard} replace />;
  }

  // Prevent restricted users from accessing Tenant Admin routes (users, roles, permissions, settings)
  const isTenantAdmin = !isManager && !isSales && !isOps && !isSupport && !isAuditor;

  if (!isTenantAdmin) {
    if (
      path.endsWith("/users") ||
      path.endsWith("/roles") ||
      path.endsWith("/permissions") ||
      path.endsWith("/settings")
    ) {
      return <Navigate to={expectedDashboard} replace />;
    }
  }

  // Enforce industry matching for tenant admins
  if (isTenantAdmin) {
    const urlIndustry = path.split("/")[1];
    const expectedSlug = expectedDashboard.split("/")[1];
    
    if (urlIndustry && urlIndustry !== expectedSlug && urlIndustry !== "empty") {
      return <Navigate to={expectedDashboard} replace />;
    }
  }

  return <Outlet />;
}
