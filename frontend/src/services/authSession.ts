import axios from "axios";
import type { TokenResponse } from "../types/auth";
import type { PlatformEmployee } from "../types/platform";
import type { SupportedIndustry } from "../utils/industryUtils";
import {
  clearCrmAuthStorage,
  extractRawRole,
  isPlatformIdentity,
  resolveCrmDashboardDestination,
  type CrmRoleCategory,
} from "../utils/authRouting";
import {
  fetchCurrentAuthUser,
  fetchTenantBillingProfile,
  logoutUserSession,
} from "./authService";
import {
  PLATFORM_ACCESS_TOKEN_KEY,
  PLATFORM_PERMISSIONS_KEY,
  PLATFORM_ROLE_KEY,
  PLATFORM_TENANT_KEY,
  PLATFORM_USER_KEY,
  clearPlatformSession,
  getPlatformAccessToken,
  getPlatformRefreshToken,
  savePlatformSession,
} from "./platformApiClient";
import { platformService } from "./platformService";

export interface TenantMetadata {
  id: string;
  name: string;
  industry?: string | null;
  is_platform?: boolean;
}

export type VerifiedAuthSession =
  | {
      kind: "platform";
      destination: string;
      role: string;
      mustChangePassword: boolean;
      employee: PlatformEmployee | null;
      permissions: string[];
      user: Record<string, unknown>;
      tenant: TenantMetadata | null;
    }
  | {
      kind: "crm";
      destination: string;
      role: string;
      crmRole: CrmRoleCategory;
      industryRaw: string | null;
      industrySlug: SupportedIndustry | null;
      tenant: TenantMetadata | null;
      user: Record<string, unknown>;
      tenantId: string | null;
      mustChangePassword: boolean;
    };

export type AuthFailureReason =
  | "MISSING_TOKEN"
  | "PLATFORM_VERIFICATION_FAILED"
  | "CRM_VERIFICATION_FAILED"
  | "MISSING_OR_INVALID_ROLE"
  | "INVALID_INDUSTRY"
  | "VERIFICATION_FAILED";

export type CompleteLoginResult =
  | { ok: true; session: VerifiedAuthSession }
  | { ok: false; reason: AuthFailureReason; message: string };

export type VerifySessionResult =
  | { status: "authenticated"; session: VerifiedAuthSession }
  | { status: "unauthenticated" }
  | { status: "error"; reason: AuthFailureReason; message: string };

interface CachedSessionState {
  session: VerifiedAuthSession;
  fingerprint: string;
  verifiedAt: number;
}

const SESSION_CACHE_TTL_MS = 15_000;
let cachedSession: CachedSessionState | null = null;
let inFlightVerify: Promise<VerifySessionResult> | null = null;

function readStoragePair(key: string): string {
  return `${sessionStorage.getItem(key) ?? ""}::${localStorage.getItem(key) ?? ""}`;
}

export function computeAuthStorageFingerprint(): string {
  const keys = [
    "access_token",
    "refresh_token",
    "user",
    "tenant",
    "tenant_id",
    PLATFORM_ACCESS_TOKEN_KEY,
    PLATFORM_ROLE_KEY,
    PLATFORM_USER_KEY,
    PLATFORM_TENANT_KEY,
    PLATFORM_PERMISSIONS_KEY,
  ];
  return keys.map((k) => `${k}=${readStoragePair(k)}`).join("|");
}

export function invalidateVerifiedSessionCache(): void {
  cachedSession = null;
}

export function isAuthStorageModifiedSinceVerification(): boolean {
  if (!cachedSession) {
    return true;
  }
  return computeAuthStorageFingerprint() !== cachedSession.fingerprint;
}

function cacheVerifiedSession(session: VerifiedAuthSession): void {
  cachedSession = {
    session,
    fingerprint: computeAuthStorageFingerprint(),
    verifiedAt: Date.now(),
  };
}

function getAxiosStatus(err: unknown): number | undefined {
  if (axios.isAxiosError(err)) {
    return err.response?.status;
  }
  return undefined;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    if (data) {
      if (typeof data.detail === "string" && data.detail.trim()) {
        return data.detail.trim();
      }
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message.trim();
      }
    }
  } else if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return fallback;
}

