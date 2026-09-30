import { DashboardSummary, TenantDetails, Activity } from "../types/dashboard";
import { mockDashboardSummary, mockTenant, mockActivities } from "../mock/dashboardData";

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockDashboardSummary;
};

export const getTenantDetails = async (): Promise<TenantDetails> => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return mockTenant;
};

export const getRecentActivities = async (): Promise<Activity[]> => {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return mockActivities;
};
