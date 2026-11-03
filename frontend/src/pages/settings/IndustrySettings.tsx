import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getTenantIndustryConfig,
  getIndustryPacks,
  updateTenantIndustryConfig,
} from "../../services/industryService";
import type {
  TenantIndustryConfigResponse,
  IndustryPackSummary,
} from "../../types/industryConfig";
import "./Settings.css";

export default function IndustrySettings() {
  const [config, setConfig] = useState<TenantIndustryConfigResponse | null>(null);
  const [packs, setPacks] = useState<IndustryPackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Editable state
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});

  // Check permission
  const canUpdate = useMemo(() => {
    try {
      const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (!userStr) return false;
      const user = JSON.parse(userStr);
      if (user.role === "Admin" || user.role === "admin" || user.is_super_admin) return true;
      const perms: string[] = user.permissions || [];
      return perms.includes("industry_config.update") || perms.includes("*");
    } catch {
      return false;
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, allPacks] = await Promise.all([
        getTenantIndustryConfig(),
        getIndustryPacks().catch(() => []),
      ]);
      setConfig(cfg);
      setPacks(allPacks);
      setEnabledModules(cfg.enabled_modules || []);
      setCustomLabels(cfg.custom_labels || {});
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to load tenant industry configuration"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleModule = (modKey: string) => {
    if (!canUpdate) return;
    setEnabledModules((prev) =>
      prev.includes(modKey) ? prev.filter((k) => k !== modKey) : [...prev, modKey]
    );
  };

  const handleSave = async () => {
    if (!canUpdate) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await updateTenantIndustryConfig({
        enabled_modules: enabledModules,
        custom_labels: customLabels,
      });
      setConfig(updated);
      setEnabledModules(updated.enabled_modules || []);
      setCustomLabels(updated.custom_labels || {});
      setSuccessMessage("Industry and module configuration updated successfully.");
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to save industry configuration"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-container" style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ color: "#94a3b8" }}>Loading industry configuration...</p>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="settings-container">
        <div className="settings-header">
          <div>
            <h1>Industry & Module Settings</h1>
            <p>Configure industry pack modules and workspace preferences.</p>
          </div>
        </div>
        <div
          style={{
            padding: "24px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#ef4444",
            marginTop: "20px",
          }}
        >
          <p><strong>Error loading configuration:</strong> {error}</p>
          <button
            className="settings-btn-save"
            style={{ marginTop: "12px", background: "#64748b" }}
            onClick={loadData}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const commonMods = (config?.modules || []).filter((m) => !m.industry_specific);
  const industryMods = (config?.modules || []).filter((m) => m.industry_specific);

  return (
    <div className="settings-container">
      {/* Page Header */}
      <div className="settings-header">
        <div>
          <h1>Industry & Module Settings</h1>
          <p>Configure tenant industry pack, activate business modules, and customize labels.</p>
        </div>
        {canUpdate && (
          <button
            className="settings-btn-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving Changes..." : "Save Configuration"}
          </button>
        )}
      </div>

      {/* Notifications */}
      {successMessage && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            color: "#10b981",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      {!canUpdate && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            background: "rgba(245, 158, 11, 0.15)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            color: "#f59e0b",
            marginBottom: "20px",
            fontSize: "0.88rem",
          }}
        >
          You have view-only access to industry settings. Changes require the{" "}
          <code>industry_config.update</code> permission or Administrator privileges.
        </div>
      )}

      {/* Tenant Industry Metadata Cards */}
      <div className="settings-meta-grid">
        <div className="settings-meta-card">
          <div className="settings-meta-label">Tenant Industry</div>
          <div className="settings-meta-value" style={{ textTransform: "capitalize" }}>
            {config?.industry || "Software Company"}
          </div>
        </div>

        <div className="settings-meta-card">
          <div className="settings-meta-label">Active Industry Pack</div>
          <div className="settings-meta-value">
            {config?.industry_pack || "Software Development & IT Services"}
          </div>
        </div>

        <div className="settings-meta-card">
          <div className="settings-meta-label">Enabled Modules</div>
          <div className="settings-meta-value" style={{ color: "#10b981" }}>
            {enabledModules.length} Active
          </div>
        </div>

        <div className="settings-meta-card">
          <div className="settings-meta-label">Total Available Modules</div>
          <div className="settings-meta-value" style={{ color: "#64748b" }}>
            {config?.modules?.length || 0} Modules
          </div>
        </div>
      </div>

      {/* Industry Specific Modules Section */}
      {industryMods.length > 0 && (
        <div className="settings-section-card">
          <h2 className="settings-section-title">
            Industry Modules ({config?.industry_pack || "Specialized"})
          </h2>
          <p className="settings-section-desc">
            Specialized modules tailored for your business vertical. Enable or disable modules as per your operational workflow.
          </p>

          <div className="modules-grid">
            {industryMods.map((mod) => {
              const isChecked = enabledModules.includes(mod.key);
              return (
                <div className="module-toggle-card" key={mod.key}>
                  <div className="module-info">
                    <h4>{mod.label}</h4>
                    <span>{mod.key}</span>
                    {!mod.api_available && (
                      <div style={{ fontSize: "0.7rem", color: "#f59e0b", marginTop: "2px" }}>
                        (API in Preview)
                      </div>
                    )}
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!canUpdate}
                      onChange={() => handleToggleModule(mod.key)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Common CRM Modules Section */}
      <div className="settings-section-card">
        <h2 className="settings-section-title">Core CRM Modules</h2>
        <p className="settings-section-desc">
          Universal CRM capabilities including leads, accounts, contacts, deals, and activities.
        </p>

        <div className="modules-grid">
          {commonMods.map((mod) => {
            const isChecked = enabledModules.includes(mod.key);
            return (
              <div className="module-toggle-card" key={mod.key}>
                <div className="module-info">
                  <h4>{mod.label}</h4>
                  <span>{mod.key}</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!canUpdate}
                    onChange={() => handleToggleModule(mod.key)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Available Industry Packs Reference */}
      {packs.length > 0 && (
        <div className="settings-section-card">
          <h2 className="settings-section-title">Installed Industry Packs</h2>
          <p className="settings-section-desc">
            Available system packs for multi-tenant and industry-customized instances.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
            {packs.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: p.pack_key === config?.industry_key ? "rgba(14, 165, 233, 0.08)" : "rgba(255, 255, 255, 0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ margin: 0, fontWeight: 700 }}>{p.name}</h4>
                  {p.pack_key === config?.industry_key && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "2px 8px",
                        background: "#0ea5e9",
                        color: "#fff",
                        borderRadius: "9999px",
                        fontWeight: 600,
                      }}
                    >
                      Active
                    </span>
                  )}
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                  {p.description || `Industry pack for ${p.name}`}
                </p>
                <div style={{ marginTop: "10px", fontSize: "0.75rem", color: "#64748b" }}>
                  Version: {p.version || "1.0.0"} | Default Modules: {p.default_modules?.length || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
