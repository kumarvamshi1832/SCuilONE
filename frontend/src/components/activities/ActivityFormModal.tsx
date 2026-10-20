import { useState, useEffect, useMemo } from "react";
import type {
  Activity,
  ActivityCreate,
  ActivityUpdate,
  ActivityType,
  ActivityStatus,
  ActivityPriority,
} from "../../types/activity";
import { User } from "../../types/user";
import { Lead } from "../../types/lead";
import { Contact } from "../../types/contact";
import { Account } from "../../types/account";
import { Deal } from "../../types/deal";
import { createActivity, updateActivity } from "../../services/activityService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";
import { getDeals } from "../../services/dealService";
import "../../pages/activities/Activities.css";

interface ActivityFormModalProps {
  activity?: Activity | null;
  defaultType?: ActivityType;
  onClose: () => void;
  onSuccess: (savedActivity: Activity) => void;
}

const ACTIVITY_TYPES: ActivityType[] = ["Task", "Call", "Meeting"];
const ACTIVITY_STATUSES: ActivityStatus[] = ["Pending", "In Progress", "Completed", "Cancelled"];
const ACTIVITY_PRIORITIES: ActivityPriority[] = ["Low", "Medium", "High"];

const areIdsEqual = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
};

const formatForDateTimeLocal = (isoString?: string | null): string => {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
};