function getSafeStoredUserDisplayFields(): Record<string, unknown> {
  try {
    const raw =
      sessionStorage.getItem("user") || localStorage.getItem("user");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    const displayKeys = [
      "name",
      "full_name",
      "email",
      "photo_url",
      "phone",
      "designation",
      "department",
      "employee_id",
      "location",
    ];
    for (const key of displayKeys) {
      if (parsed[key] !== undefined) {
        safe[key] = parsed[key];
      }
    }
    return safe;
  } catch {
    return {};
  }
}

function getCrmAccessToken(): string | null {
  return (
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token")
  );
}

function getCrmRefreshToken(): string | null {
  return (
    sessionStorage.getItem("refresh_token") ||
    localStorage.getItem("refresh_token")
  );
}

function saveCrmSessionStorage(params: {
  accessToken: string;
  refreshToken?: string | null;
  user: Record<string, unknown>;
  tenant: TenantMetadata | null;
  tenantId: string | null;
}): void {
  clearPlatformSession();

  const useLocal = Boolean(localStorage.getItem("access_token"));
  const targetStorage = useLocal ? localStorage : sessionStorage;
  const alternateStorage = useLocal ? sessionStorage : localStorage;

  const crmKeys = [
    "access_token",
    "refresh_token",
    "user",
    "tenant",
    "tenant_id",
  ];
  crmKeys.forEach((k) => alternateStorage.removeItem(k));

  const transientMfaKeys = [
    "mfa_email",
    "mfa_temp_token",
    "mfa_token",
    "mfa_setup_required",
    "otp_flow",
  ];
  transientMfaKeys.forEach((k) => {
    sessionStorage.removeItem(k);
    localStorage.removeItem(k);
  });

  targetStorage.setItem("access_token", params.accessToken);
  if (params.refreshToken) {
    targetStorage.setItem("refresh_token", params.refreshToken);
  }
  targetStorage.setItem("user", JSON.stringify(params.user));
  if (params.tenant) {
    targetStorage.setItem("tenant", JSON.stringify(params.tenant));
  } else {
    targetStorage.removeItem("tenant");
  }
  if (params.tenantId) {
    targetStorage.setItem("tenant_id", params.tenantId);
  } else {
    targetStorage.removeItem("tenant_id");
  }
}

async function resolvePlatformSession(params: {
  accessToken?: string;
  refreshToken?: string | null;
  meUser?: Record<string, unknown>;
  fallbackRole?: string | null;
  fallbackTenant?: TenantMetadata | null;
  fallbackPermissions?: string[];
  fallbackMustChangePassword?: boolean;
  useExplicitToken: boolean;
}): Promise<
  | { ok: true; session: VerifiedAuthSession }
  | { ok: false; status?: number; reason: AuthFailureReason; message: string }
