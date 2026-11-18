import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getTenantIndustryConfig,
  updateTenantIndustryConfig,
} from "../../services/industryService";
import type {
  TenantIndustryConfigResponse,
  IndustryPackObject,
  IndustryModuleInfo,
} from "../../types/industryConfig";
import { canManageIndustryConfig } from "../../utils/industryAccess";
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

export default function IndustrySettings() {
  const [config, setConfig] = useState<TenantIndustryConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Editable state
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});

  // UI gating only; the API enforces industry_config.update for the caller's own tenant.
  const canUpdate = useMemo(() => canManageIndustryConfig(), []);

  // Last values loaded from the API, used for unsaved-change tracking and Cancel.
  const [savedModules, setSavedModules] = useState<string[]>([]);
  const [savedLabels, setSavedLabels] = useState<Record<string, string>>({});

  const isDirty = useMemo(() => {
    const sameModules =
      enabledModules.length === savedModules.length &&
      enabledModules.every((key) => savedModules.includes(key));
    const keys = new Set([...Object.keys(customLabels), ...Object.keys(savedLabels)]);
    const sameLabels = Array.from(keys).every(
      (key) => (customLabels[key] ?? "") === (savedLabels[key] ?? "")
    );
    return !(sameModules && sameLabels);
  }, [enabledModules, savedModules, customLabels, savedLabels]);

  const isFetchingRef = useRef(false);

  const loadData = useCallback(async (): Promise<boolean> => {
    if (isFetchingRef.current) return false;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const cfg = await getTenantIndustryConfig();
      setConfig(cfg);
      const modules = cfg?.enabled_modules || [];
      // The API returns labels inside `configuration`; keep the legacy top-level field as a fallback.
      const labels: Record<string, string> =
        (cfg?.configuration?.custom_labels as Record<string, string> | undefined) ||
        cfg?.custom_labels ||
        {};
      setEnabledModules(modules);
      setSavedModules(modules);
      setCustomLabels({ ...labels });
      setSavedLabels({ ...labels });
      return true;
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
      return false;
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

  const handleLabelChange = (modKey: string, value: string) => {
    if (!canUpdate) return;
    setCustomLabels((prev) => ({ ...prev, [modKey]: value }));
  };

  const handleCancel = () => {
    setEnabledModules(savedModules);
    setCustomLabels({ ...savedLabels });
    setError(null);
    setSuccessMessage(null);
  };

  const handleSave = async () => {
    if (!canUpdate || !isDirty) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      // Blank labels mean "use the default label", so they are not sent.
      const labelsToSave = Object.fromEntries(
        Object.entries(customLabels)
          .map(([key, value]) => [key, value.trim()] as const)
          .filter(([, value]) => value !== "")
      );
      const updated = await updateTenantIndustryConfig({
        enabled_modules: enabledModules,
        custom_labels: labelsToSave,
      });
      // The API confirmed the save. Re-fetch so the page shows what is actually stored.
      const refreshed = await loadData();
      const base =
        typeof updated?.message === "string"
          ? updated.message
          : "Industry and module configuration updated successfully.";
      if (refreshed) {
        setSuccessMessage(base);
      } else {
        setSuccessMessage(`${base} (The latest configuration could not be reloaded; use Refresh.)`);
      }
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.status === 401) {
        setError("Your session has expired. Please sign in again.");
      } else if (err?.response?.status === 403 || err?.status === 403) {
        const detail = err?.response?.data?.detail;
        const serverMessage =
          typeof detail === "string" ? detail : detail?.message || "Forbidden";
        // The UI treated this account as authorized, so a 403 means the server disagrees.
        setError(
          `The server rejected this change (HTTP 403: ${serverMessage}). Your role is allowed to manage ` +
            "industry settings in the interface, but backend authorization for it is missing or " +
            "the industry_config.update permission is not granted. No changes were saved."
        );
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

  const renderModuleCard = (mod: IndustryModuleInfo, showPreview: boolean) => {
    const isChecked = enabledModules.includes(mod.key);
    const customLabel = customLabels[mod.key] ?? "";
    const displayName = customLabel.trim() || mod.label;
    return (
      <div
        className={`module-toggle-card${canUpdate ? "" : " is-readonly"}`}
        key={mod.key}
      >
        <div className="module-card-head">
          <div className="module-info">
            <h4 title={displayName}>{displayName}</h4>
            <span className="module-key" title={mod.key}>
              {mod.key}
            </span>
            {showPreview && !mod.api_available && (
              <div className="module-preview-note">(API in Preview)</div>
            )}
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={isChecked}
              disabled={!canUpdate || saving}
              aria-label={`Enable ${displayName}`}
              onChange={() => handleToggleModule(mod.key)}
            />
            <span className="slider"></span>
          </label>
        </div>
        {canUpdate && (
          <input
            type="text"
            className="module-label-input"
            value={customLabel}
            maxLength={80}
            placeholder={`Custom label (default: ${mod.label})`}
            aria-label={`Custom label for ${mod.label}`}
            disabled={saving}
            onChange={(e) => handleLabelChange(mod.key, e.target.value)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="settings-container">
      {/* Page Header */}
      <div className="settings-header">
        <div>
          <h1>Industry & Module Settings</h1>
          <p>Configure tenant industry pack, activate business modules, and customize labels.</p>
        </div>
        {canUpdate && (
          <div className="settings-header-actions">
            {isDirty && !saving && (
              <span className="settings-unsaved-chip" role="status">
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              className="settings-btn-cancel"
              onClick={handleCancel}
              disabled={saving || !isDirty}
            >
              Cancel
            </button>
            <button
              type="button"
              className="settings-btn-save"
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              {saving ? "Saving Changes..." : "Save Configuration"}
            </button>
          </div>
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
          <div className="settings-meta-value is-capitalized">
            {config.industry ? config.industry.replace(/_/g, " ") : "Software Company"}
          </div>
        </div>

        <div className="settings-meta-card">
          <div className="settings-meta-label">Active Industry Pack</div>
          <div className="settings-meta-value settings-meta-pack">
            <span className="settings-meta-pack-name">{getPackName(config.industry_pack)}</span>
            {getPackVersion(config.industry_pack) && (
              <span className="settings-version-badge">v{getPackVersion(config.industry_pack)}</span>
            )}
          </div>
        </div>

        <div className="settings-meta-card">
          <div className="settings-meta-label">Enabled Modules</div>
          <div className="settings-meta-value is-success">
            {enabledModules.length} Active
          </div>
        </div>

        <div className="settings-meta-card">
          <div className="settings-meta-label">Total Available Modules</div>
          <div className="settings-meta-value is-muted">
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
            {industryMods.map((mod) => renderModuleCard(mod, true))}
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
          {commonMods.map((mod) => renderModuleCard(mod, false))}
        </div>
      </div>
    </div>
  );
}
