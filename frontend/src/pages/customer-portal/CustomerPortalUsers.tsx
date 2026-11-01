import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  UsersIcon,
  UserPlusIcon,
  SearchIcon,
  RefreshIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  XIcon,
  MailIcon,
  BuildingIcon,
  UserCheckIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getCustomerPortalUsers,
  inviteCustomerContact,
  updateCustomerPortalUserStatus,
} from "../../services/customerPortalAdminService";
import { getContacts } from "../../services/contactService";
import type { CustomerPortalUserRow, PortalInviteResponse } from "../../types/customerPortal";
import type { Contact } from "../../types/contact";
import "./CustomerPortalUsers.css";

export default function CustomerPortalUsers() {
  const [users, setUsers] = useState<CustomerPortalUserRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<PortalInviteResponse | null>(null);

  // Action state
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Users
  const fetchPortalUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCustomerPortalUsers();
      setUsers(data);
    } catch (err: any) {
      console.error("Failed to fetch customer portal users:", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to load portal users.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Contacts for Invitation Dropdown
  useEffect(() => {
    async function loadContacts() {
      try {
        const contactList = await getContacts();
        setContacts(contactList);
      } catch (err) {
        console.warn("Failed to load contacts for portal invites:", err);
      }
    }
    loadContacts();
    fetchPortalUsers();
  }, [fetchPortalUsers]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === "Active").length;
    const invited = users.filter((u) => u.status === "Invited").length;
    const suspended = users.filter((u) => u.status === "Suspended").length;
    return { total, active, invited, suspended };
  }, [users]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter && u.status !== statusFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = u.contact_name?.toLowerCase().includes(q);
        const matchAccount = u.account_name?.toLowerCase().includes(q);
        const matchEmail = u.email?.toLowerCase().includes(q);
        if (!matchName && !matchAccount && !matchEmail) return false;
      }
      return true;
    });
  }, [users, statusFilter, searchTerm]);

  // Eligible contacts for invitation (must have email)
  const eligibleContacts = useMemo(() => {
    return contacts.filter((c) => c.email && c.email.trim().length > 0);
  }, [contacts]);

  // Handle Invite Submit
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId) {
      showToast("Please select a customer contact to invite.", "error");
      return;
    }

    setInviting(true);
    try {
      const result = await inviteCustomerContact(selectedContactId);
      setInviteSuccess(result);
      showToast(`Invitation sent to ${result.email}!`, "success");
      fetchPortalUsers();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to send portal invitation.", "error");
    } finally {
      setInviting(false);
    }
  };

  // Toggle user status Active <-> Suspended
  const handleToggleStatus = async (user: CustomerPortalUserRow) => {
    if (user.status === "Invited") {
      showToast(
        "This user is still in 'Invited' status. They must activate their account before you can enable or disable them.",
        "error"
      );
      return;
    }

    const newStatus = user.status === "Active" ? "Suspended" : "Active";
    setStatusUpdatingId(user.portal_user_id);
    try {
      await updateCustomerPortalUserStatus(user.portal_user_id, newStatus);
      showToast(`User status updated to ${newStatus}.`, "success");
      fetchPortalUsers();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to update user status.", "error");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Active":
        return <span className="portal-status-badge portal-status-active">Active</span>;
      case "Invited":
        return <span className="portal-status-badge portal-status-invited">Invited</span>;
      case "Suspended":
        return <span className="portal-status-badge portal-status-suspended">Suspended</span>;
      default:
        return <span className="portal-status-badge">{status}</span>;
    }
  };

  return (
    <div className="portal-admin-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`support-alert ${toast.type}`}>
          {toast.type === "success" ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="portal-admin-header">
        <div className="portal-admin-title">
          <UsersIcon size={28} color="#2563eb" />
          <div>
            <h1>Customer Portal Users</h1>
            <div className="portal-admin-subtitle">
              Manage client portal accounts, track invitations, and configure access permissions
            </div>
          </div>
        </div>
        <div className="support-header-actions">
          <button className="btn-secondary" onClick={fetchPortalUsers} disabled={loading}>
            <RefreshIcon size={16} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setSelectedContactId("");
              setInviteSuccess(null);
              setIsInviteOpen(true);
            }}
          >
            <UserPlusIcon size={16} />
            <span>Invite Customer Contact</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="portal-kpis">
        <div className="portal-kpi-card">
          <div className="portal-kpi-icon blue">
            <UsersIcon size={24} />
          </div>
          <div className="portal-kpi-content">
            <span className="portal-kpi-label">Total Portal Accounts</span>
            <span className="portal-kpi-value">{kpis.total}</span>
          </div>
        </div>
        <div className="portal-kpi-card">
          <div className="portal-kpi-icon emerald">
            <UserCheckIcon size={24} />
          </div>
          <div className="portal-kpi-content">
            <span className="portal-kpi-label">Active Users</span>
            <span className="portal-kpi-value">{kpis.active}</span>
          </div>
        </div>
        <div className="portal-kpi-card">
          <div className="portal-kpi-icon amber">
            <ClockIcon size={24} />
          </div>
          <div className="portal-kpi-content">
            <span className="portal-kpi-label">Pending Activation</span>
            <span className="portal-kpi-value">{kpis.invited}</span>
          </div>
        </div>
        <div className="portal-kpi-card">
          <div className="portal-kpi-icon rose">
            <ShieldAlertIcon size={24} />
          </div>
          <div className="portal-kpi-content">
            <span className="portal-kpi-label">Suspended</span>
            <span className="portal-kpi-value">{kpis.suspended}</span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="support-filter-bar">
        <div className="support-search-box">
          <SearchIcon size={16} className="support-search-icon" />
          <input
            type="text"
            placeholder="Search by contact, account, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="support-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Invited">Invited</option>
          <option value="Suspended">Suspended</option>
        </select>
        {(searchTerm || statusFilter) && (
          <button
            className="btn-secondary"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("");
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Portal Users Table */}
      <div className="portal-table-container">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
            <RefreshIcon size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            <div>Loading customer portal accounts...</div>
          </div>
        ) : error ? (
          <div style={{ padding: "32px", textAlign: "center" }}>
            <div className="support-alert error" style={{ maxWidth: 500, margin: "0 auto 16px" }}>
              <AlertCircleIcon size={18} />
              <span>{error}</span>
            </div>
            <button className="btn-secondary" onClick={fetchPortalUsers}>
              Retry Loading
            </button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <UsersIcon size={48} style={{ opacity: 0.3, margin: "0 auto 12px" }} />
            <h3>No Customer Portal Users Found</h3>
            <p>
              {searchTerm || statusFilter
                ? "No portal accounts match your search filter."
                : "No customer portal users have been invited yet. Click 'Invite Customer Contact' above to send the first invitation."}
            </p>
          </div>
        ) : (
          <table className="portal-table">
            <thead>
              <tr>
                <th>Customer Contact</th>
                <th>Company / Account</th>
                <th>Portal Email</th>
                <th>Status</th>
                <th>Created</th>
                <th>Activated</th>
                <th>Last Login</th>
                <th style={{ textAlign: "right" }}>Access Control</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isUpdating = statusUpdatingId === user.portal_user_id;

                return (
                  <tr key={user.portal_user_id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-color, #0f172a)" }}>
                        {user.contact_name}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <BuildingIcon size={14} color="#64748b" />
                        <span>{user.account_name}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <MailIcon size={14} color="#64748b" />
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td>{getStatusBadge(user.status)}</td>
                    <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      {user.activated_at ? new Date(user.activated_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {user.status === "Invited" ? (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "#94a3b8",
                            fontStyle: "italic",
                          }}
                          title="Contact has not activated account yet"
                        >
                          Pending Activation
                        </span>
                      ) : (
                        <button
                          className="btn-secondary"
                          style={{
                            padding: "6px 12px",
                            fontSize: "0.8125rem",
                            color: user.status === "Active" ? "#dc2626" : "#15803d",
                            borderColor: user.status === "Active" ? "#fca5a5" : "#86efac",
                          }}
                          disabled={isUpdating}
                          onClick={() => handleToggleStatus(user)}
                        >
                          {isUpdating ? (
                            "Updating..."
                          ) : user.status === "Active" ? (
                            <>
                              <ShieldAlertIcon size={14} />
                              <span>Suspend Access</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheckIcon size={14} />
                              <span>Activate Access</span>
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* INVITE CUSTOMER CONTACT MODAL */}
      {isInviteOpen && (
        <div className="modal-overlay" onClick={() => setIsInviteOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Invite Customer to Client Portal</h2>
              <button className="modal-close-btn" onClick={() => setIsInviteOpen(false)}>
                <XIcon size={20} />
              </button>
            </div>

            {inviteSuccess ? (
              <div className="modal-body">
                <div className="support-alert success">
                  <CheckCircleIcon size={20} />
                  <div>
                    <strong>Invitation Successfully Created!</strong>
                    <div style={{ marginTop: 4 }}>
                      An invitation email has been sent to <strong>{inviteSuccess.email}</strong>.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(0,0,0,0.03)",
                    padding: "16px",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ marginBottom: 6 }}>
                    <strong>Portal User ID:</strong> {inviteSuccess.portal_user_id}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Invitation Status:</strong> {inviteSuccess.status}
                  </div>
                  <div>
                    <strong>Expires At:</strong>{" "}
                    {new Date(inviteSuccess.invitation_expires_at).toLocaleString()}
                  </div>
                </div>

                <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
                  The client can activate their portal account by visiting the portal activation link
                  and choosing a secure password.
                </p>

                <div className="modal-footer" style={{ padding: "16px 0 0 0" }}>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setIsInviteOpen(false);
                      setInviteSuccess(null);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit}>
                <div className="modal-body">
                  <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: 16 }}>
                    Select an existing contact from your CRM to grant access to the Customer Portal.
                    The contact must have a valid email address and belong to an Account.
                  </p>

                  <div className="form-group">
                    <label>Select Customer Contact *</label>
                    <select
                      value={selectedContactId}
                      required
                      onChange={(e) => setSelectedContactId(e.target.value)}
                    >
                      <option value="">-- Choose Contact --</option>
                      {eligibleContacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} ({c.email}) {c.company ? `— ${c.company}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {eligibleContacts.length === 0 && (
                    <div className="support-alert info" style={{ marginTop: 12 }}>
                      <span>No contacts with valid email addresses found in the CRM.</span>
                    </div>
                  )}
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsInviteOpen(false)}
                    disabled={inviting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={inviting || !selectedContactId}
                  >
                    {inviting ? "Sending Invitation..." : "Send Invitation"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

