export type SoftwareInvoiceStatus =
  | "Draft"
  | "Sent"
  | "Partially Paid"
  | "Paid"
  | "Credited"
  | "Void";

export interface SoftwareInvoiceItem {
  id: string;
  tenant_id: string;
  invoice_id: string;
  time_entry_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_percent: number;
  line_subtotal: number;
  line_tax: number;
  line_total: number;
  total_price?: number;
  created_at: string;
}

export interface SoftwareInvoiceItemCreate {
  description: string;
  quantity: number;
  unit_price: number;
  tax_percent?: number;
  time_entry_id?: string | null;
}

export interface SoftwareInvoicePayment {
  id: string;
  tenant_id: string;
  invoice_id: string;
  created_by?: string | null;
  amount: number;
  payment_method: string;
  transaction_reference?: string | null;
  payment_date: string;
  notes?: string | null;
  status: string; // "Received" | "Reversed"
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  created_at: string;
}

export interface SoftwareInvoicePaymentCreate {
  amount: number;
  payment_method: string;
  transaction_reference?: string | null;
  payment_date?: string | null;
  notes?: string | null;
}

export interface SoftwareInvoicePaymentReverse {
  reason: string;
}

export interface SoftwareCreditNote {
  id: string;
  tenant_id: string;
  invoice_id: string;
  created_by?: string | null;
  credit_note_number: string;
  issue_date: string;
  amount: number;
  reason: string;
  created_at: string;
}

export interface SoftwareCreditNoteCreate {
  amount: number;
  reason: string;
}

export interface SoftwareInvoice {
  id: string;
  tenant_id: string;
  project_id: string;
  software_contract_id: string;
  created_by?: string | null;
  invoice_number: string;
  currency: string;
  issue_date: string;
  due_date?: string | null;
  status: SoftwareInvoiceStatus | string;
  subtotal: number;
  tax_total: number;
  total_amount: number;
  amount_paid: number;
  credited_amount: number;
  balance_due: number;
  is_overdue: boolean;
  days_overdue: number;
  notes?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
  items: SoftwareInvoiceItem[];
  payments: SoftwareInvoicePayment[];
  credit_notes: SoftwareCreditNote[];
}

export interface SoftwareInvoiceCreate {
  invoice_number?: string | null;
  project_id: string;
  software_contract_id?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  items: SoftwareInvoiceItemCreate[];
}

export interface SoftwareInvoiceStatusUpdate {
  status: "Sent" | "Void";
}

export interface SoftwareInvoiceFilterParams {
  status?: string;
  project_id?: string;
  overdue?: boolean;
}

export interface BillingSummaryItem {
  currency: string;
  invoiced: number | string;
  received: number | string;
  credited: number | string;
  outstanding: number | string;
  overdue_amount: number | string;
  overdue_invoice_count: number;
}

export interface BillingSummaryResponse {
  items: BillingSummaryItem[];
}

export const SOFTWARE_INVOICE_STATUSES: SoftwareInvoiceStatus[] = [
  "Draft",
  "Sent",
  "Partially Paid",
  "Paid",
  "Credited",
  "Void",
];
