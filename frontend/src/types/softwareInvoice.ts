export type SoftwareInvoiceStatus =
  | "Draft"
  | "Sent"
  | "Partially Paid"
  | "Paid"
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
  created_at: string;
}

export interface SoftwareInvoicePaymentCreate {
  amount: number;
  payment_method: string;
  transaction_reference?: string | null;
  payment_date?: string | null;
  notes?: string | null;
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
  balance_due: number;
  notes?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
  items: SoftwareInvoiceItem[];
  payments: SoftwareInvoicePayment[];
}

export interface SoftwareInvoiceCreate {
  invoice_number: string;
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
}

export const SOFTWARE_INVOICE_STATUSES: SoftwareInvoiceStatus[] = [
  "Draft",
  "Sent",
  "Partially Paid",
  "Paid",
  "Void",
];

