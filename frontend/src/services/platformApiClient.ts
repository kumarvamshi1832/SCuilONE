import axios from "axios";
import { clearCrmAuthStorage } from "../utils/authRouting";

export const PLATFORM_ACCESS_TOKEN_KEY = "platform_access_token";
export const PLATFORM_REFRESH_TOKEN_KEY = "platform_refresh_token";
export const PLATFORM_USER_KEY = "platform_user";
export const PLATFORM_ROLE_KEY = "platform_role";
export const PLATFORM_PERMISSIONS_KEY = "platform_permissions";
export const PLATFORM_DASHBOARD_KEY = "platform_dashboard";
export const PLATFORM_SIDEBAR_MODULES_KEY = "platform_sidebar_modules";
export const PLATFORM_TENANT_KEY = "platform_tenant";

export function isPlatformRememberMe(): boolean {
  return Boolean(localStorage.getItem(PLATFORM_ACCESS_TOKEN_KEY));
}

export function getPlatformAccessToken(): string | null {
  return (
    sessionStorage.getItem(PLATFORM_ACCESS_TOKEN_KEY) ||
    localStorage.getItem(PLATFORM_ACCESS_TOKEN_KEY)
  );
}

export function getPlatformRefreshToken(): string | null {
  return (
    sessionStorage.getItem(PLATFORM_REFRESH_TOKEN_KEY) ||
    localStorage.getItem(PLATFORM_REFRESH_TOKEN_KEY)
  );
}

