export const REFUND_STATUSES = ["Pending", "Processed", "Rejected"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface PaymentRefund {
  id: string;
  tenant_id: string;
  booking_id: string;
  payment_id: string;
  amount: number | string;
  reason: string;
  status: RefundStatus | string;
  external_reference?: string | null;
  notes?: string | null;
  created_by?: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
  created_at: string;
  updated_at: string;
  // Enriched UI fields
  processed_by_name?: string;
}

export interface PaymentRefundCreate {
  amount: number;
  reason: string;
}

export interface PaymentRefundDecision {
  status: "Rejected";
  external_reference?: string | null;
  notes?: string | null;
}

export interface PaymentRefundManualConfirmation {
  confirmed_returned: true;
  external_reference: string;
  notes: string;
}
