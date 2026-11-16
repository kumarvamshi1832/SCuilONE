function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${msg || ""}`
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, msg?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Deep assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${msg || ""}`
    );
  }
}

const assert = {
  equal: assertEqual,
  deepEqual: assertDeepEqual,
};
import {
  KNOWN_INDUSTRY_SLUGS,
  getIndustryDisplayName,
  isKnownIndustry,
  normalizeIndustry,
  tryNormalizeIndustry,
} from "./industryUtils";
import {
  getIndustryConfig,
  normalizeIndustrySlug,
} from "../config/industryConfig";
import {
  classifyCrmRole,
  isPlatformIdentity,
  isPlatformRole,
  resolveCrmDashboardDestination,
} from "./authRouting";

function run() {
  console.log("=== Running Frontend Industry & Auth Routing Tests ===");

  // 1. All 10 official industries normalize without Real Estate fallback
  for (const slug of KNOWN_INDUSTRY_SLUGS) {
    assert.equal(
      tryNormalizeIndustry(slug),
      slug,
      `Expected ${slug} to normalize to itself`
    );
    assert.equal(isKnownIndustry(slug), true);
    assert.equal(normalizeIndustrySlug(slug), slug);
    const cfg = getIndustryConfig(slug);
    assert.equal(cfg.slug, slug, `Expected config slug ${slug}`);
  }

  // Plural / label aliases
  const aliasCases: Array<[string, string]> = [
    ["Real Estate", "real-estate"],
    ["real_estate", "real-estate"],
    ["Software Company", "software-company"],
    ["software_companies", "software-company"],
    ["Software Services", "software-company"],
    ["Education Consulting", "education-consulting"],
    ["Training Institute", "training-institute"],
    ["training_institutes", "training-institute"],
    ["Digital Marketing Agency", "digital-marketing-agency"],
    ["Insurance Agency", "insurance-agency"],
    ["Automobile Dealer", "automobile-dealer"],
    ["automobile_dealers", "automobile-dealer"],
    ["Interior Designer", "interior-designer"],
    ["interior_designers", "interior-designer"],
    ["Travel Company", "travel-company"],
    ["travel_companies", "travel-company"],
    ["B2B Sales", "b2b-sales"],
  ];
  for (const [input, expected] of aliasCases) {
    assert.equal(
      tryNormalizeIndustry(input),
      expected,
      `Alias ${input} -> ${expected}`
    );
    assert.equal(normalizeIndustrySlug(input), expected);
    assert.equal(getIndustryConfig(input).slug, expected);
  }

  // Unknown or missing industries NEVER default to real-estate
  for (const unknown of [
    "",
    "   ",
    null,
    undefined,
    "Platform Operations",
    "platform_operations",
    "Healthcare",
    "Unknown Industry",
  ]) {
    assert.equal(
      tryNormalizeIndustry(unknown),
      null,
      `Unknown industry "${String(unknown)}" must return null`
    );
    assert.equal(normalizeIndustry(unknown), "");
    assert.equal(normalizeIndustrySlug(unknown), "");
    assert.equal(getIndustryConfig(unknown).slug, "");
  }
  assert.equal(getIndustryDisplayName(null), "");
  assert.equal(getIndustryDisplayName(""), "");
  assert.equal(getIndustryDisplayName("Platform Operations"), "Platform Operations");

  // 2. All 18 platform roles must be detected as platform and NEVER match CRM roles
  const platformRoles = [
    "Platform Super Admin",
    "PLATFORM_SUPER_ADMIN",
    "Platform Admin",
    "Platform Manager",
    "Platform Support",
    "Sales",
    "Billing",
    "Technical",
    "Audit",
    "Finance",
    "Security Administrator",
    "Analyst",
    "Team Admin",
    "Team Manager",
    "Industry Support",
    "Team Auditor",
    "Team Finance",
    "Team Analyst",
    "Industry Sales",
  ];
  for (const role of platformRoles) {
    assert.equal(
      isPlatformRole(role),
      true,
      `Platform role "${role}" must be detected as platform`
    );
    assert.equal(
      classifyCrmRole(role),
      null,
      `Platform role "${role}" must NOT classify as a CRM role`
    );
    assert.equal(
      resolveCrmDashboardDestination(role, "Real Estate").ok,
      false,
      `Platform role "${role}" must not resolve to a CRM dashboard`
    );
  }

  // Platform tenant metadata detection
  assert.equal(
    isPlatformIdentity({
      role: "Custom Platform Observer",
      tenant: { name: "SCuilONE Platform", industry: "Platform Operations" },
    }),
    true
  );
  assert.equal(
    isPlatformIdentity({
      role: "Tenant Admin",
      tenant: { name: "Acme Homes", industry: "Real Estate" },
    }),
    false
  );

  // 3. CRM roles route cleanly
  const tenantAdminRes = resolveCrmDashboardDestination(
    "Tenant Admin",
    "Software Company"
  );
  assert.deepEqual(tenantAdminRes, {
    ok: true,
    destination: "/software-company/dashboard",
    crmRole: "TENANT_ADMIN",
    industrySlug: "software-company",
  });

  const tenantOwnerRes = resolveCrmDashboardDestination(
    "Tenant Owner",
    "Automobile Dealer"
  );
  assert.deepEqual(tenantOwnerRes, {
    ok: true,
    destination: "/automobile-dealer/dashboard",
    crmRole: "TENANT_ADMIN",
    industrySlug: "automobile-dealer",
  });

  const crmRoleCases: Array<[string, string, string]> = [
    ["Manager", "Real Estate", "/manager/dashboard"],
    ["MANAGER", "Software Company", "/manager/dashboard"],
    ["Sales User", "Real Estate", "/sales/dashboard"],
    ["SALES_USER", "Travel Company", "/sales/dashboard"],
    ["Operations User", "Interior Designer", "/operations/dashboard"],
    ["OPERATIONS_USER", "Real Estate", "/operations/dashboard"],
    ["Support User", "Real Estate", "/support/dashboard"],
    ["SUPPORT_USER", "B2B Sales", "/support/dashboard"],
    ["Read-only / Auditor", "Real Estate", "/auditor/dashboard"],
    ["READ_ONLY", "Education Consulting", "/auditor/dashboard"],
    ["Auditor", "Insurance Agency", "/auditor/dashboard"],
  ];
  for (const [role, industry, expectedDest] of crmRoleCases) {
    const res = resolveCrmDashboardDestination(role, industry);
    assert.equal(res.ok, true, `Expected valid CRM route for ${role}`);
    if (res.ok) {
      assert.equal(res.destination, expectedDest);
    }
  }

  // 4. Missing/invalid role or unknown/missing industry fails closed
  for (const badRole of ["", null, undefined, "Random Role", "Hacker Admin"]) {
    const res = resolveCrmDashboardDestination(badRole, "Real Estate");
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.reason, "MISSING_OR_INVALID_ROLE");
    }
  }

  for (const badIndustry of ["", null, undefined, "UnknownIndustry", "Platform Operations"]) {
    const res = resolveCrmDashboardDestination("Tenant Admin", badIndustry);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.reason, "INVALID_INDUSTRY");
    }
  }

  const nonAdminBadIndustry = resolveCrmDashboardDestination(
    "Sales User",
    "UnknownIndustry"
  );
  assert.equal(nonAdminBadIndustry.ok, false);
  if (!nonAdminBadIndustry.ok) {
    assert.equal(nonAdminBadIndustry.reason, "INVALID_INDUSTRY");
  }

  console.log("✓ All Frontend Industry & Auth Routing tests passed!");
}

run();
