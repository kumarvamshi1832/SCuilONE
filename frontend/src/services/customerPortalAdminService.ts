import { apiClient } from "./authService";
import type {
  CustomerPortalUserRow,
  PortalInviteCreate,
  PortalInviteResponse,
} from "../types/customerPortal";

const BASE_URL = "/api/v1/customer-portal";

export const getCustomerPortalUsers = async (): Promise<
  CustomerPortalUserRow[]
> => {
  const response = await apiClient.get<CustomerPortalUserRow[]>(
    `${BASE_URL}/invitations`
  );
  return response.data;
};

export const inviteCustomerContact = async (
  contactId: string
): Promise<PortalInviteResponse> => {
  const payload: PortalInviteCreate = { contact_id: contactId };
  const response = await apiClient.post<PortalInviteResponse>(
    `${BASE_URL}/invitations`,
    payload
  );
  return response.data;
};

export const updateCustomerPortalUserStatus = async (
  portalUserId: string,
  status: "Active" | "Suspended"
): Promise<{ id: string; status: string }> => {
  const response = await apiClient.patch<{ id: string; status: string }>(
    `${BASE_URL}/users/${portalUserId}/status?status=${status}`
  );
  return response.data;
};

