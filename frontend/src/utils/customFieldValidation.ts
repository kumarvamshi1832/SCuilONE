import { CUSTOM_FIELD_LIMITS } from "../types/customField";
import type { CustomFieldDefinition, CustomFieldErrors } from "../types/customField";

/**
 * Client-side mirror of validate_value() in backend/app/services/custom_fields.py. It only exists to give
 * immediate feedback - the backend validates again and its messages win.
 *
 * Draft values (what the inputs hold): text-like and number fields hold strings, booleans hold
 * true / false / "" (unset), multiselect holds string[].
 */

export type CustomFieldDraft = Record<string, unknown>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\/\S+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isEmptyValue = (value: unknown): boolean =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

/** Converts a stored (JSON) value into what the input control holds. */
export const toDraftValue = (def: CustomFieldDefinition, stored: unknown): unknown => {
  if (isEmptyValue(stored)) return def.field_type === "multiselect" ? [] : "";
  if (def.field_type === "number") return String(stored);
  if (def.field_type === "multiselect") return Array.isArray(stored) ? stored.map(String) : [];
  if (def.field_type === "boolean") return stored === true || stored === "true" ? true : stored === false || stored === "false" ? false : "";
  return typeof stored === "string" ? stored : String(stored);
};

const isRealDate = (text: string): boolean => {
  if (!DATE_RE.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** Returns the value to send for a draft (null clears the field) or an error message. */
export const normalizeDraftValue = (
  def: CustomFieldDefinition,
  draft: unknown
): { value: unknown; error: null } | { value: null; error: string } => {
  if (isEmptyValue(draft)) return { value: null, error: null };
  switch (def.field_type) {
    case "text":
    case "textarea": {
      const text = String(draft).trim();
      if (!text) return { value: null, error: null };
      const max = def.field_type === "textarea" ? CUSTOM_FIELD_LIMITS.textareaMax : CUSTOM_FIELD_LIMITS.textMax;
      return text.length > max ? { value: null, error: `Use at most ${max} characters.` } : { value: text, error: null };
    }
    case "number": {
      const text = String(draft).trim();
      if (!text) return { value: null, error: null };
      const number = Number(text);
      if (!Number.isFinite(number)) return { value: null, error: "Enter a valid number." };
      if (Math.abs(number) > 1e15) return { value: null, error: "The number is out of range." };
      return { value: number, error: null };
    }
    case "date": {
      const text = String(draft).trim();
      return isRealDate(text) ? { value: text, error: null } : { value: null, error: "Enter a valid date." };
    }
    case "boolean":
      return draft === true || draft === false ? { value: draft, error: null } : { value: null, error: null };
    case "select": {
      const text = String(draft);
      return (def.options ?? []).includes(text)
        ? { value: text, error: null }
        : { value: null, error: "Choose one of the listed options." };
    }
    case "multiselect": {
      const list = Array.isArray(draft) ? draft.map(String) : [];
      const bad = list.filter((v) => !(def.options ?? []).includes(v));
      return bad.length > 0
        ? { value: null, error: "Choose only the listed options." }
        : { value: Array.from(new Set(list)), error: null };
    }
    case "email": {
      const text = String(draft).trim();
      return EMAIL_RE.test(text) && text.length <= 255
        ? { value: text, error: null }
        : { value: null, error: "Enter a valid email address." };
    }
    case "url": {
      const text = String(draft).trim();
      return URL_RE.test(text) && text.length <= CUSTOM_FIELD_LIMITS.urlMax
        ? { value: text, error: null }
        : { value: null, error: "Enter a valid http(s) URL." };
    }
    default:
      return { value: null, error: "Unsupported field type." };
  }
};

/** Validates every field of a draft. Required fields must be filled. */
export const validateDraft = (
  defs: CustomFieldDefinition[],
  draft: CustomFieldDraft
): { errors: CustomFieldErrors; values: Record<string, unknown> } => {
  const errors: CustomFieldErrors = {};
  const values: Record<string, unknown> = {};
  defs.forEach((def) => {
    const result = normalizeDraftValue(def, draft[def.field_key]);
    if (result.error) {
      errors[def.field_key] = result.error;
      return;
    }
    if (def.is_required && result.value === null) {
      errors[def.field_key] = "This field is required.";
      return;
    }
    values[def.field_key] = result.value;
  });
  return { errors, values };
};

/** Human-readable value for display mode. */
export const formatStoredValue = (def: CustomFieldDefinition, stored: unknown): string => {
  if (isEmptyValue(stored)) return "";
  if (def.field_type === "boolean") return stored === true || stored === "true" ? "Yes" : "No";
  if (def.field_type === "multiselect" && Array.isArray(stored)) return stored.join(", ");
  if (def.field_type === "date" && typeof stored === "string" && isRealDate(stored)) {
    const [y, m, d] = stored.split("-").map(Number) as [number, number, number];
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }
  return String(stored);
};

/** Only http(s) URLs are turned into links. */
export const isSafeHttpUrl = (value: unknown): value is string => typeof value === "string" && URL_RE.test(value);
