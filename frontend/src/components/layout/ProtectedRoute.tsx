import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function ProtectedRoute() {
  const token = sessionStorage.getItem("access_token");
  const location = useLocation();

  if (!token) {
    // Redirect to login if there is no token, saving the current location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