> {
  try {
    const platformMe =
      params.useExplicitToken && params.accessToken
        ? await platformService.getMeWithToken(params.accessToken)
        : await platformService.getMe();

    const employee = platformMe.employee;
    const verifiedRole =
      extractRawRole(employee) || (params.fallbackRole ?? "").trim();

    if (!verifiedRole) {
      return {
        ok: false,
        reason: "MISSING_OR_INVALID_ROLE",
        message:
          "Your platform account does not have a valid assigned role. Please contact a Platform Super Admin.",
      };
    }

    const mustChangePassword = Boolean(
      employee?.must_change_password ?? params.fallbackMustChangePassword
    );
    const permissions = Array.isArray(platformMe.permissions)
      ? platformMe.permissions
      : params.fallbackPermissions ?? [];

    const mergedUser: Record<string, unknown> = {
      ...(params.meUser ?? {}),
      ...(employee ?? {}),
      role: verifiedRole,
    };

    const platformTenant: TenantMetadata = params.fallbackTenant ?? {
      id: String(mergedUser.tenant_id || ""),
      name: "SCuilONE Platform",
      industry: "Platform Operations",
      is_platform: true,
    };

    const preservedRefreshToken =
      params.refreshToken ||
      getPlatformRefreshToken() ||
      getCrmRefreshToken() ||
      undefined;

    const preservedAccessToken =
      params.accessToken || getPlatformAccessToken() || undefined;

    savePlatformSession({
      access_token: preservedAccessToken,
      refresh_token: preservedRefreshToken,
      employee,
      user: mergedUser,
      role: verifiedRole,
      permissions,
      dashboard: platformMe.dashboard,
      sidebar_modules: platformMe.sidebar_modules,
      tenant: platformTenant,
    });

    const destination = mustChangePassword
      ? "/platform/change-password"
      : "/platform/dashboard";

    const session: VerifiedAuthSession = {
      kind: "platform",
      destination,
      role: verifiedRole,
      mustChangePassword,
      employee,
      permissions,
      user: mergedUser,
      tenant: platformTenant,
    };
    cacheVerifiedSession(session);
    return { ok: true, session };
  } catch (err) {
    const status = getAxiosStatus(err);
    const verifiedFallbackRole = (params.fallbackRole ?? "").trim();

    if (
      status === 403 &&
      params.fallbackMustChangePassword &&
      verifiedFallbackRole
    ) {
      const mergedUser: Record<string, unknown> = {
        ...(params.meUser ?? {}),
        role: verifiedFallbackRole,
        must_change_password: true,
      };
      const platformTenant: TenantMetadata = params.fallbackTenant ?? {
        id: String(mergedUser.tenant_id || ""),
        name: "SCuilONE Platform",
        industry: "Platform Operations",
        is_platform: true,
      };

      const preservedRefreshToken =
        params.refreshToken ||
        getPlatformRefreshToken() ||
        getCrmRefreshToken() ||
        undefined;
      const preservedAccessToken =
        params.accessToken || getPlatformAccessToken() || undefined;

      savePlatformSession({
        access_token: preservedAccessToken,
        refresh_token: preservedRefreshToken,
        user: mergedUser,
        role: verifiedFallbackRole,
        permissions: params.fallbackPermissions ?? [],
        tenant: platformTenant,
      });

      const session: VerifiedAuthSession = {
        kind: "platform",
        destination: "/platform/change-password",
        role: verifiedFallbackRole,
        mustChangePassword: true,
        employee: null,
        permissions: params.fallbackPermissions ?? [],
        user: mergedUser,
        tenant: platformTenant,
      };
      cacheVerifiedSession(session);
      return { ok: true, session };
    }

    return {
      ok: false,
      status,
      reason: "PLATFORM_VERIFICATION_FAILED",
      message: extractErrorMessage(
        err,
        "Unable to verify Platform portal authorization with the server."
      ),
    };
  }
}

