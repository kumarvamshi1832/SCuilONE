import { useState, useEffect, useRef } from "react";
import type { Lead, CreateLeadRequest, UpdateLeadRequest, LeadStatus, LeadSource } from "../../types/lead";
import { User } from "../../types/user";
import { createLead, updateLead } from "../../services/leadService";
import { createActivity, getActivities } from "../../services/activityService";
import type { Activity } from "../../types/activity";
import { getUsers } from "../../services/userService";
import { getAccounts } from "../../services/accountService";
import { friendlyAssignmentError } from "../../utils/leadPermissions";
import UserSearchDropdown from "./UserSearchDropdown";
import { Account } from "../../types/account";

interface LeadFormModalProps {
  lead?: Lead | null;
  onClose: () => void;
  onSuccess: (savedLead: Lead) => void;
}

const LEAD_STATUSES: LeadStatus[] = ["New", "Contacted", "Qualified", "Converted", "Lost"];
const LEAD_SOURCES: LeadSource[] = [
  "Website",
  "Referral",
  "Social Media",
  "Walk-in",
  "Phone Inquiry",
  "Email Campaign",
  "Property Portal",
  "Other",
];

export default function LeadFormModal({ lead, onClose, onSuccess }: LeadFormModalProps) {
  const isEdit = !!lead;

  const [fullName, setFullName] = useState(lead?.full_name || "");
  const [email, setEmail] = useState(lead?.email || "");
  const [phone, setPhone] = useState(lead?.phone || "");
  const [source, setSource] = useState(lead?.source || "");
  const [status, setStatus] = useState(lead?.status || "New");
  const [assignedTo, setAssignedTo] = useState(lead?.assigned_to || "");
  const [accountId, setAccountId] = useState(lead?.account_id || "");
  const [notes, setNotes] = useState(lead?.notes || "");

  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [createdLead, setCreatedLead] = useState<Lead | null>(null);
  const [createdTask, setCreatedTask] = useState<Activity | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isSubmittingRef = useRef(false);

  useEffect(() => {
    setUsersLoading(true);
    Promise.all([
      getUsers().catch(() => []),
      getAccounts().catch(() => [])
    ]).then(([usersRes, accountsRes]) => {
      setUsers(usersRes || []);
      setAccounts(accountsRes || []);
    }).finally(() => {
      setUsersLoading(false);
    });
  }, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) {
      errors.full_name = "Full Name is required.";
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Please enter a valid email address.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleClose = () => {
    if (createdLead) {
      onSuccess(createdLead);
    }
    onClose();
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    if (!validate()) return;

    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);
    setTaskError(null);

    try {
      let savedLead: Lead;
      if (isEdit && lead) {
        const data: UpdateLeadRequest = {
          full_name: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          source: source || undefined,
          status,
          assigned_to: assignedTo || undefined,
          account_id: accountId || undefined,
          notes: notes.trim() || undefined,
        };
        if (!assignedTo) data.assigned_to = null;
        if (!accountId) data.account_id = null;
        savedLead = await updateLead(lead.id, data);
      } else {
        // Prevent duplicate Lead creation on repeated submissions or retry
        if (createdLead) {
          savedLead = createdLead;
        } else {
          const data: CreateLeadRequest = {
            full_name: fullName.trim(),
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            source: source || undefined,
            status,
            assigned_to: assignedTo || undefined,
            account_id: accountId || undefined,
            notes: notes.trim() || undefined,
          };
          if (!assignedTo) data.assigned_to = null;
          if (!accountId) data.account_id = null;
          savedLead = await createLead(data);
          setCreatedLead(savedLead);
        }

        // When assigned to an employee, automatically create follow-up task (or reuse existing)
        if (assignedTo && !createdTask) {
          try {
            // Check if follow-up task already exists for this lead to avoid duplicates
            const existingActivities = await getActivities().catch(() => []);
            const existingTask = existingActivities.find(
              (a) => a.lead_id === savedLead.id && a.activity_type === "Task"
            );

            if (existingTask) {
              setCreatedTask(existingTask);
            } else {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              const newTask = await createActivity({
                title: `Follow up with ${savedLead.full_name}`,
                description: `Initial follow-up task for newly assigned lead ${savedLead.full_name}.`,
                activity_type: "Task",
                status: "Pending",
                priority: "Medium",
                due_date: tomorrow.toISOString(),
                assigned_to: assignedTo,
                lead_id: savedLead.id,
                account_id: savedLead.account_id || null,
              });
              setCreatedTask(newTask);
            }
            // Dispatch update event so any active task lists refresh automatically
            window.dispatchEvent(new CustomEvent("crm:activity-updated"));
          } catch (taskErr: any) {
            console.error("Follow-up task creation error:", taskErr);
            const rawTaskMsg =
              taskErr?.response?.data?.detail ||
              taskErr?.response?.data?.message ||
              taskErr?.message ||
              "Failed to create follow-up task.";
            const taskMsg = typeof rawTaskMsg === "string" ? rawTaskMsg : "Failed to create follow-up task.";
            setTaskError(
              `Lead "${savedLead.full_name}" was created successfully, but creating the follow-up task failed: ${taskMsg}. Click "Retry Creating Follow-up Task" to try again without duplicating the lead.`
            );
            setLoading(false);
            isSubmittingRef.current = false;
            return;
          }
        }
      }
      onSuccess(savedLead);
      onClose();
    } catch (err: any) {
      console.error("Lead form error:", err);
      // Handle 422 validation errors
      if (err?.response?.status === 422 || err?.status === 422) {
        const detail = err?.response?.data?.detail || err?.detail;
        if (Array.isArray(detail)) {
          const newFieldErrors: Record<string, string> = {};
          detail.forEach((d: any) => {
            const field = d.loc?.[d.loc.length - 1];
            if (field && d.msg) {
              newFieldErrors[field] = d.msg;
            }
          });
          if (Object.keys(newFieldErrors).length > 0) {
            setFieldErrors(newFieldErrors);
            return;
          }
        }
      }

      // Handle 403 permission errors
      if (err?.response?.status === 403 || err?.status === 403) {
        setError("You do not have permission to perform this action.");
        return;
      }

      const rawMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Something went wrong. Please try again.";
      const message = typeof rawMessage === "string" ? rawMessage : "Something went wrong. Please try again.";
      setError(friendlyAssignmentError(message));
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content leads-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? "Edit Lead" : "Create Lead"}</h2>
          <button className="btn-close" onClick={handleClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div
              className="alert-box error"
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

          {taskError && (
            <div
              className="alert-box warning"
              style={{
                padding: "12px 14px",
                marginBottom: "16px",
                borderRadius: "6px",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                color: "#92400e",
                fontSize: "0.875rem",
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>Follow-up Task Pending</div>
              <div>{taskError}</div>
            </div>
          )}

          <div className="form-group">
            <label>
              Full Name <span style={{ color: "#e53e3e" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, full_name: "" }));
                setError(null);
              }}
              disabled={loading || !!createdLead}
              className={fieldErrors.full_name ? "input-error" : ""}
            />
            {fieldErrors.full_name && (
              <span className="field-error">{fieldErrors.full_name}</span>
            )}
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="e.g. rahul@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, email: "" }));
                  setError(null);
                }}
                disabled={loading || !!createdLead}
                className={fieldErrors.email ? "input-error" : ""}
              />
              {fieldErrors.email && (
                <span className="field-error">{fieldErrors.email}</span>
              )}
            </div>

            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                placeholder="e.g. +91 9876543210"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError(null);
                }}
                disabled={loading || !!createdLead}
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={loading || !!createdLead}
              >
                <option value="">-- Select Source --</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={loading || !!createdLead}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={loading || usersLoading || !!createdLead}
              >
                <option value="">-- Select Account --</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Assigned To</label>
              <UserSearchDropdown
                users={users}
                value={assignedTo}
                onChange={setAssignedTo}
                disabled={loading || !!createdLead}
                loading={usersLoading}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              placeholder="e.g. Interested in purchasing a 3BHK apartment in Hyderabad."
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setError(null);
              }}
              disabled={loading || !!createdLead}
              rows={3}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleClose} disabled={loading}>
            {createdLead ? "Close (Lead Saved)" : "Cancel"}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading
              ? isEdit
                ? "Saving…"
                : createdLead
                ? "Retrying Task…"
                : "Creating…"
              : isEdit
              ? "Save Changes"
              : createdLead
              ? "Retry Creating Follow-up Task"
              : "Create Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
