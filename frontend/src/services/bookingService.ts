import { apiClient } from "./authService";
import type { Booking, BookingCreate, BookingUpdate, BookingCancel } from "../types/booking";
import type { BookingNominee, BookingNomineeInput } from "../types/bookingNominee";

/**
 * Bookings (staff). Backend: /api/v1/bookings (routes/bookings.py).
 *   GET    /                    booking.view     ?status&property_id&skip&limit(<=100)
 *   GET    /{id}                booking.view
 *   POST   /                    booking.create
 *   PATCH  /{id}                booking.update   status Pending -> Confirmed is validated server-side
 *   POST   /{id}/cancel         booking.cancel
 *   POST   /{id}/complete       booking.complete
 *   PUT    /{id}/nominees       booking.update
 *
 * Real API calls only. Failures (including 404 and 409 validation messages) are thrown so the screen shows
 * what the server said; nothing is stored or simulated locally.
 */

export interface BookingFilterParams {
  status?: string;
  property_id?: string;
  skip?: number;
  limit?: number;
}

export const getBookings = async (params?: BookingFilterParams): Promise<Booking[]> => {
  const response = await apiClient.get<Booking[]>("/api/v1/bookings/", {
    params: {
      status: params?.status || undefined,
      property_id: params?.property_id || undefined,
      skip: params?.skip,
      limit: params?.limit !== undefined ? Math.min(Math.max(1, params.limit), 100) : undefined,
    },
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const getBooking = async (id: string): Promise<Booking> => {
  const response = await apiClient.get<Booking>(`/api/v1/bookings/${id}`);
  return response.data;
};

export const createBooking = async (data: BookingCreate): Promise<Booking> => {
  const response = await apiClient.post<Booking>("/api/v1/bookings/", data);
  return response.data;
};

export const updateBooking = async (id: string, data: BookingUpdate): Promise<Booking> => {
  const response = await apiClient.patch<Booking>(`/api/v1/bookings/${id}`, data);
  return response.data;
};

export const cancelBooking = async (id: string, data: BookingCancel): Promise<Booking> => {
  const response = await apiClient.post<Booking>(`/api/v1/bookings/${id}/cancel`, data);
  return response.data;
};

export const completeBooking = async (id: string): Promise<Booking> => {
  const response = await apiClient.post<Booking>(`/api/v1/bookings/${id}/complete`);
  return response.data;
};

/**
 * Replaces ALL nominees of a booking (PUT /api/v1/bookings/{id}/nominees, permission booking.update).
 * The body is the full list; an empty list removes every nominee. The backend rejects the change with
 * 409 on a cancelled booking and 422 when percentages are partial or do not total exactly 100.
 */
export const replaceBookingNominees = async (
  bookingId: string,
  nominees: BookingNomineeInput[]
): Promise<BookingNominee[]> => {
  const response = await apiClient.put<BookingNominee[]>(`/api/v1/bookings/${bookingId}/nominees`, nominees);
  return Array.isArray(response.data) ? response.data : [];
};
