/**
 * Extracts a human-readable message from an Axios/FastAPI error.
 * Handles string `detail`, FastAPI 422 validation arrays, and network failures.
 */
export function getApiErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const e = err as {
    response?: { status?: number; data?: { detail?: unknown; message?: unknown } };
    message?: string;
  };
  const data = e?.response?.data;
  const detail = data?.detail;

  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail
      .map((d: { msg?: string; loc?: unknown[] }) => {
        if (!d?.msg) return "";
        const field = Array.isArray(d.loc) ? String(d.loc[d.loc.length - 1] ?? "") : "";
        const msg = d.msg.replace(/^Value error,\s*/i, "");
        return field && field !== "body" ? `${field.replace(/_/g, " ")}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }

  if (detail && typeof detail === "object" && typeof (detail as { message?: unknown }).message === "string") {
    return (detail as { message: string }).message;
  }
  if (typeof data?.message === "string" && data.message.trim()) return data.message;

  if (!e?.response) return "Unable to reach the server. Please check your connection and try again.";
  if (e.response.status === 429) return "Too many requests. Please wait a minute and try again.";
  if (e.response.status === 403) return "You do not have permission to perform this action.";
  if (e.response.status === 404) return "The requested record could not be found.";
  return fallback;
}

/** Backwards-compatible alias used by the customer portal pages. */
export const getPortalErrorMessage = getApiErrorMessage;
