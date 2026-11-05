import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getTenantIndustryConfig,
  getIndustryPacks,
  updateTenantIndustryConfig,
} from "../../services/industryService";
import type {
  TenantIndustryConfigResponse,
  IndustryPackSummary,
  IndustryPackObject,
} from "../../types/industryConfig";
import "./Settings.css";

function getPackName(
  pack: string | IndustryPackObject | null | undefined
): string {
  if (!pack) return "Software Development & IT Services";
  if (typeof pack === "string") return pack;
  return pack.name || pack.key || "Software Development & IT Services";
}

function getPackVersion(
  pack: string | IndustryPackObject | null | undefined
): string | null {
  if (!pack || typeof pack === "string") return null;
  return pack.version || null;
}

function getPackKey(
  pack: string | IndustryPackObject | null | undefined
): string {
  if (!pack) return "";
  if (typeof pack === "string") return pack;
  return pack.key || "";
}

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
      const rawRole =
        typeof user.role === "string"
          ? user.role
          : user.role?.name || user.role_name || "";
      const roleUpper = String(rawRole).trim().toUpperCase();
      if (roleUpper === "ADMIN" || roleUpper.includes("ADMIN") || user.is_super_admin) return true;
      const perms: string[] = user.permissions || [];
      return perms.includes("industry_config.update") || perms.includes("*");
    } catch {
      return false;
    }
  }, []);

  const isFetchingRef = useRef(false);

  const loadData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const [cfg, allPacks] = await Promise.all([
        getTenantIndustryConfig(),
        getIndustryPacks().catch(() => []),
      ]);
      setConfig(cfg);
      setPacks(Array.isArray(allPacks) ? allPacks : []);
      setEnabledModules(cfg?.enabled_modules || []);
      setCustomLabels(cfg?.custom_labels || {});
    } catch (err: any) {
      console.error("Failed to load industry configuration:", err);
      if (err?.response?.status === 401 || err?.status === 401) {
        setError("Your session has expired. Please sign in again.");
      } else if (err?.response?.status === 403 || err?.status === 403) {
        setError("You do not have permission to view industry settings. Please contact your system administrator.");
      } else {
        setError(
          err?.response?.data?.detail ||
            err?.message ||
            "Failed to load tenant industry configuration"
        );
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
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
      // Re-fetch configuration to preserve full modules list and synchronization
      await loadData();
      setSuccessMessage(
        typeof updated?.message === "string"
          ? updated.message
          : "Industry and module configuration updated successfully."
      );
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.status === 401) {
        setError("Your session has expired. Please sign in again.");
      } else if (err?.response?.status === 403 || err?.status === 403) {
        setError("You do not have permission to update industry settings.");
      } else {
        const detail = err?.response?.data?.detail;
        if (typeof detail === "string") {
          setError(detail);
        } else if (detail?.message) {
          setError(detail.message);
        } else if (err?.message) {
          setError(err.message);
        } else {
          setError("Failed to save industry configuration");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading && !config) {
    return (
      <div className="settings-container" style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ color: "#94a3b8" }}>Loading industry configuration...</p>
      </div>
    );
  }

  if (error && !config) {
    const isAuthError =
      error.toLowerCase().includes("session has expired") ||
      error.toLowerCase().includes("not authenticated") ||
      error.toLowerCase().includes("credentials") ||
      error.toLowerCase().includes("401");

    const isPermError =
      error.toLowerCase().includes("permission") ||
      error.toLowerCase().includes("403");

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
            background: isPermError
              ? "rgba(245, 158, 11, 0.1)"
              : "rgba(239, 68, 68, 0.1)",
            border: isPermError
              ? "1px solid rgba(245, 158, 11, 0.3)"
              : "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: isPermError ? "#f59e0b" : "#ef4444",
            marginTop: "20px",
          }}
        >
          <p style={{ margin: "0 0 8px 0", fontWeight: 600 }}>
            {isAuthError
              ? "Authentication Required"
              : isPermError
              ? "Access Restricted"
              : "Error loading configuration"}
          </p>
          <p style={{ margin: 0, fontSize: "0.875rem" }}>{error}</p>
          <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
            {isAuthError ? (
              <button
                className="settings-btn-save"
                onClick={() => {
                  window.location.href = "/login";
                }}
              >
                Sign In to Continue
              </button>
            ) : (
              <button
                className="settings-btn-save"
                style={{ background: "#64748b" }}
                onClick={loadData}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="settings-container">
        <div className="settings-header">
          <div>
            <h1>Industry & Module Settings</h1>
            <p>Configure industry pack modules and workspace preferences.</p>
          </div>
        </div>
        <div className="settings-section-card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <p style={{ color: "#64748b", margin: "0 0 16px 0" }}>
            No industry configuration found for this tenant.
          </p>
          <button className="settings-btn-save" onClick={loadData}>
            Reload Configuration
          </button>
        </div>
      </div>
    );
  }

  const commonMods = config.common_modules && Array.isArray(config.common_modules)
    ? config.common_modules
    : (config.modules || []).filter((m) => !m.industry_specific);

  const industryMods = config.industry_modules && Array.isArray(config.industry_modules)
    ? config.industry_modules
    : (config.modules || []).filter((m) => m.industry_specific);

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
            {config.industry ? config.industry.replace(/_/g, " ") : "Software Company"}
          </div>
        </div>

        <div className="settings-meta-card">
          <div className="settings-meta-label">Active Industry Pack</div>
          <div className="settings-meta-value">
            {getPackName(config.industry_pack)}
            {getPackVersion(config.industry_pack) && (
              <span
                style={{
                  marginLeft: "8px",
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "9999px",
                  background: "rgba(14, 165, 233, 0.15)",
                  color: "#38bdf8",
                  fontWeight: 600,
                  display: "inline-block",
                }}
              >
                v{getPackVersion(config.industry_pack)}
              </span>
            )}
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
            {config.modules?.length || (commonMods.length + industryMods.length)} Modules
          </div>
        </div>
      </div>

      {/* Industry Specific Modules Section */}
      {industryMods.length > 0 && (
        <div className="settings-section-card">
          <h2 className="settings-section-title">
            Industry Modules ({getPackName(config.industry_pack)})
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
            {packs.map((p) => {
              const packKey = p.key || p.pack_key || p.id || "";
              const activePackKey = getPackKey(config.industry_pack) || config.industry_key;
              const isActive = Boolean(packKey && activePackKey && packKey === activePackKey);
              const defaultModulesCount =
                p.default_config?.enabled_modules?.length ??
                p.default_modules?.length ??
                0;

              return (
                <div
                  key={packKey || p.name}
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    border: isActive
                      ? "1px solid rgba(14, 165, 233, 0.4)"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                    background: isActive
                      ? "rgba(14, 165, 233, 0.08)"
                      : "rgba(255, 255, 255, 0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ margin: 0, fontWeight: 700 }}>{p.name}</h4>
                    {isActive && (
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
                    Version: {p.version || "1.0.0"} | Default Modules: {defaultModulesCount}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
