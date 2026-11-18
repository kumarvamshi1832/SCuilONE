/**
 * Presentation + client-side validation metadata for platform settings.
 *
 * IMPORTANT: this file never supplies setting VALUES. Every value shown in the UI comes from the
 * existing `GET /platform/settings` response. The metadata below only describes how to label and
 * validate keys that the API already returns (labels, input kind, allowed ranges). The backend
 * remains the authority and re-validates every save.
 *
 * Keys that appear in an API response but are not described here are still rendered (inferred from
 * their value type) and are always preserved on save.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type FieldKind = "text" | "email" | "number" | "toggle" | "select" | "secret";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldMeta {
  label?: string;
  description?: string;
  kind?: FieldKind;
  /** Section heading this field is grouped under inside its card. */
  section?: string;
  unit?: string;
  placeholder?: string;
  options?: SelectOption[];
  /** Fetch options lazily (e.g. time zones) — the current value is always added if missing. */
  optionsFactory?: () => SelectOption[];
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  minLength?: number;
  maxLength?: number;
  /** Metadata for keys of a nested object. */
  children?: Record<string, FieldMeta>;
}

export interface SectionMeta {
  title: string;
  description?: string;
}

export interface GroupMeta {
  title: string;
  description: string;
  icon: "general" | "security" | "routing" | "generic";
  sections?: Record<string, SectionMeta>;
  fields: Record<string, FieldMeta>;
}

/* ------------------------------------------------------------------ */
/* Option lists                                                        */
/* ------------------------------------------------------------------ */

// Mirrors the currency whitelist enforced by backend/app/services/platform_config.py (read-only reference).
const CURRENCY_LABELS: Record<string, string> = {
  INR: "Indian Rupee",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  AED: "UAE Dirham",
  CAD: "Canadian Dollar",
  AUD: "Australian Dollar",
  SGD: "Singapore Dollar",
  JPY: "Japanese Yen",
};

export const currencyOptions = (): SelectOption[] =>
  Object.entries(CURRENCY_LABELS).map(([code, name]) => ({
    value: code,
    label: `${code} — ${name}`,
  }));

const FALLBACK_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export const timezoneOptions = (): SelectOption[] => {
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    zones = intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : [];
  } catch {
    zones = [];
  }
  const merged = Array.from(new Set([...FALLBACK_TIMEZONES, ...zones])).sort((a, b) =>
    a.localeCompare(b)
  );
  return merged.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }));
};

/* ------------------------------------------------------------------ */
/* Known groups (labels / controls / backend-documented ranges)        */
/* ------------------------------------------------------------------ */

