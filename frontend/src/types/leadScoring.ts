/**
 * Lead scoring. Mirrors backend/app/routes/lead_scoring.py and
 * backend/app/services/lead_scoring.py (rule-based, explainable score of 0-100).
 */

/** Labels accepted by the leaderboard `label` filter. */
export const LEAD_SCORE_LABELS = ["Hot", "Warm", "Cold", "Converted", "Dead"] as const;
export type LeadScoreLabel = (typeof LEAD_SCORE_LABELS)[number];

/** Row of GET /api/v1/lead-scoring/leaderboard. */
export interface LeadScoreRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
  assigned_to: string | null;
  score: number;
  score_label: LeadScoreLabel | string | null;
  scored_at: string | null;
}

/**
 * The breakdown is a JSON object built by the backend:
 * { profile: {factor: points}, engagement: {factor: points}, total: number, ... }.
 * Only the keys documented in lead_scoring.py are typed; anything else is rendered generically.
 */
export interface LeadScoreBreakdown {
  profile?: Record<string, number>;
  engagement?: Record<string, number>;
  total?: number;
  [key: string]: unknown;
}

/** Response of GET /leads/{id} and POST /leads/{id}/recalculate. */
export interface LeadScoreDetail extends LeadScoreRow {
  breakdown: LeadScoreBreakdown;
}

export interface LeaderboardParams {
  label?: LeadScoreLabel;
  assigned_to?: string;
  min_score?: number;
  skip?: number;
  limit?: number;
}

/** Response of POST /api/v1/lead-scoring/recalculate-all */
export interface RecalculateAllResult {
  leads_scored: number;
}
