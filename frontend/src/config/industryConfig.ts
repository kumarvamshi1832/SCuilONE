import { tryNormalizeIndustry } from "../utils/industryUtils";

export type IndustryConfig = {
  name: string;
  slug: string;
  dashboardTitle: string;
  leadLabel: string;
  contactLabel: string;
  accountLabel: string;
  dealLabel: string;
  pipelineLabel: string;
  primaryEntity: string;
  modules: string[];
  /**
   * Subscription module keys (backend/app/core/subscription_config.py) that belong to this industry. Only
   * industries for which the backend defines entitlement modules list any; the others have none yet.
   */
  subscriptionModules?: string[];
};

/** Core CRM keys that every tenant's plan carries (COMMON_CRM_MODULES in the backend), in display order. */
export const CORE_SUBSCRIPTION_MODULES: readonly string[] = [
  "leads",
  "contacts",
  "accounts",
  "deals",
  "activities",
  "pipelines",
  "workflows",
  "reports",
  "dashboard",
  "documents",
  "form_templates",
  "import_export",
  "search",
  "audit_logs",
];

/** Readable names for subscription module keys (the raw keys are backend identifiers). */
export const SUBSCRIPTION_MODULE_LABELS: Record<string, string> = {
  leads: "Leads",
  contacts: "Contacts",
  accounts: "Accounts",
  deals: "Deals",
  activities: "Activities & Tasks",
  pipelines: "Pipelines",
  workflows: "Workflows",
  reports: "Reports",
  dashboard: "Dashboard",
  documents: "Documents",
  form_templates: "Form Templates",
  import_export: "Import & Export",
  search: "Global Search",
  audit_logs: "Audit Logs",
  properties: "Properties",
  buildings: "Buildings",
  real_estate_projects: "Real Estate Projects",
  buyer_requirements: "Buyer Requirements",
  property_matches: "Property Matches",
  site_visits: "Site Visits",
  bookings: "Bookings",
  payments: "Payments",
  payment_plans: "Payment Plans",
  payment_refunds: "Payment Refunds",
  software_requirements: "Software Requirements",
  software_estimates: "Software Estimates",
  software_contracts: "Software Contracts",
  software_projects: "Software Projects",
  software_sprints: "Software Sprints",
  software_time_entries: "Time Tracking",
  software_invoices: "Invoices & Billing",
  software_delivery_reports: "Delivery Reports",
};

const sharedModules = [
  "dashboard",
  "leads",
  "contacts",
  "accounts",
  "deals",
  "pipelines",
  "activities",
  "tasks",
  "reports",
  "forecast",
  "lead-scoring",
  "trash",
  "customer-chat",
  "emails",
  "custom-fields",
];

const adminModules = [
  "users",
  "roles",
  // "permissions" is intentionally not listed: the tenant-side Permissions Catalog is removed from the
  // CRM. The /:industry/permissions route is still gated by this list and redirects to the dashboard.
  "form-builder",
  "workflows",
  "settings",
];

