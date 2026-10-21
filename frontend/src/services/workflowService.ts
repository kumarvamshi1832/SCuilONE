
import { apiClient } from "./authService";
import type {
  Workflow,
  WorkflowCreateRequest,
  WorkflowExecution,
  WorkflowUpdateRequest,
} from "../types/workflow";

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
  const response = await apiClient.get<Workflow[]>(
    `${BASE_URL}/`,
    getHeaders()
  );

  return response.data;
};

export const getWorkflow = async (
  id: string
): Promise<Workflow> => {
  const response = await apiClient.get<Workflow>(
    `${BASE_URL}/${id}`,
    getHeaders()
  );

  return response.data;
};

export const createWorkflow = async (
  data: WorkflowCreateRequest
): Promise<Workflow> => {
  const response = await apiClient.post<Workflow>(
    `${BASE_URL}/`,
    data,
    getHeaders()
  );

  return response.data;
};

export const updateWorkflow = async (
  id: string,
  data: WorkflowUpdateRequest
): Promise<Workflow> => {
  const response = await apiClient.put<Workflow>(
    `${BASE_URL}/${id}`,
    data,
    getHeaders()
  );

  return response.data;
};

export const activateWorkflow = async (
  id: string
): Promise<Workflow> => {
  const response = await apiClient.patch<Workflow>(
    `${BASE_URL}/${id}/activate`,
    {},
    getHeaders()
  );

  return response.data;
};

export const deactivateWorkflow = async (
  id: string
): Promise<Workflow> => {
  const response = await apiClient.patch<Workflow>(
    `${BASE_URL}/${id}/deactivate`,
    {},
    getHeaders()
  );

  return response.data;
};

export const deleteWorkflow = async (
  id: string
): Promise<void> => {
  await apiClient.delete(
    `${BASE_URL}/${id}`,
    getHeaders()
  );
};

export const getWorkflowExecutions = async (
  id: string,
  limit = 50,
  offset = 0
): Promise<WorkflowExecution[]> => {
  const response = await apiClient.get<WorkflowExecution[]>(
    `${BASE_URL}/${id}/executions`,
    {
      ...getHeaders(),
      params: { limit, offset },
    }
  );

  return response.data;
};