export async function completeAuthenticatedLogin(
  response: TokenResponse
): Promise<CompleteLoginResult> {
  const accessToken = response.access_token;
  if (!accessToken) {
    return {
      ok: false,
      reason: "MISSING_TOKEN",
      message: "Authentication did not issue a valid session token.",
    };
  }

  let meUser: Record<string, unknown>;
  try {
    const meRes = await fetchCurrentAuthUser(accessToken);
    if (!meRes.user || typeof meRes.user !== "object") {
      return {
        ok: false,
        reason: "VERIFICATION_FAILED",
        message: "Server did not return authenticated user details.",
      };
    }
    meUser = meRes.user as Record<string, unknown>;
  } catch (err) {
    clearCrmAuthStorage({ keepMfaTemp: false });
    clearPlatformSession();
    invalidateVerifiedSessionCache();
    return {
      ok: false,
      reason: "VERIFICATION_FAILED",
      message: extractErrorMessage(
        err,
        "Unable to verify your user profile with the server. Please sign in again."
      ),
    };
  }

  const authoritativeRole =
    "role" in meUser
      ? extractRawRole(meUser)
      : extractRawRole(response.role) || extractRawRole(response.user);

  const mustChangePassword = Boolean(meUser.must_change_password);
  const responseTenant: TenantMetadata | null = response.tenant
    ? {
        id: response.tenant.id,
        name: response.tenant.name,
        industry: response.tenant.industry ?? null,
        is_platform: response.tenant.is_platform,
      }
    : null;

  const isPlatform = isPlatformIdentity({
    role: authoritativeRole,
    tenant: responseTenant,
    accountType: response.account_type,
  });

  if (isPlatform) {
    const mergedUser = {
      ...(response.user ?? {}),
      ...meUser,
      role: authoritativeRole,
    };
    const platformResult = await resolvePlatformSession({
      accessToken,
      refreshToken: response.refresh_token,
      meUser: mergedUser,
      fallbackRole: authoritativeRole,
      fallbackTenant: responseTenant,
      fallbackPermissions: response.permissions,
      fallbackMustChangePassword: mustChangePassword,
      useExplicitToken: true,
    });

    if (!platformResult.ok) {
      clearCrmAuthStorage({ keepMfaTemp: false });
      clearPlatformSession();
      invalidateVerifiedSessionCache();
      return {
        ok: false,
        reason: platformResult.reason,
        message: platformResult.message,
      };
    }

    return { ok: true, session: platformResult.session };
  }

  // Non-platform flow: verify tenant industry live from backend
  const tenantId =
    (typeof meUser.tenant_id === "string" && meUser.tenant_id) ||
    responseTenant?.id ||
    null;

  let authoritativeTenant: TenantMetadata | null = responseTenant;
  let authoritativeIndustry: string | null =
    responseTenant?.industry ?? null;

  try {
    const billing = await fetchTenantBillingProfile(accessToken, tenantId);
    authoritativeTenant = {
      id: billing.tenant_id || tenantId || "",
      name: billing.company_name || responseTenant?.name || "",
      industry: billing.industry ?? null,
      is_platform: false,
    };
    authoritativeIndustry = billing.industry ?? null;
  } catch (err) {
    const status = getAxiosStatus(err);
    if (status === 403 && mustChangePassword && responseTenant) {
      authoritativeTenant = responseTenant;
      authoritativeIndustry = responseTenant.industry ?? null;
    } else {
      clearCrmAuthStorage({ keepMfaTemp: false });
      clearPlatformSession();
      invalidateVerifiedSessionCache();
      return {
        ok: false,
        reason: "CRM_VERIFICATION_FAILED",
        message: extractErrorMessage(
          err,
          "Unable to verify your organization's workspace configuration. Please sign in again."
        ),
      };
    }
  }

  // Double-check DB tenant metadata in case login payload omitted platform markers
  if (
    isPlatformIdentity({
      role: authoritativeRole,
      tenant: authoritativeTenant,
      accountType: response.account_type,
    })
  ) {
    const mergedUser = {
      ...(response.user ?? {}),
      ...meUser,
      role: authoritativeRole,
    };
    const platformResult = await resolvePlatformSession({
      accessToken,
      refreshToken: response.refresh_token,
      meUser: mergedUser,
      fallbackRole: authoritativeRole,
      fallbackTenant: authoritativeTenant,
      fallbackPermissions: response.permissions,
      fallbackMustChangePassword: mustChangePassword,
      useExplicitToken: true,
    });
    if (!platformResult.ok) {
      clearCrmAuthStorage({ keepMfaTemp: false });
      clearPlatformSession();
      invalidateVerifiedSessionCache();
      return {
        ok: false,
        reason: platformResult.reason,
        message: platformResult.message,
      };
    }
    return { ok: true, session: platformResult.session };
  }

  const destinationResult = resolveCrmDashboardDestination(
    authoritativeRole,
    authoritativeIndustry
  );

  if (!destinationResult.ok) {
    clearCrmAuthStorage({ keepMfaTemp: false });
    clearPlatformSession();
    invalidateVerifiedSessionCache();
    return {
      ok: false,
      reason: destinationResult.reason,
      message: destinationResult.message,
    };
  }

  const mergedCrmUser: Record<string, unknown> = {
    ...(response.user ?? {}),
    ...meUser,
    id: meUser.user_id || response.user?.id,
    role: authoritativeRole,
    tenant_id: authoritativeTenant?.id ?? tenantId,
  };

  saveCrmSessionStorage({
    accessToken,
    refreshToken: response.refresh_token,
    user: mergedCrmUser,
    tenant: authoritativeTenant,
    tenantId: authoritativeTenant?.id ?? tenantId,
  });

  const session: VerifiedAuthSession = {
    kind: "crm",
    destination: destinationResult.destination,
    role: authoritativeRole,
    crmRole: destinationResult.crmRole,
    industryRaw: authoritativeIndustry,
    industrySlug: destinationResult.industrySlug,
    tenant: authoritativeTenant,
    user: mergedCrmUser,
    tenantId: authoritativeTenant?.id ?? tenantId,
    mustChangePassword,
  };
  cacheVerifiedSession(session);
  return { ok: true, session };
}

