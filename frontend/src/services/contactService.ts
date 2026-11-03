import { apiClient } from "./authService";
import type { Contact, ContactCreate, ContactUpdate } from "../types/contact";

const getHeaders = () => {
  const token =
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token");
  return token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {};
};

/* ─── Endpoints ─── */

const CONTACTS_ENDPOINTS = {
  LIST: "/api/v1/contacts/",
  DETAIL: (id: string) => `/api/v1/contacts/${id}`,
} as const;

/* ─── Service Functions ─── */

export const getContacts = async (): Promise<Contact[]> => {
  const response = await apiClient.get<any>(CONTACTS_ENDPOINTS.LIST, getHeaders());
  if (Array.isArray(response.data)) {
    return response.data;
  }
  if (response.data && Array.isArray(response.data.data)) {
    return response.data.data;
  }
  if (response.data && Array.isArray(response.data.items)) {
    return response.data.items;
  }
  if (response.data && Array.isArray(response.data.results)) {
    return response.data.results;
  }
  return [];
};

export const getContact = async (id: string): Promise<Contact> => {
  const response = await apiClient.get<any>(CONTACTS_ENDPOINTS.DETAIL(id), getHeaders());
  return response.data?.data || response.data;
};

export const createContact = async (data: ContactCreate): Promise<Contact> => {
  const response = await apiClient.post<Contact>(CONTACTS_ENDPOINTS.LIST, data, getHeaders());
  return response.data;
};

export const updateContact = async (id: string, data: ContactUpdate): Promise<Contact> => {
  const response = await apiClient.put<Contact>(CONTACTS_ENDPOINTS.DETAIL(id), data, getHeaders());
  return response.data;
};

export const deleteContact = async (id: string): Promise<void> => {
  await apiClient.delete(CONTACTS_ENDPOINTS.DETAIL(id), getHeaders());
};
