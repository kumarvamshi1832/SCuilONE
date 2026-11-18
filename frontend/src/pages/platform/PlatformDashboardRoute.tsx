import PlatformDashboardPage from "./PlatformDashboardPage";
import PlatformManagerDashboardPage from "./PlatformManagerDashboardPage";
import { isPlatformManager } from "../../utils/platformManager";

/**
 * /platform/dashboard entry point. It only chooses which existing dashboard to render for the
 * already-verified platform session; authorization is still enforced by PlatformProtectedRoute
 * and by the API.
 */
export default function PlatformDashboardRoute() {
  return isPlatformManager() ? (
    <PlatformManagerDashboardPage />
  ) : (
    <PlatformDashboardPage />
  );
}
