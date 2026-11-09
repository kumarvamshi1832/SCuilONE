import axios from "axios";
import type {
  PortalActivateRequest,
  PortalLoginRequest,
  PortalAuthResponse,
  PortalProfileResponse,
  PortalForgotPasswordRequest,
  PortalResetPasswordRequest,
  PortalChangePasswordRequest,
  PortalWorkspacesResponse,
  PortalSwitchWorkspaceResponse,
  PortalProfileUpdateRequest,
  PortalDashboardResponse,
} from "../types/customerPortal";

export const PORTAL_ACCESS_TOKEN_KEY = "scuilone_portal_access_token";
export const PORTAL_REFRESH_TOKEN_KEY = "scuilone_portal_refresh_token";
export const PORTAL_CUSTOMER_KEY = "scuilone_portal_customer";
export const PORTAL_TENANT_ID_KEY = "scuilone_portal_tenant_id";

export function isPortalRememberMe(): boolean {
  return Boolean(localStorage.getItem(PORTAL_ACCESS_TOKEN_KEY));
}

export function getPortalAccessToken(): string | null {
  return (
    sessionStorage.getItem(PORTAL_ACCESS_TOKEN_KEY) ||
    localStorage.getItem(PORTAL_ACCESS_TOKEN_KEY)
  );
}

export function getPortalRefreshToken(): string | null {
  return (
    sessionStorage.getItem(PORTAL_REFRESH_TOKEN_KEY) ||
    localStorage.getItem(PORTAL_REFRESH_TOKEN_KEY)
  );
}

