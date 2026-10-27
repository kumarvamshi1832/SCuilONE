export type InstallmentStatus =
  | "Pending"
  | "Partially Paid"
  | "Paid"
  | "Overdue"
  | "Cancelled"
  | string;

export interface InstallmentCreate {
  sequence: number;
  name: string;
  amount: number;
  due_date: string; // YYYY-MM-DD
  notes?: string | null;
}

export interface PaymentPlanCreate {
  installments: InstallmentCreate[];
  notes?: string | null;
}

export interface PaymentPlanInstallment {
  id: string;
  sequence: number;
  name: string;
  amount: number | string;
  due_date: string;
  status: InstallmentStatus;
  total_verified?: number | string;
  total_processed_refunds?: number | string;
  net_collected?: number | string;
  outstanding_balance?: number | string;
  notes?: string | null;
}

export interface PaymentPlan {
  id: string;
  tenant_id: string;
  booking_id: string;
  total_amount: number | string;
  status: "Active" | "Cancelled" | string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  installments: PaymentPlanInstallment[];
  total_collected?: number | string;
  total_outstanding?: number | string;
}

export interface CollectionSummary {
  booking_id: string;
  payment_preference: "Full Payment" | "Installments" | string;
  installment_request_notes?: string | null;
  agreed_price: number | string;
  total_verified: number | string;
  total_processed_refunds: number | string;
  net_collected: number | string;
  outstanding_balance: number | string;
  pending_payments: number | string;
  installments: PaymentPlanInstallment[];
}

export interface OverdueInstallmentRow {
  booking_id: string;
  booking_status: string;
  payment_plan_id: string;
  installment: PaymentPlanInstallment;
  booking?: {
    id: string;
    buyer_name?: string;
    buyer_phone?: string;
    property_id?: string;
  };
}

export interface OverdueCollectionsResponse {
  as_of_date: string;
  overdue_count: number;
  total_overdue_outstanding: number | string;
  installments: OverdueInstallmentRow[];
}

export interface OverdueInstallmentItem {
  installment: PaymentPlanInstallment;
  payment_plan: {
    id: string;
    total_amount: number | string;
    status: string;
  };
  booking: {
    id: string;
    buyer_name: string;
    buyer_email?: string | null;
    buyer_phone?: string | null;
    property_id: string;
    agreed_price: number | string;
  };
}
