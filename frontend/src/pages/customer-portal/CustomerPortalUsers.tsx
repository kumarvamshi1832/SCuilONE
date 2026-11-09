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
  resendCustomerPortalInvitation,
  revokeCustomerPortalInvitation,
} from "../../services/customerPortalAdminService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";
import { getCustomerPortalPermissions } from "../../utils/customerPortalPermissions";
import type { CustomerPortalUserRow, PortalInviteResponse } from "../../types/customerPortal";
import type { Contact } from "../../types/contact";
import type { Account } from "../../types/account";
import "./CustomerPortalUsers.css";

export default function CustomerPortalUsers() {
  const [users, setUsers] = useState<CustomerPortalUserRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Permissions
  const permissions = useMemo(() => getCustomerPortalPermissions(), []);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<PortalInviteResponse | null>(null);

  // Action & Confirmation Dialog State
  const [confirmAction, setConfirmAction] = useState<{
    type: "suspend" | "reactivate" | "resend" | "revoke";
    user: CustomerPortalUserRow;
  } | null>(null);
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
      setUsers(data || []);
    } catch (err: any) {
      console.error("Failed to fetch customer portal users:", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to load portal users.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Contacts and Accounts for Invitation Dropdown
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [contactList, accountList] = await Promise.all([
          getContacts().catch(() => []),
          getAccounts().catch(() => []),
        ]);
        setContacts(contactList || []);
        setAccounts(accountList || []);
      } catch (err) {
        console.warn("Failed to load contacts or accounts for portal invites:", err);
      }
    }
    loadMetadata();
    fetchPortalUsers();
  }, [fetchPortalUsers]);

  // Account map for quick lookup
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((acc) => {
      map.set(acc.id, acc.name);
    });
    return map;
  }, [accounts]);

  // Dynamic KPI Calculations strictly from actual Customer Portal Users API response
  const kpis = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status?.trim() === "Active").length;
    const invited = users.filter((u) => u.status?.trim() === "Invited").length;
    const suspended = users.filter((u) => u.status?.trim() === "Suspended").length;
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

  // Eligible contacts for invitation: Backend strictly requires BOTH email AND account_id
  const eligibleContacts = useMemo(() => {
    return contacts.filter(
      (c) => Boolean(c.email && c.email.trim().length > 0) && Boolean(c.account_id)
    );
  }, [contacts]);

  // Handle Invite Submit
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.canInvite) {
      showToast("You do not have permission to invite customer portal users.", "error");
      return;
    }

    if (!selectedContactId) {
      showToast("Please select a customer contact to invite.", "error");
      return;
    }

    setInviting(true);
    try {
      const result = await inviteCustomerContact(selectedContactId);
      setInviteSuccess(result);
      showToast(`Invitation successfully sent to ${result.email}!`, "success");
      fetchPortalUsers();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to send portal invitation.", "error");
    } finally {
      setInviting(false);
    }
  };

  // Execute Action (Resend, Revoke, Suspend or Reactivate) with backend confirmation
  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, user } = confirmAction;

    if (type === "resend") {
      if (!permissions.canInvite) {
        showToast("You do not have permission to resend invitations.", "error");
        setConfirmAction(null);
        return;
      }
      setStatusUpdatingId(user.portal_user_id);
      try {
        const result = await resendCustomerPortalInvitation(user.portal_user_id);
        const expiryStr = result.invitation_expires_at
          ? new Date(result.invitation_expires_at).toLocaleString()
          : "7 days";
        showToast(
          `Invitation successfully resent to ${result.email}! Valid until ${expiryStr}.`,
          "success"
        );
        setConfirmAction(null);
        await fetchPortalUsers();
      } catch (err: any) {
        const status = err?.response?.status;
        let msg = err?.response?.data?.detail;
        if (status === 403) {
          msg = msg || "Permission denied. You require customer_portal.invite permission.";
        } else if (status === 404) {
          msg = msg || "Portal user or linked contact not found.";
        } else if (status === 409) {
          msg = msg || "This portal account is already active.";
        } else if (status === 502) {
          msg = msg || "Invitation could not be resent. Check the email service and try again.";
        } else {
          msg = msg || "Failed to resend portal invitation.";
        }
        showToast(msg, "error");
      } finally {
        setStatusUpdatingId(null);
      }
      return;
    }

    if (type === "revoke") {
      if (!permissions.canManage) {
        showToast("You do not have permission to revoke portal invitations.", "error");
        setConfirmAction(null);
        return;
      }
      setStatusUpdatingId(user.portal_user_id);
      try {
        const result = await revokeCustomerPortalInvitation(user.portal_user_id);
        showToast(
          result.message || `Pending invitation revoked for ${user.contact_name}. Status is now ${result.status}.`,
          "success"
        );
        setConfirmAction(null);
        await fetchPortalUsers();
      } catch (err: any) {
        showToast(err?.response?.data?.detail || "Failed to revoke invitation.", "error");
      } finally {
        setStatusUpdatingId(null);
      }
      return;
    }

    // Suspend or Reactivate (Active or Suspended users only)
    if (!permissions.canManage) {
      showToast("You do not have permission to change portal user status.", "error");
      setConfirmAction(null);
      return;
    }

    if (user.status === "Invited") {
      showToast(
        "This user is still in 'Invited' status. Please use Resend Invitation or Revoke Invitation.",
        "error"
      );
      setConfirmAction(null);
      return;
    }

    const targetStatus = type === "suspend" ? "Suspended" : "Active";
    setStatusUpdatingId(user.portal_user_id);

    try {
      await updateCustomerPortalUserStatus(user.portal_user_id, targetStatus);
      showToast(
        targetStatus === "Suspended"
          ? `Portal access suspended for ${user.contact_name}. Active sessions have been revoked.`
          : `Portal access reactivated successfully for ${user.contact_name}.`,
        "success"
      );
      setConfirmAction(null);
      await fetchPortalUsers();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || `Failed to ${type} user access.`, "error");
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
        <div className={`support-alert ${toast.type}`} role="alert">
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
            disabled={!permissions.canInvite}
            title={!permissions.canInvite ? "Requires customer_portal.invite permission" : undefined}
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

      {/* KPI Stats (Dynamically derived from actual API responses) */}
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

      {/* Search and Filters Toolbar (Clean Flexbox Layout, No Overlap) */}
      <div className="portal-users-toolbar">
        <div className="portal-search-wrapper">
          <SearchIcon size={16} className="portal-search-icon" />
          <input
            type="text"
            placeholder="Search by contact, account, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="portal-status-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by portal status"
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Invited">Invited</option>
          <option value="Suspended">Suspended</option>
        </select>
        {(searchTerm || statusFilter) && (
          <button
            type="button"
            className="btn-secondary portal-clear-btn"
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
                      <div style={{ display: "inline-flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                        {user.status === "Invited" ? (
                          <>
                            {permissions.canInvite && (
                              <button
                                type="button"
                                className="btn-action-resend"
                                disabled={isUpdating}
                                title="Resend invitation email with refreshed expiration"
                                onClick={() => setConfirmAction({ type: "resend", user })}
                              >
                                <MailIcon size={14} />
                                <span>{isUpdating ? "Resending..." : "Resend Invite"}</span>
                              </button>
                            )}
                            {permissions.canManage && (
                              <button
                                type="button"
                                className="btn-action-revoke"
                                disabled={isUpdating}
                                title="Revoke pending invitation and suspend access"
                                onClick={() => setConfirmAction({ type: "revoke", user })}
                              >
                                <ShieldAlertIcon size={14} />
                                <span>{isUpdating ? "Revoking..." : "Revoke"}</span>
                              </button>
                            )}
                            {!permissions.canInvite && !permissions.canManage && (
                              <span
                                className="portal-pending-label"
                                title="Contact has not activated account yet. Must activate via invitation email."
                              >
                                Pending Activation
                              </span>
                            )}
                          </>
                        ) : user.status === "Suspended" ? (
                          <button
                            type="button"
                            className="btn-action-reactivate"
                            disabled={isUpdating || !permissions.canManage}
                            title={
                              !permissions.canManage
                                ? "Requires customer_portal.manage permission"
                                : "Reactivate user account"
                            }
                            onClick={() => setConfirmAction({ type: "reactivate", user })}
                          >
                            <ShieldCheckIcon size={14} />
                            <span>{isUpdating ? "Updating..." : "Reactivate Access"}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-action-suspend"
                            disabled={isUpdating || !permissions.canManage}
                            title={
                              !permissions.canManage
                                ? "Requires customer_portal.manage permission"
                                : "Suspend user and revoke active sessions"
                            }
                            onClick={() => setConfirmAction({ type: "suspend", user })}
                          >
                            <ShieldAlertIcon size={14} />
                            <span>{isUpdating ? "Updating..." : "Suspend Access"}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* CONFIRM ACTION MODAL */}
      {confirmAction && (
        <div className="modal-overlay" onClick={() => !statusUpdatingId && setConfirmAction(null)}>
          <div className="modal-content" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {confirmAction.type === "resend"
                  ? "Resend Portal Invitation"
                  : confirmAction.type === "revoke"
                  ? "Revoke Pending Invitation"
                  : confirmAction.type === "suspend"
                  ? "Suspend Customer Portal Access"
                  : "Reactivate Customer Portal Access"}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                disabled={Boolean(statusUpdatingId)}
                onClick={() => setConfirmAction(null)}
              >
                <XIcon size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "16px",
                  borderRadius: "8px",
                  background:
                    confirmAction.type === "resend"
                      ? "rgba(37, 99, 235, 0.1)"
                      : confirmAction.type === "revoke"
                      ? "rgba(217, 119, 6, 0.1)"
                      : confirmAction.type === "suspend"
                      ? "rgba(239, 68, 68, 0.1)"
                      : "rgba(16, 185, 129, 0.1)",
                  border:
                    confirmAction.type === "resend"
                      ? "1px solid rgba(37, 99, 235, 0.25)"
                      : confirmAction.type === "revoke"
                      ? "1px solid rgba(217, 119, 6, 0.25)"
                      : confirmAction.type === "suspend"
                      ? "1px solid rgba(239, 68, 68, 0.25)"
                      : "1px solid rgba(16, 185, 129, 0.25)",
                  marginBottom: 16,
                }}
              >
                {confirmAction.type === "resend" ? (
                  <MailIcon size={24} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
                ) : confirmAction.type === "revoke" ? (
                  <ShieldAlertIcon size={24} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
                ) : confirmAction.type === "suspend" ? (
                  <ShieldAlertIcon size={24} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <ShieldCheckIcon size={24} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                )}
                <div style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
                  <p style={{ margin: "0 0 6px 0", fontWeight: 600 }}>
                    {confirmAction.type === "resend"
                      ? `Resend invitation email to ${confirmAction.user.contact_name}?`
                      : confirmAction.type === "revoke"
                      ? `Revoke pending invitation for ${confirmAction.user.contact_name}?`
                      : confirmAction.type === "suspend"
                      ? `Are you sure you want to suspend portal access for ${confirmAction.user.contact_name}?`
                      : `Are you sure you want to reactivate portal access for ${confirmAction.user.contact_name}?`}
                  </p>
                  <p style={{ margin: 0, color: "#64748b" }}>
                    {confirmAction.type === "resend"
                      ? `A new activation email with a refreshed expiration window will be delivered to ${confirmAction.user.email}. Previous links will be superseded.`
                      : confirmAction.type === "revoke"
                      ? "Revoking this invitation immediately invalidates any pending activation links and sets the portal account status to Suspended. The user will not be able to activate until re-invited. (This does not delete the user record)."
                      : confirmAction.type === "suspend"
                      ? "Suspending access will immediately revoke all active portal sessions and prevent this contact from logging in until reactivated."
                      : "Reactivating access will restore this contact's ability to log in with their existing credentials."}
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: "var(--bg-secondary, rgba(0,0,0,0.03))",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  fontSize: "0.8125rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div>
                  <strong>Customer Contact:</strong> {confirmAction.user.contact_name}
                </div>
                <div>
                  <strong>Portal Email:</strong> {confirmAction.user.email}
                </div>
                <div>
                  <strong>Company:</strong> {confirmAction.user.account_name}
                </div>
                <div>
                  <strong>Current Status:</strong>{" "}
                  <span style={{ fontWeight: 600 }}>{confirmAction.user.status}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                disabled={Boolean(statusUpdatingId)}
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: statusUpdatingId ? "not-allowed" : "pointer",
                  border: "none",
                  color: "#ffffff",
                  background:
                    confirmAction.type === "resend"
                      ? "#2563eb"
                      : confirmAction.type === "revoke"
                      ? "#d97706"
                      : confirmAction.type === "suspend"
                      ? "#dc2626"
                      : "#16a34a",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
                disabled={Boolean(statusUpdatingId)}
                onClick={handleConfirmAction}
              >
                {statusUpdatingId ? (
                  <>
                    <RefreshIcon size={16} className="animate-spin" />
                    <span>
                      {confirmAction.type === "resend"
                        ? "Resending..."
                        : confirmAction.type === "revoke"
                        ? "Revoking..."
                        : confirmAction.type === "suspend"
                        ? "Suspending..."
                        : "Reactivating..."}
                    </span>
                  </>
                ) : confirmAction.type === "resend" ? (
                  <>
                    <MailIcon size={16} />
                    <span>Resend Invitation</span>
                  </>
                ) : confirmAction.type === "revoke" ? (
                  <>
                    <ShieldAlertIcon size={16} />
                    <span>Revoke Invitation</span>
                  </>
                ) : confirmAction.type === "suspend" ? (
                  <>
                    <ShieldAlertIcon size={16} />
                    <span>Suspend Access</span>
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon size={16} />
                    <span>Reactivate Access</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVITE CUSTOMER CONTACT MODAL */}
      {isInviteOpen && (
        <div className="modal-overlay" onClick={() => !inviting && setIsInviteOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Invite Customer to Client Portal</h2>
              <button className="modal-close-btn" disabled={inviting} onClick={() => setIsInviteOpen(false)}>
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
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div>
                    <strong>Contact Email:</strong> {inviteSuccess.email}
                  </div>
                  <div>
                    <strong>Account ID:</strong>{" "}
                    <span style={{ fontFamily: "monospace" }}>{inviteSuccess.account_id}</span>
                  </div>
                  <div>
                    <strong>Portal User ID:</strong>{" "}
                    <span style={{ fontFamily: "monospace" }}>{inviteSuccess.portal_user_id}</span>
                  </div>
                  <div>
                    <strong>Invitation Status:</strong> {inviteSuccess.status}
                  </div>
                  <div>
                    <strong>Invitation Expires At:</strong>{" "}
                    {new Date(inviteSuccess.invitation_expires_at).toLocaleString()}
                  </div>
                </div>

                <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
                  The client can activate their portal account by clicking the secure link in their
                  invitation email and setting their password.
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
                      {eligibleContacts.map((c) => {
                        const accName =
                          (c.account_id ? accountMap.get(c.account_id) : null) ||
                          c.company ||
                          "Linked Account";
                        return (
                          <option key={c.id} value={c.id}>
                            {c.full_name} ({c.email}) — Account: {accName}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {eligibleContacts.length === 0 && (
                    <div className="support-alert info" style={{ marginTop: 12 }}>
                      <span>
                        No contacts with both a valid email address and an associated Account found in
                        the CRM.
                      </span>
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
                    disabled={inviting || !selectedContactId || !permissions.canInvite}
                    title={!permissions.canInvite ? "Requires customer_portal.invite permission" : undefined}
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
