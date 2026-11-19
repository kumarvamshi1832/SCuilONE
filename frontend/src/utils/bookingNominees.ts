import { NOMINEE_LIMITS } from "../types/bookingNominee";
import type {
  BookingNominee,
  BookingNomineeInput,
  NomineeDraft,
  NomineeErrors,
  NomineeFieldErrors,
} from "../types/bookingNominee";

/**
 * Nominee helpers shared by the staff booking screens and the customer portal.
 * Mirrors validate_nominee_allocations() in backend/app/schemas/booking.py. The backend validates again.
 *
 * Allocation percentages are summed in hundredths (integers), never as floats, so 33.33 + 33.33 + 33.34
 * is exactly 100.00 and 0.1 + 0.2 style drift cannot reject a valid split.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let draftCounter = 0;

export const newNomineeDraft = (): NomineeDraft => ({
  key: `nominee-${Date.now()}-${draftCounter++}`,
  nominee_name: "",
  relationship: "",
  phone: "",
  email: "",
  date_of_birth: "",
  address: "",
  allocation_percentage: "",
  remarks: "",
});

const percentText = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
};

export const draftFromNominee = (nominee: BookingNominee): NomineeDraft => ({
  key: nominee.id || `nominee-${Date.now()}-${draftCounter++}`,
  nominee_name: nominee.nominee_name ?? "",
  relationship: nominee.relationship ?? "",
  phone: nominee.phone ?? "",
  email: nominee.email ?? "",
  date_of_birth: nominee.date_of_birth ? nominee.date_of_birth.slice(0, 10) : "",
  address: nominee.address ?? "",
  allocation_percentage: percentText(nominee.allocation_percentage),
  remarks: nominee.remarks ?? "",
});

/** Parses "33.33" into hundredths (3333). Returns null for anything that is not a number with at most 2 decimals. */
export const percentToHundredths = (text: string): number | null => {
  const trimmed = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};

const hundredthsToText = (value: number): string => (value / 100).toFixed(2).replace(/\.?0+$/, "");

export const totalAllocationText = (drafts: NomineeDraft[]): string => {
  let total = 0;
  drafts.forEach((d) => {
    const h = percentToHundredths(d.allocation_percentage);
    if (h !== null) total += h;
  });
  return hundredthsToText(total) || "0";
};

const isFutureDate = (iso: string): boolean => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getTime() > Date.now();
};

const isRealIsoDate = (iso: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export const validateNominees = (drafts: NomineeDraft[]): NomineeErrors => {
  const rows: Record<string, NomineeFieldErrors> = {};
  let form: string | null = null;

  if (drafts.length > NOMINEE_LIMITS.maxNominees) {
    form = `A booking can have at most ${NOMINEE_LIMITS.maxNominees} nominees.`;
  }

  const withPercent = drafts.filter((d) => d.allocation_percentage.trim() !== "");
  const percentsMixed = withPercent.length > 0 && withPercent.length !== drafts.length;

  drafts.forEach((d) => {
    const e: NomineeFieldErrors = {};
    const name = d.nominee_name.trim();
    const relationship = d.relationship.trim();
    if (name.length < NOMINEE_LIMITS.nameMin) e.nominee_name = `Enter the nominee’s name (at least ${NOMINEE_LIMITS.nameMin} characters).`;
    else if (name.length > NOMINEE_LIMITS.nameMax) e.nominee_name = `At most ${NOMINEE_LIMITS.nameMax} characters.`;
    if (relationship.length < NOMINEE_LIMITS.relationshipMin) e.relationship = "Enter the relationship to the buyer.";
    else if (relationship.length > NOMINEE_LIMITS.relationshipMax) e.relationship = `At most ${NOMINEE_LIMITS.relationshipMax} characters.`;
    if (d.phone.trim().length > NOMINEE_LIMITS.phoneMax) e.phone = `At most ${NOMINEE_LIMITS.phoneMax} characters.`;
    if (d.email.trim() && !EMAIL_RE.test(d.email.trim())) e.email = "Enter a valid email address.";
    if (d.date_of_birth) {
      if (!isRealIsoDate(d.date_of_birth)) e.date_of_birth = "Enter a valid date.";
      else if (isFutureDate(d.date_of_birth)) e.date_of_birth = "Date of birth cannot be in the future.";
    }
    if (d.address.trim().length > NOMINEE_LIMITS.addressMax) e.address = `At most ${NOMINEE_LIMITS.addressMax} characters.`;
    if (d.remarks.trim().length > NOMINEE_LIMITS.remarksMax) e.remarks = `At most ${NOMINEE_LIMITS.remarksMax} characters.`;

    const percent = d.allocation_percentage.trim();
    if (percent !== "") {
      const hundredths = percentToHundredths(percent);
      if (hundredths === null) e.allocation_percentage = "Use a number with up to 2 decimals, e.g. 33.33.";
      else if (hundredths <= 0) e.allocation_percentage = "Must be greater than 0.";
      else if (hundredths > 10000) e.allocation_percentage = "Cannot exceed 100.";
    } else if (percentsMixed) {
      e.allocation_percentage = "Enter a percentage for every nominee, or for none.";
    }
    if (Object.keys(e).length > 0) rows[d.key] = e;
  });

  if (!form && withPercent.length > 0) {
    if (percentsMixed) {
      form = "Provide an allocation percentage for every nominee or for none of them.";
    } else {
      const total = drafts.reduce((sum, d) => sum + (percentToHundredths(d.allocation_percentage) ?? 0), 0);
      const allParsed = drafts.every((d) => percentToHundredths(d.allocation_percentage) !== null);
      if (allParsed && total !== 10000) {
        form = `Allocation percentages must total exactly 100% (currently ${hundredthsToText(total) || "0"}%).`;
      }
    }
  }

  return { rows, form };
};

export const hasNomineeErrors = (errors: NomineeErrors): boolean => Boolean(errors.form) || Object.keys(errors.rows).length > 0;

/** Request body entries. Percentages are sent as fixed 2-decimal strings so no float rounding reaches the API. */
export const nomineePayload = (drafts: NomineeDraft[]): BookingNomineeInput[] =>
  drafts.map((d) => {
    const hundredths = percentToHundredths(d.allocation_percentage);
    return {
      nominee_name: d.nominee_name.trim(),
      relationship: d.relationship.trim(),
      phone: d.phone.trim() || null,
      email: d.email.trim() || null,
      date_of_birth: d.date_of_birth || null,
      address: d.address.trim() || null,
      allocation_percentage: hundredths === null ? null : (hundredths / 100).toFixed(2),
      remarks: d.remarks.trim() || null,
    };
  });

/** "33.33" style text for display. */
export const formatAllocation = (value: string | number | null | undefined): string => {
  const text = percentText(value);
  return text ? `${text}%` : "—";
};