export function getPortalCustomer(): any | null {
  try {
    const raw =
      sessionStorage.getItem(PORTAL_CUSTOMER_KEY) ||
      localStorage.getItem(PORTAL_CUSTOMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getPortalTenantId(): string | null {
  return (
    sessionStorage.getItem(PORTAL_TENANT_ID_KEY) ||
    localStorage.getItem(PORTAL_TENANT_ID_KEY)
  );
}

export function setPortalAuthSession(
  authData: PortalAuthResponse,
  tenantId?: string,
  rememberMe?: boolean
): void {
  // If rememberMe is omitted (e.g. during automatic token refresh), preserve the existing preference
  const isRemembered =
    rememberMe !== undefined ? rememberMe : isPortalRememberMe();
  const targetStorage = isRemembered ? localStorage : sessionStorage;
  const alternateStorage = isRemembered ? sessionStorage : localStorage;

  // Clear from the alternate storage so tokens never exist concurrently in both
  alternateStorage.removeItem(PORTAL_ACCESS_TOKEN_KEY);
  alternateStorage.removeItem(PORTAL_REFRESH_TOKEN_KEY);
  alternateStorage.removeItem(PORTAL_CUSTOMER_KEY);
  alternateStorage.removeItem(PORTAL_TENANT_ID_KEY);

  targetStorage.setItem(PORTAL_ACCESS_TOKEN_KEY, authData.access_token);
  targetStorage.setItem(PORTAL_REFRESH_TOKEN_KEY, authData.refresh_token);
  if (authData.customer) {
    targetStorage.setItem(PORTAL_CUSTOMER_KEY, JSON.stringify(authData.customer));
    if (authData.customer.tenant_id) {
      targetStorage.setItem(PORTAL_TENANT_ID_KEY, authData.customer.tenant_id);
    }
  } else if (tenantId) {
    targetStorage.setItem(PORTAL_TENANT_ID_KEY, tenantId);
  }
}

let cachedProfile: PortalProfileResponse | null = null;
let profileInFlightPromise: Promise<PortalProfileResponse> | null = null;

export function clearPortalProfileCache(): void {
  cachedProfile = null;
  profileInFlightPromise = null;
}

export function clearPortalAuthSession(): void {
  clearPortalProfileCache();
  sessionStorage.removeItem(PORTAL_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(PORTAL_REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(PORTAL_CUSTOMER_KEY);
  sessionStorage.removeItem(PORTAL_TENANT_ID_KEY);

  localStorage.removeItem(PORTAL_ACCESS_TOKEN_KEY);
  localStorage.removeItem(PORTAL_REFRESH_TOKEN_KEY);
  localStorage.removeItem(PORTAL_CUSTOMER_KEY);
  localStorage.removeItem(PORTAL_TENANT_ID_KEY);
}

export const portalApiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
});

portalApiClient.interceptors.request.use(
  (config) => {
    const url = config.url || "";
    const isPublicAuth =
      url.includes("/api/v1/customer-portal/auth/login") ||
      url.includes("/api/v1/customer-portal/auth/activate") ||
      url.includes("/api/v1/customer-portal/auth/forgot-password") ||
      url.includes("/api/v1/customer-portal/auth/reset-password") ||
      url.includes("/api/v1/customer-portal/auth/refresh");

    if (!isPublicAuth) {
      const token = getPortalAccessToken();
      if (token) {
        if (!config.headers) {
          config.headers = new axios.AxiosHeaders();
        }
        if (typeof config.headers.set === "function") {
          config.headers.set("Authorization", `Bearer ${token}`);
        } else {
          config.headers["Authorization"] = `Bearer ${token}`;
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isPortalRefreshing = false;
let portalRefreshSubscribers: ((newToken: string) => void)[] = [];

function onPortalTokenRefreshed(newToken: string) {
  portalRefreshSubscribers.forEach((cb) => cb(newToken));
  portalRefreshSubscribers = [];
}

portalApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    if (error.response && error.response.status === 401) {
      const url = originalRequest.url || "";
      if (
        url.includes("/api/v1/customer-portal/auth/login") ||
        url.includes("/api/v1/customer-portal/auth/activate") ||
        url.includes("/api/v1/customer-portal/auth/forgot-password") ||
        url.includes("/api/v1/customer-portal/auth/reset-password") ||
        url.includes("/api/v1/customer-portal/auth/refresh")
      ) {
        return Promise.reject(error);
      }

      const refreshToken = getPortalRefreshToken();
      if (refreshToken && !originalRequest._retry) {
        if (isPortalRefreshing) {
          return new Promise((resolve) => {
            portalRefreshSubscribers.push((newToken: string) => {
              if (originalRequest.headers?.set) {
                originalRequest.headers.set(
                  "Authorization",
                  `Bearer ${newToken}`
                );
              } else {
                originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
              }
              resolve(portalApiClient(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isPortalRefreshing = true;

        try {
          const res = await axios.post<PortalAuthResponse>(
            `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/v1/customer-portal/auth/refresh`,
            { refresh_token: refreshToken }
          );
          const newAuth = res.data;
          setPortalAuthSession(newAuth);
          isPortalRefreshing = false;
          onPortalTokenRefreshed(newAuth.access_token);

          if (originalRequest.headers?.set) {
            originalRequest.headers.set(
              "Authorization",
              `Bearer ${newAuth.access_token}`
            );
          } else {
            originalRequest.headers["Authorization"] = `Bearer ${newAuth.access_token}`;
          }
          return portalApiClient(originalRequest);
        } catch (refreshErr) {
          isPortalRefreshing = false;
          portalRefreshSubscribers = [];
          clearPortalAuthSession();
          const isPortalApp =
            window.location.pathname.startsWith("/portal") ||
            window.location.pathname.startsWith("/customer_portal") ||
            window.location.pathname.startsWith("/customer-portal");
          const isPublicPortalRoute =
            window.location.pathname.includes("/login") ||
            window.location.pathname.includes("/activate") ||
            window.location.pathname.includes("/forgot-password") ||
            window.location.pathname.includes("/reset-password");

          if (isPortalApp && !isPublicPortalRoute) {
            window.location.href = "/portal/login";
          }
          return Promise.reject(refreshErr);
        }
      } else {
        clearPortalAuthSession();
        const isPortalApp =
          window.location.pathname.startsWith("/portal") ||
          window.location.pathname.startsWith("/customer_portal") ||
          window.location.pathname.startsWith("/customer-portal");
        const isPublicPortalRoute =
          window.location.pathname.includes("/login") ||
          window.location.pathname.includes("/activate") ||
          window.location.pathname.includes("/forgot-password") ||
          window.location.pathname.includes("/reset-password");

        if (isPortalApp && !isPublicPortalRoute) {
          window.location.href = "/portal/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

/* ─── Customer Portal Auth Operations ─── */

export const portalActivate = async (
  data: PortalActivateRequest
): Promise<{ message: string; tenant_id: string }> => {
  const response = await portalApiClient.post<{
    message: string;
    tenant_id: string;
  }>("/api/v1/customer-portal/auth/activate", data);
  return response.data;
};

export const portalLogin = async (
  data: PortalLoginRequest,
  rememberMe: boolean = true
): Promise<PortalAuthResponse | any> => {
  const payload: PortalLoginRequest = {
    email: data.email.trim().toLowerCase(),
    password: data.password,
  };
  if (data.tenant_id && data.tenant_id.trim()) {
    payload.tenant_id = data.tenant_id.trim();
  }

  const response = await portalApiClient.post<PortalAuthResponse>(
    "/api/v1/customer-portal/auth/login",
    payload
  );

  if (response.data && response.data.access_token) {
    setPortalAuthSession(response.data, payload.tenant_id, rememberMe);
  }
  return response.data;
};

export const portalForgotPassword = async (
  data: PortalForgotPasswordRequest
): Promise<{ message: string }> => {
  const response = await portalApiClient.post<{ message: string }>(
    "/api/v1/customer-portal/auth/forgot-password",
    data
  );
  return response.data;
};

export const portalResetPassword = async (
  data: PortalResetPasswordRequest
): Promise<{ message: string }> => {
  const response = await portalApiClient.post<{ message: string }>(
    "/api/v1/customer-portal/auth/reset-password",
    data
  );
  return response.data;
};

export const portalChangePassword = async (
  data: PortalChangePasswordRequest
): Promise<{ message: string }> => {
  const response = await portalApiClient.post<{ message: string }>(
    "/api/v1/customer-portal/auth/change-password",
    data
  );
  clearPortalAuthSession();
  return response.data;
};

export const portalLogout = async (): Promise<void> => {
  const refreshToken = getPortalRefreshToken();
  if (refreshToken) {
    try {
      await portalApiClient.post("/api/v1/customer-portal/auth/logout", {
        refresh_token: refreshToken,
      });
    } catch {
      // Ignore network failures on logout
    }
  }
  clearPortalAuthSession();
};

export const getPortalWorkspaces = async (): Promise<PortalWorkspacesResponse> => {
  const response = await portalApiClient.get<PortalWorkspacesResponse>(
    "/api/v1/customer-portal/auth/workspaces"
  );
  return response.data;
};

export const portalSwitchWorkspace = async (
  tenant_id: string
): Promise<PortalSwitchWorkspaceResponse> => {
  const response = await portalApiClient.post<PortalSwitchWorkspaceResponse>(
    "/api/v1/customer-portal/auth/switch-workspace",
    { tenant_id }
  );
  setPortalAuthSession(
    {
      access_token: response.data.access_token,
      token_type: response.data.token_type,
      refresh_token: response.data.refresh_token,
      expires_in_minutes: response.data.expires_in_minutes,
      customer: response.data.customer,
      workspace: response.data.workspace,
    },
    tenant_id
  );
  clearPortalProfileCache();
  return response.data;
};

export const getPortalProfile = async (
  forceRefresh: boolean = false
): Promise<PortalProfileResponse> => {
  if (!forceRefresh && cachedProfile) {
    return cachedProfile;
  }
  if (profileInFlightPromise) {
    return profileInFlightPromise;
  }
  profileInFlightPromise = (async () => {
    try {
      const response = await portalApiClient.get<PortalProfileResponse>(
        "/api/v1/customer-portal/me"
      );
      cachedProfile = response.data;
      return response.data;
    } finally {
      profileInFlightPromise = null;
    }
  })();
  return profileInFlightPromise;
};

export const updatePortalProfile = async (
  data: PortalProfileUpdateRequest
): Promise<{ message: string; contact: any }> => {
  const response = await portalApiClient.patch<{ message: string; contact: any }>(
    "/api/v1/customer-portal/me",
    data
  );
  clearPortalProfileCache();
  return response.data;
};

export const getPortalDashboard = async (): Promise<PortalDashboardResponse> => {
  const response = await portalApiClient.get<PortalDashboardResponse>(
    "/api/v1/customer-portal/dashboard"
  );
  return response.data;
};

/**
 * Rate limit handling helper for Customer Portal Authentication & Actions
 * Aligned with backend HTTP 429 responses and Retry-After headers
 */
export interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfterSeconds: number | null;
  message: string;
}

export function extractRateLimitInfo(error: unknown): RateLimitInfo {
  const err = error as any;
  if (err?.response && err.response.status === 429) {
    const headers = err.response.headers || {};
    const rawRetryAfter =
      headers["retry-after"] ||
      headers["Retry-After"] ||
      headers["retry_after"];

    let retryAfterSeconds: number | null = null;
    if (rawRetryAfter !== undefined && rawRetryAfter !== null) {
      const parsed = parseInt(String(rawRetryAfter), 10);
      if (!isNaN(parsed) && parsed > 0) {
        retryAfterSeconds = parsed;
      }
    }

    const detailMsg =
      err.response.data?.detail ||
      err.response.data?.message ||
      "Too many attempts. Please try again later.";

    return {
      isRateLimited: true,
      retryAfterSeconds,
      message:
        typeof detailMsg === "string" ? detailMsg : JSON.stringify(detailMsg),
    };
  }

  return {
    isRateLimited: false,
    retryAfterSeconds: null,
    message: "",
  };
}

