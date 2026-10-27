export const PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "UPI",
  "Cheque",
  "Card",
  "Other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["Pending", "Verified", "Rejected"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Payment {
  id: string;
  tenant_id: string;
  booking_id: string;
  installment_id?: string | null;
  amount: number | string;
  payment_method: PaymentMethod | string;
  transaction_reference?: string | null;
  status: PaymentStatus | string;
  payment_date: string;
  verified_by?: string | null;
  verified_at?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Enriched UI fields
  verified_by_name?: string;
  refunds_count?: number;
  total_refunded?: number;
}

export interface PaymentCreate {
  installment_id?: string | null;
  amount: number;
  payment_method: PaymentMethod | string;
  transaction_reference?: string | null;
  payment_date?: string | null;
  notes?: string | null;
}

export interface PaymentDecision {
  status: "Verified" | "Rejected";
  notes?: string | null;
}
