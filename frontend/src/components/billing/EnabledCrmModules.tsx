import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getTenantIndustryConfig } from "../../services/industryService";
import { resolveTenantModules } from "../../utils/subscriptionModules";
import type { TenantIndustryConfigResponse } from "../../types/industryConfig";

interface EnabledCrmModulesProps {
  /** `resources.enabled_modules` from the subscription API (the plan's modules, for all industries). */
  planModules: string[] | undefined;
}

/**
 * "Enabled CRM Modules" card of Subscription & Billing: the plan's modules narrowed to the tenant's own
 * industry, grouped into Core and Industry-Specific, with readable names.
 */
export default function EnabledCrmModules({ planModules }: EnabledCrmModulesProps) {
  const { industry: routeIndustry } = useParams();
  const [config, setConfig] = useState<TenantIndustryConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [configFailed, setConfigFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTenantIndustryConfig()
      .then((data) => {
        if (!active) return;
        setConfig(data);
        setConfigFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setConfig(null);
        setConfigFailed(true);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // The tenant's industry comes from the API; the route's industry segment is only a fallback if that call fails.
  const resolved = useMemo(
    () => resolveTenantModules(planModules, config?.industry || routeIndustry, config?.modules),
    [planModules, config, routeIndustry]
  );

  const hasPlanModules = Boolean(planModules && planModules.length > 0);

  return (
    <div className="sub-card">
      <h2 className="sub-card-title">Enabled CRM Modules</h2>

      {!hasPlanModules ? (
        <p className="sub-subtitle">No active modules in current subscription state.</p>
      ) : loading ? (
        <p className="sub-subtitle" aria-busy="true">
          Loading modules for your industry…
        </p>
      ) : (
        <>
          <p className="sub-subtitle">
            Industry: <strong>{resolved.industryName ?? "Not set"}</strong>
          </p>
          {configFailed && (
            <p className="sub-module-note" role="status">
              Your module settings could not be loaded, so modules your administrator may have switched off are not
              reflected below.
            </p>
          )}

          <h3 className="sub-module-group">Core CRM Modules</h3>
          {resolved.core.length > 0 ? (
            <div className="sub-chip-list">
              {resolved.core.map((m) => (
                <span key={m.key} className="sub-chip" title={m.key}>
                  {m.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="sub-module-note">No core modules are active for this subscription.</p>
          )}

          <h3 className="sub-module-group">Industry-Specific Modules</h3>
          {resolved.industry.length > 0 ? (
            <div className="sub-chip-list">
              {resolved.industry.map((m) => (
                <span key={m.key} className="sub-chip industry" title={m.key}>
                  {m.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="sub-module-note">
              {!resolved.industryRecognised
                ? "Your industry is not recognised, so no industry-specific modules are shown."
                : !resolved.industryHasModules
                ? `No industry-specific modules are configured for ${resolved.industryName ?? "your industry"} yet.`
                : "Your subscription does not include any industry-specific modules."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
