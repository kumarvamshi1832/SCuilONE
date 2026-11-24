import { parseBackendDate } from "./bookingJourney";
import type { RentalAgreementCreate, RentalAgreementType, RentalFrequency } from "../types/rental";

/** Tone of a status pill. */
export type StatusTone = "good" | "info" | "warn" | "bad" | "muted";

export const rentalStatusTone = (status: string): StatusTone => {
  switch (status) {
    case "Booked":
    case "Active":
    case "Verified":
    case "Paid":
    case "Approved":
    case "Refunded":
    case "Collected":
    case "Closed":
    case "Activated":
    case "Processed":
    case "Resolved":
      return "good";
    case "Pending Signature":
    case "Under Verification":
    case "Pending":
    case "Requested":
    case "Under Review":
    case "Inspection Pending":
    case "Settlement Pending":
    case "Amount Due":
    case "Partially Paid":
    case "Partially Refunded":
    case "Partially Collected":
    case "Termination Requested":
    case "Open":
    case "In Progress":
    case "Waiting on Customer":
      return "warn";
    case "Rejected":
    case "Failed":
    case "Overdue":
    case "Cancelled":
    case "Expired":
    case "Terminated":
    case "Expired - Payment Review":
      return "bad";
    case "Draft":
    case "Agreement Created":
      return "info";
    default:
      return "muted";
  }
};

const FREQUENCY_SUFFIX: Record<string, string> = { Monthly: "/ month", Quarterly: "/ quarter", Yearly: "/ year" };
export const frequencySuffix = (frequency: string | null | undefined): string => FREQUENCY_SUFFIX[frequency ?? ""] ?? "";