export default function ActivityFormModal({
  activity,
  defaultType,
  onClose,
  onSuccess,
}: ActivityFormModalProps) {
  const isEdit = !!activity;

  const [title, setTitle] = useState(activity?.title || "");
  const [description, setDescription] = useState(activity?.description || "");
  const [activityType, setActivityType] = useState<ActivityType>(
    activity?.activity_type || defaultType || "Task"
  );
  const [status, setStatus] = useState<ActivityStatus>(activity?.status || "Pending");
  const [priority, setPriority] = useState<ActivityPriority>(activity?.priority || "Medium");
  const [dueDate, setDueDate] = useState<string>(formatForDateTimeLocal(activity?.due_date));
  const [assignedTo, setAssignedTo] = useState<string>(() => {
    if (activity?.assigned_to) return activity.assigned_to;
    try {
      const userStr = sessionStorage.getItem("user");
      if (userStr) {
        const u = JSON.parse(userStr);
        return u.id || u.user_id || "";
      }
    } catch {}
    return "";
  });
  const [accountId, setAccountId] = useState(activity?.account_id || "");
  const [leadId, setLeadId] = useState(activity?.lead_id || "");
  const [contactId, setContactId] = useState(activity?.contact_id || "");
  const [dealId, setDealId] = useState(activity?.deal_id || "");

  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  const [dataLoading, setDataLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setDataLoading(true);
    setError(null);
    Promise.all([
      getUsers().catch(() => []),
      getLeads().catch(() => []),
      getContacts().catch(() => []),
      getAccounts().catch(() => []),
      getDeals().catch(() => []),
    ])
      .then(([usersData, leadsData, contactsData, accountsData, dealsData]) => {
        setUsers(usersData);
        setLeads(leadsData);
        setContacts(contactsData);
        setAccounts(accountsData);
        setDeals(dealsData);
      })
      .catch((err) => {
        console.error("Failed to load initial form data:", err);
        setError("Failed to load related CRM records. You can still create an activity.");
      })
      .finally(() => {
        setDataLoading(false);
      });
  }, []);

  const selectedAccount = useMemo(() => {
    if (!accountId) return null;
    return accounts.find((a) => areIdsEqual(a.id, accountId)) || null;
  }, [accounts, accountId]);

  // Filter related CRM records based on selected Account
  const filteredLeads = useMemo(() => {
    if (!accountId) return leads;
    return leads.filter((l) => {
      // 1. Primary: Lead-to-Account relationship (lead.account_id matches selected Account UUID)
      if (areIdsEqual(l.account_id, accountId)) return true;
      // 2. Account stores lead_id relationship where available
      if (selectedAccount?.lead_id && areIdsEqual(selectedAccount.lead_id, l.id)) return true;
      return false;
    });
  }, [leads, accountId, selectedAccount]);

  const filteredContacts = useMemo(() => {
    if (!accountId) return contacts;
    return contacts.filter((c) => areIdsEqual(c.account_id, accountId));
  }, [contacts, accountId]);

  const filteredDeals = useMemo(() => {
    if (!accountId) return deals;
    return deals.filter((d) => areIdsEqual(d.account_id, accountId));
  }, [deals, accountId]);

  const handleAccountChange = (newAccId: string) => {
    setAccountId(newAccId);
    const newAccount = newAccId ? accounts.find((a) => areIdsEqual(a.id, newAccId)) : null;

    if (!newAccId) {
      // If Account is cleared, clear selections that belonged to the previous account
      if (leadId) {
        const selectedLead = leads.find((l) => areIdsEqual(l.id, leadId));
        if (selectedLead && (selectedLead.account_id || accounts.some((a) => areIdsEqual(a.lead_id, selectedLead.id)))) {
          setLeadId("");
        }
      }
      if (contactId) {
        const selectedContact = contacts.find((c) => areIdsEqual(c.id, contactId));
        if (selectedContact && selectedContact.account_id) {
          setContactId("");
        }
      }
      if (dealId) {
        const selectedDeal = deals.find((d) => areIdsEqual(d.id, dealId));
        if (selectedDeal && selectedDeal.account_id) {
          setDealId("");
        }
      }
    } else {
      // Clear any previously selected Lead, Contact, or Deal that does not belong to the newly selected Account
      if (leadId) {
        const selectedLead = leads.find((l) => areIdsEqual(l.id, leadId));
        const leadBelongsToNewAccount =
          selectedLead &&
          (areIdsEqual(selectedLead.account_id, newAccId) ||
            (newAccount?.lead_id && areIdsEqual(newAccount.lead_id, selectedLead.id)));

        if (!leadBelongsToNewAccount) {
          setLeadId("");
        }
      }
      if (contactId) {
        const selectedContact = contacts.find((c) => areIdsEqual(c.id, contactId));
        if (!selectedContact || !areIdsEqual(selectedContact.account_id, newAccId)) {
          setContactId("");
        }
      }
      if (dealId) {
        const selectedDeal = deals.find((d) => areIdsEqual(d.id, dealId));
        if (!selectedDeal || !areIdsEqual(selectedDeal.account_id, newAccId)) {
          setDealId("");
        }
      }
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!title.trim()) {
      errors.title = "Title is required.";
    } else if (title.trim().length > 200) {
      errors.title = "Title cannot exceed 200 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);

    const payloadDueDate = dueDate ? new Date(dueDate).toISOString() : null;

    try {
      if (isEdit && activity) {
        const updatePayload: ActivityUpdate = {
          title: title.trim(),
          description: description.trim() || null,
          activity_type: activityType,
          status,
          priority,
          due_date: payloadDueDate,
          assigned_to: assignedTo || null,
          account_id: accountId || null,
          lead_id: leadId || null,
          contact_id: contactId || null,
          deal_id: dealId || null,
        };
        const updated = await updateActivity(activity.id, updatePayload);
        onSuccess(updated);
      } else {
        const createPayload: ActivityCreate = {
          title: title.trim(),
          description: description.trim() || null,
          activity_type: activityType,
          status,
          priority,
          due_date: payloadDueDate,
          assigned_to: assignedTo || null,
          account_id: accountId || null,
          lead_id: leadId || null,
          contact_id: contactId || null,
          deal_id: dealId || null,
        };
        const created = await createActivity(createPayload);
        onSuccess(created);
      }
      window.dispatchEvent(new CustomEvent("crm:activity-updated"));
      onClose();
    } catch (err: any) {
      console.error("Save activity error:", err);
      if (err?.response?.status === 403 || err?.status === 403) {
        setError("You do not have permission to perform this action.");
        return;
      }
      const rawMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Unable to save activity. Please try again.";
      setError(typeof rawMessage === "string" ? rawMessage : "Unable to save activity. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "700px" }}>
        <div className="modal-header">
          <h2>
            {isEdit
              ? activityType === "Task"
                ? "Edit Task"
                : "Edit Activity"
              : activityType === "Task"
              ? "Create New Task"
              : "Create New Activity"}
          </h2>
          <button className="btn-close" onClick={onClose} disabled={loading} aria-label="Close modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div className="modal-body" style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: "16px",
                  borderRadius: "6px",
                  background: "#fcebea",
                  color: "#cc0000",
                  fontSize: "0.875rem",
                }}
              >
                {error}
              </div>
            )}

            {/* Title */}
            <div className="form-group">
              <label>
                Title <span style={{ color: "#e53e3e" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Client Follow-up Call, Quarterly Review"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: "" }));
                }}
                disabled={loading}
                maxLength={200}
                style={{ borderColor: fieldErrors.title ? "#e53e3e" : undefined }}
              />
              {fieldErrors.title && (
                <span className="info-text" style={{ color: "#e53e3e" }}>
                  {fieldErrors.title}
                </span>
              )}
            </div>

            {/* Activity Type, Status, Priority Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Type <span style={{ color: "#e53e3e" }}>*</span></label>
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as ActivityType)}
                  disabled={loading}
                >
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ActivityStatus)}
                  disabled={loading}
                >
                  {ACTIVITY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ActivityPriority)}
                  disabled={loading}
                >
                  {ACTIVITY_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Due Date & Assigned To */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Due Date & Time</label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Assigned To</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  disabled={loading || dataLoading}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div className="form-group">
              <label>Description</label>
              <textarea
                placeholder="Add meeting notes, agenda, discussion points or instructions..."
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e0",
                  fontFamily: "inherit",
                  fontSize: "0.95rem",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Related Records Section */}
            <div className="activity-form-section-divider">
              <h4 className="activity-form-section-title">
                Related CRM Records (Optional)
              </h4>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Account</label>
                  <select
                    value={accountId}
                    onChange={(e) => handleAccountChange(e.target.value)}
                    disabled={loading || dataLoading}
                  >
                    <option value="">None</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Lead</label>
                  <select
                    value={leadId}
                    onChange={(e) => setLeadId(e.target.value)}
                    disabled={loading || dataLoading || (!!accountId && filteredLeads.length === 0)}
                  >
                    {accountId && filteredLeads.length === 0 ? (
                      <option value="">-- No leads linked to this account --</option>
                    ) : (
                      <>
                        <option value="">None</option>
                        {filteredLeads.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.full_name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  {accountId && filteredLeads.length === 0 && (
                    <span className="activity-related-hint">
                      No leads linked to this account
                    </span>
                  )}
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Contact</label>
                  <select
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                    disabled={loading || dataLoading || (!!accountId && filteredContacts.length === 0)}
                  >
                    {accountId && filteredContacts.length === 0 ? (
                      <option value="">-- No contacts linked to this account --</option>
                    ) : (
                      <>
                        <option value="">None</option>
                        {filteredContacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.full_name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  {accountId && filteredContacts.length === 0 && (
                    <span className="activity-related-hint">
                      No contacts linked to this account
                    </span>
                  )}
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Deal</label>
                  <select
                    value={dealId}
                    onChange={(e) => setDealId(e.target.value)}
                    disabled={loading || dataLoading || (!!accountId && filteredDeals.length === 0)}
                  >
                    {accountId && filteredDeals.length === 0 ? (
                      <option value="">-- No deals linked to this account --</option>
                    ) : (
                      <>
                        <option value="">None</option>
                        {filteredDeals.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  {accountId && filteredDeals.length === 0 && (
                    <span className="activity-related-hint">
                      No deals linked to this account
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                ? "Save Changes"
                : activityType === "Task"
                ? "Create Task"
                : "Create Activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}