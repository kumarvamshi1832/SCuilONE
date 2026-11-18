import { PLATFORM_ROLE_KEY, getStoredPlatformUser } from "../services/platformApiClient";
import { getSynchronouslyValidCachedSession } from "../services/authSession";
import { normalizeRoleKey } from "./authRouting";

/**
 * Role of the signed-in platform employee. Prefers the server-verified session (the same one
 * PlatformProtectedRoute relies on) and only falls back to the stored platform profile.
 */
export function getCurrentPlatformRole(): string {
  const cached = getSynchronouslyValidCachedSession();
  if (cached && cached.kind === "platform" && cached.role) {
    return cached.role;
  }
  const stored = getStoredPlatformUser<{ role?: unknown }>();
  if (stored && typeof stored.role === "string" && stored.role) {
    return stored.role;
  }
  try {
    return (
      sessionStorage.getItem(PLATFORM_ROLE_KEY) ||
      localStorage.getItem(PLATFORM_ROLE_KEY) ||
      ""
    );
  } catch {
    return "";
  }
}

/** True only for the "Platform Manager" role (PLATFORM_MANAGER). Never inferred from name/email. */
export function isPlatformManager(role: string = getCurrentPlatformRole()): boolean {
  return normalizeRoleKey(role) === "PLATFORM_MANAGER";
}
