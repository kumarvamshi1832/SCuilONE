import { portalApiClient } from "./customerPortalAuthService";

/**
 * Payment receipts for the customer. Uses `portalApiClient` (customer token) only.
 * Backend (customer_portal_lifecycle.py), available for VERIFIED payments of a booking created through a booking request:
 *   GET /api/v1/customer-portal/bookings/{booking_id}/payments/{payment_id}/receipt       JSON
 *   GET /api/v1/customer-portal/bookings/{booking_id}/payments/{payment_id}/receipt.pdf   PDF (503 if the server lacks ReportLab)
 * The receipt is a CRM verification record, not a bank receipt - the backend says so in `note`.
 */

export interface PaymentReceipt {
  receipt_type: string;
  payment_id: string;
  booking_id: string;
  amount: string;
  payment_method: string;
  transaction_reference: string | null;
  payment_date: string | null;
  verified_at: string | null;
  status: string;
  note: string;
}

const path = (bookingId: string, paymentId: string) =>
  `/api/v1/customer-portal/bookings/${bookingId}/payments/${paymentId}/receipt`;

export const getPaymentReceipt = async (bookingId: string, paymentId: string): Promise<PaymentReceipt> => {
  const response = await portalApiClient.get<PaymentReceipt>(path(bookingId, paymentId));
  return response.data;
};

/** For a blob request the error body is a Blob; pull the FastAPI `detail` string out of it. */
const blobErrorMessage = async (err: unknown): Promise<string> => {
  const e = err as { response?: { status?: number; data?: unknown } };
  const data = e?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { detail?: unknown };
      if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
    } catch {
      /* not JSON */
    }
  }
  if (!e?.response) return "Unable to reach the server. Please check your connection and try again.";
  if (e.response.status === 404) return "A receipt is only available for verified payments.";
  return "The receipt could not be downloaded.";
};

/** Downloads the PDF through the authenticated client and saves it; throws an Error with a readable message. */
export const downloadPaymentReceiptPdf = async (bookingId: string, paymentId: string): Promise<void> => {
  try {
    const response = await portalApiClient.get<Blob>(`${path(bookingId, paymentId)}.pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payment-receipt-${paymentId.slice(0, 8)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (err) {
    throw new Error(await blobErrorMessage(err));
  }
};
