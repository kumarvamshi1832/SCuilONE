import { useEffect, useState } from "react";
import {
  CheckCircleIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from "../../components/common/SupportPortalIcons";
import { hasPlatformPermission } from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformPermissionMeta,
  PlatformRoleDefinition,
} from "../../types/platform";
import "./PlatformPages.css";

export default function PlatformRolesPermissionsPage() {
  const [centralRoles, setCentralRoles] = useState<PlatformRoleDefinition[]>(
    []
  );
  const [industryRoles, setIndustryRoles] = useState<PlatformRoleDefinition[]>(
    []
  );
  const [availablePerms, setAvailablePerms] = useState<PlatformPermissionMeta[]>(
    []
  );
  const [selectedRole, setSelectedRole] =
    useState<PlatformRoleDefinition | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManage = hasPlatformPermission("platform.roles.manage");

  const loadRoles = async (keepSelectedName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformService.listRoles();
      const central = res.central_platform_roles || [];
      const ind = res.reusable_industry_roles || [];
      setCentralRoles(central);
      setIndustryRoles(ind);
      setAvailablePerms(res.available_permissions || []);

      const all = [...central, ...ind];
      const next =
        all.find((r) => r.name === keepSelectedName) || all[0] || null;
      setSelectedRole(next);
      setDraftPermissions(next ? [...next.permissions] : []);
    } catch (err) {
      setError(
        extractApiErrorMessage(err, "Failed to load roles and permissions.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const selectRole = (role: PlatformRoleDefinition) => {
    setSelectedRole(role);
    setDraftPermissions([...role.permissions]);
    setError(null);
    setSuccess(null);
  };

  const togglePermission = (permName: string) => {
    if (!canManage) return;
    setDraftPermissions((prev) =>
      prev.includes(permName)
        ? prev.filter((p) => p !== permName)
        : [...prev, permName]
    );
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.updateRolePermissions(
        selectedRole.name,
        draftPermissions
      );
      setSuccess(`Updated permissions for role "${selectedRole.name}".`);
      await loadRoles(selectedRole.name);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update role permissions."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h2>Platform & Industry Roles Matrix</h2>
          <p>
            11 Central Platform Roles + 7 Reusable Industry Team Roles across 36
            platform RBAC permissions.
          </p>
        </div>
        <button
          type="button"
          className="platform-btn"
          onClick={() => loadRoles(selectedRole?.name)}
          disabled={loading}
        >
          <RefreshIcon size={15} />
          <span>Refresh</span>
        </button>
      </div>

      {error && <div className="platform-alert error">{error}</div>}
      {success && <div className="platform-alert success">{success}</div>}

      {loading ? (
        <div className="platform-card platform-empty">
          Loading roles and permissions...
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 340px) 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* Role List */}
          <div className="platform-card" style={{ padding: 14 }}>
            <div className="platform-card-title">
              <span>Central Platform ({centralRoles.length})</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {centralRoles.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`platform-tab ${
                    selectedRole?.name === r.name ? "active" : ""
                  }`}
                  style={{ textAlign: "left", width: "100%" }}
                  onClick={() => selectRole(r)}
                >
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                    {r.permissions.length} permissions • {r.dashboard_title}
                  </div>
                </button>
              ))}
            </div>

            <div className="platform-card-title">
              <span>Reusable Industry ({industryRoles.length})</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {industryRoles.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`platform-tab ${
                    selectedRole?.name === r.name ? "active" : ""
                  }`}
                  style={{ textAlign: "left", width: "100%" }}
                  onClick={() => selectRole(r)}
                >
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                    {r.permissions.length} permissions • {r.dashboard_title}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Selected Role Detail & Permissions Editor */}
          {selectedRole ? (
            <div className="platform-card">
              <div className="platform-card-title">
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldCheckIcon size={18} />
                  {selectedRole.name}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="platform-badge indigo">
                    {selectedRole.role_scope}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      className="platform-btn primary sm"
                      onClick={handleSavePermissions}
                      disabled={saving}
                    >
                      <CheckCircleIcon size={14} />
                      <span>{saving ? "Saving..." : "Save Permissions"}</span>
                    </button>
                  )}
                </div>
              </div>

              <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--plat-muted)" }}>
                {selectedRole.responsibility}
              </p>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  Sidebar Modules ({selectedRole.sidebar_modules.length})
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {selectedRole.sidebar_modules.map((mod, idx) => (
                    <span key={idx} className="platform-badge">
                      {typeof mod === "string" ? mod : mod.label}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                Assigned Permissions ({draftPermissions.length} /{" "}
                {availablePerms.length})
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 10,
                }}
              >
                {availablePerms.map((perm) => {
                  const checked = draftPermissions.includes(perm.name);
                  return (
                    <label
                      key={perm.name}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1px solid ${
                          checked ? "var(--plat-accent)" : "var(--plat-border)"
                        }`,
                        background: checked
                          ? "var(--plat-accent-soft)"
                          : "var(--plat-surface-alt)",
                        cursor: canManage ? "pointer" : "default",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canManage}
                        onChange={() => togglePermission(perm.name)}
                        style={{ marginTop: 2 }}
                      />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 12.5,
                            fontFamily: "monospace",
                          }}
                        >
                          {perm.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                          {perm.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="platform-card platform-empty">
              Select a role to view its permissions.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
