import React, { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import AuthErrorState from "../common/AuthErrorState";
import {
  clearPlatformSession,
  getPlatformAccessToken,
} from "../../services/platformApiClient";
import {
  getSynchronouslyValidCachedSession,
  isAuthStorageModifiedSinceVerification,
  verifyExistingSession,
  type VerifiedAuthSession,
} from "../../services/authSession";

interface PlatformProtectedRouteProps {
  requiredPermissions?: string[];
  children?: React.ReactNode;
}

type PlatformSession = Extract<VerifiedAuthSession, { kind: "platform" }>;

type PlatformRouteState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "authenticated"; session: PlatformSession };

function getInitialPlatformState(): PlatformRouteState {
  const token = getPlatformAccessToken();
  if (!token) {
    return { status: "unauthenticated" };
  }
  const cached = getSynchronouslyValidCachedSession();
  if (cached && cached.kind === "platform") {
    return { status: "authenticated", session: cached };
  }
  return { status: "loading" };
}

export default function PlatformProtectedRoute({
  requiredPermissions,
  children,
}: PlatformProtectedRouteProps) {
  const location = useLocation();
  const [state, setState] = useState<PlatformRouteState>(
    getInitialPlatformState
  );

  const syncPlatformVerification = useCallback(async (force = false) => {
    const token = getPlatformAccessToken();
    if (!token) {
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
      if (result.session.kind === "platform") {
        setState({ status: "authenticated", session: result.session });
        return;
      }
      clearPlatformSession();
      setState({ status: "unauthenticated" });
      return;
    }

    if (result.status === "unauthenticated") {
      clearPlatformSession();
      setState({ status: "unauthenticated" });
      return;
    }

    setState({
      status: "error",
      message: result.message,
    });
  }, []);

  useEffect(() => {
    void syncPlatformVerification(false);
  }, [location.pathname, syncPlatformVerification]);

  useEffect(() => {
    const handleStorageOrFocus = () => {
      if (!getPlatformAccessToken()) {
        setState({ status: "unauthenticated" });
        return;
      }
      if (isAuthStorageModifiedSinceVerification()) {
        void syncPlatformVerification(true);
      }
    };

    window.addEventListener("storage", handleStorageOrFocus);
    window.addEventListener("focus", handleStorageOrFocus);
    return () => {
      window.removeEventListener("storage", handleStorageOrFocus);
      window.removeEventListener("focus", handleStorageOrFocus);
    };
  }, [syncPlatformVerification]);

  if (!getPlatformAccessToken() || state.status === "unauthenticated") {
    return (
      <Navigate to="/platform/login" state={{ from: location }} replace />
    );
  }

  const storageTamperedNow = isAuthStorageModifiedSinceVerification();
  if (
    state.status === "loading" ||
    (storageTamperedNow && state.status === "authenticated")
  ) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary, #f8fafc)",
          color: "var(--text-primary, #0f172a)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div className="platform-spinner" style={{ margin: "0 auto 12px" }} />
          <div>Verifying Platform session...</div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <AuthErrorState
        title="Platform Access Denied"
        message={state.message}
        loginPath="/platform/login"
        primaryActionLabel="Retry Verification"
        onPrimaryAction={() => void syncPlatformVerification(true)}
      />
    );
  }

  const { session } = state;

  if (
    session.mustChangePassword &&
    location.pathname !== "/platform/change-password"
  ) {
    return <Navigate to="/platform/change-password" replace />;
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasPerm =
      session.permissions.includes("*") ||
      requiredPermissions.some((perm) => session.permissions.includes(perm));
    if (!hasPerm) {
      return (
        <div className="platform-access-denied">
          <h2>Access Restricted</h2>
          <p>
            Your current platform role ({session.role || "Employee"}) does not
            have permission to view this module.
          </p>
        </div>
      );
    }
  }

  return children ? <>{children}</> : <Outlet />;
}
