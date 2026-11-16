import React, { useEffect, useState } from "react";
import { Pagination } from "../../components/common/Pagination";
import {
  EditIcon,
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
  const [editName, setEditName] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
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
    setEditName(t.name);
    setEditIndustry(t.industry);
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
        name: editName.trim(),
        industry: editIndustry,
        status: editStatus,
      });
      setSuccess(`Updated tenant "${editName.trim()}".`);
      setEditing(null);
      await fetchTenants();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update tenant."));
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
              <h3>Edit Tenant: {editing.name}</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setEditing(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleUpdate}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Company Name</label>
                <input
                  className="platform-input"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="platform-field">
                <label>Industry</label>
                <select
                  className="platform-select"
                  value={editIndustry}
                  onChange={(e) => setEditIndustry(e.target.value)}
                >
                  {INDUSTRY_OPTIONS.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-field">
                <label>Status</label>
                <select
                  className="platform-select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  {TENANT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
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
