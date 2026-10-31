import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getPortalAccessToken } from "../../services/customerPortalAuthService";

export default function CustomerPortalProtectedRoute() {
  const token = getPortalAccessToken();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

