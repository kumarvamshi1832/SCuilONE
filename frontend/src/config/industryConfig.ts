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
];

const adminModules = [
  "users",
  "roles",
  "permissions",
  "form-builder",
  "workflows",
  "settings",
];

const industries: IndustryConfig[] = [
  {
    name: "Real Estate",
    slug: "real-estate",
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
    dashboardTitle: "Software Sales Overview",
    leadLabel: "Leads",
    contactLabel: "Contacts",
    accountLabel: "Business Accounts",
    dealLabel: "Sales Opportunities",
    pipelineLabel: "Sales Pipeline",
    primaryEntity: "Opportunities",
    modules: [
      ...sharedModules,
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

export const INDUSTRY_CONFIGS: Record<string, IndustryConfig> =
  Object.fromEntries(
    industries.map((industry) => [industry.slug, industry])
  );

export const normalizeIndustrySlug = (
  industry?: string | null
): string => {
  const value = (industry || "real-estate").trim().toLowerCase();

  const existing = Object.values(INDUSTRY_CONFIGS).find(
    (config) =>
      config.slug === value ||
      config.name.toLowerCase() === value
  );

  return existing?.slug || value.replace(/\s+/g, "-");
};

export const getIndustryConfig = (
  industry?: string | null
): IndustryConfig => {
  const slug = normalizeIndustrySlug(industry);

  return (
    INDUSTRY_CONFIGS[slug] ??
    INDUSTRY_CONFIGS["software-company"]!
  );
};
