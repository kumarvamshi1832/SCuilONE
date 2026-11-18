import { JOURNEY_FILE_EXTENSIONS, JOURNEY_FILE_MAX_BYTES } from "../services/customerPortalJourneyService";

/**
 * Client-side checks for booking journey uploads (signed agreement, payment proof). They mirror the
 * backend rules (PDF/JPG/JPEG/PNG, non-empty, max 5 MB, matching file signature) so obvious problems
 * are reported before any request is sent. The backend still performs the authoritative validation.
 */

const ACCEPTED_MIME_BY_EXTENSION: Record<string, string[]> = {
  ".pdf": ["application/pdf", "application/x-pdf"],
  ".jpg": ["image/jpeg", "image/pjpeg"],
  ".jpeg": ["image/jpeg", "image/pjpeg"],
  ".png": ["image/png"],
};

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
};

export const formatFileSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Synchronous checks: extension, MIME type, empty file, size. Returns an error message or null. */
export const validateJourneyFileBasics = (file: File | null | undefined): string | null => {
  if (!file) return "Choose a file to upload first.";
  const extension = extensionOf(file.name);
  if (!JOURNEY_FILE_EXTENSIONS.includes(extension)) {
    return "Unsupported file type. Only PDF, JPG, JPEG and PNG files are accepted.";
  }
  // Some systems report no MIME type; the extension and signature checks still apply in that case.
  const mime = (file.type || "").toLowerCase();
  if (mime && !(ACCEPTED_MIME_BY_EXTENSION[extension] ?? []).includes(mime)) {
    return `The file type (${file.type}) does not match its ${extension} extension. Choose a valid PDF, JPG or PNG file.`;
  }
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > JOURNEY_FILE_MAX_BYTES) {
    return `File is too large (${formatFileSize(file.size)}). The maximum size is 5 MB.`;
  }
  return null;
};

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
  bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);

/** Basics plus a file-signature check, which the backend also enforces ("Invalid PDF file." etc.). */
export const validateJourneyFile = async (file: File | null | undefined): Promise<string | null> => {
  const basic = validateJourneyFileBasics(file);
  if (basic || !file) return basic;
  try {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const extension = extensionOf(file.name);
    if (extension === ".pdf" && !startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
      return "This file is not a valid PDF. Choose another file.";
    }
    if ((extension === ".jpg" || extension === ".jpeg") && !startsWith(head, [0xff, 0xd8, 0xff])) {
      return "This file is not a valid JPEG image. Choose another file.";
    }
    if (extension === ".png" && !startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      return "This file is not a valid PNG image. Choose another file.";
    }
  } catch {
    return "The selected file could not be read. Choose it again and retry.";
  }
  return null;
};

/* ─── Technical trace: what the browser actually sent / received (token never included) ─── */

export interface JourneyUploadTraceContext {
  requestId: string;
  purpose: string;
  file: File;
  /** Customer portal access token, used ONLY to report non-secret claims; it is never printed. */
  accessToken?: string | null;
}

const decodeTokenClaims = (token: string | null | undefined): Record<string, unknown> => {
  if (!token) return { present: false };
  try {
    const part = token.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const claims = JSON.parse(json) as Record<string, unknown>;
    const exp = typeof claims.exp === "number" ? claims.exp : null;
    const iat = typeof claims.iat === "number" ? claims.iat : null;
    return {
      present: true,
      length: token.length,
      type: claims.type ?? claims.token_type,
      role: claims.role,
      sub: claims.sub,
      tenant_id: claims.tenant_id,
      issuedAt: iat ? new Date(iat * 1000).toISOString() : undefined,
      expiresAt: exp ? new Date(exp * 1000).toISOString() : undefined,
      expired: exp ? exp * 1000 < Date.now() : undefined,
    };
  } catch {
    return { present: true, length: token.length, note: "not a decodable JWT" };
  }
};

const headerValue = (headers: unknown, name: string): string | undefined => {
  const h = headers as { get?: (n: string) => unknown } & Record<string, unknown>;
  const v = typeof h?.get === "function" ? h.get(name) : h?.[name];
  return v == null ? undefined : String(v);
};

/**
 * Builds a plain-text/JSON report of the failed upload for comparison with a working Swagger request:
 * resolved URL, request id, form fields, file metadata, redacted headers, token claims, response status,
 * server/correlation headers and the response body.
 */
