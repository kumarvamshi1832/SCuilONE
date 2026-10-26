import { apiClient } from "./authService";
import type {
  Booking,
  BookingCreate,
  BookingUpdate,
  BookingCancel,
} from "../types/booking";

export interface BookingFilterParams {
  status?: string;
  property_id?: string;
  skip?: number;
  limit?: number;
}

export const getBookings = async (
  params?: BookingFilterParams
): Promise<Booking[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.property_id) query.append("property_id", params.property_id);
  if (params?.skip !== undefined) query.append("skip", String(params.skip));
  if (params?.limit !== undefined) query.append("limit", String(params.limit));

  const url = `/api/v1/bookings/${query.toString() ? `?${query.toString()}` : ""}`;
  const response = await apiClient.get<Booking[]>(url);
  return response.data;
};

export const getBooking = async (id: string): Promise<Booking> => {
  const response = await apiClient.get<Booking>(`/api/v1/bookings/${id}`);
  return response.data;
};

export const createBooking = async (data: BookingCreate): Promise<Booking> => {
  const response = await apiClient.post<Booking>("/api/v1/bookings/", data);
  return response.data;
};

export const updateBooking = async (
  id: string,
  data: BookingUpdate
): Promise<Booking> => {
  const response = await apiClient.patch<Booking>(`/api/v1/bookings/${id}`, data);
  return response.data;
};

export const cancelBooking = async (
  id: string,
  data: BookingCancel
): Promise<Booking> => {
  const response = await apiClient.post<Booking>(`/api/v1/bookings/${id}/cancel`, data);
  return response.data;
};

export const completeBooking = async (id: string): Promise<Booking> => {
  const response = await apiClient.post<Booking>(`/api/v1/bookings/${id}/complete`);
  return response.data;
};
