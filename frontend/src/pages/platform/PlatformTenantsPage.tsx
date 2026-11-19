import React, { useEffect, useState } from "react";
import { Pagination } from "../../components/common/Pagination";
import {
  EditIcon,
  LockIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import { hasPlatformPermission } from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformCustomerLookupItem,
  PlatformTenantCompany,
} from "../../types/platform";
import "./PlatformPages.css";

const INDUSTRY_OPTIONS = [
  "Real Estate",
  "Software Company",
  "Education Consulting",
  "Training Institute",
  "Digital Marketing Agency",
  "Insurance Agency",
  "Healthcare",
  "E-Commerce",
  "Manufacturing",
  "Logistics",
];

const TENANT_STATUSES = ["Active", "Trial", "Suspended", "Inactive"];

export default function PlatformTenantsPage() {
  const [tenants, setTenants] = useState<PlatformTenantCompany[]>([]);
  const [lookupResults, setLookupResults] = useState<PlatformCustomerLookupItem[]>(
    []
  );
  const [mode, setMode] = useState<"tenants" | "lookup">("tenants");

  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIndustry, setNewIndustry] = useState("Real Estate");
  const [newPlanKey, setNewPlanKey] = useState("starter");
  const [provisionOwner, setProvisionOwner] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit modal
  const [editing, setEditing] = useState<PlatformTenantCompany | null>(null);
  const [editStatus, setEditStatus] = useState("Active");

  const canManage = hasPlatformPermission("platform.tenants.manage");

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "lookup") {
        const res = await platformService.customerLookup(search);
        setLookupResults(res.items || []);
      } else {
        const res = await platformService.listTenants({
          industry_type: industryFilter || undefined,
          status: statusFilter || undefined,
          search: search || undefined,
        });
        setTenants(res.items || []);
      }
      setPage(1);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load tenant companies."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [mode, industryFilter, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (provisionOwner && ownerPassword.length < 15) {
      setError("Owner password must be at least 15 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await platformService.createTenant({
        name: newName.trim(),
        industry: newIndustry,
        plan_key: newPlanKey.trim() || "starter",
        ...(provisionOwner
          ? {
              owner_full_name: ownerName.trim(),
              owner_email: ownerEmail.trim(),
              owner_password: ownerPassword,
            }
          : {}),
      });
      setSuccess(`Tenant company "${newName.trim()}" created.`);
      setCreateOpen(false);
      setNewName("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPassword("");
      await fetchTenants();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to create tenant."));
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (t: PlatformTenantCompany) => {
    setEditing(t);
    setEditStatus(t.status);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await platformService.updateTenant(editing.id, {
        status: editStatus,
      });
      setSuccess(`Updated status for tenant "${editing.name}" to "${editStatus}".`);
      setEditing(null);
      await fetchTenants();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update tenant status."));
    } finally {
      setSubmitting(false);
    }
  };

  const activeRows = mode === "tenants" ? tenants : lookupResults;
  const pagedTenants = tenants.slice((page - 1) * pageSize, page * pageSize);
  const pagedLookup = lookupResults.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h2>Customer Tenant Companies</h2>
          <p>
            Manage registered CRM tenants, industry classification, account
            status, and quick customer lookup.
          </p>
        </div>
        <div className="platform-actions-row">
          <button
            type="button"
            className="platform-btn"
            onClick={fetchTenants}
            disabled={loading}
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          {canManage && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon size={15} />
              <span>Create Tenant</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="platform-alert error">{error}</div>}
      {success && <div className="platform-alert success">{success}</div>}

      <div className="platform-tabs">
        <button
          type="button"
          className={`platform-tab ${mode === "tenants" ? "active" : ""}`}
          onClick={() => setMode("tenants")}
        >
          Full Tenant Directory ({tenants.length})
        </button>
        <button
          type="button"
          className={`platform-tab ${mode === "lookup" ? "active" : ""}`}
          onClick={() => setMode("lookup")}
        >
          Minimal Support Lookup
        </button>
      </div>

      <form
        className="platform-filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          fetchTenants();
        }}
      >
        <input
          className="platform-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Search company name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {mode === "tenants" && (
          <>
            <select
              className="platform-select"
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
            >
              <option value="">All Industries</option>
              {INDUSTRY_OPTIONS.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
            <select
              className="platform-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {TENANT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="submit" className="platform-btn primary sm">
          <SearchIcon size={14} />
          <span>Filter</span>
        </button>
      </form>

      <div className="platform-card">
        {loading ? (
          <div className="platform-empty">Loading tenant records...</div>
        ) : activeRows.length === 0 ? (
          <div className="platform-empty">No matching tenants found.</div>
        ) : mode === "tenants" ? (
          <>
            <div className="platform-table-wrap">
              <table className="platform-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Industry</th>
                    <th>Status</th>
                    <th>Users</th>
                    <th>Open Tickets</th>
                    <th>Subscription</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTenants.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        <div style={{ fontSize: 11, color: "var(--plat-muted)" }}>
                          {t.id}
                        </div>
                      </td>
                      <td>{t.industry}</td>
                      <td>
                        <span
                          className={`platform-badge ${
                            t.status === "Active"
                              ? "green"
                              : t.status === "Suspended"
                              ? "red"
                              : "yellow"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td>{t.users_count}</td>
                      <td>{t.open_tickets_count}</td>
                      <td>
                        {t.subscription ? (
                          <div>
                            <strong>{t.subscription.plan_name}</strong>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {t.subscription.status} • {t.subscription.billing_cycle}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "var(--plat-muted)" }}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        {canManage && (
                          <button
                            type="button"
                            className="platform-btn sm"
                            onClick={() => openEdit(t)}
                          >
                            <EditIcon size={13} />
                            <span>Edit</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalItems={tenants.length}
              pageSize={pageSize}
              onPageChange={setPage}
              entityName="tenants"
            />
          </>
        ) : (
          <>
            <div className="platform-table-wrap">
              <table className="platform-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Industry</th>
                    <th>Status</th>
                    <th>Plan</th>
                    <th>Subscription Status</th>
                    <th>Open Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLookup.map((item) => (
                    <tr key={item.tenant_id}>
                      <td>
                        <strong>{item.company_name}</strong>
                      </td>
                      <td>{item.industry}</td>
                      <td>{item.status}</td>
                      <td>{item.subscription_plan}</td>
                      <td>{item.subscription_status}</td>
                      <td>{item.open_tickets_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalItems={lookupResults.length}
              pageSize={pageSize}
              onPageChange={setPage}
              entityName="results"
            />
          </>
        )}
      </div>

      {createOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Create Customer Tenant</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setCreateOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleCreate}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Company Name</label>
                  <input
                    className="platform-input"
                    required
                    minLength={2}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Industry</label>
                  <select
                    className="platform-select"
                    value={newIndustry}
                    onChange={(e) => setNewIndustry(e.target.value)}
                  >
                    {INDUSTRY_OPTIONS.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Initial Plan Key</label>
                  <input
                    className="platform-input"
                    value={newPlanKey}
                    onChange={(e) => setNewPlanKey(e.target.value)}
                    placeholder="starter"
                  />
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={provisionOwner}
                  onChange={(e) => setProvisionOwner(e.target.checked)}
                />
                Provision initial Tenant Owner user
              </label>

              {provisionOwner && (
                <div className="platform-form-grid">
                  <div className="platform-field">
                    <label>Owner Full Name</label>
                    <input
                      className="platform-input"
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                    />
                  </div>
                  <div className="platform-field">
                    <label>Owner Email</label>
                    <input
                      className="platform-input"
                      type="email"
                      required
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                    />
                  </div>
                  <div className="platform-field">
                    <label>Owner Password (min 15 chars)</label>
                    <input
                      className="platform-input"
                      type="password"
                      required
                      minLength={15}
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Creating..." : "Create Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                  Edit Tenant Status
                </h3>
                <div style={{ fontSize: 12, color: "var(--plat-muted)", marginTop: 2 }}>
                  Modify account status for &quot;{editing.name}&quot;
                </div>
              </div>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setEditing(null)}
                aria-label="Close modal"
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleUpdate}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              {/* Company Name (Read-Only) */}
              <div className="platform-field">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <label style={{ margin: 0 }}>Company Name</label>
                  <span
                    className="platform-badge"
                    style={{
                      fontSize: 10.5,
                      padding: "1px 6px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "rgba(255, 255, 255, 0.05)",
                      color: "var(--plat-muted)",
                      border: "1px solid var(--plat-border)",
                    }}
                  >
                    <LockIcon size={11} />
                    <span>Read-only</span>
                  </span>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    className="platform-input"
                    value={editing.name}
                    readOnly
                    disabled
                    style={{
                      width: "100%",
                      cursor: "not-allowed",
                      background: "rgba(255, 255, 255, 0.03)",
                      borderColor: "rgba(255, 255, 255, 0.08)",
                      color: "var(--plat-muted)",
                      paddingRight: 32,
                    }}
                  />
                  <LockIcon
                    size={14}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--plat-muted)",
                      opacity: 0.6,
                      pointerEvents: "none",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--plat-muted)",
                    marginTop: 2,
                    display: "block",
                  }}
                >
                  Company name is fixed and governed by the tenant registration.
                </span>
              </div>

              {/* Industry (Read-Only) */}
              <div className="platform-field">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <label style={{ margin: 0 }}>Industry Vertical</label>
                  <span
                    className="platform-badge"
                    style={{
                      fontSize: 10.5,
                      padding: "1px 6px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "rgba(255, 255, 255, 0.05)",
                      color: "var(--plat-muted)",
                      border: "1px solid var(--plat-border)",
                    }}
                  >
                    <LockIcon size={11} />
                    <span>Read-only</span>
                  </span>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    className="platform-input"
                    value={editing.industry}
                    readOnly
                    disabled
                    style={{
                      width: "100%",
                      cursor: "not-allowed",
                      background: "rgba(255, 255, 255, 0.03)",
                      borderColor: "rgba(255, 255, 255, 0.08)",
                      color: "var(--plat-muted)",
                      paddingRight: 32,
                    }}
                  />
                  <LockIcon
                    size={14}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--plat-muted)",
                      opacity: 0.6,
                      pointerEvents: "none",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--plat-muted)",
                    marginTop: 2,
                    display: "block",
                  }}
                >
                  Industry vertical determines the CRM schema pack and cannot be modified.
                </span>
              </div>

              {/* Status (Editable) */}
              <div className="platform-field">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <label
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      color: "var(--plat-text)",
                    }}
                  >
                    <span>Tenant Status</span>
                    <span style={{ color: "#8b5cf6", marginLeft: 4 }}>*</span>
                  </label>
                  <span
                    className="platform-badge indigo"
                    style={{ fontSize: 10.5, padding: "1px 6px" }}
                  >
                    Editable
                  </span>
                </div>
                <select
                  className="platform-select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  style={{
                    width: "100%",
                    borderColor:
                      editStatus !== editing.status ? "#8b5cf6" : undefined,
                    boxShadow:
                      editStatus !== editing.status
                        ? "0 0 10px rgba(139, 92, 246, 0.25)"
                        : undefined,
                  }}
                >
                  {TENANT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--plat-muted)",
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {editStatus === "Active" && (
                    <span style={{ color: "#4ade80" }}>
                      ✓ Active: Tenant has full operational access to their workspace.
                    </span>
                  )}
                  {editStatus === "Trial" && (
                    <span style={{ color: "#38bdf8" }}>
                      ℹ️ Trial: Tenant is evaluating features within trial period.
                    </span>
                  )}
                  {editStatus === "Suspended" && (
                    <span style={{ color: "#f87171" }}>
                      ⚠️ Suspended: All active tenant sessions are revoked immediately.
                    </span>
                  )}
                  {editStatus === "Inactive" && (
                    <span style={{ color: "#fbbf24" }}>
                      ⚠️ Inactive: Tenant workspace is archived and login is disabled.
                    </span>
                  )}
                </div>
              </div>

              <div
                className="platform-actions-row"
                style={{
                  justifyContent: "flex-end",
                  marginTop: 6,
                  paddingTop: 12,
                  borderTop: "1px solid var(--plat-border)",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setEditing(null)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting || editStatus === editing.status}
                  title={
                    editStatus === editing.status
                      ? "Select a different status to save"
                      : "Save updated tenant status"
                  }
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

