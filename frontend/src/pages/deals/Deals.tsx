import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Deal } from "../../types/deal";
import { User } from "../../types/user";
import { Lead } from "../../types/lead";
import { Contact } from "../../types/contact";
import { Account } from "../../types/account";
import { getDeals } from "../../services/dealService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";
import { getDealPermissions } from "../../utils/dealPermissions";
import DealFormModal from "../../components/deals/DealFormModal";
import DealViewModal from "../../components/deals/DealViewModal";
import DealDeleteConfirm from "../../components/deals/DealDeleteConfirm";
import { formatDateTime } from "../../utils/dateFormatter";
import "../users/Users.css";
import "../leads/Leads.css";

export default function Deals() {
  /* ─── Permissions ─── */
  const permissions = useMemo(() => getDealPermissions(), []);

  /* ─── State ─── */
  const [deals, setDeals] = useState<Deal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [viewDeal, setViewDeal] = useState<Deal | null>(null);
  const [deleteDealState, setDeleteDealState] = useState<Deal | null>(null);

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
      const [dealsData, usersData, leadsData, contactsData, accountsData] = await Promise.all([
        getDeals(),
        getUsers().catch(() => []),
        getLeads().catch(() => []),
        getContacts().catch(() => []),
        getAccounts().catch(() => []),
      ]);
      setDeals(dealsData);
      setUsers(usersData);
      setLeads(leadsData);
      setContacts(contactsData);
      setAccounts(accountsData);
    } catch (err: any) {
      console.error("Fetch deals error:", err);
      if (err?.response?.status === 401 || err?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (err?.response?.status >= 500 || err?.status >= 500) {
        setError("Unable to load deals. Please try again.");
      } else {
        setError(
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load deals."
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
  const toggleActions = (dealId: string) => {
    if (openActionId === dealId) {
      setOpenActionId(null);
      setDropdownPos(null);
      return;
    }
    const btn = triggerRefs.current[dealId];
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
    setOpenActionId(dealId);
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

  const getAccountName = (accountId: string | null) => {
    if (!accountId) return "";
    const account = accounts.find(a => a.id === accountId);
    return account ? account.name : "";
  };

  const getContactName = (contactId: string | null) => {
    if (!contactId) return "";
    const contact = contacts.find(c => c.id === contactId);
    return contact ? contact.full_name : "";
  };

  const clearFilters = () => {
    setSearch("");
    setStageFilter("");
    setAssignedFilter("");
  };

  const hasActiveFilters = search || stageFilter || assignedFilter;

  /* ─── Filtering (client-side) ─── */

  const filteredDeals = deals.filter((deal) => {
    // Text search
    if (search) {
      const q = search.toLowerCase();
      const acctName = getAccountName(deal.account_id).toLowerCase();
      const contName = getContactName(deal.contact_id).toLowerCase();
      const matchesSearch =
        (deal.name || "").toLowerCase().includes(q) ||
        acctName.includes(q) ||
        contName.includes(q);
      if (!matchesSearch) return false;
    }
    // Stage filter
    if (stageFilter && deal.stage !== stageFilter) return false;
    // Assigned filter
    if (assignedFilter && deal.assigned_to !== assignedFilter) return false;

    return true;
  });

  // Collect unique values from data for filter dropdowns
  const uniqueStages = Array.from(new Set(deals.map((d) => d.stage).filter(Boolean))) as string[];

  /* ─── Action Handlers ─── */

  const handleCreate = () => {
    setEditDeal(null);
    setIsFormOpen(true);
  };

  const handleView = (deal: Deal) => {
    setOpenActionId(null);
    setViewDeal(deal);
  };

  const handleEdit = (deal: Deal) => {
    setOpenActionId(null);
    setViewDeal(null);
    setEditDeal(deal);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (deal: Deal) => {
    setOpenActionId(null);
    setDeleteDealState(deal);
  };

  const handleFormSuccess = (savedDeal: Deal) => {
    setDeals((prev) => {
      const isExisting = prev.some((d) => d.id === savedDeal.id);
      if (isExisting) {
        return prev.map((d) => (d.id === savedDeal.id ? savedDeal : d));
      } else {
        return [savedDeal, ...prev];
      }
    });
    fetchData(); // Optional, but guarantees latest relationships
    showToast(editDeal ? "Deal updated successfully" : "Deal created successfully");
  };

  const handleDeleteSuccess = () => {
    fetchData();
    showToast("Deal deleted successfully");
  };

  /* ─── Render Helpers ─── */
  
  const getStageBadgeClass = (stage: string) => {
    const s = stage.toLowerCase();
    if (s === "won") return "status-qualified";
    if (s === "lost") return "status-lost";
    if (s === "new") return "status-new";
    if (s === "proposal" || s === "negotiation" || s === "discovery") return "status-contacted";
    return "";
  };

  if (!permissions.view) {
    return (
      <div className="leads-page">
        <div className="alert-box error" style={{ margin: "2rem" }}>
          You do not have permission to view deals.
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
          <h1>Deals</h1>
          <p className="text-muted">Manage and track your sales opportunities.</p>
        </div>
        <div className="header-actions">
          {permissions.create && (
            <button className="btn-primary" onClick={handleCreate}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Deal
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
            placeholder="Search deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        {uniqueStages.length > 0 && (
          <select 
            value={stageFilter} 
            onChange={(e) => setStageFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Stages</option>
            {uniqueStages.map(s => (
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
          <p>Loading deals...</p>
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
      ) : filteredDeals.length === 0 ? (
        <div className="leads-empty-state">
          <div className="leads-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2v20"></path>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <h3>No deals found</h3>
          <p className="text-muted">
            {hasActiveFilters 
              ? "Try adjusting your filters or search term."
              : "Get started by adding your first deal."}
          </p>
        </div>
      ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>Deal Name</th>
                <th>Account / Contact</th>
                <th>Amount</th>
                <th>Stage</th>
                <th>Expected Close</th>
                <th>Assigned To</th>
                <th>Updated</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal) => {
                const assignedUser = getUserDisplay(deal.assigned_to);
                const accountName = getAccountName(deal.account_id);
                const contactName = getContactName(deal.contact_id);
                
                return (
                  <tr key={deal.id}>
                    <td>
                      <div className="lead-name-cell">
                        <div className="lead-avatar" style={{ background: '#4299e1', color: 'white' }}>
                          {(deal.name || "-").charAt(0).toUpperCase()}
                        </div>
                        <span className="lead-name-text" style={{ fontWeight: 500 }}>{deal.name || "—"}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ lineHeight: 1.4 }}>
                        {accountName ? (
                          <span className="lead-name-text" style={{ display: 'block' }}>{accountName}</span>
                        ) : null}
                        {contactName ? (
                          <span className="text-dim" style={{ fontSize: '0.85rem' }}>{contactName}</span>
                        ) : null}
                        {!accountName && !contactName && <span className="text-muted">—</span>}
                      </div>
                    </td>
                    <td>
                      {deal.amount != null ? (
                        <span style={{ fontWeight: 600 }}>
                          {new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: "INR",
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 0,
                          }).format(Number(deal.amount))}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {deal.stage ? (
                        <span className={`lead-status-badge ${getStageBadgeClass(deal.stage)}`}>
                          {deal.stage}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {deal.expected_close_date ? (
                        <span>{deal.expected_close_date}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {deal.assigned_to && assignedUser.name !== "—" ? (
                        <div className="lead-name-cell" style={{ gap: '10px' }}>
                          <div className="lead-avatar">
                            {assignedUser.name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ lineHeight: 1.3 }}>
                            <span className="lead-name-text">{assignedUser.name}</span>
                            {assignedUser.role && (
                              <>
                                <br />
                                <span className="text-dim" style={{ fontSize: '0.78rem' }}>{assignedUser.role}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="text-sm text-muted">
                        {formatDateTime(deal.updated_at)}
                      </div>
                    </td>
                    <td className="actions-cell">
                      <button 
                        className="btn-icon" 
                        ref={(el) => (triggerRefs.current[deal.id] = el)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActions(deal.id);
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
            const activeDeal = deals.find(d => d.id === openActionId);
            if (!activeDeal) return null;
            return (
              <>
                {permissions.view && (
                  <button className="dropdown-item" onClick={() => handleView(activeDeal)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View Details
                  </button>
                )}
                {permissions.update && (
                  <button className="dropdown-item" onClick={() => handleEdit(activeDeal)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Edit Deal
                  </button>
                )}
                {permissions.delete && (
                  <button className="dropdown-item text-danger" onClick={() => handleDeleteClick(activeDeal)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete Deal
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
        <DealFormModal
          deal={editDeal}
          onClose={() => setIsFormOpen(false)}
          onSuccess={handleFormSuccess}
        />
      )}

      {viewDeal && (
        <DealViewModal
          deal={viewDeal}
          users={users}
          leads={leads}
          contacts={contacts}
          accounts={accounts}
          onClose={() => setViewDeal(null)}
        />
      )}

      {deleteDealState && (
        <DealDeleteConfirm
          deal={deleteDealState}
          onClose={() => setDeleteDealState(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
