import {
  CORE_SUBSCRIPTION_MODULES,
  SUBSCRIPTION_MODULE_LABELS,
  getIndustryConfig,
  normalizeIndustrySlug,
} from "../config/industryConfig";
import type { IndustryModuleInfo } from "../types/industryConfig";

/**
 * Which of a plan's modules apply to the current tenant.
 *
 * Every subscription plan stores the modules of ALL industries (core + Real Estate + Software), so showing
 * `enabled_modules` as-is lists modules that can never be used by the tenant. The backend only lets a tenant use
 * a module when the plan includes it AND the tenant's industry config enables it (core/industry_modules.py).
 * This mirrors that rule on the client:
 *
 *   shown = plan modules  ∩  (core modules ∪ modules of the tenant's industry)  minus modules the tenant's
 *           industry config explicitly disables.
 *
 * The plan list itself is never altered - nothing is added that the plan does not include.
 */

export interface TenantModuleChip {
  key: string;
  label: string;
}

export interface ResolvedTenantModules {
  /** Display name of the tenant's industry, or null when it is unknown. */
  industryName: string | null;
  /** True when the industry is one the CRM recognises. */
  industryRecognised: boolean;
  core: TenantModuleChip[];
  industry: TenantModuleChip[];
  /** False when the backend defines no subscription modules for this industry (only the core set applies). */
  industryHasModules: boolean;
}

/** "software_time_entries" -> "Software Time Entries" - last-resort label for a key without a configured name. */
export const humanizeModuleKey = (key: string): string =>
  key
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function resolveTenantModules(
  planModules: readonly string[] | null | undefined,
  rawIndustry: string | null | undefined,
  apiModules?: readonly IndustryModuleInfo[] | null
): ResolvedTenantModules {
  const plan = new Set(planModules ?? []);
  const slug = normalizeIndustrySlug(rawIndustry);
  const config = slug ? getIndustryConfig(slug) : null;

  const apiLabels = new Map<string, string>();
  const disabledByTenant = new Set<string>();
  (apiModules ?? []).forEach((m) => {
    apiLabels.set(m.key, m.label);
    if (m.enabled === false) disabledByTenant.add(m.key);
  });

  const toChip = (key: string): TenantModuleChip => ({
    key,
    label: SUBSCRIPTION_MODULE_LABELS[key] ?? apiLabels.get(key) ?? humanizeModuleKey(key),
  });
  const visible = (key: string) => plan.has(key) && !disabledByTenant.has(key);

  const industryKeys = config?.subscriptionModules ?? [];
  return {
    industryName: config ? config.name : rawIndustry?.trim() || null,
    industryRecognised: Boolean(config),
    core: CORE_SUBSCRIPTION_MODULES.filter(visible).map(toChip),
    industry: industryKeys.filter(visible).map(toChip),
    industryHasModules: industryKeys.length > 0,
  };
}