const industries: IndustryConfig[] = [
  {
    name: "Real Estate",
    slug: "real-estate",
    subscriptionModules: [
      "properties",
      "buildings",
      "real_estate_projects",
      "buyer_requirements",
      "property_matches",
      "site_visits",
      "bookings",
      "payments",
      "payment_plans",
      "payment_refunds",
    ],
    dashboardTitle: "Real Estate Overview",
    leadLabel: "Leads",
    contactLabel: "Buyers & Contacts",
    accountLabel: "Owners & Builders",
    dealLabel: "Deals & Bookings",
    pipelineLabel: "Property Sales Pipeline",
    primaryEntity: "Properties",
    modules: [
      ...sharedModules,
      "projects",
      "buildings",
      "properties",
      "buyer-requirements",
      "site-visits",
      "bookings",
      "customer-booking-requests",
      "rentals",
      "payments",
      "audit-logs",
      "documents",
      ...adminModules,
    ],
  },
  {
    name: "Education Consulting",
    slug: "education-consulting",
    dashboardTitle: "Education Consulting Overview",
    leadLabel: "Prospective Students",
    contactLabel: "Students & Contacts",
    accountLabel: "Universities",
    dealLabel: "Applications",
    pipelineLabel: "Admissions Pipeline",
    primaryEntity: "Students",
    modules: [
      ...sharedModules,
      "students",
      "universities",
      "programs",
      "applications",
      "counselling",
      "documents",
      ...adminModules,
    ],
  },
  {
    name: "Training Institute",
    slug: "training-institute",
    dashboardTitle: "Training Institute Overview",
    leadLabel: "Leads",
    contactLabel: "Learners",
    accountLabel: "Corporate Clients",
    dealLabel: "Enrollments",
    pipelineLabel: "Enrollment Pipeline",
    primaryEntity: "Courses",
    modules: [
      ...sharedModules,
      "courses",
      "batches",
      "enrollments",
      "trainers",
      "attendance",
      "fees",
      "certificates",
      "documents",
      ...adminModules,
    ],
  },
  {
    name: "Digital Marketing Agency",
    slug: "digital-marketing-agency",
    dashboardTitle: "Agency Overview",
    leadLabel: "Leads",
    contactLabel: "Clients",
    accountLabel: "Client Accounts",
    dealLabel: "Campaign Deals",
    pipelineLabel: "Agency Sales Pipeline",
    primaryEntity: "Campaigns",
    modules: [
      ...sharedModules,
      "services",
      "campaigns",
      "client-projects",
      "content-calendar",
      "proposals",
      "documents",
      ...adminModules,
    ],
  },
  {
    name: "Software Company",
    slug: "software-company",
    subscriptionModules: [
      "software_requirements",
      "software_estimates",
      "software_contracts",
      "software_projects",
      "software_sprints",
      "software_time_entries",
      "software_invoices",
      "software_delivery_reports",
    ],
    dashboardTitle: "Software Sales Overview",
    leadLabel: "Leads",
    contactLabel: "Contacts",
    accountLabel: "Business Accounts",
    dealLabel: "Sales Opportunities",
    pipelineLabel: "Sales Pipeline",
    primaryEntity: "Opportunities",
    modules: [
      ...sharedModules,
      "software-requirements",
      "software-estimates",
      "software-contracts",
      "software-projects",
      "software-sprints",
      "software-time-tracking",
      "software-delivery-reports",
      "software-invoices",
      "products",
      "proposals",
      "contracts",
      "renewals",
      "customer-success",
      "documents",
      ...adminModules,
    ],
  },
  {
    name: "Insurance Agency",
    slug: "insurance-agency",
    dashboardTitle: "Insurance Overview",
    leadLabel: "Prospects",
    contactLabel: "Policyholders",
    accountLabel: "Accounts",
    dealLabel: "Policy Opportunities",
    pipelineLabel: "Insurance Sales Pipeline",
    primaryEntity: "Policies",
    modules: [
      ...sharedModules,
      "quotes",
      "policies",
      "renewals",
      "claims",
      "premiums",
      "commissions",
      "documents",
      ...adminModules,
    ],
  },
  {
    name: "Automobile Dealer",
    slug: "automobile-dealer",
    dashboardTitle: "Automobile Sales Overview",
    leadLabel: "Leads",
    contactLabel: "Customers",
    accountLabel: "Fleet Accounts",
    dealLabel: "Vehicle Deals",
    pipelineLabel: "Vehicle Sales Pipeline",
    primaryEntity: "Vehicles",
    modules: [
      ...sharedModules,
      "vehicles",
      "test-drives",
      "quotations",
      "bookings",
      "deliveries",
      "service",
      "documents",
      ...adminModules,
    ],
  },
  {
    name: "Interior Designer",
    slug: "interior-designer",
    dashboardTitle: "Interior Design Overview",
    leadLabel: "Leads",
    contactLabel: "Clients",
    accountLabel: "Accounts & Vendors",
    dealLabel: "Design Projects",
    pipelineLabel: "Project Pipeline",
    primaryEntity: "Projects",
    modules: [
      ...sharedModules,
      "consultations",
      "design-projects",
      "site-visits",
      "quotations",
      "milestones",
      "approvals",
      "documents",
      ...adminModules,
    ],
  },
  {
    name: "Travel Company",
    slug: "travel-company",
    dashboardTitle: "Travel Sales Overview",
    leadLabel: "Travel Enquiries",
    contactLabel: "Travellers",
    accountLabel: "Corporate Accounts",
    dealLabel: "Bookings",
    pipelineLabel: "Booking Pipeline",
    primaryEntity: "Trips",
    modules: [
      ...sharedModules,
      "itineraries",
      "trips",
      "bookings",
      "suppliers",
      "invoices",
      "commissions",
      "documents",
      ...adminModules,
    ],
  },
  {
    name: "B2B Sales",
    slug: "b2b-sales",
    dashboardTitle: "B2B Sales Overview",
    leadLabel: "Leads",
    contactLabel: "Contacts",
    accountLabel: "Business Accounts",
    dealLabel: "Sales Opportunities",
    pipelineLabel: "B2B Sales Pipeline",
    primaryEntity: "Opportunities",
    modules: [
      ...sharedModules,
      "products",
      "proposals",
      "orders",
      "contracts",
      "renewals",
      "documents",
      ...adminModules,
    ],
  },
];

const DEFAULT_UNKNOWN_INDUSTRY_CONFIG: IndustryConfig = {
  name: "Unsupported Industry",
  slug: "",
  dashboardTitle: "Industry Unavailable",
  leadLabel: "Leads",
  contactLabel: "Contacts",
  accountLabel: "Accounts",
  dealLabel: "Deals",
  pipelineLabel: "Sales Pipeline",
  primaryEntity: "Records",
  modules: ["dashboard"],
};

export const INDUSTRY_CONFIGS: Record<string, IndustryConfig> =
  Object.fromEntries(
    industries.map((industry) => [industry.slug, industry])
  );

export const normalizeIndustrySlug = (
  industry?: string | null
): string => {
  const norm = tryNormalizeIndustry(industry);
  if (norm && INDUSTRY_CONFIGS[norm]) {
    return norm;
  }
  const value = (industry ?? "").trim().toLowerCase();
  if (!value) {
    return "";
  }

  const existing = Object.values(INDUSTRY_CONFIGS).find(
    (config) =>
      config.slug === value ||
      config.name.toLowerCase() === value
  );

  return existing?.slug ?? "";
};

export const getIndustryConfig = (
  industry?: string | null
): IndustryConfig => {
  const slug = normalizeIndustrySlug(industry);

  return (
    (slug ? INDUSTRY_CONFIGS[slug] : undefined) ??
    DEFAULT_UNKNOWN_INDUSTRY_CONFIG
  );
};
