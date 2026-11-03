import { useState, useEffect, useMemo } from "react";
import {
  getPermissions,
  getAuthenticatedUserPermissions,
  PermissionDetail,
} from "../../services/permissionService";
import "../users/Users.css";

export default function Permissions() {
  const [permissions, setPermissions] = useState<PermissionDetail[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedModule, setSelectedModule] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if current user is admin
  const isAdmin = useMemo(() => {
    try {
      const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (!userStr) return false;
      const user = JSON.parse(userStr);
      return (
        user.role === "Admin" ||
        user.role === "admin" ||
        user.is_super_admin ||
        (user.permissions || []).includes("*")
      );
    } catch {
      return false;
    }
  }, []);

  const fetchPermissionsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const perms = await getPermissions();
      setPermissions(perms);
      setUserPermissions(getAuthenticatedUserPermissions());
    } catch (err: any) {
      setError(err?.message || "Unable to load permissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissionsData();
  }, []);

  const modulesList = useMemo(() => {
    const set = new Set<string>();
    permissions.forEach((p) => set.add(p.module));
    return ["All", ...Array.from(set).sort()];
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    return permissions.filter((p) => {
      if (selectedModule !== "All" && p.module !== selectedModule) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        const matchMod = p.module.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchMod) return false;
      }
      return true;
    });
  }, [permissions, selectedModule, search]);

  return (
    <div className="users-page">
      <div className="page-header">
        <div>
          <h1>Permissions Catalog</h1>
          <p className="text-muted">
            Platform RBAC permissions matrix and your active session authorization.
          </p>
        </div>
        <div className="header-actions">
          <div className="search-users-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search Permissions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "inherit",
              color: "inherit",
              fontSize: "0.85rem",
            }}
          >
            {modulesList.map((m) => (
              <option key={m} value={m}>
                {m === "All" ? "All Modules" : m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && !loading && (
        <div
          className="notification-toast error"
          style={{
            position: "relative",
            top: 0,
            right: 0,
            marginBottom: "20px",
            width: "100%",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {error}
        </div>
      )}

      <div className="users-table-container">
        {loading ? (
          <div className="loading-state">Loading system permissions...</div>
        ) : (
          <table className="full-width-table">
            <thead>
              <tr>
                <th>Permission Key</th>
                <th>Module</th>
                <th>Action</th>
                <th>Description</th>
                <th className="text-right">Your Access</th>
              </tr>
            </thead>
            <tbody>
              {filteredPermissions.map((perm) => {
                const hasPerm = isAdmin || userPermissions.includes(perm.name);
                return (
                  <tr key={perm.id}>
                    <td>
                      <code
                        style={{
                          background: "rgba(14, 165, 233, 0.1)",
                          color: "#0ea5e9",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontWeight: 600,
                          fontSize: "0.82rem",
                        }}
                      >
                        {perm.name}
                      </code>
                    </td>
                    <td>{perm.module}</td>
                    <td>
                      <span className="role-badge font-medium">{perm.action}</span>
                    </td>
                    <td style={{ color: "#64748b" }}>{perm.description}</td>
                    <td className="text-right">
                      {hasPerm ? (
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "9999px",
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#10b981",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                          }}
                        >
                          Granted
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "9999px",
                            fontSize: "0.72rem",
                            fontWeight: 500,
                            color: "#94a3b8",
                          }}
                        >
                          Not Granted
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredPermissions.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-muted">
                    No permissions match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
