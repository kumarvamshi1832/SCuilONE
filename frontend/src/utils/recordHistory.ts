import { formatBookingDateTime, parseBackendDate } from "./bookingJourney";

/** Readable labels for the fields that appear in site visit and buyer requirement history snapshots. */
const FIELD_LABELS: Record<string, string> = {
  assigned_to: "Assigned to",
  scheduled_start: "Visit start",
  scheduled_end: "Visit end",
  status: "Status",
  outcome: "Outcome",
  buyer_feedback: "Buyer feedback",
  interest_level: "Interest level",
  follow_up_required: "Follow-up required",
  follow_up_date: "Follow-up date",
  cancellation_reason: "Cancellation reason",
  lead_id: "Linked lead",
  contact_id: "Linked contact",
  requirement_type: "Requirement type",
  property_type: "Property type",
  preferred_city: "Preferred city",
  preferred_location: "Preferred location",
  min_budget: "Minimum budget",
  max_budget: "Maximum budget",
  bedrooms: "Bedrooms",
  min_area: "Minimum area",
  max_area: "Maximum area",
  area_unit: "Area unit",
  notes: "Notes",
};

/** Technical keys that are never useful in a change list. */
const HIDDEN_KEYS = new Set(["id", "tenant_id", "created_by", "created_at", "updated_at", "property_match_id"]);

const DATE_KEYS = new Set(["scheduled_start", "scheduled_end", "follow_up_date"]);
const MONEY_KEYS = new Set(["min_budget", "max_budget"]);
const USER_KEYS = new Set(["assigned_to"]);
const LINK_KEYS = new Set(["lead_id", "contact_id"]);

export type UserNameResolver = (userId: string | null | undefined) => string | null;

export interface FieldChange {
  key: string;
  label: string;
  from: string;
  to: string;
}

export const fieldLabel = (key: string): string =>
  FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const formatMoney = (value: unknown): string => {
  const n = Number(value);
  return Number.isFinite(n) ? `₹ ${n.toLocaleString("en-IN")}` : String(value);
};

/** Human-readable form of one stored value. */
export const describeValue = (key: string, value: unknown, resolveUser?: UserNameResolver): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (DATE_KEYS.has(key)) {
    const d = parseBackendDate(String(value));
    return d ? formatBookingDateTime(String(value)) : String(value);
  }
  if (MONEY_KEYS.has(key)) return formatMoney(value);
  if (USER_KEYS.has(key)) return resolveUser?.(String(value)) ?? "A team member";
  if (LINK_KEYS.has(key)) return "Linked";
  return String(value);
};

const sameValue = (a: unknown, b: unknown): boolean => {
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  if (empty(a) && empty(b)) return true;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

/** Fields whose value differs between two snapshots. */
export const diffRecords = (
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  resolveUser?: UserNameResolver
): FieldChange[] => {
  const prev = before ?? {};
  const next = after ?? {};
  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)])).filter((k) => !HIDDEN_KEYS.has(k));
  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (sameValue(prev[key], next[key])) continue;
    changes.push({
      key,
      label: fieldLabel(key),
      from: describeValue(key, prev[key], resolveUser),
      to: describeValue(key, next[key], resolveUser),
    });
  }
  return changes;
};
