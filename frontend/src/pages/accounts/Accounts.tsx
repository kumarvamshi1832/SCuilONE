import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Account } from "../../types/account";
import { User } from "../../types/user";
import { getAccounts } from "../../services/accountService";
import { getUsers } from "../../services/userService";
import { getAccountPermissions } from "../../utils/accountPermissions";
import AccountFormModal from "../../components/accounts/AccountFormModal";
import AccountViewModal from "../../components/accounts/AccountViewModal";
import AccountDeleteConfirm from "../../components/accounts/AccountDeleteConfirm";
import { formatDateTime } from "../../utils/dateFormatter";
import "../users/Users.css";
import "../leads/Leads.css";

export default function Accounts() {
  /* ─── Permissions ─── */
  const permissions = useMemo(() => getAccountPermissions(), []);

  /* ─── State ─── */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [viewAccount, setViewAccount] = useState<Account | null>(null);
  const [deleteAccountState, setDeleteAccountState] = useState<Account | null>(null);

  // Actions dropdown
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Toast
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  /* ─── Data Fetching ─── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsData, usersData] = await Promise.all([
        getAccounts(),
        getUsers(),
      ]);
      setAccounts(accountsData);
      setUsers(usersData);
    } catch (err: any) {
      console.error("Fetch accounts error:", err);
      if (err?.response?.status === 401 || err?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (err?.response?.status >= 500 || err?.status >= 500) {
        setError("Unable to load accounts. Please try again.");
      } else {
        setError(
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load accounts."
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close actions dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setOpenActionId(null);
        setDropdownPos(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenActionId(null);
        setDropdownPos(null);
      }
    };
    if (openActionId) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openActionId]);

  // Calculate dropdown position from the trigger button
  const toggleActions = (accountId: string) => {
    if (openActionId === accountId) {
      setOpenActionId(null);
      setDropdownPos(null);
      return;
    }
    const btn = triggerRefs.current[accountId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const dropdownHeight = 140;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropdownHeight + 8;
      setDropdownPos({
        top: openUp ? rect.top : rect.bottom + 4,
        left: rect.right - 148,
        openUp,
      });
    }
    setOpenActionId(accountId);
  };

  /* ─── Helpers ─── */

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const getUserDisplay = (userId?: string | null): { name: string; role: string } => {
    if (!userId) return { name: "—", role: "" };
    const user = users.find((u) => u.id === userId);
    return user
      ? { name: user.full_name, role: user.role }
      : { name: "—", role: "" };
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setIndustryFilter("");
    setSourceFilter("");
    setAssignedFilter("");
  };

  const hasActiveFilters = search || statusFilter || industryFilter || sourceFilter || assignedFilter;

  /* ─── Filtering (client-side) ─── */

  const filteredAccounts = accounts.filter((account) => {
    // Text search
    if (search) {
      const q = search.toLowerCase();
      const matchesSearch =
        (account.name || "").toLowerCase().includes(q) ||
        (account.email || "").toLowerCase().includes(q) ||
        (account.phone || "").toLowerCase().includes(q) ||
        (account.industry || "").toLowerCase().includes(q) ||
        (account.website || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    // Status filter
    if (statusFilter && account.status !== statusFilter) return false;
    // Industry filter
    if (industryFilter && account.industry !== industryFilter) return false;
    // Source filter
    if (sourceFilter && account.source !== sourceFilter) return false;
    // Assigned filter
    if (assignedFilter && account.assigned_to !== assignedFilter) return false;

    return true;
  });

  // Collect unique values from data for filter dropdowns
  const uniqueStatuses = Array.from(new Set(accounts.map((a) => a.status).filter(Boolean))) as string[];
  const uniqueIndustries = Array.from(new Set(accounts.map((a) => a.industry).filter(Boolean))) as string[];
  const uniqueSources = Array.from(new Set(accounts.map((a) => a.source).filter(Boolean))) as string[];

  /* ─── Action Handlers ─── */

  const handleCreate = () => {
    setEditAccount(null);
    setIsFormOpen(true);
  };

  const handleView = (account: Account) => {
    setOpenActionId(null);
    setViewAccount(account);
  };

  const handleEdit = (account: Account) => {
    setOpenActionId(null);
    setViewAccount(null);
    setEditAccount(account);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (account: Account) => {
    setOpenActionId(null);
    setDeleteAccountState(account);
  };

  const handleFormSuccess = (savedAccount: Account) => {
    setAccounts((prev) => {
      const isExisting = prev.some((a) => a.id === savedAccount.id);
      if (isExisting) {
        return prev.map((a) => (a.id === savedAccount.id ? savedAccount : a));
      } else {
        return [savedAccount, ...prev];
      }
    });
    fetchData();
    showToast(editAccount ? "Account updated successfully" : "Account created successfully");
  };

  const handleDeleteSuccess = () => {
    fetchData();
    showToast("Account deleted successfully");
  };

  /* ─── Status Badge Helper ─── */
  const getStatusClass = (status: string) => {
    const s = status.toLowerCase();
    if (s === "active") return "status-qualified";
    if (s === "inactive") return "status-lost";
    if (s === "prospect") return "status-new";
    if (s === "churned") return "status-contacted";
    return "";
  };

  /* ─── Render ─── */

  if (!permissions.view) {
    return (
      <div className="leads-page">
        <div className="alert-box error" style={{ margin: "2rem" }}>
          You do not have permission to view accounts.
        </div>
      </div>
    );
  }

  return (
    <div className="leads-page">
      {/* Toast Notification */}
      {notification && (
        <div className={`notification-toast ${notification.type}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {notification.type === "success" ? (
              <>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </>
            )}
          </svg>
          {notification.message}
        </div>
      )}

      {/* Header Section */}
      <div className="page-header">
        <div>
          <h1>Accounts</h1>
          <p className="text-muted">Manage and maintain customer/company account information.</p>
        </div>
        <div className="header-actions">
          {permissions.create && (
            <button className="btn-primary" onClick={handleCreate}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Account
            </button>
          )}
        </div>
      </div>

      {/* Filters Section */}
      <div className="leads-filter-bar">
        <div className="leads-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        {uniqueStatuses.length > 0 && (
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Statuses</option>
            {uniqueStatuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {uniqueIndustries.length > 0 && (
          <select 
            value={industryFilter} 
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Industries</option>
            {uniqueIndustries.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {uniqueSources.length > 0 && (
          <select 
            value={sourceFilter} 
            onChange={(e) => setSourceFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Sources</option>
            {uniqueSources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        
        <select 
          value={assignedFilter} 
          onChange={(e) => setAssignedFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Assignees</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>
        
        {hasActiveFilters && (
          <button 
            className="btn-clear-filters" 
            onClick={clearFilters} 
            title="Clear all filters"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            Clear Filters
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="leads-table-container" style={{ overflowX: 'auto' }}>
        {loading ? (
        <div className="leads-loading">
          <div className="leads-loading-spinner"></div>
          <p>Loading accounts...</p>
        </div>
      ) : error ? (
        <div className="error-state" style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", background: "rgba(231,76,60,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px"
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="2" width="24" height="24">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <p style={{ color: "#e74c3c", fontWeight: 500, marginBottom: 8 }}>{error}</p>
          <button className="btn-secondary" onClick={fetchData} style={{ marginTop: 8 }}>
            Retry
          </button>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="leads-empty-state">
          <div className="leads-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16"></path>
              <path d="M1 21h22"></path>
              <path d="M9 7h6"></path>
              <path d="M9 11h6"></path>
              <path d="M9 15h4"></path>
            </svg>
          </div>
          <h3>No accounts found</h3>
          <p className="text-muted">
            {hasActiveFilters 
              ? "Try adjusting your filters or search term."
              : "Get started by adding your first account."}
          </p>
        </div>
      ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Industry</th>
                <th>Status</th>
                <th>Source</th>
                <th>Assigned To</th>
                <th>Updated</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => {
                const assignedUser = getUserDisplay(account.assigned_to);
                return (
                  <tr key={account.id}>
                    <td>
                      <div className="lead-name-cell">
                        <div className="lead-avatar">
                          {(account.name || "-").charAt(0).toUpperCase()}
                        </div>
                        <span className="lead-name-text">{account.name || "—"}</span>
                      </div>
                    </td>
                    <td>
                      {account.email ? (
                        <div className="text-sm">{account.email}</div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {account.phone ? (
                        <div className="text-sm">{account.phone}</div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {account.industry ? (
                        <span className="badge badge-secondary">{account.industry}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {account.status ? (
                        <span className={`lead-status-badge ${getStatusClass(account.status)}`}>
                          {account.status}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {account.source ? (
                        <span className="badge badge-secondary">{account.source}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {account.assigned_to && assignedUser.name !== "—" ? (
                        <div style={{ lineHeight: 1.3 }}>
                          <span style={{ fontWeight: 500 }}>{assignedUser.name}</span>
                          {assignedUser.role && (
                            <>
                              <br />
                              <span className="text-dim" style={{ fontSize: '0.78rem' }}>{assignedUser.role}</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="text-sm text-muted">
                        {formatDateTime(account.updated_at)}
                      </div>
                    </td>
                    <td className="actions-cell">
                      <button 
                        className="btn-icon" 
                        ref={(el) => (triggerRefs.current[account.id] = el)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActions(account.id);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="1"></circle>
                          <circle cx="12" cy="5" r="1"></circle>
                          <circle cx="12" cy="19" r="1"></circle>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
      )}
      </div>

      {/* Global dropdown menu via fixed positioning */}
      {openActionId && dropdownPos && (
        <div 
          ref={actionsRef}
          className={`actions-dropdown ${dropdownPos.openUp ? 'open-up' : ''}`}
          style={{
            position: 'fixed',
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            zIndex: 1000
          }}
        >
          {(() => {
            const activeAccount = accounts.find(a => a.id === openActionId);
            if (!activeAccount) return null;
            return (
              <>
                {permissions.view && (
                  <button className="dropdown-item" onClick={() => handleView(activeAccount)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View Details
                  </button>
                )}
                {permissions.update && (
                  <button className="dropdown-item" onClick={() => handleEdit(activeAccount)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Edit Account
                  </button>
                )}
                {permissions.delete && (
                  <button className="dropdown-item text-danger" onClick={() => handleDeleteClick(activeAccount)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete Account
                  </button>
                )}
                {!permissions.view && !permissions.update && !permissions.delete && (
                  <div className="dropdown-item text-muted" style={{ pointerEvents: 'none' }}>
                    No actions available
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Modals */}
      {isFormOpen && (
        <AccountFormModal
          account={editAccount}
          onClose={() => setIsFormOpen(false)}
          onSuccess={handleFormSuccess}
        />
      )}

      {viewAccount && (
        <AccountViewModal
          account={viewAccount}
          users={users}
          onClose={() => setViewAccount(null)}
        />
      )}

      {deleteAccountState && (
        <AccountDeleteConfirm
          account={deleteAccountState}
          onClose={() => setDeleteAccountState(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
