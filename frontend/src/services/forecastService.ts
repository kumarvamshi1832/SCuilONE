import { apiClient } from "./authService";
import type {
  ForecastSummary,
  ForecastSummaryParams,
  StageProbability,
  StageProbabilityUpdateResult,
} from "../types/forecast";

/**
 * Sales forecast. Backend: /api/v1/forecast
 *   GET /summary                         permission forecast.view (months 1-24, pipeline_id, assigned_to)
 *   GET /stages                          permission pipeline.view (pipeline_id)
 *   PUT /stages/{stage_id}/probability   permission pipeline.update, body {probability: 0-100}
 */

export const getForecastSummary = async (
  params: ForecastSummaryParams = {}
): Promise<ForecastSummary> => {
  const response = await apiClient.get<ForecastSummary>("/api/v1/forecast/summary", {
    params: {
      months: params.months,
      pipeline_id: params.pipeline_id || undefined,
      assigned_to: params.assigned_to || undefined,
    },
  });
  return response.data;
};

export const getStageProbabilities = async (pipelineId?: string): Promise<StageProbability[]> => {
  const response = await apiClient.get<StageProbability[]>("/api/v1/forecast/stages", {
    params: { pipeline_id: pipelineId || undefined },
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const updateStageProbability = async (
  stageId: string,
  probability: number
): Promise<StageProbabilityUpdateResult> => {
  const response = await apiClient.put<StageProbabilityUpdateResult>(
    `/api/v1/forecast/stages/${stageId}/probability`,
    { probability }
  );
  return response.data;
};
