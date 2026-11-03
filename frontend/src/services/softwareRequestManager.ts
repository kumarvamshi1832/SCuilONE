/**
 * Software Request Manager
 * Handles in-flight request deduplication, session-level 403 forbidden tracking,
 * tenant context awareness, cache invalidation, and clean extraction of backend authorization errors.
 */

export interface ForbiddenState {
  isForbidden: boolean;
  message: string;
  statusCode: number;
  timestamp: number;
  reason?: "industry_mismatch" | "permission_denied" | "module_disabled" | "unknown";
}

const inFlightRequests = new Map<string, Promise<any>>();
const forbiddenCache = new Map<string, ForbiddenState>();
let lastKnownTenant: string | null = null;

// Short TTL to prevent permanent lockouts if tenant status was updated
const FORBIDDEN_CACHE_TTL_MS = 15000; // 15 seconds

/**
 * Ensures cache is reset when tenant switching occurs in multi-tenant workflows.
 */
function checkTenantContext(): void {
  try {
    let currentTenant: string | null =
      sessionStorage.getItem("tenant_id") ||
      localStorage.getItem("tenant_id");
    if (!currentTenant) {
      const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (userStr) {
        const u = JSON.parse(userStr);
        currentTenant = u.tenant_id || u.tenant?.id || null;
      }
    }
    if (lastKnownTenant !== null && currentTenant !== lastKnownTenant) {
      forbiddenCache.clear();
      inFlightRequests.clear();
    }
    lastKnownTenant = currentTenant;
  } catch {}
}

/**
 * Extracts a concise, human-readable error message from Axios / FastAPI errors.
 */
export function extractBackendDetail(err: any): string {
  if (!err) return "An unexpected error occurred.";
  if (typeof err === "string") return err;

  const detail = err?.response?.data?.detail ?? err?.detail;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item: any) => {
        if (typeof item === "string") return item;
        const loc = Array.isArray(item.loc)
          ? item.loc.filter((l: any) => l !== "body").join(".")
          : "";
        const msg = item.msg || item.message || "Invalid value";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join("; ");
  }

  if (detail && typeof detail === "object") {
    return detail.message || detail.error || JSON.stringify(detail);
  }

  const message = err?.response?.data?.message || err?.message;
  if (message) return message;

  return "Request failed.";
}

/**
 * Categorizes a 403 error message into an actionable reason code.
 */
export function classifyForbiddenReason(message: string): "industry_mismatch" | "permission_denied" | "module_disabled" | "unknown" {
  const lower = message.toLowerCase();
  if (lower.includes("software services") || lower.includes("industry") || lower.includes("company not found")) {
    return "industry_mismatch";
  }
  if (lower.includes("permission") || lower.includes("privilege") || lower.includes("not allowed")) {
    return "permission_denied";
  }
  if (lower.includes("disabled") || lower.includes("module not enabled") || lower.includes("not enabled")) {
    return "module_disabled";
  }
  return "unknown";
}

/**
 * Checks if a specific software module endpoint has previously returned 403 in the current session.
 */
export function isSoftwareEndpointForbidden(moduleKey: string): boolean {
  checkTenantContext();
  const cached = forbiddenCache.get(moduleKey);
  if (!cached) return false;
  if (Date.now() - cached.timestamp > FORBIDDEN_CACHE_TTL_MS) {
    forbiddenCache.delete(moduleKey);
    return false;
  }
  return true;
}

/**
 * Gets the cached 403 error detail for a module, if any.
 */
export function getSoftwareForbiddenState(moduleKey: string): ForbiddenState | null {
  checkTenantContext();
  const cached = forbiddenCache.get(moduleKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > FORBIDDEN_CACHE_TTL_MS) {
    forbiddenCache.delete(moduleKey);
    return null;
  }
  return cached;
}

/**
 * Records a 403 Forbidden state for a module to avoid redundant server hammering.
 */
