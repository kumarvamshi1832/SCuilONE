
import { apiClient } from "./authService";
import type {
  Pipeline,
  PipelineCreate,
  PipelineUpdate,
  PipelineStage,
  PipelineStageCreate,
  PipelineStageUpdate,
} from "../types/pipeline";

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");

  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

const PIPELINES_ENDPOINT = "/api/v1/pipelines/";

export const getPipelines = async (): Promise<Pipeline[]> => {
  const response = await apiClient.get<Pipeline[]>(
    PIPELINES_ENDPOINT,
    getHeaders()
  );
  return response.data;
};

export const getPipelineById = async (
  id: string
): Promise<Pipeline> => {
  const response = await apiClient.get<Pipeline>(
    `${PIPELINES_ENDPOINT}${id}`,
    getHeaders()
  );
  return response.data;
};

export const createPipeline = async (
  data: PipelineCreate
): Promise<Pipeline> => {
  const response = await apiClient.post<Pipeline>(
    PIPELINES_ENDPOINT,
    data,
    getHeaders()
  );
  return response.data;
};

export const updatePipeline = async (
  id: string,
  data: PipelineUpdate
): Promise<Pipeline> => {
  const response = await apiClient.put<Pipeline>(
    `${PIPELINES_ENDPOINT}${id}`,
    data,
    getHeaders()
  );
  return response.data;
};

export const deletePipeline = async (id: string): Promise<void> => {
  await apiClient.delete(`${PIPELINES_ENDPOINT}${id}`, getHeaders());
};

export const getPipelineStages = async (
  pipelineId: string
): Promise<PipelineStage[]> => {
  const response = await apiClient.get<PipelineStage[]>(
    `${PIPELINES_ENDPOINT}${pipelineId}/stages`,
    getHeaders()
  );
  return response.data;
};

export const createPipelineStage = async (
  pipelineId: string,
  data: PipelineStageCreate
): Promise<PipelineStage> => {
  const response = await apiClient.post<PipelineStage>(
    `${PIPELINES_ENDPOINT}${pipelineId}/stages`,
    data,
    getHeaders()
  );
  return response.data;
};

export const updatePipelineStage = async (
  pipelineId: string,
  stageId: string,
  data: PipelineStageUpdate
): Promise<PipelineStage> => {
  const response = await apiClient.put<PipelineStage>(
    `${PIPELINES_ENDPOINT}${pipelineId}/stages/${stageId}`,
    data,
    getHeaders()
  );
  return response.data;
};

export const deletePipelineStage = async (
  pipelineId: string,
  stageId: string
): Promise<void> => {
  await apiClient.delete(
    `${PIPELINES_ENDPOINT}${pipelineId}/stages/${stageId}`,
    getHeaders()
  );
};