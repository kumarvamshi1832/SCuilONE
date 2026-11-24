import type { Deal } from "../types/deal";
import type {
  ForecastSummary,
  ForecastTotals,
  ForecastCategories,
  ForecastPeriod,
  ForecastStageRow,
  ForecastOwnerRow,
} from "../types/forecast";

const WON_NAMES = new Set(["won", "closed won", "closed_won", "closed-won"]);
const LOST_NAMES = new Set(["lost", "closed lost", "closed_lost", "closed-lost"]);
const DEFAULT_OPEN_PROBABILITY = 20;

function norm(v: string | null | undefined): string {
  return (v || "").trim().toLowerCase();
}

function money(v: number): number {
  return Math.round(v * 100) / 100;
}

export function computeForecastSummaryFromDeals(
  deals: Deal[],
  months = 6,
  pipelineId?: string,
  assignedTo?: string,
  userMap?: Map<string, string>
): ForecastSummary {
  let filtered = deals;
  if (pipelineId) {
    filtered = filtered.filter((d: any) => d.pipeline_id === pipelineId);
  }
  if (assignedTo) {
    filtered = filtered.filter(
      (d: any) => d.assigned_to === assignedTo || d.owner_id === assignedTo
    );
  }

  let totalCount = 0;
  let totalPipelineAmount = 0;
  let totalWeightedAmount = 0;
  let overdueDeals = 0;
  let noCloseDateDeals = 0;
  let wonThisMonth = 0;
  let wonDealsThisMonth = 0;
  let lostDealsThisMonth = 0;

  let categoryPipeline = 0;
  let categoryBestCase = 0;
  let categoryCommit = 0;

  const stageBuckets = new Map<
    string,
    { deal_count: number; pipeline_amount: number; weighted_amount: number; probability: number }
  >();
  const ownerBuckets = new Map<
    string,
    { deal_count: number; pipeline_amount: number; weighted_amount: number }
  >();

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const monthBuckets = new Map<
    string,
    { period: string; label: string; deal_count: number; pipeline_amount: number; weighted_amount: number }
  >();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    monthBuckets.set(key, {
      period: key,
      label,
      deal_count: 0,
      pipeline_amount: 0,
      weighted_amount: 0,
    });
  }

  for (const deal of filtered) {
    const val = Number(deal.amount || (deal as any).value || 0);
    const stageName = deal.stage || "New";
    const sNorm = norm(stageName);

    let classification: "won" | "lost" | "open" = "open";
    let prob = (deal as any).probability ?? DEFAULT_OPEN_PROBABILITY;

    if (WON_NAMES.has(sNorm)) {
      classification = "won";
      prob = 100;
    } else if (LOST_NAMES.has(sNorm)) {
      classification = "lost";
      prob = 0;
    }

    const closeDate = deal.expected_close_date || (deal as any).closed_date || deal.created_at;
    let dealMonthKey = "";
    if (closeDate) {
      const dDate = new Date(closeDate);
      if (!Number.isNaN(dDate.getTime())) {
        dealMonthKey = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, "0")}`;
        if (dDate < now && classification === "open") {
          overdueDeals += 1;
        }
      } else {
        noCloseDateDeals += 1;
      }
    } else {
      noCloseDateDeals += 1;
    }

    if (dealMonthKey === currentMonthKey) {
      if (classification === "won") {
        wonThisMonth += val;
        wonDealsThisMonth += 1;
      } else if (classification === "lost") {
        lostDealsThisMonth += 1;
      }
    }

    if (classification === "lost") {
      continue;
    }

    const weighted = (val * prob) / 100;

    totalCount += 1;
    totalPipelineAmount += val;
    totalWeightedAmount += weighted;

    if (classification === "open") {
      categoryPipeline += weighted;
      if (prob >= 50) categoryBestCase += weighted;
      if (prob >= 75) categoryCommit += weighted;
    }

    // Stage
    const stageData = stageBuckets.get(stageName) || {
      deal_count: 0,
      pipeline_amount: 0,
      weighted_amount: 0,
      probability: prob,
    };
    stageData.deal_count += 1;
    stageData.pipeline_amount += val;
    stageData.weighted_amount += weighted;
    stageData.probability = prob;
    stageBuckets.set(stageName, stageData);

    // Owner
    const ownerId = deal.assigned_to || (deal as any).owner_id || "unassigned";
    const ownerData = ownerBuckets.get(ownerId) || {
      deal_count: 0,
      pipeline_amount: 0,
      weighted_amount: 0,
    };
    ownerData.deal_count += 1;
    ownerData.pipeline_amount += val;
    ownerData.weighted_amount += weighted;
    ownerBuckets.set(ownerId, ownerData);

    // Month
    if (dealMonthKey && monthBuckets.has(dealMonthKey)) {
      const mBucket = monthBuckets.get(dealMonthKey)!;
      mBucket.deal_count += 1;
      mBucket.pipeline_amount += val;
      mBucket.weighted_amount += weighted;
    }
  }

  const totals: ForecastTotals = {
    deal_count: totalCount,
    pipeline_amount: money(totalPipelineAmount),
    weighted_amount: money(totalWeightedAmount),
    overdue_close_date_deals: overdueDeals,
    no_close_date_deals: noCloseDateDeals,
    won_this_month: money(wonThisMonth),
    won_deals_this_month: wonDealsThisMonth,
    lost_deals_this_month: lostDealsThisMonth,
    won_lost_basis: "closed_date",
  };

  const forecast_categories: ForecastCategories = {
    pipeline: money(categoryPipeline),
    best_case: money(categoryBestCase),
    commit: money(categoryCommit),
  };

  const by_month: ForecastPeriod[] = Array.from(monthBuckets.values()).map((b) => ({
    period: b.period,
    label: b.label,
    deal_count: b.deal_count,
    pipeline_amount: money(b.pipeline_amount),
    weighted_amount: money(b.weighted_amount),
  }));

  const by_stage: ForecastStageRow[] = Array.from(stageBuckets.entries()).map(([name, s]) => ({
    stage: name,
    probability: s.probability,
    deal_count: s.deal_count,
    pipeline_amount: money(s.pipeline_amount),
    weighted_amount: money(s.weighted_amount),
  }));

  const by_owner: ForecastOwnerRow[] = Array.from(ownerBuckets.entries()).map(([id, o]) => ({
    user_id: id === "unassigned" ? null : id,
    user_name: id === "unassigned" ? "Unassigned" : userMap?.get(id) || "Team Member",
    deal_count: o.deal_count,
    pipeline_amount: money(o.pipeline_amount),
    weighted_amount: money(o.weighted_amount),
  }));

  return {
    as_of: new Date().toISOString(),
    months,
    totals,
    forecast_categories,
    by_month,
    by_stage,
    by_owner,
  };
}
