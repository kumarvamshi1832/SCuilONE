import { apiClient } from "./authService";
import type {
  SupportTicket,
  SupportTicketCreate,
  SupportTicketUpdate,
  SupportTicketDetailResponse,
  SupportTicketListResponse,
  SupportTicketComment,
  SupportTicketCommentCreate,
  SupportTicketFilterParams,
} from "../types/supportTicket";

const BASE_URL = "/api/v1/support-tickets";
const FALLBACK_SERVICE_REQUESTS_URL = "/api/v1/customer-booking-workflow/service-requests";

let backendTicketsAvailable: boolean | null = null;

export const isTicketsBackendAvailable = (): boolean => backendTicketsAvailable !== false;

/** Maps a customer property service request into the SupportTicket interface. */
const mapServiceRequestToTicket = (sr: any): SupportTicket => {
  const validStatus = ["Open", "In Progress", "Waiting on Customer", "Resolved", "Closed"].includes(sr.status)
    ? sr.status
    : "Open";
  const validPriority = ["Low", "Medium", "High", "Urgent"].includes(sr.priority)
    ? sr.priority
    : "Medium";
  const validCategory = [
    "General",
    "Bug",
    "Technical Support",
    "Billing",
    "Feature Request",
    "Account Access",
    "Other",
  ].includes(sr.category)
    ? sr.category
    : "Technical Support";

  return {
    id: String(sr.id),
    tenant_id: String(sr.tenant_id || ""),
    ticket_number: `SR-${String(sr.id || "").slice(0, 8).toUpperCase()}`,
    subject: sr.subject || "Service Request",
    description: sr.description || "",
    category: validCategory,
    status: validStatus,
    priority: validPriority,
    source: "Client Portal",
    requester_name: sr.customer_name || sr.requester_name || "Portal Customer",
    requester_email: sr.customer_email || sr.requester_email || null,
    account_id: sr.account_id ? String(sr.account_id) : null,
    contact_id: sr.contact_id ? String(sr.contact_id) : null,
    software_project_id: null,
    assigned_to: sr.assigned_to ? String(sr.assigned_to) : null,
    created_by: null,
    resolution: sr.resolution || null,
    resolved_at: validStatus === "Resolved" ? sr.updated_at || sr.closed_at : null,
    closed_at: sr.closed_at || null,
    created_at: sr.created_at || new Date().toISOString(),
    updated_at: sr.updated_at || new Date().toISOString(),
  };
};

export const getSupportTickets = async (
  params?: SupportTicketFilterParams,
  signal?: AbortSignal
): Promise<SupportTicketListResponse> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.priority) query.append("priority", params.priority);
  if (params?.assigned_to) query.append("assigned_to", params.assigned_to);
  if (params?.account_id) query.append("account_id", params.account_id);
  if (params?.search) query.append("search", params.search);
  if (params?.limit !== undefined) query.append("limit", String(params.limit));
  if (params?.offset !== undefined) query.append("offset", String(params.offset));

  const qs = query.toString();
  const url = qs ? `${BASE_URL}?${qs}` : BASE_URL;

  // 1. Try native backend support-tickets router if not known to be 404
  if (backendTicketsAvailable !== false) {
    try {
      const response = await apiClient.get<SupportTicketListResponse>(url, { signal });
      backendTicketsAvailable = true;
      if (response.data && Array.isArray(response.data.items)) {
        return response.data;
      }
    } catch (err: any) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
        throw err;
      }
      if (err?.response?.status === 404) {
        backendTicketsAvailable = false;
      } else {
        // Re-throw 401, 403, 500, network errors so caller can handle appropriately
        throw err;
      }
    }
  }

  // 2. Fallback to active customer booking workflow service-requests endpoint
  try {
    const srResponse = await apiClient.get<any[]>(FALLBACK_SERVICE_REQUESTS_URL, {
      params: params?.status ? { status: params.status } : undefined,
      signal,
    });

    if (Array.isArray(srResponse.data)) {
      let mappedTickets = srResponse.data.map(mapServiceRequestToTicket);

      // In-memory filters for fields not handled by service-requests query
      if (params?.priority) {
        mappedTickets = mappedTickets.filter((t) => t.priority === params.priority);
      }
      if (params?.assigned_to) {
        mappedTickets = mappedTickets.filter((t) => t.assigned_to === params.assigned_to);
      }
      if (params?.search) {
        const q = params.search.toLowerCase().trim();
        mappedTickets = mappedTickets.filter(
          (t) =>
            t.subject.toLowerCase().includes(q) ||
            t.ticket_number.toLowerCase().includes(q) ||
            t.requester_name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q)
        );
      }

      const total = mappedTickets.length;
      const offset = params?.offset ?? 0;
      const limit = params?.limit ?? 100;
      const paginated = mappedTickets.slice(offset, offset + limit);

      return {
        items: paginated,
        total,
        limit,
        offset,
      };
    }
  } catch (srErr: any) {
    if (srErr?.name === "CanceledError" || srErr?.code === "ERR_CANCELED") {
      throw srErr;
    }
    // If fallback is also 404 or fails, re-throw if not 404
    if (srErr?.response?.status !== 404) {
      throw srErr;
    }
  }

  // 3. Both endpoints are 404 (routers not mounted in backend/app/main.py)
  return {
    items: [],
    total: 0,
    limit: params?.limit ?? 100,
    offset: params?.offset ?? 0,
  };
};

