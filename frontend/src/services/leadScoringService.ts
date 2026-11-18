import { apiClient } from "./authService";
import type {
  LeadScoreDetail,
  LeadScoreRow,
  LeaderboardParams,
  RecalculateAllResult,
} from "../types/leadScoring";

/**
 * Lead scoring. Backend: /api/v1/lead-scoring
 *   GET  /leaderboard                  permission lead.view (label, assigned_to, min_score, skip, limit<=100)
 *   GET  /leads/{id}                   permission lead.view (adds `breakdown`)
 *   POST /leads/{id}/recalculate       permission lead.update
 *   POST /recalculate-all              permission lead.update (rate limited: 5/minute)
 * Without `label` the leaderboard returns Hot/Warm/Cold leads only.
 */

export const getLeadLeaderboard = async (params: LeaderboardParams = {}): Promise<LeadScoreRow[]> => {
  const response = await apiClient.get<LeadScoreRow[]>("/api/v1/lead-scoring/leaderboard", {
    params: {
      label: params.label || undefined,
      assigned_to: params.assigned_to || undefined,
      min_score: params.min_score || undefined,
      skip: params.skip ?? 0,
      limit: params.limit ?? 25,
    },
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const getLeadScoreDetail = async (leadId: string): Promise<LeadScoreDetail> => {
  const response = await apiClient.get<LeadScoreDetail>(`/api/v1/lead-scoring/leads/${leadId}`);
  return response.data;
};

export const recalculateLeadScore = async (leadId: string): Promise<LeadScoreDetail> => {
  const response = await apiClient.post<LeadScoreDetail>(
    `/api/v1/lead-scoring/leads/${leadId}/recalculate`
  );
  return response.data;
};

export const recalculateAllLeadScores = async (): Promise<RecalculateAllResult> => {
  const response = await apiClient.post<RecalculateAllResult>("/api/v1/lead-scoring/recalculate-all");
  return response.data;
};
