import { apiClient } from "./authService";
import type { TrashEntity, TrashRecord, TrashRestoreResult } from "../types/trash";

/**
 * Trash. Backend: /api/v1/trash (tenant-scoped by the authenticated user).
 *   GET    /{entity}                 permission trash.view
 *   POST   /{entity}/{id}/restore    permission trash.restore
 *   DELETE /{entity}/{id}            permission trash.purge (permanent, 409 if still referenced)
 *
 * Valid entities (backend `Entity` literal): lead | contact | account | deal.
 */

export interface TrashListParams {
  skip?: number;
  limit?: number;
}

let backendTrashAvailable: boolean | null = null;

export const isTrashSupported = (): boolean => backendTrashAvailable !== false;

/**
 * Backend contract (backend/app/routes/trash.py): `skip` >= 0 (default 0), `limit` 1..100 (default 25).
 * The endpoint returns a plain JSON array - there is no `items`/`total` wrapper and no server-side search.
 * Errors are propagated; an API failure is never converted into an empty list.
 */
export const getTrashRecords = async (
  entity: TrashEntity,
  params: TrashListParams = {},
  signal?: AbortSignal
): Promise<TrashRecord[]> => {
  if (backendTrashAvailable === false) {
    return [];
  }
  try {
    const response = await apiClient.get<TrashRecord[] | { items?: TrashRecord[] }>(
      `/api/v1/trash/${entity}`,
      {
        params: {
          skip: Math.max(params.skip ?? 0, 0),
          limit: Math.min(Math.max(params.limit ?? 25, 1), 100),
        },
        signal,
      }
    );
    backendTrashAvailable = true;
    const data = response.data;
    if (Array.isArray(data)) return data;
    // Tolerate a wrapped response, but never hide a genuinely unexpected shape.
    if (data && Array.isArray((data as { items?: TrashRecord[] }).items)) {
      return (data as { items: TrashRecord[] }).items;
    }
    return [];
  } catch (err: any) {
    if (err?.response?.status === 404) {
      backendTrashAvailable = false;
      return [];
    }
    throw err;
  }
};

export const restoreTrashRecord = async (
  entity: TrashEntity,
  recordId: string
): Promise<TrashRestoreResult> => {
  const response = await apiClient.post<TrashRestoreResult>(
    `/api/v1/trash/${entity}/${recordId}/restore`
  );
  return response.data;
};

export const purgeTrashRecord = async (entity: TrashEntity, recordId: string): Promise<void> => {
  await apiClient.delete(`/api/v1/trash/${entity}/${recordId}`);
};

export type TrashAction = "list" | "restore" | "purge";

export const isRequestCanceled = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";
};

export interface TrashErrorInfo {
  /** User-facing message. */
  message: string;
  /** Technical line (method, endpoint and HTTP status) for diagnosing server-side failures. */
  detail: string | null;
}

/** Status-specific (non-generic) error text for every Trash call. */
export const describeTrashError = (
  err: unknown,
  action: TrashAction,
  entity: TrashEntity,
  entityLabel: string
): TrashErrorInfo => {
  const e = err as {
    response?: { status?: number; data?: { detail?: unknown } | string };
    config?: { method?: string; url?: string };
    message?: string;
  };
  const status = e?.response?.status;
  const data = e?.response?.data;
  const detail = typeof data === "object" && data ? data.detail : undefined;
  const serverText = typeof detail === "string" && detail.trim() ? detail.trim() : null;
  const verb = action === "list" ? "load" : action === "restore" ? "restore" : "permanently delete";
  const fallbackMethod = action === "list" ? "get" : action === "restore" ? "post" : "delete";
  const method = (e?.config?.method || fallbackMethod).toUpperCase();
  const url = e?.config?.url || `/api/v1/trash/${entity}`;
  const tech = status ? `${method} ${url} → HTTP ${status}` : `${method} ${url}`;
  const label = entityLabel.toLowerCase();

  if (!e?.response) {
    // Not an HTTP error (e.g. unexpected response shape) or a network failure.
    const isNetwork = (err as { code?: string })?.code === "ERR_NETWORK" || /network/i.test(e?.message || "");
    return {
      message: isNetwork || !e?.message
        ? "Unable to reach the server. Check your connection and try again."
        : e.message,
      detail: tech,
    };
  }

  switch (status) {
    case 401:
      return { message: "Authentication required. Please sign in again.", detail: tech };
    case 403:
      return {
        message: serverText || `You do not have permission to ${verb} deleted ${label}.`,
        detail: tech,
      };
    case 404:
      return {
        message:
          serverText ||
          (action === "list"
            ? `The Trash entity "${entity}" was not found.`
            : "This record is no longer in the Trash. Refresh the list."),
        detail: tech,
      };
    case 409:
      return { message: serverText || "This record is still referenced by other records.", detail: tech };
    case 422:
      return {
        message: `The request was rejected as invalid (entity "${entity}"). ${serverText ?? ""}`.trim(),
        detail: tech,
      };
    default:
      if (status && status >= 500) {
        const extra =
          serverText && !/^internal server error$/i.test(serverText) ? ` ${serverText}` : "";
        return {
          message: `The server failed to ${verb} deleted ${label}.${extra} This is a server-side error.`,
          detail: tech,
        };
      }
      return { message: serverText || `Could not ${verb} deleted ${label}.`, detail: tech };
  }
};