export function getStoredPlatformUser<T = any>(): T | null {
  try {
    const raw =
      sessionStorage.getItem(PLATFORM_USER_KEY) ||
      localStorage.getItem(PLATFORM_USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function getStoredPlatformPermissions(): string[] {
  try {
    const raw =
      sessionStorage.getItem(PLATFORM_PERMISSIONS_KEY) ||
      localStorage.getItem(PLATFORM_PERMISSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getStoredPlatformDashboard<T = any>(): T | null {
  try {
    const raw =
      sessionStorage.getItem(PLATFORM_DASHBOARD_KEY) ||
      localStorage.getItem(PLATFORM_DASHBOARD_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function getStoredPlatformSidebarModules(): Array<
  string | { key: string; label: string; purpose?: string }
> {
  try {
    const raw =
      sessionStorage.getItem(PLATFORM_SIDEBAR_MODULES_KEY) ||
      localStorage.getItem(PLATFORM_SIDEBAR_MODULES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hasPlatformPermission(permission: string): boolean {
  const perms = getStoredPlatformPermissions();
  return perms.includes(permission) || perms.includes("*");
}

export function savePlatformSession(
  data: {
    access_token?: string;
    refresh_token?: string;
    employee?: any;
    user?: any;
    role?: string;
    permissions?: string[];
    dashboard?: any;
    sidebar_modules?: any[];
    tenant?: any;
  },
  rememberMe?: boolean
): void {
  const isRemembered =
    rememberMe !== undefined ? rememberMe : isPlatformRememberMe();
  const targetStorage = isRemembered ? localStorage : sessionStorage;
  const alternateStorage = isRemembered ? sessionStorage : localStorage;

  const keys = [
    PLATFORM_ACCESS_TOKEN_KEY,
    PLATFORM_REFRESH_TOKEN_KEY,
    PLATFORM_USER_KEY,
    PLATFORM_ROLE_KEY,
    PLATFORM_PERMISSIONS_KEY,
    PLATFORM_DASHBOARD_KEY,
    PLATFORM_SIDEBAR_MODULES_KEY,
    PLATFORM_TENANT_KEY,
  ];
  keys.forEach((k) => alternateStorage.removeItem(k));
  clearCrmAuthStorage();

  if (data.access_token) {
    targetStorage.setItem(PLATFORM_ACCESS_TOKEN_KEY, data.access_token);
  }
  if (data.refresh_token) {
    targetStorage.setItem(PLATFORM_REFRESH_TOKEN_KEY, data.refresh_token);
  }
  const employeeOrUser = data.employee || data.user;
  if (employeeOrUser) {
    targetStorage.setItem(PLATFORM_USER_KEY, JSON.stringify(employeeOrUser));
  }
  if (data.role) {
    targetStorage.setItem(PLATFORM_ROLE_KEY, data.role);
  } else if (data.employee?.role) {
    targetStorage.setItem(PLATFORM_ROLE_KEY, data.employee.role);
  }
  if (Array.isArray(data.permissions)) {
    targetStorage.setItem(
      PLATFORM_PERMISSIONS_KEY,
      JSON.stringify(data.permissions)
    );
  }
  if (data.dashboard) {
    targetStorage.setItem(PLATFORM_DASHBOARD_KEY, JSON.stringify(data.dashboard));
    if (Array.isArray(data.dashboard.sidebar_modules)) {
      targetStorage.setItem(
        PLATFORM_SIDEBAR_MODULES_KEY,
        JSON.stringify(data.dashboard.sidebar_modules)
      );
    }
  }
  if (Array.isArray(data.sidebar_modules)) {
    targetStorage.setItem(
      PLATFORM_SIDEBAR_MODULES_KEY,
      JSON.stringify(data.sidebar_modules)
    );
  }
  if (data.tenant) {
    targetStorage.setItem(PLATFORM_TENANT_KEY, JSON.stringify(data.tenant));
  }
}

export function clearPlatformSession(): void {
  const keys = [
    PLATFORM_ACCESS_TOKEN_KEY,
    PLATFORM_REFRESH_TOKEN_KEY,
    PLATFORM_USER_KEY,
    PLATFORM_ROLE_KEY,
    PLATFORM_PERMISSIONS_KEY,
    PLATFORM_DASHBOARD_KEY,
    PLATFORM_SIDEBAR_MODULES_KEY,
    PLATFORM_TENANT_KEY,
  ];
  keys.forEach((k) => {
    sessionStorage.removeItem(k);
    localStorage.removeItem(k);
  });
}

const normalizedBaseUrl = String(
  import.meta.env.VITE_API_BASE_URL ?? ""
)
  .trim()
  .replace(/\/+$/, "");

export const PLATFORM_API_BASE_URL = normalizedBaseUrl;

export const platformApiClient = axios.create({
  baseURL: normalizedBaseUrl,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

const PUBLIC_PLATFORM_AUTH_URLS = [
  "/api/v1/platform/auth/login",
  "/api/v1/platform/auth/bootstrap-super-admin",
  "/api/v1/auth/mfa/enroll/start",
  "/api/v1/auth/mfa/enroll/verify",
  "/api/v1/auth/mfa/verify",
  "/api/v1/auth/refresh",
];

platformApiClient.interceptors.request.use(
  (config) => {
    const url = config.url || "";
    const isPublic = PUBLIC_PLATFORM_AUTH_URLS.some((u) => url.includes(u));
    if (!isPublic) {
      const hasExplicitAuth = Boolean(
        config.headers &&
          (typeof config.headers.get === "function"
            ? config.headers.get("Authorization")
            : config.headers["Authorization"])
      );
      const token = getPlatformAccessToken();
      if (token && !hasExplicitAuth) {
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

let isPlatformRefreshing = false;
let platformRefreshSubscribers: ((newToken: string) => void)[] = [];

function onPlatformTokenRefreshed(newToken: string) {
  platformRefreshSubscribers.forEach((cb) => cb(newToken));
  platformRefreshSubscribers = [];
}

platformApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    if (error.response && error.response.status === 401) {
      const url = originalRequest.url || "";
      const isPublic = PUBLIC_PLATFORM_AUTH_URLS.some((u) => url.includes(u));
      if (isPublic) {
        return Promise.reject(error);
      }

      const refreshToken = getPlatformRefreshToken();
      if (refreshToken && !originalRequest._retry) {
        if (isPlatformRefreshing) {
          return new Promise((resolve) => {
            platformRefreshSubscribers.push((newToken: string) => {
              if (originalRequest.headers?.set) {
                originalRequest.headers.set("Authorization", `Bearer ${newToken}`);
              } else if (originalRequest.headers) {
                originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
              }
              resolve(platformApiClient(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isPlatformRefreshing = true;

        try {
          const refreshRes = await axios.post(
            `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/v1/auth/refresh`,
            { refresh_token: refreshToken }
          );
          const newAccessToken = refreshRes.data?.access_token;
          if (newAccessToken) {
            savePlatformSession({
              access_token: newAccessToken,
              refresh_token: refreshRes.data?.refresh_token || refreshToken,
            });
            isPlatformRefreshing = false;
            onPlatformTokenRefreshed(newAccessToken);

            if (originalRequest.headers?.set) {
              originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
            } else if (originalRequest.headers) {
              originalRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
            }
            return platformApiClient(originalRequest);
          }
        } catch (refreshErr) {
          isPlatformRefreshing = false;
          platformRefreshSubscribers = [];
          clearPlatformSession();
          if (!window.location.pathname.includes("/platform/login")) {
            window.location.href = "/platform/login";
          }
          return Promise.reject(refreshErr);
        }
      }

      clearPlatformSession();
      if (!window.location.pathname.includes("/platform/login")) {
        window.location.href = "/platform/login";
      }
    }

    return Promise.reject(error);
  }
);
