import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import AuthErrorState from "../common/AuthErrorState";
import {
  getSynchronouslyValidCachedSession,
  isAuthStorageModifiedSinceVerification,
  verifyExistingSession,
  type VerifiedAuthSession,
} from "../../services/authSession";
import { getPlatformAccessToken } from "../../services/platformApiClient";
import {
  CRM_ADMIN_ONLY_SUFFIXES,
  CRM_GLOBAL_ROUTES,
  CRM_NAKED_MODULE_ROOTS,
  isKnownIndustrySegment,
} from "../../utils/authRouting";

export const VerifiedAuthContext = createContext<VerifiedAuthSession | null>(
  null
);

export function useVerifiedAuth(): VerifiedAuthSession | null {
  return useContext(VerifiedAuthContext);
}

type RouteVerifyState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "authenticated"; session: VerifiedAuthSession };

const SOFTWARE_ONLY_SEGMENTS = new Set<string>([
  "software-requirements",
  "software-estimates",
  "software-contracts",
  "software-projects",
  "software-sprints",
  "software-time-tracking",
  "software-delivery-reports",
  "software-invoices",
]);

function hasAnyToken(): boolean {
  return Boolean(
    sessionStorage.getItem("access_token") ||
      localStorage.getItem("access_token") ||
      getPlatformAccessToken()
  );
}

function getInitialRouteState(): RouteVerifyState {
  if (!hasAnyToken()) {
    return { status: "unauthenticated" };
  }
  const cached = getSynchronouslyValidCachedSession();
  if (cached) {
    return { status: "authenticated", session: cached };
  }
  return { status: "loading" };
}

export default function ProtectedRoute() {
  const location = useLocation();
  const [state, setState] = useState<RouteVerifyState>(getInitialRouteState);

  const syncVerification = useCallback(async (force = false) => {
    if (!hasAnyToken()) {
      setState({ status: "unauthenticated" });
      return;
    }

    const storageModified = isAuthStorageModifiedSinceVerification();
    if (force || storageModified) {
      setState((prev) =>
        prev.status === "authenticated" && !storageModified
          ? prev
          : { status: "loading" }
      );
    }

    const result = await verifyExistingSession({
      force: force || storageModified,
    });

    if (result.status === "authenticated") {
      setState({ status: "authenticated", session: result.session });
    } else if (result.status === "unauthenticated") {
      setState({ status: "unauthenticated" });
    } else {
      setState({ status: "error", message: result.message });
    }
  }, []);

  useEffect(() => {
    void syncVerification(false);
  }, [location.pathname, syncVerification]);

  useEffect(() => {
    const handleStorageOrFocus = () => {
      if (!hasAnyToken()) {
        setState({ status: "unauthenticated" });
        return;
      }
      if (isAuthStorageModifiedSinceVerification()) {
        void syncVerification(true);
      }
    };

    window.addEventListener("storage", handleStorageOrFocus);
    window.addEventListener("focus", handleStorageOrFocus);
    return () => {
      window.removeEventListener("storage", handleStorageOrFocus);
      window.removeEventListener("focus", handleStorageOrFocus);
    };
  }, [syncVerification]);

  if (!hasAnyToken() || state.status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const storageTamperedNow = isAuthStorageModifiedSinceVerification();
  if (state.status === "loading" || (storageTamperedNow && state.status === "authenticated")) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary, #0b1120)",
          color: "var(--text-primary, #f8fafc)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ textAlign: "center", fontSize: "14px", opacity: 0.85 }}>
          Verifying workspace session...
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <AuthErrorState
        title="Access Denied"
        message={state.message}
        loginPath="/login"
        primaryActionLabel="Retry Verification"
        onPrimaryAction={() => void syncVerification(true)}
      />
    );
  }

  const { session } = state;

  // Never allow Platform staff/admin accounts into Customer Tenant CRM routes
  if (session.kind === "platform") {
    return <Navigate to={session.destination} replace />;
  }

  const path = location.pathname;
  const segments = path.split("/").filter(Boolean);
  const urlFirstSegment = segments[0] || "";

  // Enforce role-specific dashboards for all CRM roles
  if (
    (path === "/dashboard" || path.endsWith("/dashboard")) &&
    path !== session.destination
  ) {
    return <Navigate to={session.destination} replace />;
  }

  // Non-admin CRM roles cannot access admin-only administration routes
  if (session.crmRole !== "TENANT_ADMIN") {
    const isAdminOnlyRoute = CRM_ADMIN_ONLY_SUFFIXES.some(
      (suffix) => path === suffix || path.endsWith(suffix)
    );
    if (isAdminOnlyRoute) {
      return <Navigate to={session.destination} replace />;
    }
  }

  // Enforce industry boundary for industry-prefixed routes and reject unknown industry slugs
  if (
    !CRM_GLOBAL_ROUTES.has(path) &&
    urlFirstSegment &&
    !CRM_NAKED_MODULE_ROOTS.has(urlFirstSegment)
  ) {
    if (session.industrySlug) {
      if (urlFirstSegment !== session.industrySlug) {
        return <Navigate to={session.destination} replace />;
      }
    } else if (!isKnownIndustrySegment(urlFirstSegment)) {
      return <Navigate to={session.destination} replace />;
    }
  }

  // Block software-company-only module routes for non-software industries
  if (session.industrySlug !== "software-company") {
    const checkSeg = segments[1] || urlFirstSegment;
    if (
      SOFTWARE_ONLY_SEGMENTS.has(urlFirstSegment) ||
      SOFTWARE_ONLY_SEGMENTS.has(checkSeg)
    ) {
      return <Navigate to={session.destination} replace />;
    }
  }

  return (
    <VerifiedAuthContext.Provider value={session}>
      <Outlet />
    </VerifiedAuthContext.Provider>
  );
}