export const buildJourneyUploadTrace = (err: unknown, ctx: JourneyUploadTraceContext): string => {
  const e = err as {
    config?: { baseURL?: string; url?: string; method?: string; headers?: unknown; _retry?: boolean };
    response?: { status?: number; statusText?: string; headers?: unknown; data?: unknown };
    code?: string;
    message?: string;
  };
  const cfg = e?.config;
  const base = cfg?.baseURL ?? "";
  const path = cfg?.url ?? "";
  let resolvedUrl = path;
  try {
    resolvedUrl = new URL(`${base}${path}`, window.location.origin).toString();
  } catch {
    /* keep raw */
  }
  const sent = (cfg?.headers ?? {}) as Record<string, unknown>;
  const authHeader = headerValue(sent, "Authorization");
  const trace = {
    capturedAt: new Date().toISOString(),
    pageOrigin: window.location.origin,
    request: {
      method: (cfg?.method ?? "post").toUpperCase(),
      resolvedUrl,
      baseURL: base || "(empty - same origin, goes through the dev proxy)",
      requestIdInUrl: ctx.requestId,
      requestIdMatchesUrl: path.includes(ctx.requestId),
      retriedAfterTokenRefresh: Boolean(cfg?._retry),
      formFields: {
        file: { name: ctx.file.name, type: ctx.file.type || "(empty)", sizeBytes: ctx.file.size },
        purpose: ctx.purpose,
      },
      headersConfigured: {
        Accept: headerValue(sent, "Accept"),
        "Content-Type (before browser adds boundary)": headerValue(sent, "Content-Type") ?? "(unset - browser sets multipart boundary)",
        Authorization: authHeader ? `${authHeader.split(" ")[0]} <redacted, ${authHeader.length - 7} chars>` : "(missing)",
      },
      portalTokenClaims: decodeTokenClaims(ctx.accessToken),
    },
    response: e?.response
      ? {
          status: e.response.status,
          statusText: e.response.statusText,
          server: headerValue(e.response.headers, "server"),
          contentType: headerValue(e.response.headers, "content-type"),
          correlationId: headerValue(e.response.headers, "x-correlation-id"),
          responseTimeMs: headerValue(e.response.headers, "x-response-time-ms"),
          body: e.response.data,
        }
      : { error: e?.code ?? e?.message ?? "no response received" },
    swaggerEquivalent:
      `curl -X POST "${resolvedUrl}" -H "Authorization: Bearer <PORTAL_TOKEN>" ` +
      `-F "file=@${ctx.file.name};type=${ctx.file.type || "application/pdf"}" -F "purpose=${ctx.purpose}"`,
  };
  return JSON.stringify(trace, null, 2);
};

export interface JourneyUploadError {
  /** Message shown to the customer. */
  message: string;
  /** Short technical line: endpoint, HTTP status and the safe backend message. */
  diagnostic: string;
}

const safeDetail = (data: unknown): string => {
  const detail = (data as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "string") return detail.slice(0, 300);
  if (Array.isArray(detail)) {
    return detail
      .map((d: { msg?: string; loc?: unknown[] }) => {
        const field = Array.isArray(d?.loc) ? String(d.loc[d.loc.length - 1] ?? "") : "";
        return [field && field !== "body" ? field : "", d?.msg].filter(Boolean).join(": ");
      })
      .filter(Boolean)
      .join("; ")
      .slice(0, 300);
  }
  return "";
};

/**
 * Turns an Axios error from the upload call into a specific message. Only the endpoint, status and the
 * backend's own `detail` text are surfaced - never request headers, so no access token can leak.
 */
export const describeJourneyUploadError = (err: unknown, endpoint: string): JourneyUploadError => {
  const e = err as { response?: { status?: number; data?: unknown; headers?: unknown }; code?: string };
  const status = e?.response?.status;
  const detail = safeDetail(e?.response?.data);
  const correlationId = headerValue(e?.response?.headers, "x-correlation-id");
  const diagnostic =
    `${endpoint} · ${status ? `HTTP ${status}` : "no response"}${detail ? ` · ${detail}` : ""}` +
    (correlationId ? ` · correlation id ${correlationId}` : "");

  if (!e?.response) {
    return {
      message: "Could not reach the server, so the file was not uploaded. Check your connection and retry.",
      diagnostic,
    };
  }

  let message: string;
  switch (status) {
    case 400:
      message = detail || "The server rejected this file as invalid. Check that it is a real PDF, JPG or PNG.";
      break;
    case 401:
      message = "Your session has expired. Please sign in again to upload your document.";
      break;
    case 403:
      message = detail || "You do not have permission to upload to this booking request.";
      break;
    case 404:
      message = detail || "This booking request or its agreement could not be found.";
      break;
    case 409:
      message = detail || "The agreement is not in a state that accepts an upload right now.";
      break;
    case 413:
      message = detail || "The file is too large. The maximum size is 5 MB.";
      break;
    case 415:
      message = detail || "This file type is not supported. Upload a PDF, JPG or PNG.";
      break;
    case 422:
      message = detail
        ? `The upload request was not accepted: ${detail}`
        : "The upload request was not accepted (invalid file or form field).";
      break;
    case 502:
    case 503:
    case 504:
      message = `${detail || "The server could not store the file."} Your file is still selected - you can retry. If this keeps happening, contact support and quote: ${diagnostic}`;
      break;
    default:
      message =
        status && status >= 500
          ? `The server hit an error while storing the file. Please retry, or contact support and quote: ${diagnostic}`
          : detail || "The upload failed. Please retry.";
  }
  return { message, diagnostic };
};
