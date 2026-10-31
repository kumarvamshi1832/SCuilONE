import axios from "axios";
import type {
  PortalActivateRequest,
  PortalLoginRequest,
  PortalAuthResponse,
  PortalProfileResponse,
} from "../types/customerPortal";

export const PORTAL_ACCESS_TOKEN_KEY = "scuilone_portal_access_token";
export const PORTAL_REFRESH_TOKEN_KEY = "scuilone_portal_refresh_token";
export const PORTAL_CUSTOMER_KEY = "scuilone_portal_customer";
export const PORTAL_TENANT_ID_KEY = "scuilone_portal_tenant_id";

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
  rememberMe: boolean = true
): void {
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(PORTAL_ACCESS_TOKEN_KEY, authData.access_token);
  storage.setItem(PORTAL_REFRESH_TOKEN_KEY, authData.refresh_token);
  if (authData.customer) {
    storage.setItem(PORTAL_CUSTOMER_KEY, JSON.stringify(authData.customer));
    if (authData.customer.tenant_id) {
      storage.setItem(PORTAL_TENANT_ID_KEY, authData.customer.tenant_id);
    }
  } else if (tenantId) {
    storage.setItem(PORTAL_TENANT_ID_KEY, tenantId);
  }
}

export function clearPortalAuthSession(): void {
  sessionStorage.removeItem(PORTAL_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(PORTAL_REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(PORTAL_CUSTOMER_KEY);
  sessionStorage.removeItem(PORTAL_TENANT_ID_KEY);

  localStorage.removeItem(PORTAL_ACCESS_TOKEN_KEY);
  localStorage.removeItem(PORTAL_REFRESH_TOKEN_KEY);
  localStorage.removeItem(PORTAL_CUSTOMER_KEY);
  localStorage.removeItem(PORTAL_TENANT_ID_KEY);
}

/* ─── Dedicated Isolated Portal Axios Client ─── */
export const portalApiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
});

portalApiClient.interceptors.request.use(
  (config) => {
    const url = config.url || "";
    const isPublicAuth =
      url.includes("/api/v1/customer-portal/auth/login") ||
      url.includes("/api/v1/customer-portal/auth/activate") ||
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
          if (
            window.location.pathname.startsWith("/portal") &&
            window.location.pathname !== "/portal/login" &&
            window.location.pathname !== "/portal/activate"
          ) {
            window.location.href = "/portal/login";
          }
          return Promise.reject(refreshErr);
        }
      } else {
        clearPortalAuthSession();
        if (
          window.location.pathname.startsWith("/portal") &&
          window.location.pathname !== "/portal/login" &&
          window.location.pathname !== "/portal/activate"
        ) {
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
): Promise<PortalAuthResponse> => {
  const response = await portalApiClient.post<PortalAuthResponse>(
    "/api/v1/customer-portal/auth/login",
    data
  );
  setPortalAuthSession(response.data, data.tenant_id, rememberMe);
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

export const getPortalProfile = async (): Promise<PortalProfileResponse> => {
  const response = await portalApiClient.get<PortalProfileResponse>(
    "/api/v1/customer-portal/me"
  );
  return response.data;
};

