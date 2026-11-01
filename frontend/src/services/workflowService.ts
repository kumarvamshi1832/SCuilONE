import { apiClient } from "./authService";
import type {
  Workflow,
  WorkflowCreateRequest,
  WorkflowExecution,
  WorkflowUpdateRequest,
} from "../types/workflow";

let isWorkflowsApiSupported = false;
const WORKFLOWS_STORAGE_KEY = "scuilone_workflows_v1";

const initialWorkflows: Workflow[] = [
  {
    id: "wf-1",
    tenant_id: "tenant-default",
    created_by: "Sales Admin",
    name: "High Value Lead Notification",
    description: "Send instant notification when a high value lead is registered",
    module_name: "leads",
    trigger_event: "record_created",
    condition_logic: "AND",
    conditions: [],
    actions: [
      {
        action_type: "send_notification",
        recipient: "assigned_user",
        message: "A new lead has been assigned to you. Follow up within 15 minutes.",
      },
    ],
    is_active: true,
    created_at: "2024-03-01T10:00:00Z",
    updated_at: "2024-03-01T10:00:00Z",
  },
  {
    id: "wf-2",
    tenant_id: "tenant-default",
    created_by: "Sales Admin",
    name: "Won Deal Onboarding Task",
    description: "Automatically create documentation checklist task when a deal closes as Won",
    module_name: "deals",
    trigger_event: "field_changed",
    condition_logic: "AND",
    conditions: [
      {
        field: "stage",
        operator: "is",
        value: "Closed Won",
      },
    ],
    actions: [
      {
        action_type: "create_task",
        title: "Prepare Client Agreement & Booking Dossier",
        priority: "High",
        due_in_days: 2,
        description: "Collect KYC documents and execute formal agreements.",
      },
    ],
    is_active: true,
    created_at: "2024-03-05T12:00:00Z",
    updated_at: "2024-03-05T12:00:00Z",
  },
];

const getLocalWorkflows = (): Workflow[] => {
  try {
    const raw = localStorage.getItem(WORKFLOWS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(initialWorkflows));
      return [...initialWorkflows];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...initialWorkflows];
  } catch {
    return [...initialWorkflows];
  }
};

const saveLocalWorkflows = (items: Workflow[]) => {
  try {
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("Failed to save workflows to localStorage", err);
  }
};

const BASE_URL = "/api/v1/workflows";

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

export const getWorkflows = async (): Promise<Workflow[]> => {
  if (!isWorkflowsApiSupported) {
    return getLocalWorkflows();
  }
  try {
    const response = await apiClient.get<Workflow[]>(
      `${BASE_URL}/`,
      getHeaders()
    );
    return response.data;
  } catch {
    isWorkflowsApiSupported = false;
    return getLocalWorkflows();
  }
};

export const getWorkflow = async (
  id: string
): Promise<Workflow> => {
  if (!isWorkflowsApiSupported) {
    const item = getLocalWorkflows().find((w) => w.id === id);
    if (!item) throw new Error("Workflow not found");
    return item;
  }
  try {
    const response = await apiClient.get<Workflow>(
      `${BASE_URL}/${id}`,
      getHeaders()
    );
    return response.data;
  } catch {
    isWorkflowsApiSupported = false;
    const item = getLocalWorkflows().find((w) => w.id === id);
    if (!item) throw new Error("Workflow not found");
    return item;
  }
};

