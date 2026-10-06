import { apiClient } from "./authService";
import type { Account, AccountCreate, AccountUpdate } from "../types/account";

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

/* ─── Endpoints ─── */

const ACCOUNTS_ENDPOINTS = {
  LIST: "/api/v1/accounts/",
  DETAIL: (id: string) => `/api/v1/accounts/${id}`,
} as const;

/* ─── Service Functions ─── */

export const getAccounts = async (): Promise<Account[]> => {
  const response = await apiClient.get<Account[]>(ACCOUNTS_ENDPOINTS.LIST, getHeaders());
  return response.data;
};

export const getAccountById = async (id: string): Promise<Account> => {
  const response = await apiClient.get<Account>(ACCOUNTS_ENDPOINTS.DETAIL(id), getHeaders());
  return response.data;
};

export const createAccount = async (data: AccountCreate): Promise<Account> => {
  const response = await apiClient.post<Account>(ACCOUNTS_ENDPOINTS.LIST, data, getHeaders());
  return response.data;
};

export const updateAccount = async (id: string, data: AccountUpdate): Promise<Account> => {
  const response = await apiClient.put<Account>(ACCOUNTS_ENDPOINTS.DETAIL(id), data, getHeaders());
  return response.data;
};

export const deleteAccount = async (id: string): Promise<void> => {
  await apiClient.delete(ACCOUNTS_ENDPOINTS.DETAIL(id), getHeaders());
};