export const getSupportTicket = async (
  ticketId: string,
  signal?: AbortSignal
): Promise<SupportTicketDetailResponse> => {
  if (backendTicketsAvailable !== false) {
    try {
      const response = await apiClient.get<SupportTicketDetailResponse>(
        `${BASE_URL}/${ticketId}`,
        { signal }
      );
      return response.data;
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        throw err;
      }
      backendTicketsAvailable = false;
    }
  }

  // Try service request detail fallback
  try {
    const srList = await apiClient.get<any[]>(FALLBACK_SERVICE_REQUESTS_URL, { signal });
    const match = (srList.data || []).find((s) => String(s.id) === ticketId);
    if (match) {
      const ticket = mapServiceRequestToTicket(match);
      return {
        ...ticket,
        comments: [],
      };
    }
  } catch {
    // fallback error ignored
  }

  throw new Error(`Support ticket ${ticketId} could not be found.`);
};

export const createSupportTicket = async (
  data: SupportTicketCreate
): Promise<SupportTicket> => {
  try {
    const response = await apiClient.post<SupportTicket>(BASE_URL, data);
    backendTicketsAvailable = true;
    return response.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      backendTicketsAvailable = false;
      throw new Error(
        "Support ticket creation is currently disabled because the support tickets router is not enabled on the server (backend/app/main.py line 197)."
      );
    }
    throw err;
  }
};

export const updateSupportTicket = async (
  ticketId: string,
  data: SupportTicketUpdate
): Promise<SupportTicket> => {
  if (backendTicketsAvailable !== false) {
    try {
      const response = await apiClient.patch<SupportTicket>(
        `${BASE_URL}/${ticketId}`,
        data
      );
      return response.data;
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        throw err;
      }
      backendTicketsAvailable = false;
    }
  }

  // Try updating through service request endpoint
  const srUpdatePayload: Record<string, any> = {};
  if (data.status) srUpdatePayload.status = data.status;
  if (data.resolution !== undefined) srUpdatePayload.resolution = data.resolution;
  if (data.assigned_to !== undefined) srUpdatePayload.assigned_to = data.assigned_to;

  const srResponse = await apiClient.patch(
    `/api/v1/customer-booking-workflow/service-requests/${ticketId}`,
    srUpdatePayload
  );
  return mapServiceRequestToTicket(srResponse.data);
};

export const deleteSupportTicket = async (ticketId: string): Promise<void> => {
  await apiClient.delete(`${BASE_URL}/${ticketId}`);
};

export const addSupportTicketComment = async (
  ticketId: string,
  data: SupportTicketCommentCreate
): Promise<SupportTicketComment> => {
  const response = await apiClient.post<SupportTicketComment>(
    `${BASE_URL}/${ticketId}/comments`,
    data
  );
  return response.data;
};