async function performVerifyExistingSession(): Promise<VerifySessionResult> {
  const platformToken = getPlatformAccessToken();
  const crmToken = getCrmAccessToken();

  // Platform token path
  if (platformToken && !crmToken) {
    let fallbackRole =
      sessionStorage.getItem(PLATFORM_ROLE_KEY) ||
      localStorage.getItem(PLATFORM_ROLE_KEY) ||
      "";
    let fallbackMustChange = false;
    let meUser: Record<string, unknown> = {};

    const platformResult = await resolvePlatformSession({
      useExplicitToken: false,
      fallbackRole,
      fallbackMustChangePassword: fallbackMustChange,
    });

    if (platformResult.ok) {
      return { status: "authenticated", session: platformResult.session };
    }

    if (platformResult.status === 403) {
      // Handle first-login must_change_password state for platform user
      try {
        const authMe = await fetchCurrentAuthUser(platformToken);
        if (authMe.user) {
          meUser = authMe.user as Record<string, unknown>;
          fallbackRole = extractRawRole(meUser) || fallbackRole;
          fallbackMustChange = Boolean(meUser.must_change_password);
          if (fallbackMustChange) {
            const retryResult = await resolvePlatformSession({
              accessToken: platformToken,
              meUser,
              fallbackRole,
              fallbackMustChangePassword: true,
              useExplicitToken: true,
            });
            if (retryResult.ok) {
              return { status: "authenticated", session: retryResult.session };
            }
          }
        }
      } catch {
        // Fall through to cleanup
      }
    }

    clearPlatformSession();
    clearCrmAuthStorage({ keepMfaTemp: false });
    invalidateVerifiedSessionCache();
    return { status: "unauthenticated" };
  }

  // CRM token path (or mixed CRM + Platform token where CRM login should verify via /auth/me)
  if (!crmToken) {
    return { status: "unauthenticated" };
  }

  let meUser: Record<string, unknown>;
  try {
    const meRes = await fetchCurrentAuthUser();
    if (!meRes.user || typeof meRes.user !== "object") {
      clearCrmAuthStorage({ keepMfaTemp: false });
      invalidateVerifiedSessionCache();
      return {
        status: "error",
        reason: "VERIFICATION_FAILED",
        message: "Server did not return authenticated user details.",
      };
    }
    meUser = meRes.user as Record<string, unknown>;
  } catch (err) {
    const status = getAxiosStatus(err);
    if (status === 401) {
      clearCrmAuthStorage({ keepMfaTemp: false });
      clearPlatformSession();
      invalidateVerifiedSessionCache();
      return { status: "unauthenticated" };
    }
    return {
      status: "error",
      reason: "VERIFICATION_FAILED",
      message: extractErrorMessage(
        err,
        "Unable to verify your active session. Please sign in again."
      ),
    };
  }

  const authoritativeRole = extractRawRole(meUser);
  const mustChangePassword = Boolean(meUser.must_change_password);
  const tenantId =
    (typeof meUser.tenant_id === "string" && meUser.tenant_id) || null;
  const displayFields = getSafeStoredUserDisplayFields();

  if (isPlatformIdentity({ role: authoritativeRole })) {
    const mergedUser = {
      ...displayFields,
      ...meUser,
      role: authoritativeRole,
    };
    const platformResult = await resolvePlatformSession({
      accessToken: crmToken,
      refreshToken: getCrmRefreshToken(),
      meUser: mergedUser,
      fallbackRole: authoritativeRole,
      fallbackMustChangePassword: mustChangePassword,
      useExplicitToken: true,
    });
    if (!platformResult.ok) {
      clearCrmAuthStorage({ keepMfaTemp: false });
      clearPlatformSession();
      invalidateVerifiedSessionCache();
      return {
        status: "error",
        reason: platformResult.reason,
        message: platformResult.message,
      };
    }
    return { status: "authenticated", session: platformResult.session };
  }

  let authoritativeTenant: TenantMetadata | null = null;
  let authoritativeIndustry: string | null = null;

  try {
    const billing = await fetchTenantBillingProfile();
    authoritativeTenant = {
      id: billing.tenant_id || tenantId || "",
      name: billing.company_name,
      industry: billing.industry ?? null,
      is_platform: false,
    };
    authoritativeIndustry = billing.industry ?? null;
  } catch (err) {
    const status = getAxiosStatus(err);
    if (status === 401) {
      clearCrmAuthStorage({ keepMfaTemp: false });
      invalidateVerifiedSessionCache();
      return { status: "unauthenticated" };
    }
    return {
      status: "error",
      reason: "CRM_VERIFICATION_FAILED",
      message: extractErrorMessage(
        err,
        "Unable to verify your workspace industry and access permissions."
      ),
    };
  }

  // Re-check if tenant metadata reveals platform workspace even for an unrecognized role
  if (
    isPlatformIdentity({
      role: authoritativeRole,
      tenant: authoritativeTenant,
    })
  ) {
    const mergedUser = {
      ...displayFields,
      ...meUser,
      role: authoritativeRole,
    };
    const platformResult = await resolvePlatformSession({
      accessToken: crmToken,
      refreshToken: getCrmRefreshToken(),
      meUser: mergedUser,
      fallbackRole: authoritativeRole,
      fallbackTenant: authoritativeTenant,
      fallbackMustChangePassword: mustChangePassword,
      useExplicitToken: true,
    });
    if (!platformResult.ok) {
      clearCrmAuthStorage({ keepMfaTemp: false });
      clearPlatformSession();
      invalidateVerifiedSessionCache();
      return {
        status: "error",
        reason: platformResult.reason,
        message: platformResult.message,
      };
    }
    return { status: "authenticated", session: platformResult.session };
  }

  const destinationResult = resolveCrmDashboardDestination(
    authoritativeRole,
    authoritativeIndustry
  );

  if (!destinationResult.ok) {
    return {
      status: "error",
      reason: destinationResult.reason,
      message: destinationResult.message,
    };
  }

  const freshAccessToken = getCrmAccessToken() || crmToken;
  const freshRefreshToken = getCrmRefreshToken();

  const mergedCrmUser: Record<string, unknown> = {
    ...displayFields,
    ...meUser,
    id: meUser.user_id || displayFields.id,
    role: authoritativeRole,
    tenant_id: authoritativeTenant.id || tenantId,
  };

  // Overwrite any tampered storage with server-verified identity & tenant
  saveCrmSessionStorage({
    accessToken: freshAccessToken,
    refreshToken: freshRefreshToken,
    user: mergedCrmUser,
    tenant: authoritativeTenant,
    tenantId: authoritativeTenant.id || tenantId,
  });

  const session: VerifiedAuthSession = {
    kind: "crm",
    destination: destinationResult.destination,
    role: authoritativeRole,
    crmRole: destinationResult.crmRole,
    industryRaw: authoritativeIndustry,
    industrySlug: destinationResult.industrySlug,
    tenant: authoritativeTenant,
    user: mergedCrmUser,
    tenantId: authoritativeTenant.id || tenantId,
    mustChangePassword,
  };
  cacheVerifiedSession(session);
  return { status: "authenticated", session };
}

export async function verifyExistingSession(options?: {
  force?: boolean;
}): Promise<VerifySessionResult> {
  const force = Boolean(options?.force);

  if (!force && cachedSession) {
    const ageMs = Date.now() - cachedSession.verifiedAt;
    const unchanged =
      computeAuthStorageFingerprint() === cachedSession.fingerprint;
    if (unchanged && ageMs < SESSION_CACHE_TTL_MS) {
      return { status: "authenticated", session: cachedSession.session };
    }
  }

  if (inFlightVerify && !force) {
    return inFlightVerify;
  }

  const run = performVerifyExistingSession().finally(() => {
    if (inFlightVerify === run) {
      inFlightVerify = null;
    }
  });
  inFlightVerify = run;
  return run;
}

export function getSynchronouslyValidCachedSession(): VerifiedAuthSession | null {
  if (!cachedSession) {
    return null;
  }
  const unchanged =
    computeAuthStorageFingerprint() === cachedSession.fingerprint;
  if (!unchanged) {
    cachedSession = null;
    return null;
  }
  return cachedSession.session;
}

export async function signOutAndRedirect(): Promise<void> {
  invalidateVerifiedSessionCache();
  await logoutUserSession();
}
