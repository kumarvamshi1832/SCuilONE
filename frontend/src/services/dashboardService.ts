import { DashboardSummary, TenantDetails, Activity } from "../types/dashboard";
import { getLeads } from "./leadService";
import { getContacts } from "./contactService";
import { getAccounts } from "./accountService";
import { getDeals } from "./dealService";
import { getActivities } from "./activityService";
import { getProperties } from "./propertyService";
import { getBookings } from "./bookingService";
import { getSiteVisits } from "./siteVisitService";
import { calculateTaskSummary } from "../utils/taskStatus";
import { formatDateTime } from "../utils/dateFormatter";

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  // Call registered backend endpoints and dynamic tenant services in parallel
  const [
    leadsRes,
    contactsRes,
    accountsRes,
    dealsRes,
    activitiesRes,
    propertiesRes,
    bookingsRes,
    siteVisitsRes,
  ] = await Promise.allSettled([
    getLeads(),
    getContacts(),
    getAccounts(),
    getDeals(),
    getActivities(),
    getProperties(),
    getBookings(),
    getSiteVisits(),
  ]);

  // Properties metrics
  let totalProperties: number | null = null;
  let activeListings: number | null = null;

  if (propertiesRes.status === "fulfilled" && Array.isArray(propertiesRes.value)) {
    const properties = propertiesRes.value;
    totalProperties = properties.length;
    activeListings = properties.filter((p) => {
      const status = (p.status || "").trim().toLowerCase();
      return status === "available" || status === "active";
    }).length;
  }

  // Bookings metrics
  let bookings: number | null = null;
  if (bookingsRes.status === "fulfilled" && Array.isArray(bookingsRes.value)) {
    bookings = bookingsRes.value.length;
  }

  // Site visits metrics
  let siteVisits: number | null = null;
  if (siteVisitsRes.status === "fulfilled" && Array.isArray(siteVisitsRes.value)) {
    siteVisits = siteVisitsRes.value.length;
  }

  // Leads metrics & breakdown
  let totalLeads: number | null = null;
  let qualifiedLeads: number | null = null;
  let leadStatusBreakdown: { status: string; count: number }[] = [];

  if (leadsRes.status === "fulfilled" && Array.isArray(leadsRes.value)) {
    const leads = leadsRes.value;
    totalLeads = leads.length;
    qualifiedLeads = leads.filter(
      (l) => (l.status || "").trim().toLowerCase() === "qualified"
    ).length;

    const statusCounts: Record<string, number> = {};
    leads.forEach((l) => {
      const raw = (l.status || "New").trim();
      const s = raw
        ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
        : "New";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    leadStatusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));
  }

  // Contacts metric
  let totalContacts: number | null = null;
  if (contactsRes.status === "fulfilled" && Array.isArray(contactsRes.value)) {
    totalContacts = contactsRes.value.length;
  }

  // Accounts metric
  let totalAccounts: number | null = null;
  if (accountsRes.status === "fulfilled" && Array.isArray(accountsRes.value)) {
    totalAccounts = accountsRes.value.length;
  }

  // Deals metrics & breakdown
  let totalDeals: number | null = null;
  let openDeals: number | null = null;
  let wonRevenue: number | null = null;
  let dealStageBreakdown: { stage: string; count: number }[] = [];

  if (dealsRes.status === "fulfilled" && Array.isArray(dealsRes.value)) {
    const deals = dealsRes.value;
    totalDeals = deals.length;

    const closedStages = ["won", "closed won", "lost", "closed lost"];
    openDeals = deals.filter((d) => {
      const stage = (d.stage || "").trim().toLowerCase();
      return !closedStages.includes(stage);
    }).length;

    wonRevenue = deals
      .filter((d) => {
        const stage = (d.stage || "").trim().toLowerCase();
        return stage === "won" || stage === "closed won";
      })
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    const stageCounts: Record<string, number> = {};
    deals.forEach((d) => {
      const raw = (d.stage || "New").trim();
      const s = raw
        ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
        : "New";
      stageCounts[s] = (stageCounts[s] || 0) + 1;
    });
    dealStageBreakdown = Object.entries(stageCounts).map(([stage, count]) => ({
      stage,
      count,
    }));
  }

  // Activities / Tasks metrics
  let pendingTasks: number | null = null;
  let completedTasks: number | null = null;
  let overdueTasks: number | null = null;

  if (activitiesRes.status === "fulfilled" && Array.isArray(activitiesRes.value)) {
    const stats = calculateTaskSummary(activitiesRes.value);
    completedTasks = stats.completed;
    pendingTasks = stats.pending;
    overdueTasks = stats.overdue;
  }

  return {
    totalProperties,
    activeListings,
    totalLeads,
    openDeals,
    siteVisits,
    bookings,
    qualifiedLeads,
    totalContacts,
    totalAccounts,
    totalDeals,
    wonRevenue,
    pendingTasks,
    completedTasks,
    overdueTasks,
    leadStatusBreakdown,
    dealStageBreakdown,
  };
};

export const getTenantDetails = async (): Promise<TenantDetails> => {
  const tenantStr =
    sessionStorage.getItem("tenant") || localStorage.getItem("tenant");
  if (tenantStr) {
    try {
      const parsed = JSON.parse(tenantStr);
      if (parsed && typeof parsed === "object") {
        const companyName =
          parsed.name ||
          parsed.company_name ||
          parsed.company ||
          parsed.organization_name ||
          "";
        return {
          id: String(parsed.id || ""),
          name:
            typeof companyName === "string" && companyName.trim()
              ? companyName.trim()
              : "Unknown",
          industry: String(parsed.industry || "").trim(),
        };
      }
    } catch (e) {}
  }

  const userStr =
    sessionStorage.getItem("user") || localStorage.getItem("user");
  if (userStr) {
    try {
      const parsedUser = JSON.parse(userStr);
      if (parsedUser?.tenant && typeof parsedUser.tenant === "object") {
        const tenantComp =
          parsedUser.tenant.name ||
          parsedUser.tenant.company_name ||
          parsedUser.tenant.company ||
          "";
        return {
          id: String(parsedUser.tenant.id || ""),
          name:
            typeof tenantComp === "string" && tenantComp.trim()
              ? tenantComp.trim()
              : "Unknown",
          industry: String(parsedUser.tenant.industry || "").trim(),
        };
      }
      const userCompany =
        parsedUser.company ||
        parsedUser.company_name ||
        parsedUser.organization_name ||
        "";
      if (typeof userCompany === "string" && userCompany.trim()) {
        return {
          id: String(parsedUser.tenant_id || ""),
          name: userCompany.trim(),
          industry: String(parsedUser.industry || "").trim(),
        };
      }
    } catch (e) {}
  }

  return { id: "", name: "Unknown", industry: "" };
};

export const getRecentActivities = async (): Promise<Activity[]> => {
  try {
    const list = await getActivities();
    if (Array.isArray(list)) {
      return list.slice(0, 5).map((a) => ({
        id: String(a.id || Math.random()),
        description: a.title
          ? a.description
            ? `${a.title}: ${a.description}`
            : a.title
          : a.description || "Activity",
        timestamp: a.created_at ? formatDateTime(a.created_at) : "",
      }));
    }
    return [];
  } catch {
    return [];
  }
};
