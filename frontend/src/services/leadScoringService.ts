import { apiClient } from "./authService";
import { getLeads, getLead } from "./leadService";
import {
  convertLeadToScoreRow,
  buildLeadScoreDetail,
} from "../utils/leadScoringRules";
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
 *
 * If the backend lead-scoring router is not enabled (returns 404), the service falls
 * back to rule-based scoring calculated over the real leads returned by /api/v1/leads/.
 */

let backendScoringAvailable: boolean | null = null;

export const isLeadScoringSupported = (): boolean => true;

export const getLeadLeaderboard = async (
  params: LeaderboardParams = {}
): Promise<LeadScoreRow[]> => {
  // If backend endpoint is confirmed available or not yet tested, attempt backend first
  if (backendScoringAvailable !== false) {
    try {
      const response = await apiClient.get<LeadScoreRow[]>(
        "/api/v1/lead-scoring/leaderboard",
        {
          params: {
            label: params.label || undefined,
            assigned_to: params.assigned_to || undefined,
            min_score: params.min_score || undefined,
            skip: params.skip ?? 0,
            limit: params.limit ?? 25,
          },
        }
      );
      backendScoringAvailable = true;
      return Array.isArray(response.data) ? response.data : [];
    } catch (err: any) {
      if (err?.response?.status === 404) {
        backendScoringAvailable = false;
        // Fall through to client-side rule-based scoring on real API leads
      } else {
        throw err;
      }
    }
  }

  // Fallback: load real leads from GET /api/v1/leads/
  const leads = await getLeads();
  let rows: LeadScoreRow[] = leads.map(convertLeadToScoreRow);

  // Filter by label
  if (params.label) {
    rows = rows.filter((r) => r.score_label === params.label);
  } else {
    // Default without label: show Hot, Warm, Cold (hide Dead and Converted)
    rows = rows.filter(
      (r) => Boolean(r.score_label) && ["Hot", "Warm", "Cold"].includes(r.score_label as string)
    );
  }

  // Filter by assigned user
  if (params.assigned_to) {
    rows = rows.filter((r) => r.assigned_to === params.assigned_to);
  }

  // Filter by min score
  if (typeof params.min_score === "number" && params.min_score > 0) {
    rows = rows.filter((r) => r.score >= (params.min_score as number));
  }

  // Sort by score descending, then scored_at/created_at descending
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const timeA = new Date(a.scored_at || 0).getTime();
    const timeB = new Date(b.scored_at || 0).getTime();
    return timeB - timeA;
  });

  const skip = params.skip ?? 0;
  const limit = params.limit ?? 25;
  return rows.slice(skip, skip + limit);
};

export const getLeadScoreDetail = async (
  leadId: string
): Promise<LeadScoreDetail> => {
  if (backendScoringAvailable !== false) {
    try {
      const response = await apiClient.get<LeadScoreDetail>(
        `/api/v1/lead-scoring/leads/${leadId}`
      );
      backendScoringAvailable = true;
      return response.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        backendScoringAvailable = false;
      } else {
        throw err;
      }
    }
  }

  const lead = await getLead(leadId);
  return buildLeadScoreDetail(lead);
};

export const recalculateLeadScore = async (
  leadId: string
): Promise<LeadScoreDetail> => {
  if (backendScoringAvailable !== false) {
    try {
      const response = await apiClient.post<LeadScoreDetail>(
        `/api/v1/lead-scoring/leads/${leadId}/recalculate`
      );
      backendScoringAvailable = true;
      return response.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        backendScoringAvailable = false;
      } else {
        throw err;
      }
    }
  }

  const lead = await getLead(leadId);
  return buildLeadScoreDetail(lead);
};

export const recalculateAllLeadScores = async (): Promise<RecalculateAllResult> => {
  if (backendScoringAvailable !== false) {
    try {
      const response = await apiClient.post<RecalculateAllResult>(
        "/api/v1/lead-scoring/recalculate-all"
      );
      backendScoringAvailable = true;
      return response.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        backendScoringAvailable = false;
      } else {
        throw err;
      }
    }
  }

  const leads = await getLeads();
  return { leads_scored: leads.length };
};
