import { useEffect, useState } from "react";
import {
  DownloadIcon,
  RefreshIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getStoredPlatformUser,
  hasPlatformPermission,
} from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformAnalyticsOverview,
  PlatformSettingItem,
} from "../../types/platform";
import "./PlatformPages.css";

export default function PlatformAnalyticsSettingsPage() {
  const canViewAnalytics = hasPlatformPermission("platform.analytics.view");
  const canManageSettings = hasPlatformPermission("platform.settings.manage");
  const currentUser = getStoredPlatformUser();
  const isSuperAdmin = currentUser?.role === "Platform Super Admin";

  const [tab, setTab] = useState<"analytics" | "settings">(
    canViewAnalytics ? "analytics" : "settings"
  );

  // Analytics
  const [analytics, setAnalytics] = useState<PlatformAnalyticsOverview | null>(
    null
  );
  const [industryFilter, setIndustryFilter] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);

  // Settings
  const [settings, setSettings] = useState<PlatformSettingItem[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAnalytics = async () => {
    if (!canViewAnalytics) return;
    setLoading(true);
    setError(null);
    try {
      const res = await platformService.getAnalyticsOverview({
        industry_type: industryFilter || undefined,
      });
      setAnalytics(res);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load platform analytics."));
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    if (!canManageSettings) return;
    setLoading(true);
    setError(null);
    try {
      const res = await platformService.listSettings();
      const items = res.items || [];
      setSettings(items);
      const nextDrafts: Record<string, string> = {};
      items.forEach((s) => {
        nextDrafts[s.setting_key] = JSON.stringify(s.value_json, null, 2);
      });
      setDraftValues(nextDrafts);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load platform settings."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "analytics") loadAnalytics();
    else loadSettings();
  }, [tab, industryFilter]);

  const handleExport = async (fmt: "json" | "csv" | "pdf") => {
    setExporting(fmt);
    setError(null);
    setSuccess(null);
    try {
      const { blob, filename } = await platformService.exportAnalyticsReport({
        industry_type: industryFilter || undefined,
        format: fmt,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccess(`Exported analytics report as ${fmt.toUpperCase()}.`);
    } catch (err) {
      setError(extractApiErrorMessage(err, `Failed to export ${fmt} report.`));
    } finally {
      setExporting(null);
    }
  };

  const handleSaveSetting = async (item: PlatformSettingItem) => {
    setError(null);
    setSuccess(null);
    let parsedValue: Record<string, any>;
    try {
      parsedValue = JSON.parse(draftValues[item.setting_key] || "{}");
    } catch {
      setError(`Invalid JSON in setting "${item.setting_key}".`);
      return;
    }

    setSavingKey(item.setting_key);
    try {
      await platformService.updateSetting(item.setting_key, {
        category: item.category,
        value_json: parsedValue,
        description: item.description,
      });
      setSuccess(`Updated platform setting "${item.setting_key}".`);
      await loadSettings();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to save setting."));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h2>Aggregate Analytics & Platform Settings</h2>
          <p>
            Multi-industry tenant growth, SLA compliance benchmarks, report
            exports (JSON / CSV / PDF), and global platform configuration.
          </p>
        </div>
        <div className="platform-actions-row">
          <button
            type="button"
            className="platform-btn"
            onClick={() => (tab === "analytics" ? loadAnalytics() : loadSettings())}
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          {tab === "analytics" && canViewAnalytics && (
            <>
              <button
                type="button"
                className="platform-btn"
                disabled={exporting !== null}
                onClick={() => handleExport("csv")}
              >
                <DownloadIcon size={14} />
                <span>{exporting === "csv" ? "Exporting..." : "CSV"}</span>
              </button>
              <button
                type="button"
                className="platform-btn"
                disabled={exporting !== null}
                onClick={() => handleExport("json")}
              >
                <DownloadIcon size={14} />
                <span>{exporting === "json" ? "Exporting..." : "JSON"}</span>
              </button>
              <button
                type="button"
                className="platform-btn primary"
                disabled={exporting !== null}
                onClick={() => handleExport("pdf")}
              >
                <DownloadIcon size={14} />
                <span>{exporting === "pdf" ? "Exporting..." : "Export PDF"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="platform-alert error">{error}</div>}
      {success && <div className="platform-alert success">{success}</div>}

      <div className="platform-tabs">
        {canViewAnalytics && (
          <button
            type="button"
            className={`platform-tab ${tab === "analytics" ? "active" : ""}`}
            onClick={() => setTab("analytics")}
          >
            Analytics & Exports
          </button>
        )}
        {canManageSettings && (
          <button
            type="button"
            className={`platform-tab ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            Global Settings ({settings.length})
          </button>
        )}
      </div>

      {tab === "analytics" && canViewAnalytics && (
        <>
          {analytics && (
            <>
              <div className="platform-filter-bar">
                <strong style={{ fontSize: 13 }}>Filter Industry:</strong>
                <select
                  className="platform-select"
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                >
                  <option value="">All Registered Industries</option>
                  {analytics.industry_analytics.map((row) => (
                    <option key={row.industry_key} value={row.industry_key}>
                      {row.industry_name}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 12,
                    color: "var(--plat-muted)",
                  }}
                >
                  {analytics.company_name} • Generated{" "}
                  {analytics.generated_at.slice(0, 19).replace("T", " ")}
                </span>
              </div>

              <div className="platform-kpi-grid">
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">Registered Tenants</div>
                  <div className="platform-kpi-value">
                    {analytics.totals.registered_companies}
                  </div>
                  <div className="platform-kpi-sub">
                    {analytics.totals.active_companies} active
                  </div>
                </div>
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">Total Support Tickets</div>
                  <div className="platform-kpi-value">
                    {analytics.totals.total_tickets}
                  </div>
                  <div className="platform-kpi-sub">
                    {analytics.totals.open_tickets} open •{" "}
                    {analytics.totals.resolved_tickets} resolved
                  </div>
                </div>
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">SLA Compliance</div>
                  <div className="platform-kpi-value">
                    {analytics.totals.sla_compliance_pct}%
                  </div>
                  <div className="platform-kpi-sub">
                    {analytics.totals.sla_breached_tickets} SLA breached
                  </div>
                </div>
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">Sales Prospects</div>
                  <div className="platform-kpi-value">
                    {analytics.totals.sales_prospects}
                  </div>
                  <div className="platform-kpi-sub">
                    Across {analytics.industries_count} industry verticals
                  </div>
                </div>
              </div>

              <div className="platform-card">
                <div className="platform-card-title">
                  <span>10-Industry Aggregate Benchmark</span>
                </div>
                <div className="platform-table-wrap">
                  <table className="platform-table">
                    <thead>
                      <tr>
                        <th>Industry</th>
                        <th>Companies (Active)</th>
                        <th>Tickets (Open / Resolved)</th>
                        <th>SLA Compliance</th>
                        <th>Sales Prospects</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.industry_analytics.map((row) => (
                        <tr key={row.industry_key}>
                          <td>
                            <strong>{row.industry_name}</strong>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {row.industry_key}
                            </div>
                          </td>
                          <td>
                            {row.registered_companies} ({row.active_companies})
                          </td>
                          <td>
                            {row.total_tickets} ({row.open_tickets} open /{" "}
                            {row.resolved_tickets} resolved)
                          </td>
                          <td>
                            <span
                              className={`platform-badge ${
                                row.sla_compliance_pct >= 90
                                  ? "green"
                                  : row.sla_compliance_pct >= 75
                                  ? "yellow"
                                  : "red"
                              }`}
                            >
                              {row.sla_compliance_pct}%
                            </span>
                          </td>
                          <td>{row.sales_prospects}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          {loading && !analytics && (
            <div className="platform-card platform-empty">
              Loading analytics overview...
            </div>
          )}
        </>
      )}

      {tab === "settings" && canManageSettings && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!isSuperAdmin && (
            <div className="platform-alert info">
              Only Platform Super Admins can modify global settings; read preview
              is shown below.
            </div>
          )}
          {loading ? (
            <div className="platform-card platform-empty">
              Loading settings...
            </div>
          ) : (
            settings.map((item) => (
              <div key={item.setting_key} className="platform-card">
                <div className="platform-card-title">
                  <span>
                    <code>{item.setting_key}</code> — {item.category}
                  </span>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      className="platform-btn sm primary"
                      disabled={savingKey === item.setting_key}
                      onClick={() => handleSaveSetting(item)}
                    >
                      {savingKey === item.setting_key ? "Saving..." : "Save JSON"}
                    </button>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--plat-muted)",
                    marginBottom: 10,
                  }}
                >
                  {item.description}
                  {item.updated_at ? ` • Updated: ${item.updated_at}` : ""}
                </div>
                <textarea
                  className="platform-textarea"
                  rows={5}
                  readOnly={!isSuperAdmin}
                  style={{ fontFamily: "monospace", width: "100%" }}
                  value={draftValues[item.setting_key] || ""}
                  onChange={(e) =>
                    setDraftValues((prev) => ({
                      ...prev,
                      [item.setting_key]: e.target.value,
                    }))
                  }
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