export const createWorkflow = async (
  data: WorkflowCreateRequest
): Promise<Workflow> => {
  if (!isWorkflowsApiSupported) {
    const items = getLocalWorkflows();
    const newWorkflow: Workflow = {
      id: `wf-${Date.now()}`,
      tenant_id: "tenant-default",
      created_by: "Current User",
      name: data.name,
      description: data.description || null,
      module_name: data.module_name,
      trigger_event: data.trigger_event,
      condition_logic: data.condition_logic,
      conditions: data.conditions,
      actions: data.actions,
      is_active: data.is_active ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    items.unshift(newWorkflow);
    saveLocalWorkflows(items);
    return newWorkflow;
  }
  try {
    const response = await apiClient.post<Workflow>(
      `${BASE_URL}/`,
      data,
      getHeaders()
    );
    return response.data;
  } catch {
    isWorkflowsApiSupported = false;
    return createWorkflow(data);
  }
};

export const updateWorkflow = async (
  id: string,
  data: WorkflowUpdateRequest
): Promise<Workflow> => {
  if (!isWorkflowsApiSupported) {
    const items = getLocalWorkflows();
    const index = items.findIndex((w) => w.id === id);
    if (index === -1) throw new Error("Workflow not found");
    const existing = items[index];
    if (!existing) throw new Error("Workflow not found");
    const updated: Workflow = {
      ...existing,
      ...data,
      id: existing.id,
      tenant_id: existing.tenant_id,
      created_by: existing.created_by,
      name: data.name ?? existing.name,
      module_name: data.module_name ?? existing.module_name,
      trigger_event: data.trigger_event ?? existing.trigger_event,
      condition_logic: data.condition_logic ?? existing.condition_logic,
      conditions: data.conditions ?? existing.conditions,
      actions: data.actions ?? existing.actions,
      is_active: existing.is_active,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };
    items[index] = updated;
    saveLocalWorkflows(items);
    return updated;
  }
  try {
    const response = await apiClient.put<Workflow>(
      `${BASE_URL}/${id}`,
      data,
      getHeaders()
    );
    return response.data;
  } catch {
    isWorkflowsApiSupported = false;
    return updateWorkflow(id, data);
  }
};

export const activateWorkflow = async (
  id: string
): Promise<Workflow> => {
  if (!isWorkflowsApiSupported) {
    const items = getLocalWorkflows();
    const index = items.findIndex((w) => w.id === id);
    if (index === -1) throw new Error("Workflow not found");
    const existing = items[index];
    if (!existing) throw new Error("Workflow not found");
    const updated: Workflow = {
      ...existing,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    items[index] = updated;
    saveLocalWorkflows(items);
    return updated;
  }
  try {
    const response = await apiClient.patch<Workflow>(
      `${BASE_URL}/${id}/activate`,
      {},
      getHeaders()
    );
    return response.data;
  } catch {
    isWorkflowsApiSupported = false;
    return activateWorkflow(id);
  }
};

export const deactivateWorkflow = async (
  id: string
): Promise<Workflow> => {
  if (!isWorkflowsApiSupported) {
    const items = getLocalWorkflows();
    const index = items.findIndex((w) => w.id === id);
    if (index === -1) throw new Error("Workflow not found");
    const existing = items[index];
    if (!existing) throw new Error("Workflow not found");
    const updated: Workflow = {
      ...existing,
      is_active: false,
      updated_at: new Date().toISOString(),
    };
    items[index] = updated;
    saveLocalWorkflows(items);
    return updated;
  }
  try {
    const response = await apiClient.patch<Workflow>(
      `${BASE_URL}/${id}/deactivate`,
      {},
      getHeaders()
    );
    return response.data;
  } catch {
    isWorkflowsApiSupported = false;
    return deactivateWorkflow(id);
  }
};

export const deleteWorkflow = async (
  id: string
): Promise<void> => {
  if (!isWorkflowsApiSupported) {
    const items = getLocalWorkflows().filter((w) => w.id !== id);
    saveLocalWorkflows(items);
    return;
  }
  try {
    await apiClient.delete(
      `${BASE_URL}/${id}`,
      getHeaders()
    );
  } catch {
    isWorkflowsApiSupported = false;
    const items = getLocalWorkflows().filter((w) => w.id !== id);
    saveLocalWorkflows(items);
  }
};

export const getWorkflowExecutions = async (
  id: string,
  limit = 50,
  offset = 0
): Promise<WorkflowExecution[]> => {
  if (!isWorkflowsApiSupported) {
    return [];
  }
  try {
    const response = await apiClient.get<WorkflowExecution[]>(
      `${BASE_URL}/${id}/executions`,
      {
        ...getHeaders(),
        params: { limit, offset },
      }
    );
    return response.data;
  } catch {
    isWorkflowsApiSupported = false;
    return [];
  }
};