export const SETTING_GROUPS: Record<string, GroupMeta> = {
  "platform.general": {
    title: "General Settings",
    description: "Platform identity, support contact and regional defaults.",
    icon: "general",
    sections: {
      identity: {
        title: "Identity",
        description: "How the platform and company are presented to users.",
      },
      regional: {
        title: "Regional defaults",
        description: "Defaults applied across the platform.",
      },
    },
    fields: {
      company_name: {
        label: "Company Name",
        description: "Legal name of the company operating the platform.",
        kind: "text",
        section: "identity",
        required: true,
        minLength: 2,
        maxLength: 150,
      },
      platform_name: {
        label: "Platform Name",
        description: "Product name shown in the interface.",
        kind: "text",
        section: "identity",
        required: true,
        minLength: 2,
        maxLength: 150,
      },
      support_email: {
        label: "Support Email",
        description: "Address customers and tenants contact for help.",
        kind: "email",
        section: "identity",
        required: true,
        placeholder: "support@example.com",
      },
      default_currency: {
        label: "Default Currency",
        description: "Currency used when none is specified.",
        kind: "select",
        section: "regional",
        required: true,
        optionsFactory: currencyOptions,
      },
      default_timezone: {
        label: "Default Time Zone",
        description: "IANA time zone used for scheduling and reports.",
        kind: "select",
        section: "regional",
        required: true,
        optionsFactory: timezoneOptions,
      },
    },
  },
  "platform.security_policy": {
    title: "Security Policy",
    description: "Authentication and access rules enforced across the platform.",
    icon: "security",
    sections: {
      credentials: {
        title: "Passwords & sessions",
        description: "Limits applied to credentials and sign-in sessions.",
      },
      access: {
        title: "Access controls",
        description: "Additional safeguards for platform accounts.",
      },
    },
    fields: {
      min_password_length: {
        label: "Minimum Password Length",
        description: "Shortest password accepted when creating or changing a password.",
        kind: "number",
        section: "credentials",
        unit: "characters",
        required: true,
        integer: true,
        min: 15,
        max: 128,
      },
      session_timeout_minutes: {
        label: "Session Timeout",
        description: "How long a sign-in session stays valid.",
        kind: "number",
        section: "credentials",
        unit: "minutes",
        required: true,
        integer: true,
        min: 5,
        max: 10080,
      },
      max_failed_login_attempts: {
        label: "Maximum Failed Login Attempts",
        description: "Failed attempts allowed before an account is locked.",
        kind: "number",
        section: "credentials",
        unit: "attempts",
        required: true,
        integer: true,
        min: 3,
        max: 20,
      },
      mfa_required_for_platform_roles: {
        label: "MFA Required for Platform Roles",
        description: "Require multi-factor authentication for every platform role.",
        kind: "toggle",
        section: "access",
      },
      force_password_change_on_first_login: {
        label: "Force Password Change on First Login",
        description: "Users must set a new password the first time they sign in.",
        kind: "toggle",
        section: "access",
      },
    },
  },
  "platform.ticket_routing": {
    title: "Ticket Routing",
    description: "How support tickets are assigned and the default SLA targets.",
    icon: "routing",
    sections: {
      routing: {
        title: "Routing rules",
        description: "Controls how incoming tickets are matched to support teams.",
      },
      sla: {
        title: "SLA defaults",
        description: "Targets applied to tickets without a more specific SLA.",
      },
    },
    fields: {
      route_by_industry_first: {
        label: "Route by Industry First",
        description: "Match tickets to the tenant's industry team before anything else.",
        kind: "toggle",
        section: "routing",
      },
      route_by_issue_type_second: {
        label: "Route by Issue Type",
        description: "After industry, match tickets using the issue type.",
        kind: "toggle",
        section: "routing",
      },
      auto_assign_least_loaded: {
        label: "Auto Assign Least Loaded",
        description: "Assign to the available agent with the fewest open tickets.",
        kind: "toggle",
        section: "routing",
      },
      default_sla_response_minutes: {
        label: "Default SLA Response Time",
        description: "Target time to the first response.",
        kind: "number",
        section: "sla",
        unit: "minutes",
        required: true,
        integer: true,
        min: 1,
        max: 10080,
      },
      default_sla_resolution_hours: {
        label: "Default SLA Resolution Time",
        description: "Target time to resolve a ticket.",
        kind: "number",
        section: "sla",
        unit: "hours",
        required: true,
        integer: true,
        min: 1,
        max: 720,
      },
    },
  },
};

/** Display order for known groups; unknown keys follow in API order. */
export const GROUP_ORDER = [
  "platform.general",
  "platform.security_policy",
  "platform.ticket_routing",
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const ACRONYMS = new Set(["sla", "mfa", "id", "url", "api", "ip", "sso", "smtp", "otp", "ui", "sms"]);

export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[._\-\s]+/)
    .filter(Boolean);
  return words
    .map((word) =>
      ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

const SECRET_KEY = /(secret|token|api_?key|private_?key|credential|passphrase|password$|passwd$)/i;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Decide the control for a leaf value, preferring explicit metadata. */
export function resolveKind(key: string, value: JsonValue, meta?: FieldMeta): FieldKind {
  if (meta?.kind) return meta.kind;
  if (typeof value === "boolean") return "toggle";
  if (typeof value === "number") return "number";
  if (typeof value === "string" && SECRET_KEY.test(key)) return "secret";
  return "text";
}

export function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, idx) => deepEqual(item, b[idx]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    );
  }
  return false;
}

/** Immutable set of a value at a path inside a JSON object. */
export function setAtPath(root: JsonObject, path: (string | number)[], next: JsonValue): JsonObject {
  const write = (node: JsonValue | undefined, depth: number): JsonValue => {
    if (depth === path.length) return next;
    const seg = path[depth];
    if (Array.isArray(node)) {
      const copy = node.slice();
      copy[seg as number] = write(copy[seg as number], depth + 1);
      return copy;
    }
    const obj = isObject(node) ? { ...node } : {};
    obj[seg as string] = write(obj[seg as string], depth + 1);
    return obj;
  };
  return write(root, 0) as JsonObject;
}

