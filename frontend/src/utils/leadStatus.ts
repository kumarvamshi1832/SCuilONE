/**
 * Lead status display helpers.
 *
 * The backend (and stored lead records, filters, import/export and automations) use the
 * internal status value "Converted". The UI shows that status to users as "Won".
 *
 * ONLY use `getLeadStatusLabel` for text shown to the user. Never use its result as an
 * <option value>, filter comparison, CSS class key or API payload value.
 */

/** Internal API value that the backend expects. Do not change. */
export const LEAD_STATUS_CONVERTED = "Converted";

/** User-facing label for the internal "Converted" lead status. */
export const LEAD_STATUS_CONVERTED_LABEL = "Won";

/** Returns the user-facing label for an internal lead status value. */
export function getLeadStatusLabel(status?: string | null): string {
  if (!status) return "";
  return status.trim().toLowerCase() === LEAD_STATUS_CONVERTED.toLowerCase()
    ? LEAD_STATUS_CONVERTED_LABEL
    : status;
}