export function recordSoftwareForbidden(moduleKey: string, err: any): ForbiddenState {
  checkTenantContext();
  const message = extractBackendDetail(err) || "Access restricted: 403 Forbidden";
  const reason = classifyForbiddenReason(message);
  const state: ForbiddenState = {
    isForbidden: true,
    message,
    statusCode: 403,
    timestamp: Date.now(),
    reason,
  };
  forbiddenCache.set(moduleKey, state);
  return state;
}

/**
 * Clears the 403 Forbidden state for a module or all modules, allowing fresh requests.
 * Also invalidates related in-flight requests.
 */
export function clearSoftwareForbidden(moduleKey?: string): void {
  if (moduleKey) {
    forbiddenCache.delete(moduleKey);
    for (const key of Array.from(inFlightRequests.keys())) {
      if (
        key.includes(moduleKey) ||
        (moduleKey === "software_requirements" && (key.includes("reqs:") || key.includes("req:"))) ||
        (moduleKey === "software_estimates" && (key.includes("estimates:") || key.includes("est:"))) ||
        (moduleKey === "software_contracts" && (key.includes("contracts:") || key.includes("contract:"))) ||
        (moduleKey === "software_projects" && (key.includes("projects:") || key.includes("proj:"))) ||
        (moduleKey === "software_sprints" && (key.includes("sprints:") || key.includes("sprint:")))
      ) {
        inFlightRequests.delete(key);
      }
    }
  } else {
    forbiddenCache.clear();
    inFlightRequests.clear();
  }
}

/**
 * Broadcasts an event when any software domain data is created, updated or deleted.
 * Clears related in-flight requests and 403 caches, notifying listening dashboards.
 */
export function notifySoftwareDataChanged(moduleKey?: string): void {
  clearSoftwareForbidden(moduleKey);
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("scuilone:software_data_changed", {
          detail: { moduleKey, timestamp: Date.now() },
        })
      );
    }
  } catch {}
}

export interface SoftwareRequestOptions {
  signal?: AbortSignal;
  forceRetry?: boolean;
}

/**
 * Wraps an asynchronous API call with:
 * 1. 403 Forbidden caching with short TTL and explicit invalidation
 * 2. In-flight request deduplication for identical concurrent queries
 * 3. Graceful AbortSignal handling without contaminating other callers
 */
export async function executeSoftwareRequest<T>(
  moduleKey: string,
  requestKey: string,
  fetcher: () => Promise<T>,
  options?: SoftwareRequestOptions
): Promise<T> {
  checkTenantContext();

  // If forcing retry, clear any cached 403 and existing in-flight promise
  if (options?.forceRetry) {
    forbiddenCache.delete(moduleKey);
    inFlightRequests.delete(requestKey);
  } else {
    // Check if previously marked 403 within TTL
    const cachedForbidden = forbiddenCache.get(moduleKey);
    if (cachedForbidden) {
      if (Date.now() - cachedForbidden.timestamp < FORBIDDEN_CACHE_TTL_MS) {
        const forbiddenError: any = new Error(cachedForbidden.message);
        forbiddenError.response = { status: 403, data: { detail: cachedForbidden.message } };
        forbiddenError.isCachedForbidden = true;
        forbiddenError.reason = cachedForbidden.reason;
        return Promise.reject(forbiddenError);
      } else {
        forbiddenCache.delete(moduleKey);
      }
    }

    // Deduplicate identical in-flight requests
    const existingPromise = inFlightRequests.get(requestKey);
    if (existingPromise) {
      return existingPromise as Promise<T>;
    }
  }

  const promise = (async () => {
    try {
      const result = await fetcher();
      // On success, clear any forbidden state for this module
      forbiddenCache.delete(moduleKey);
      return result;
    } catch (err: any) {
      // Check if response is 403 Forbidden
      if (err?.response?.status === 403) {
        recordSoftwareForbidden(moduleKey, err);
      }
      throw err;
    } finally {
      inFlightRequests.delete(requestKey);
    }
  })();

  inFlightRequests.set(requestKey, promise);
  return promise;
}