export const pathId = (path: (string | number)[]) => path.join(".");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Number inputs hold `""` while empty/unparseable so the original numeric type survives a save. */
export type NumberDraft = number | "";

/* ------------------------------------------------------------------ */
/* Validation + payload reconstruction                                 */
/* ------------------------------------------------------------------ */

export function validateSettings(
  draft: JsonObject,
  fields: Record<string, FieldMeta>
): Record<string, string> {
  const errors: Record<string, string> = {};

  const visit = (
    value: JsonValue,
    key: string,
    path: (string | number)[],
    meta: FieldMeta | undefined
  ) => {
    const id = pathId(path);
    if (Array.isArray(value)) {
      value.forEach((item, idx) => visit(item, key, [...path, idx], meta));
      return;
    }
    if (isObject(value)) {
      Object.entries(value).forEach(([k, v]) =>
        visit(v, k, [...path, k], meta?.children?.[k])
      );
      return;
    }
    const kind = resolveKind(key, value, meta);
    const label = meta?.label || humanizeKey(key);

    if (kind === "toggle") {
      if (typeof value !== "boolean") errors[id] = `${label} must be on or off.`;
      return;
    }
    if (kind === "number") {
      if (value === "" || value === null || typeof value !== "number" || !Number.isFinite(value)) {
        if (meta?.required !== false) errors[id] = `${label} is required and must be a number.`;
        return;
      }
      if (meta?.integer && !Number.isInteger(value)) {
        errors[id] = `${label} must be a whole number.`;
      } else if (meta?.min !== undefined && value < meta.min) {
        errors[id] = `${label} must be at least ${meta.min}.`;
      } else if (meta?.max !== undefined && value > meta.max) {
        errors[id] = `${label} must be at most ${meta.max}.`;
      }
      return;
    }
    // text-like
    const text = typeof value === "string" ? value : value === null ? "" : String(value);
    const trimmed = text.trim();
    if (meta?.required && !trimmed) {
      errors[id] = `${label} is required.`;
      return;
    }
    if (!trimmed) return;
    if (kind === "email" && !EMAIL_RE.test(trimmed)) {
      errors[id] = `${label} must be a valid email address.`;
    } else if (meta?.minLength !== undefined && trimmed.length < meta.minLength) {
      errors[id] = `${label} must be at least ${meta.minLength} characters.`;
    } else if (meta?.maxLength !== undefined && trimmed.length > meta.maxLength) {
      errors[id] = `${label} must be at most ${meta.maxLength} characters.`;
    }
  };

  Object.entries(draft).forEach(([k, v]) => visit(v, k, [k], fields[k]));
  return errors;
}

/**
 * Rebuild the object sent to the API. The draft starts as a full clone of the server value, so
 * unknown keys / nested objects / arrays are carried through untouched. Only fields that the form
 * explicitly edits as text/email are trimmed.
 */
export function buildPayload(
  draft: JsonObject,
  baseline: JsonObject,
  fields: Record<string, FieldMeta>
): JsonObject {
  const walk = (
    value: JsonValue,
    original: JsonValue | undefined,
    key: string,
    meta: FieldMeta | undefined
  ): JsonValue => {
    if (Array.isArray(value)) {
      return value.map((item, idx) =>
        walk(item, Array.isArray(original) ? original[idx] : undefined, key, meta)
      );
    }
    if (isObject(value)) {
      const out: JsonObject = {};
      Object.entries(value).forEach(([k, v]) => {
        out[k] = walk(v, isObject(original) ? original[k] : undefined, k, meta?.children?.[k]);
      });
      return out;
    }
    const kind = resolveKind(key, value, meta);
    if (kind === "text" || kind === "email") {
      if (typeof value === "string") {
        // Only touch strings the form edits explicitly; unknown free-text keys keep their exact value.
        const trimmed = meta ? value.trim() : value;
        // A value that was null and is still blank stays null.
        return original === null && trimmed === "" ? null : trimmed;
      }
    }
    return value;
  };

  const out: JsonObject = {};
  Object.entries(draft).forEach(([k, v]) => {
    out[k] = walk(v, baseline[k], k, fields[k]);
  });
  return out;
}
