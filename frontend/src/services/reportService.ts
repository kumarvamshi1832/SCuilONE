import { apiClient } from "./authService";
import type { ReportsSummary } from "../types/report";
import { getLeads } from "./leadService";
import { getDeals } from "./dealService";
import { getActivities } from "./activityService";
import { calculateTaskSummary } from "../utils/taskStatus";

let isReportsApiSupported = false;

export interface ReportFilters {
  start_date?: string;
  end_date?: string;
}

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

export const synthesizeReportsSummary = async (
  filters: ReportFilters = {}
): Promise<ReportsSummary> => {
  try {
    const [leadsRes, dealsRes, activitiesRes] = await Promise.allSettled([
      getLeads(),
      getDeals(),
      getActivities(),
    ]);

    const leads = leadsRes.status === "fulfilled" && Array.isArray(leadsRes.value) ? leadsRes.value : [];
    const deals = dealsRes.status === "fulfilled" && Array.isArray(dealsRes.value) ? dealsRes.value : [];
    const activities = activitiesRes.status === "fulfilled" && Array.isArray(activitiesRes.value) ? activitiesRes.value : [];

    const inDateRange = (itemDate?: string | null) => {
      if (!itemDate) return true;
      const d = itemDate.slice(0, 10);
      if (filters.start_date && d < filters.start_date) return false;
      if (filters.end_date && d > filters.end_date) return false;
      return true;
    };

    // 1. Deals & Sales
    const filteredDeals = deals.filter((d) => inDateRange(d.created_at || (d as any).expected_close_date));
    const total_deals = filteredDeals.length;
    const won_deals = filteredDeals.filter((d) => {
      const s = String(d.stage || "").toLowerCase();
      return s.includes("won") || s.includes("closed-won");
    }).length;
    const lost_deals = filteredDeals.filter((d) => {
      const s = String(d.stage || "").toLowerCase();
      return s.includes("lost") || s.includes("closed-lost");
    }).length;
    const open_deals = Math.max(0, total_deals - won_deals - lost_deals);
    const won_revenue = filteredDeals
      .filter((d) => {
        const s = String(d.stage || "").toLowerCase();
        return s.includes("won") || s.includes("closed-won");
      })
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    // 2. Leads
    const filteredLeads = leads.filter((l) => inDateRange(l.created_at));
    const total_leads = filteredLeads.length;
    const qualified_leads = filteredLeads.filter((l) => {
      const s = String(l.status || "").toLowerCase();
      return s.includes("qualif") || s.includes("contacted") || s.includes("warm") || s.includes("hot");
    }).length;
    const conversion_rate = total_leads > 0 ? (qualified_leads / total_leads) * 100 : 0;

    const leadStatusCounts: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      const st = l.status || "New";
      leadStatusCounts[st] = (leadStatusCounts[st] || 0) + 1;
    });
    const lead_status_breakdown = Object.entries(leadStatusCounts).map(([status, count]) => ({
      status,
      count,
    }));
    if (lead_status_breakdown.length === 0) {
      lead_status_breakdown.push({ status: "New", count: 0 });
    }

    // 3. Pipeline
    const pipelineMap: Record<string, { pipeline_name: string; stage_name: string; count: number }> = {};
    filteredDeals.forEach((d) => {
      const pName = (d as any).pipeline_name || "Sales Pipeline";
      const sName = d.stage || "New";
      const key = `${pName}___${sName}`;
      if (!pipelineMap[key]) {
        pipelineMap[key] = {
          pipeline_name: pName,
          stage_name: sName,
          count: 0,
        };
      }
      pipelineMap[key].count++;
    });
    let pipeline = Object.values(pipelineMap);
    if (pipeline.length === 0) {
      pipeline = [
        { pipeline_name: "Sales Pipeline", stage_name: "Prospecting", count: 0 },
        { pipeline_name: "Sales Pipeline", stage_name: "Negotiation", count: 0 },
        { pipeline_name: "Sales Pipeline", stage_name: "Closed Won", count: 0 },
      ];
    }

    // 4. Tasks & Activities
    const filteredActivities = activities.filter((a) => inDateRange(a.created_at || (a as any).due_date));
    const taskSummary = calculateTaskSummary(filteredActivities);
    const task_status_breakdown = [
      { status: "Pending", count: taskSummary.pending },
      { status: "Completed", count: taskSummary.completed },
      { status: "Overdue", count: taskSummary.overdue },
    ];

    return {
      filters: {
        start_date: filters.start_date || null,
        end_date: filters.end_date || null,
      },
      sales: {
        total_deals,
        won_deals,
        lost_deals,
        open_deals,
        won_revenue,
      },
      leads: {
        total_leads,
        qualified_leads,
        conversion_rate,
        status_breakdown: lead_status_breakdown,
      },
      pipeline,
      tasks: {
        total_tasks: taskSummary.total,
        pending_tasks: taskSummary.pending,
        completed_tasks: taskSummary.completed,
        overdue_tasks: taskSummary.overdue,
        status_breakdown: task_status_breakdown,
      },
    };
  } catch (err) {
    console.warn("Failed to synthesize reports summary, returning default metrics", err);
    return {
      filters: {
        start_date: filters.start_date || null,
        end_date: filters.end_date || null,
      },
      sales: {
        total_deals: 0,
        won_deals: 0,
        lost_deals: 0,
        open_deals: 0,
        won_revenue: 0,
      },
      leads: {
        total_leads: 0,
        qualified_leads: 0,
        conversion_rate: 0,
        status_breakdown: [{ status: "New", count: 0 }],
      },
      pipeline: [
        { pipeline_name: "Sales Pipeline", stage_name: "Prospecting", count: 0 },
      ],
      tasks: {
        total_tasks: 0,
        pending_tasks: 0,
        completed_tasks: 0,
        overdue_tasks: 0,
        status_breakdown: [
          { status: "Pending", count: 0 },
          { status: "Completed", count: 0 },
          { status: "Overdue", count: 0 },
        ],
      },
    };
  }
};

export const getReportsSummary = async (
  filters: ReportFilters = {}
): Promise<ReportsSummary> => {
  if (!isReportsApiSupported) {
    return synthesizeReportsSummary(filters);
  }

  const params: Record<string, string> = {};
  if (filters.start_date) params.start_date = filters.start_date;
  if (filters.end_date) params.end_date = filters.end_date;

  try {
    const response = await apiClient.get<ReportsSummary>(
      "/api/v1/reports/summary",
      {
        ...getHeaders(),
        params,
      }
    );
    return response.data;
  } catch (err) {
    console.warn("Reports API endpoint returned error or not available. Synthesizing report locally.", err);
    isReportsApiSupported = false;
    return synthesizeReportsSummary(filters);
  }
  return synthesizeReportsSummary(filters);
};
