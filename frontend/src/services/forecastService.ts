import { apiClient } from "./authService";
import { getDeals } from "./dealService";
import { computeForecastSummaryFromDeals } from "../utils/forecastCalculator";
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
 *
 * If backend forecast router is disabled (returns 404), seamlessly computes the weighted forecast
 * from real deals returned by /api/v1/deals/.
 */

let backendForecastAvailable: boolean | null = null;

export const isForecastSupported = (): boolean => true;

export const getForecastSummary = async (
  params: ForecastSummaryParams = {}
): Promise<ForecastSummary> => {
  if (backendForecastAvailable !== false) {
    try {
      const response = await apiClient.get<ForecastSummary>(
        "/api/v1/forecast/summary",
        {
          params: {
            months: params.months,
            pipeline_id: params.pipeline_id || undefined,
            assigned_to: params.assigned_to || undefined,
          },
        }
      );
      backendForecastAvailable = true;
      return response.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        backendForecastAvailable = false;
      } else {
        throw err;
      }
    }
  }

  // Fallback: compute forecast metrics from real deals
  const deals = await getDeals();
  return computeForecastSummaryFromDeals(
    deals,
    params.months ?? 6,
    params.pipeline_id,
    params.assigned_to
  );
};

export const getStageProbabilities = async (
  pipelineId?: string
): Promise<StageProbability[]> => {
  if (backendForecastAvailable !== false) {
    try {
      const response = await apiClient.get<StageProbability[]>(
        "/api/v1/forecast/stages",
        {
          params: { pipeline_id: pipelineId || undefined },
        }
      );
      backendForecastAvailable = true;
      return Array.isArray(response.data) ? response.data : [];
    } catch (err: any) {
      if (err?.response?.status === 404) {
        backendForecastAvailable = false;
      } else {
        throw err;
      }
    }
  }

  return [];
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