export const formatRent = (value: string | number | null | undefined, frequency?: string | null): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const body = `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const suffix = frequencySuffix(frequency);
  return suffix ? `${body} ${suffix}` : body;
};

/** A date-only value (YYYY-MM-DD) or timestamp as "12 Mar 2026". Date-only strings are shown as that calendar day in every timezone. */
export const formatDay = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : parseBackendDate(value);
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
};

export const todayInput = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/** Whole months between two YYYY-MM-DD dates, counted exactly as the backend does (calendar month difference). */
export const monthsBetween = (start: string, end: string): number => {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth());
};

/* ───────────── create-agreement form ───────────── */

export interface RentalFormValues {
  propertyId: string;
  customerKind: "contact" | "lead" | "";
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  rentAmount: string;
  depositAmount: string;
  maintenanceAmount: string;
  maintenanceFrequency: RentalFrequency;
  agreementStart: string;
  agreementEnd: string;
  lockInMonths: string;
  noticePeriodDays: string;
  dueDay: string;
  lateFeeType: "Fixed" | "Percentage";
  lateFeeAmount: string;
  lateFeeGraceDays: string;
  escalationPercentage: string;
  escalationIntervalMonths: string;
  notes: string;
  /** Optional link to an accepted offer (see the offers API); its price must equal the rent. */
  acceptedOfferId: string;
  propertyMatchId: string;
  buyerRequirementId: string;
}

export interface RentalFormContext {
  agreementType: RentalAgreementType | null;
  /** The listing's recurring price frequency; the agreement must use the same one. */
  propertyFrequency: RentalFrequency | null;
  minimumTermMonths: number | null;
  maximumTermMonths: number | null;
  /** Price of the linked accepted offer, if one is selected. */
  acceptedOfferPrice: number | null;
}

export type RentalFormErrors = Partial<Record<keyof RentalFormValues, string>>;

const money = (raw: string): number | null => {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Number(t);
};
const intIn = (raw: string, lo: number, hi: number): number | null => {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= lo && n <= hi ? n : null;
};

/** Validates exactly as RentalAgreementCreate / create_rental_agreement do, and builds the request body. */
export const validateRentalForm = (v: RentalFormValues, ctx: RentalFormContext): { errors: RentalFormErrors; payload?: RentalAgreementCreate } => {
  const errors: RentalFormErrors = {};

  if (!v.propertyId) errors.propertyId = "Select the property.";
  else if (!ctx.agreementType) errors.propertyId = "Only a property listed for Rent or Lease can have a rental agreement.";
  if (!v.customerKind || !v.customerId) errors.customerId = "A rental agreement must be linked to a contact or a lead.";
  if (!v.customerName.trim()) errors.customerName = "Enter the customer's name.";
  else if (v.customerName.length > 200) errors.customerName = "The name cannot exceed 200 characters.";

  const rent = money(v.rentAmount);
  if (rent === null || Number.isNaN(rent) || rent <= 0) errors.rentAmount = "Enter the rent (greater than zero, up to 2 decimals).";
  else if (ctx.acceptedOfferPrice !== null && Math.abs(rent - ctx.acceptedOfferPrice) > 0.004) {
    errors.rentAmount = "The rent must equal the accepted offer amount.";
  }
  const deposit = money(v.depositAmount) ?? 0;
  if (Number.isNaN(deposit) || deposit < 0) errors.depositAmount = "Enter a valid deposit (zero or more).";
  const maintenance = money(v.maintenanceAmount) ?? 0;
  if (Number.isNaN(maintenance) || maintenance < 0) errors.maintenanceAmount = "Enter a valid maintenance amount (zero or more).";

  if (!v.agreementStart) errors.agreementStart = "Choose the start date.";
  if (v.agreementStart && v.agreementEnd && v.agreementEnd < v.agreementStart) errors.agreementEnd = "The end date cannot be before the start date.";

  const lockIn = intIn(v.lockInMonths || "0", 0, 600);
  if (lockIn === null) errors.lockInMonths = "Lock-in must be a whole number from 0 to 600.";
  const notice = intIn(v.noticePeriodDays || "0", 0, 365);
  if (notice === null) errors.noticePeriodDays = "Notice period must be a whole number of days from 0 to 365.";
  const dueDay = intIn(v.dueDay, 1, 28);
  if (dueDay === null) errors.dueDay = "The due day must be between 1 and 28.";
  const lateFee = money(v.lateFeeAmount) ?? 0;
  if (Number.isNaN(lateFee) || lateFee < 0) errors.lateFeeAmount = "Enter a valid late fee (zero or more).";
  else if (v.lateFeeType === "Percentage" && lateFee > 100) errors.lateFeeAmount = "A percentage late fee cannot exceed 100.";
  const grace = intIn(v.lateFeeGraceDays || "0", 0, 365);
  if (grace === null) errors.lateFeeGraceDays = "Grace days must be a whole number from 0 to 365.";

  if (v.agreementStart && v.agreementEnd && !errors.agreementEnd) {
    const duration = monthsBetween(v.agreementStart, v.agreementEnd);
    if (lockIn !== null && lockIn > duration) errors.lockInMonths = "The lock-in period cannot exceed the agreement duration.";
    if (ctx.minimumTermMonths !== null && duration < ctx.minimumTermMonths) errors.agreementEnd = `The property's minimum term is ${ctx.minimumTermMonths} months.`;
    if (ctx.maximumTermMonths !== null && duration > ctx.maximumTermMonths) errors.agreementEnd = `The property's maximum term is ${ctx.maximumTermMonths} months.`;
  }

  let escalation: number | null = null;
  let escalationInterval: number | null = null;
  if (v.escalationPercentage.trim() !== "") {
    const e = money(v.escalationPercentage);
    if (e === null || Number.isNaN(e) || e < 0 || e > 100) errors.escalationPercentage = "Escalation must be between 0 and 100.";
    else escalation = e;
    escalationInterval = intIn(v.escalationIntervalMonths, 1, 600);
    if (escalationInterval === null) errors.escalationIntervalMonths = "Escalation interval is required (1 to 600 months) when escalation is configured.";
  } else if (v.escalationIntervalMonths.trim() !== "") {
    escalationInterval = intIn(v.escalationIntervalMonths, 1, 600);
    if (escalationInterval === null) errors.escalationIntervalMonths = "The interval must be between 1 and 600 months.";
  }

  if (Object.keys(errors).length > 0 || !ctx.agreementType || rent === null || lockIn === null || notice === null || dueDay === null || grace === null) return { errors };

  const payload: RentalAgreementCreate = {
    property_id: v.propertyId,
    lead_id: v.customerKind === "lead" ? v.customerId : null,
    contact_id: v.customerKind === "contact" ? v.customerId : null,
    buyer_requirement_id: v.buyerRequirementId || null,
    property_match_id: v.propertyMatchId || null,
    accepted_offer_id: v.acceptedOfferId || null,
    agreement_type: ctx.agreementType,
    customer_name: v.customerName.trim(),
    customer_email: v.customerEmail.trim() || null,
    customer_phone: v.customerPhone.trim() || null,
    rent_amount: rent,
    rent_frequency: ctx.propertyFrequency ?? "Monthly",
    deposit_amount: deposit,
    maintenance_amount: maintenance,
    maintenance_frequency: v.maintenanceFrequency,
    agreement_start: v.agreementStart,
    agreement_end: v.agreementEnd || null,
    lock_in_months: lockIn,
    notice_period_days: notice,
    due_day: dueDay,
    late_fee_type: v.lateFeeType,
    late_fee_amount: lateFee,
    late_fee_grace_days: grace,
    escalation_percentage: escalation,
    escalation_interval_months: escalationInterval,
    notes: v.notes.trim() || null,
  };
  return { errors, payload };
};

/* ───────────── what can be done at each status (mirrors rentals.py) ───────────── */

export interface AgreementActions {
  sendForSignature: boolean;
  recordWalkIn: boolean;
  activate: boolean;
  cancel: boolean;
  generateSchedule: boolean;
  recordPayment: boolean;
  exitRequest: boolean;
  renewal: boolean;
}

export const agreementActions = (status: string, customerSigned: boolean, hasEnd: boolean): AgreementActions => ({
  sendForSignature: status === "Draft",
  recordWalkIn: status === "Pending Signature" && !customerSigned,
  activate: status === "Pending Signature" && customerSigned,
  cancel: status === "Draft" || status === "Pending Signature",
  generateSchedule: status === "Active" || status === "Termination Requested",
  recordPayment: status === "Pending Signature" || status === "Active" || status === "Expired" || status === "Termination Requested",
  exitRequest: status === "Active" || status === "Expired",
  renewal: (status === "Active" || status === "Expired") && hasEnd,
});
