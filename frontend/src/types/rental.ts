/**
 * Rental and lease lifecycle. Mirrors backend/app/schemas/rental.py and the dict responses of routes/rentals.py
 * (staff, /api/v1/rentals) and routes/customer_portal.py (customer, /api/v1/customer-portal/rental-agreements).
 * Money arrives as a decimal string from schema-backed endpoints and may arrive as a number from dict endpoints.
 */

export type Money = string | number;
export type RentalAgreementType = "Rent" | "Lease";
export type RentalFrequency = "Monthly" | "Quarterly" | "Yearly";

/** ck_rental_agreement_status */
export const RENTAL_AGREEMENT_STATUSES = [
  "Draft",
  "Pending Signature",
  "Active",
  "Termination Requested",
  "Expired",
  "Terminated",
  "Completed",
  "Cancelled",
] as const;
export type RentalAgreementStatus = (typeof RENTAL_AGREEMENT_STATUSES)[number];

export const RENTAL_FREQUENCIES: readonly RentalFrequency[] = ["Monthly", "Quarterly", "Yearly"];
export const RENTAL_PAYMENT_METHODS = ["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Other"] as const;
export const RENTAL_PAYMENT_TYPES = ["Rent", "Deposit", "Maintenance", "Other"] as const;

/** RentalAgreementResponse (staff). The customer portal returns the same fields minus the internal ids. */
export interface RentalAgreement {
  id: string;
  tenant_id?: string;
  property_id: string;
  lead_id?: string | null;
  contact_id?: string | null;
  buyer_requirement_id?: string | null;
  property_match_id?: string | null;
  accepted_offer_id?: string | null;
  agreement_type: RentalAgreementType | string;
  status: RentalAgreementStatus | string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  rent_amount: Money;
  rent_frequency: RentalFrequency | string;
  deposit_amount: Money;
  maintenance_amount: Money;
  maintenance_frequency: RentalFrequency | string;
  agreement_start: string;
  agreement_end: string | null;
  lock_in_months: number;
  notice_period_days: number;
  due_day: number;
  late_fee_type: "Fixed" | "Percentage" | string;
  late_fee_amount: Money;
  late_fee_grace_days: number;
  escalation_percentage: Money | null;
  escalation_interval_months: number | null;
  agreement_document_url: string | null;
  signed_at: string | null;
  customer_signed_at: string | null;
  customer_signature_name: string | null;
  customer_signature_method?: string | null;
  customer_signature_document_url?: string | null;
  activated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** RentalAgreementCreate */
export interface RentalAgreementCreate {
  property_id: string;
  lead_id?: string | null;
  contact_id?: string | null;
  buyer_requirement_id?: string | null;
  property_match_id?: string | null;
  accepted_offer_id?: string | null;
  agreement_type: RentalAgreementType;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  rent_amount: number;
  rent_frequency: RentalFrequency;
  deposit_amount: number;
  maintenance_amount: number;
  maintenance_frequency: RentalFrequency;
  agreement_start: string;
  agreement_end?: string | null;
  lock_in_months: number;
  notice_period_days: number;
  due_day: number;
  late_fee_type: "Fixed" | "Percentage";
  late_fee_amount: number;
  late_fee_grace_days: number;
  escalation_percentage?: number | null;
  escalation_interval_months?: number | null;
  agreement_document_url?: string | null;
  notes?: string | null;
}

export interface RentalScheduleItem {
  id: string;
  sequence: number;
  charge_type: "Rent" | "Maintenance" | string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount: Money;
  late_fee_amount: Money;
  total_due: Money;
  paid?: Money;
  outstanding?: Money;
  status: "Pending" | "Partially Paid" | "Paid" | "Overdue" | "Cancelled" | string;
}

/** RentalPaymentResponse (staff) / portal payment payload. */
export interface RentalPayment {
  id: string;
  agreement_id: string;
  schedule_id: string | null;
  settlement_id: string | null;
  payment_type: "Rent" | "Deposit" | "Maintenance" | "Other" | string;
  amount: Money;
  payment_method: string;
  transaction_reference: string | null;
  proof_document_url: string | null;
  receipt_number: string | null;
  payment_date: string;
  /** ck_rental_payment_status: Pending | Under Verification | Verified | Rejected | Failed */
  status: string;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface RentalPaymentCreate {
  schedule_id?: string | null;
  payment_type: "Rent" | "Deposit" | "Maintenance" | "Other";
  amount: number;
  payment_method: (typeof RENTAL_PAYMENT_METHODS)[number];
  transaction_reference?: string | null;
  proof_document_url?: string | null;
  payment_date?: string;
  notes?: string | null;
}

export interface RentalReceipt {
  receipt_number: string;
  payment_id: string;
  agreement_id: string;
  customer_name: string;
  payment_type: string;
  amount: Money;
  currency?: string;
  payment_method: string;
  transaction_reference: string | null;
  payment_date: string;
  verified_at: string | null;
  notes: string | null;
}

export interface DepositTransaction {
  id: string;
  direction: "Credit" | "Debit";
  transaction_type: string;
  amount: Money;
  status: string;
  description: string;
  reference: string | null;
  created_at: string;
  running_balance?: Money;
}

export interface DepositLedger {
  agreement_id: string;
  agreed_deposit: Money;
  current_balance: Money;
  transactions: DepositTransaction[];
}

/** ck_rental_exit_status */
export interface RentalExitRequest {
  id: string;
  agreement_id: string;
  requested_vacate_date: string;
  notice_served_date: string | null;
  reason: string;
  status: "Requested" | "Under Review" | "Approved" | "Rejected" | "Withdrawn" | "Inspection Pending" | "Settlement Pending" | "Closed" | string;
  early_exit_approved: boolean;
  early_exit_charge: Money;
  notice_period_waived: boolean;
  notice_shortfall_charge: Money;
  decision_notes: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface RentalInspection {
  id: string;
  agreement_id: string;
  exit_request_id: string | null;
  inspection_type: "Move In" | "Move Out" | "Periodic" | string;
  condition: "Excellent" | "Good" | "Fair" | "Damaged" | string;
  damage_details: string | null;
  damage_amount: Money;
  photographs?: string[];
  meter_readings?: Record<string, unknown> | null;
  inspected_at: string;
  tenant_acknowledged: boolean;
  tenant_acknowledgement_notes: string | null;
  tenant_acknowledged_at: string | null;
  notes: string | null;
}

export interface RentalSettlement {
  id: string;
  agreement_id: string;
  exit_request_id?: string | null;
  deposit_balance: Money;
  rent_arrears: Money;
  utility_charges: Money;
  damage_charges: Money;
  early_exit_charge: Money;
  notice_shortfall_charge: Money;
  other_charges: Money;
  deductions_total: Money;
  refund_amount: Money;
  amount_due_from_tenant: Money;
  /** ck_rental_settlement_status */
  status: string;
  approved_at: string | null;
  refunded_at: string | null;
  refund_reference?: string | null;
  notes?: string | null;
}

export interface RentalRenewal {
  id: string;
  agreement_id: string;
  revision_number: number;
  revision_type: string;
  old_end_date: string | null;
  new_end_date: string;
  old_rent_amount: Money;
  new_rent_amount: Money;
  reason: string | null;
  /** ck_rental_revision_status: Pending | Approved | Rejected | Cancelled */
  status: string;
  decided_at?: string | null;
  created_at: string;
}

export interface RentalDashboardSummary {
  active_agreements: number;
  agreements_expiring_next_30_days: number;
  open_exit_requests: number;
  overdue_schedule_items: number;
  security_deposit_liability: Money;
  [key: string]: number | Money;
}

/** GET /customer-portal/rental-agreements/{id} */
export interface PortalRentalDetail {
  agreement: RentalAgreement;
  payment_schedule: RentalScheduleItem[];
  payments: RentalPayment[];
  inspections: RentalInspection[];
  settlement: RentalSettlement | null;
}
