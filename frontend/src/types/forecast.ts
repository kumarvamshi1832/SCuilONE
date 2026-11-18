/**
 * Sales forecast. Mirrors backend/app/routes/forecast.py and
 * backend/app/services/forecast_service.py. All amounts are computed by the backend
 * (open deal amount x stage win probability); the frontend never recomputes them.
 */

export interface ForecastBucket {
  deal_count: number;
  pipeline_amount: number;
  weighted_amount: number;
}

export interface ForecastTotals extends ForecastBucket {
  overdue_close_date_deals: number;
  no_close_date_deals: number;
  won_this_month: number;
  won_deals_this_month: number;
  lost_deals_this_month: number;
  won_lost_basis: string;
}

export interface ForecastCategories {
  commit: number;
  best_case: number;
  pipeline: number;
}

export interface ForecastPeriod extends ForecastBucket {
  /** "overdue", "YYYY-MM", "later" or "unscheduled". */
  period: string;
  label: string;
}

export interface ForecastStageRow extends ForecastBucket {
  stage: string;
  probability: number;
}

export interface ForecastOwnerRow extends ForecastBucket {
  user_id: string | null;
  user_name: string;
}

/** GET /api/v1/forecast/summary */
export interface ForecastSummary {
  as_of: string;
  months: number;
  totals: ForecastTotals;
  forecast_categories: ForecastCategories;
  by_month: ForecastPeriod[];
  by_stage: ForecastStageRow[];
  by_owner: ForecastOwnerRow[];
}

export interface ForecastSummaryParams {
  months?: number;
  pipeline_id?: string;
  assigned_to?: string;
}

/** Item of GET /api/v1/forecast/stages */
export interface StageProbability {
  stage_id: string;
  pipeline_id: string;
  pipeline_name: string;
  stage_name: string;
  position: number;
  probability: number | null;
  is_closed_won: boolean;
  is_closed_lost: boolean;
}

/** Response of PUT /api/v1/forecast/stages/{stage_id}/probability */
export interface StageProbabilityUpdateResult {
  stage_id: string;
  stage_name: string;
  probability: number;
}
