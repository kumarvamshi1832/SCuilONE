import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Contact } from "../../types/contact";
import { User } from "../../types/user";
import { getContacts } from "../../services/contactService";
import { getUsers } from "../../services/userService";
import { getContactPermissions } from "../../utils/contactPermissions";
import ContactFormModal from "../../components/contacts/ContactFormModal";
import ContactViewModal from "../../components/contacts/ContactViewModal";
import ContactDeleteConfirm from "../../components/contacts/ContactDeleteConfirm";
import { formatDateTime } from "../../utils/dateFormatter";
import "../users/Users.css";
import "../leads/Leads.css";

export default function Contacts() {
  /* ─── Permissions ─── */
  const permissions = useMemo(() => getContactPermissions(), []);

  /* ─── State ─── */
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [viewContact, setViewContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);

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
      const [contactsData, usersData] = await Promise.all([
        getContacts(),
        getUsers(),
      ]);
      setContacts(contactsData);
      setUsers(usersData);
    } catch (err: any) {
      console.error("Fetch contacts error:", err);
      if (err?.response?.status === 401 || err?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (err?.response?.status >= 500 || err?.status >= 500) {
        setError("Unable to load contacts. Please try again.");
      } else {
        setError(
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load contacts."
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
  const toggleActions = (contactId: string) => {
    if (openActionId === contactId) {
      setOpenActionId(null);
      setDropdownPos(null);
      return;
    }
    const btn = triggerRefs.current[contactId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const dropdownHeight = 140; // approximate height of the 3-item menu
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropdownHeight + 8;
      setDropdownPos({
        top: openUp ? rect.top : rect.bottom + 4,
        left: rect.right - 148, // 140 min-width + 8 padding
        openUp,
      });
    }
    setOpenActionId(contactId);
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
    setSourceFilter("");
    setAssignedFilter("");
  };

  const hasActiveFilters = search || sourceFilter || assignedFilter;

  /* ─── Filtering (client-side) ─── */

  const filteredContacts = contacts.filter((contact) => {
    // Text search
    if (search) {
      const q = search.toLowerCase();
      const matchesSearch =
        (contact.full_name || "").toLowerCase().includes(q) ||
        (contact.email || "").toLowerCase().includes(q) ||
        (contact.phone || "").toLowerCase().includes(q) ||
        (contact.company || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    // Source filter
    if (sourceFilter && contact.source !== sourceFilter) return false;
    // Assigned filter
    if (assignedFilter && contact.assigned_to !== assignedFilter) return false;

    return true;
  });

  // Collect unique sources from data
  const uniqueSources = Array.from(new Set(contacts.map((c) => c.source).filter(Boolean))) as string[];

  /* ─── Action Handlers ─── */

  const handleCreate = () => {
    setEditContact(null);
    setIsFormOpen(true);
  };

  const handleView = (contact: Contact) => {
    setOpenActionId(null);
    setViewContact(contact);
  };

  const handleEdit = (contact: Contact) => {
    setOpenActionId(null);
    setViewContact(null);
    setEditContact(contact);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (contact: Contact) => {
    setOpenActionId(null);
    setDeleteContact(contact);
  };

  const handleFormSuccess = (savedContact: Contact) => {
    setContacts((prev) => {
      const isExisting = prev.some((c) => c.id === savedContact.id);
      if (isExisting) {
        return prev.map((c) => (c.id === savedContact.id ? savedContact : c));
      } else {
        return [savedContact, ...prev];
      }
    });
    fetchData();
    showToast(editContact ? "Contact updated successfully" : "Contact created successfully");
  };

  const handleDeleteSuccess = () => {
    fetchData();
    showToast("Contact deleted successfully");
  };

  /* ─── Render ─── */

  if (!permissions.view) {
    return (
      <div className="leads-page">
        <div className="alert-box error" style={{ margin: "2rem" }}>
          You do not have permission to view contacts.
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
          <h1>Contacts</h1>
          <p className="text-muted">Manage your real estate customer/contact records.</p>
        </div>
        <div className="header-actions">
          {permissions.create && (
            <button className="btn-primary" onClick={handleCreate}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Contact
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
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
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
          <p>Loading contacts...</p>
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
      ) : filteredContacts.length === 0 ? (
        <div className="leads-empty-state">
          <div className="leads-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <h3>No contacts found</h3>
          <p className="text-muted">
            {hasActiveFilters 
              ? "Try adjusting your filters or search term."
              : "Get started by adding your first contact."}
          </p>
        </div>
      ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact Info</th>
                <th>Company / Title</th>
                <th>Source</th>
                <th>Assigned To</th>
                <th>Updated</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact) => {
                const assignedUser = getUserDisplay(contact.assigned_to);
                return (
                  <tr key={contact.id}>
                    <td>
                      <div className="lead-name-cell">
                        <div className="lead-avatar">
                          {(contact.full_name || "-").charAt(0).toUpperCase()}
                        </div>
                        <span className="lead-name-text">{contact.full_name || "—"}</span>
                      </div>
                    </td>
                    <td>
                      {contact.email && <div className="text-sm">{contact.email}</div>}
                      {contact.phone && <div className="text-sm text-muted">{contact.phone}</div>}
                      {!contact.email && !contact.phone && <div className="text-muted">—</div>}
                    </td>
                    <td>
                      {contact.company && <div className="text-sm fw-medium">{contact.company}</div>}
                      {contact.job_title && <div className="text-sm text-muted">{contact.job_title}</div>}
                      {!contact.company && !contact.job_title && <div className="text-muted">—</div>}
                    </td>
                    <td>
                      {contact.source ? (
                        <span className="badge badge-secondary">{contact.source}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {contact.assigned_to && assignedUser.name !== "—" ? (
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
                        {formatDateTime(contact.updated_at)}
                      </div>
                    </td>
                    <td className="actions-cell">
                      <button 
                        className="btn-icon" 
                        ref={(el) => (triggerRefs.current[contact.id] = el)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActions(contact.id);
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

      {/* Global dropdown menu via Portal or absolute positioning */}
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
            const activeContact = contacts.find(c => c.id === openActionId);
            if (!activeContact) return null;
            return (
              <>
                {permissions.view && (
                  <button className="dropdown-item" onClick={() => handleView(activeContact)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View Details
                  </button>
                )}
                {permissions.update && (
                  <button className="dropdown-item" onClick={() => handleEdit(activeContact)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Edit Contact
                  </button>
                )}
                {permissions.delete && (
                  <button className="dropdown-item text-danger" onClick={() => handleDeleteClick(activeContact)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete Contact
                  </button>
                )}
                {/* Fallback if no permissions */}
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
        <ContactFormModal
          contact={editContact}
          onClose={() => setIsFormOpen(false)}
          onSuccess={handleFormSuccess}
        />
      )}

      {viewContact && (
        <ContactViewModal
          contact={viewContact}
          users={users}
          onClose={() => setViewContact(null)}
        />
      )}

      {deleteContact && (
        <ContactDeleteConfirm
          contact={deleteContact}
          onClose={() => setDeleteContact(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
