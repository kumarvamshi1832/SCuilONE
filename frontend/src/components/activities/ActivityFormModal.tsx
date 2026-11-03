import { useState, useEffect, useMemo, useCallback } from "react";
import type {
  Activity,
  ActivityCreate,
  ActivityUpdate,
  ActivityType,
  ActivityStatus,
  ActivityPriority,
  ActivityLinkModule,
  ActivityLinkInput,
  ActivityRelatedModule,
} from "../../types/activity";
import type { User } from "../../types/user";
import type { Lead } from "../../types/lead";
import type { Contact } from "../../types/contact";
import type { Account } from "../../types/account";
import type { Deal } from "../../types/deal";
import {
  createActivity,
  updateActivity,
  getActivityRelatedModules,
} from "../../services/activityService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";
import { getDeals } from "../../services/dealService";
import {
  fetchRecordsForModule,
  type SelectableRelatedRecord,
} from "../../services/activityRelatedRecordsService";
import {
  getAllowedStatuses,
  isTaskTerminal,
} from "../../utils/activityStatusTransitions";
import { useTheme } from "../../context/ThemeContext";
import "./ActivityFormModal.css";
import "../../pages/activities/Activities.css";

interface ActivityFormModalProps {
  activity?: Activity | null;
  defaultType?: ActivityType;
  onClose: () => void;
  onSuccess: (savedActivity: Activity) => void;
}

const ACTIVITY_TYPES: ActivityType[] = ["Task", "Call", "Meeting"];
const ACTIVITY_PRIORITIES: ActivityPriority[] = ["Low", "Medium", "High"];

interface EntityFetchState<T> {
  loading: boolean;
  error: string | null;
  data: T[];
}

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
  const { theme } = useTheme();
  const isEdit = !!activity;

  // Form Fields
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
      const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (userStr) {
        const u = JSON.parse(userStr);
        return u.id || u.user_id || "";
      }
    } catch { }
    return "";
  });

  // Direct CRM Relationships
  const [accountId, setAccountId] = useState(activity?.account_id || "");
  const [leadId, setLeadId] = useState(activity?.lead_id || "");
  const [contactId, setContactId] = useState(activity?.contact_id || "");
  const [dealId, setDealId] = useState(activity?.deal_id || "");

  // Dynamic Industry-Specific Related Modules
  const [relatedModules, setRelatedModules] = useState<ActivityRelatedModule[]>([]);
  const [relatedModulesLoading, setRelatedModulesLoading] = useState(true);
  const [relatedModulesError, setRelatedModulesError] = useState<string | null>(null);

  // Industry record selections: { [module]: record_id }
  const [selectedRelatedRecords, setSelectedRelatedRecords] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (activity?.related_records && Array.isArray(activity.related_records)) {
      for (const link of activity.related_records) {
        if (link.module && link.record_id) {
          initial[link.module] = String(link.record_id);
        }
      }
    }
    return initial;
  });

  // Store loaded records for each industry module
  const [moduleRecords, setModuleRecords] = useState<
    Record<string, EntityFetchState<SelectableRelatedRecord>>
  >({});

  // CRM Entities States (Independently loaded with retry support)
  const [usersState, setUsersState] = useState<EntityFetchState<User>>({
    loading: true,
    error: null,
    data: [],
  });
  const [leadsState, setLeadsState] = useState<EntityFetchState<Lead>>({
    loading: true,
    error: null,
    data: [],
  });
  const [contactsState, setContactsState] = useState<EntityFetchState<Contact>>({
    loading: true,
    error: null,
    data: [],
  });
  const [accountsState, setAccountsState] = useState<EntityFetchState<Account>>({
    loading: true,
    error: null,
    data: [],
  });
  const [dealsState, setDealsState] = useState<EntityFetchState<Deal>>({
    loading: true,
    error: null,
    data: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* ─── Independent Loaders for CRM Entities ─── */

  const loadUsers = useCallback(async () => {
    setUsersState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getUsers();
      setUsersState({ loading: false, error: null, data: Array.isArray(data) ? data : [] });
    } catch (err: any) {
      setUsersState({
        loading: false,
        error: err?.response?.data?.detail || err?.message || "Failed to load users",
        data: [],
      });
    }
  }, []);

  const loadLeads = useCallback(async () => {
    setLeadsState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getLeads();
      setLeadsState({ loading: false, error: null, data: Array.isArray(data) ? data : [] });
    } catch (err: any) {
      setLeadsState({
        loading: false,
        error: err?.response?.data?.detail || err?.message || "Failed to load leads",
        data: [],
      });
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setContactsState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getContacts();
      setContactsState({ loading: false, error: null, data: Array.isArray(data) ? data : [] });
    } catch (err: any) {
      setContactsState({
        loading: false,
        error: err?.response?.data?.detail || err?.message || "Failed to load contacts",
        data: [],
      });
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setAccountsState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getAccounts();
      setAccountsState({ loading: false, error: null, data: Array.isArray(data) ? data : [] });
    } catch (err: any) {
      setAccountsState({
        loading: false,
        error: err?.response?.data?.detail || err?.message || "Failed to load accounts",
        data: [],
      });
    }
  }, []);

  const loadDeals = useCallback(async () => {
    setDealsState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getDeals();
      setDealsState({ loading: false, error: null, data: Array.isArray(data) ? data : [] });
    } catch (err: any) {
      setDealsState({
        loading: false,
        error: err?.response?.data?.detail || err?.message || "Failed to load deals",
        data: [],
      });
    }
  }, []);

  /* ─── Loader for an Industry Module ─── */

  const loadModuleRecords = useCallback(async (moduleKey: ActivityLinkModule) => {
    setModuleRecords((prev) => ({
      ...prev,
      [moduleKey]: { loading: true, error: null, data: prev[moduleKey]?.data || [] },
    }));
    try {
      const records = await fetchRecordsForModule(moduleKey);
      setModuleRecords((prev) => ({
        ...prev,
        [moduleKey]: { loading: false, error: null, data: records },
      }));
    } catch (err: any) {
      setModuleRecords((prev) => ({
        ...prev,
        [moduleKey]: {
          loading: false,
          error: err?.response?.data?.detail || err?.message || `Failed to load ${moduleKey}`,
          data: [],
        },
      }));
    }
  }, []);

  /* ─── Initial Load on Mount ─── */

  useEffect(() => {
    loadUsers();
    loadAccounts();
    loadLeads();
    loadContacts();
    loadDeals();

    // Fetch dynamic industry-specific related modules config
    setRelatedModulesLoading(true);
    setRelatedModulesError(null);
    getActivityRelatedModules()
      .then((res) => {
        const modules = Array.isArray(res?.related_modules) ? res.related_modules : [];
        setRelatedModules(modules);
        // Load records for each supported module
        modules.forEach((m) => {
          if (m.module) {
            loadModuleRecords(m.module);
          }
        });
      })
      .catch((err) => {
        console.warn("Failed to load activity related modules:", err);
        setRelatedModulesError(
          err?.response?.data?.detail || "Could not retrieve industry modules configuration"
        );
      })
      .finally(() => {
        setRelatedModulesLoading(false);
      });
  }, [loadUsers, loadAccounts, loadLeads, loadContacts, loadDeals, loadModuleRecords]);

  /* ─── Allowed Status Options based on Task Status Transitions ─── */

  const allowedStatuses = useMemo(() => {
    return getAllowedStatuses(activityType, activity?.status, isEdit);
  }, [activityType, activity?.status, isEdit]);

  const isTerminalTask = useMemo(() => {
    return isEdit && activityType === "Task" && isTaskTerminal(activity?.status as ActivityStatus);
  }, [isEdit, activityType, activity?.status]);

  /* ─── Account-related CRM Filtering ─── */

  const selectedAccount = useMemo(() => {
    if (!accountId) return null;
    return accountsState.data.find((a) => areIdsEqual(a.id, accountId)) || null;
  }, [accountsState.data, accountId]);

  const filteredLeads = useMemo(() => {
    if (!accountId) return leadsState.data;
    return leadsState.data.filter((l) => {
      if (areIdsEqual(l.account_id, accountId)) return true;
      if (selectedAccount?.lead_id && areIdsEqual(selectedAccount.lead_id, l.id)) return true;
      return false;
    });
  }, [leadsState.data, accountId, selectedAccount]);

  const filteredContacts = useMemo(() => {
    if (!accountId) return contactsState.data;
    return contactsState.data.filter((c) => areIdsEqual(c.account_id, accountId));
  }, [contactsState.data, accountId]);

  const filteredDeals = useMemo(() => {
    if (!accountId) return dealsState.data;
    return dealsState.data.filter((d) => areIdsEqual(d.account_id, accountId));
  }, [dealsState.data, accountId]);

  const handleAccountChange = (newAccId: string) => {
    setAccountId(newAccId);
    const newAccount = newAccId ? accountsState.data.find((a) => areIdsEqual(a.id, newAccId)) : null;

    if (!newAccId) {
      if (leadId) {
        const selectedLead = leadsState.data.find((l) => areIdsEqual(l.id, leadId));
        if (
          selectedLead &&
          (selectedLead.account_id || accountsState.data.some((a) => areIdsEqual(a.lead_id, selectedLead.id)))
        ) {
          setLeadId("");
        }
      }
      if (contactId) {
        const selectedContact = contactsState.data.find((c) => areIdsEqual(c.id, contactId));
        if (selectedContact && selectedContact.account_id) {
          setContactId("");
        }
      }
      if (dealId) {
        const selectedDeal = dealsState.data.find((d) => areIdsEqual(d.id, dealId));
        if (selectedDeal && selectedDeal.account_id) {
          setDealId("");
        }
      }
    } else {
      if (leadId) {
        const selectedLead = leadsState.data.find((l) => areIdsEqual(l.id, leadId));
        const leadBelongsToNewAccount =
          selectedLead &&
          (areIdsEqual(selectedLead.account_id, newAccId) ||
            (newAccount?.lead_id && areIdsEqual(newAccount.lead_id, selectedLead.id)));

        if (!leadBelongsToNewAccount) {
          setLeadId("");
        }
      }
      if (contactId) {
        const selectedContact = contactsState.data.find((c) => areIdsEqual(c.id, contactId));
        if (!selectedContact || !areIdsEqual(selectedContact.account_id, newAccId)) {
          setContactId("");
        }
      }
      if (dealId) {
        const selectedDeal = dealsState.data.find((d) => areIdsEqual(d.id, dealId));
        if (!selectedDeal || !areIdsEqual(selectedDeal.account_id, newAccId)) {
          setDealId("");
        }
      }
    }
  };

  /* ─── Software Project & Sprint Dependency Handling ─── */

  const handleIndustryRecordChange = (moduleKey: ActivityLinkModule, recordId: string) => {
    setSelectedRelatedRecords((prev) => {
      const updated = { ...prev, [moduleKey]: recordId };

      // If user selected a sprint:
      if (moduleKey === "software_sprint" && recordId) {
        const sprints = moduleRecords.software_sprint?.data || [];
        const sprint = sprints.find((s) => s.id === recordId);
        // Automatically link project if not yet set and sprint has parentId
        if (sprint?.parentId && !updated.software_project) {
          updated.software_project = sprint.parentId;
        }
      }

      // If user clears the software project, and a sprint is selected that belongs to it, clear sprint
      if (moduleKey === "software_project") {
        if (!recordId && updated.software_sprint) {
          updated.software_sprint = "";
        } else if (recordId && updated.software_sprint) {
          const sprints = moduleRecords.software_sprint?.data || [];
          const currentSprint = sprints.find((s) => s.id === updated.software_sprint);
          if (currentSprint?.parentId && currentSprint.parentId !== recordId) {
            updated.software_sprint = "";
          }
        }
      }

      return updated;
    });

    if (fieldErrors[moduleKey] || fieldErrors.software_sprint || fieldErrors.software_project) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[moduleKey];
        delete next.software_sprint;
        delete next.software_project;
        return next;
      });
    }
  };

  /* ─── Sprints filtered by selected Software Project ─── */

  const availableSprints = useMemo(() => {
    const allSprints = moduleRecords.software_sprint?.data || [];
    const selectedProj = selectedRelatedRecords.software_project;
    if (!selectedProj) return allSprints;
    return allSprints.filter((s) => !s.parentId || s.parentId === selectedProj);
  }, [moduleRecords.software_sprint?.data, selectedRelatedRecords.software_project]);

  /* ─── Form Validation ─── */

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      errors.title = "Title is required and cannot be blank.";
    } else if (trimmedTitle.length > 200) {
      errors.title = "Title cannot exceed 200 characters.";
    }

    // Software Sprint & Project Dependency Rule:
    // If a sprint is selected, require its Software Project to be selected as well
    if (selectedRelatedRecords.software_sprint) {
      const selectedSprintId = selectedRelatedRecords.software_sprint;
      const selectedProjectId = selectedRelatedRecords.software_project;

      if (!selectedProjectId) {
        errors.software_sprint = "Select the Software Project when linking a task to a Software Sprint.";
      } else {
        const sprints = moduleRecords.software_sprint?.data || [];
        const sprint = sprints.find((s) => s.id === selectedSprintId);
        if (sprint?.parentId && sprint.parentId !== selectedProjectId) {
          errors.software_sprint =
            "The selected Software Sprint does not belong to the selected Software Project.";
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* ─── Submit Handler ─── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);

    const payloadDueDate = dueDate ? new Date(dueDate).toISOString() : null;

    // Prepare related_records list using strongly typed ActivityLinkInput items
    const relatedRecordsList: ActivityLinkInput[] = [];
    for (const [modKey, recId] of Object.entries(selectedRelatedRecords)) {
      if (recId && recId.trim()) {
        relatedRecordsList.push({
          module: modKey as ActivityLinkModule,
          record_id: recId.trim(),
        });
      }
    }

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
          // Always send a list (empty list [] clears all industry links, adhering to backend 422 rule)
          related_records: relatedRecordsList,
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
          related_records: relatedRecordsList,
        };
        const created = await createActivity(createPayload);
        onSuccess(created);
      }

      window.dispatchEvent(new CustomEvent("crm:activity-updated"));
      onClose();
    } catch (err: any) {
      console.error("Save activity error:", err);
      if (err?.response?.status === 403 || err?.status === 403) {
        setError(
          err?.response?.data?.detail ||
          "You do not have permission to perform this action or access this industry module."
        );
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
    <div className={`activity-modal-overlay ${theme}`} onClick={onClose}>
      <div
        className={`activity-modal-card ${theme}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-modal-title"
      >
        {/* Modal Header */}
        <div className="activity-modal-header">
          <div className="activity-modal-header-left">
            <div className="activity-modal-header-icon">
              {activityType === "Task" ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              ) : activityType === "Call" ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              )}
            </div>
            <div className="activity-modal-header-text">
              <h2 id="activity-modal-title" className="activity-modal-title">
                {isEdit
                  ? activityType === "Task"
                    ? "Edit Task"
                    : "Edit Activity"
                  : activityType === "Task"
                    ? "Create New Task"
                    : "Create New Activity"}
              </h2>
              <p className="activity-modal-subtitle">
                {isEdit
                  ? `Update scheduling, assignments, and record linkages for this ${activityType.toLowerCase()}.`
                  : `Configure scheduling, assignments, and associations for your new ${activityType.toLowerCase()}.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="activity-modal-close-btn"
            onClick={onClose}
            disabled={loading}
            aria-label="Close modal"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="activity-modal-form">
          <div className="activity-modal-body">
            {error && (
              <div className="activity-modal-error-banner" role="alert">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: "1px" }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
                SECTION 1 — Basic Information
               ═══════════════════════════════════════════════════ */}
            <div className="activity-form-section">
              <div className="activity-form-section-header">
                <div className="activity-form-section-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 9h6M9 13h6M9 17h4" />
                  </svg>
                </div>
                <div className="activity-form-section-title-wrap">
                  <h4 className="activity-form-section-title">Basic Information</h4>
                  <p className="activity-form-section-subtitle">
                    Specify the core details, type, and priority of this {activityType.toLowerCase()}.
                  </p>
                </div>
              </div>

              <div className="activity-form-section-card">
                {/* Task Title (Full Width) */}
                <div className="activity-form-group full-width">
                  <div className="activity-form-label-row">
                    <label className="activity-form-label" htmlFor="activity-title">
                      Task Title <span className="activity-form-label-req">*</span>
                    </label>
                  </div>
                  <input
                    id="activity-title"
                    type="text"
                    className={`activity-form-input ${fieldErrors.title ? "has-error" : ""}`}
                    placeholder="e.g. Client Follow-up Call, Sprint Planning, Architecture Review"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: "" }));
                    }}
                    disabled={loading}
                    maxLength={200}
                    required
                  />
                  {fieldErrors.title && (
                    <span className="activity-form-error-text">{fieldErrors.title}</span>
                  )}
                </div>

                {/* Type, Status, Priority (3-Column Grid) */}
                <div className="activity-form-grid-3">
                  {/* Type */}
                  <div className="activity-form-group">
                    <div className="activity-form-label-row">
                      <label className="activity-form-label" htmlFor="activity-type">
                        Type <span className="activity-form-label-req">*</span>
                      </label>
                    </div>
                    <select
                      id="activity-type"
                      className="activity-form-select"
                      value={activityType}
                      onChange={(e) => {
                        const newType = e.target.value as ActivityType;
                        setActivityType(newType);
                      }}
                      disabled={loading}
                    >
                      {ACTIVITY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Status */}
                  <div className="activity-form-group">
                    <div className="activity-form-label-row">
                      <label className="activity-form-label" htmlFor="activity-status">
                        Status
                      </label>
                    </div>
                    <select
                      id="activity-status"
                      className="activity-form-select"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ActivityStatus)}
                      disabled={loading || isTerminalTask}
                    >
                      {allowedStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {isTerminalTask && (
                      <span className="activity-form-hint-text">
                        {activity?.status} tasks cannot transition further.
                      </span>
                    )}
                  </div>

                  {/* Priority */}
                  <div className="activity-form-group">
                    <div className="activity-form-label-row">
                      <label className="activity-form-label" htmlFor="activity-priority">
                        Priority
                      </label>
                    </div>
                    <select
                      id="activity-priority"
                      className="activity-form-select"
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
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════
                SECTION 2 — Schedule & Assignment
               ═══════════════════════════════════════════════════ */}
            <div className="activity-form-section">
              <div className="activity-form-section-header">
                <div className="activity-form-section-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div className="activity-form-section-title-wrap">
                  <h4 className="activity-form-section-title">Schedule & Assignment</h4>
                  <p className="activity-form-section-subtitle">
                    Set target completion time and delegate to a team member.
                  </p>
                </div>
              </div>

              <div className="activity-form-section-card">
                <div className="activity-form-grid-2">
                  {/* Due Date & Time */}
                  <div className="activity-form-group">
                    <div className="activity-form-label-row">
                      <label className="activity-form-label" htmlFor="activity-duedate">
                        Due Date & Time
                      </label>
                    </div>
                    <input
                      id="activity-duedate"
                      type="datetime-local"
                      className="activity-form-input"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  {/* Assigned To */}
                  <div className="activity-form-group">
                    <div className="activity-form-label-row">
                      <label className="activity-form-label" htmlFor="activity-assignee">
                        Assigned To
                      </label>
                      {usersState.error && (
                        <button
                          type="button"
                          className="activity-form-retry-btn"
                          onClick={loadUsers}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                    <select
                      id="activity-assignee"
                      className="activity-form-select"
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      disabled={loading || usersState.loading}
                    >
                      {usersState.loading ? (
                        <option value="" disabled>Loading users...</option>
                      ) : usersState.error ? (
                        <option value="" disabled>Failed to load users</option>
                      ) : (
                        <>
                          <option value="">Unassigned</option>
                          {usersState.data.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name} ({u.role})
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════
                SECTION 3 — Task Description
               ═══════════════════════════════════════════════════ */}
            <div className="activity-form-section">
              <div className="activity-form-section-header">
                <div className="activity-form-section-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="21" y1="6" x2="3" y2="6" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                    <line x1="17" y1="18" x2="3" y2="18" />
                  </svg>
                </div>
                <div className="activity-form-section-title-wrap">
                  <h4 className="activity-form-section-title">Task Description</h4>
                  <p className="activity-form-section-subtitle">
                    Provide context, objectives, or actionable checklists.
                  </p>
                </div>
              </div>

              <div className="activity-form-section-card">
                <div className="activity-form-group">
                  <textarea
                    id="activity-description"
                    className="activity-form-textarea"
                    placeholder="Add task notes, meeting agenda, discussion points, or deliverables..."
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════
                SECTION 4 — Common CRM Relationships
               ═══════════════════════════════════════════════════ */}
            <div className="activity-form-section">
              <div className="activity-form-section-header">
                <div className="activity-form-section-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <div className="activity-form-section-title-wrap">
                  <h4 className="activity-form-section-title">Common CRM Relationships</h4>
                  <p className="activity-form-section-subtitle">
                    Optionally associate this task with CRM records.
                  </p>
                </div>
              </div>

              <div className="activity-form-section-card">
                <div className="activity-form-grid-2">
                  {/* Account */}
                  <div className="activity-form-group">
                    <div className="activity-form-label-row">
                      <label className="activity-form-label" htmlFor="activity-account">
                        Account
                      </label>
                      {accountsState.error && (
                        <button
                          type="button"
                          className="activity-form-retry-btn"
                          onClick={loadAccounts}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                    <select
                      id="activity-account"
                      className="activity-form-select"
                      value={accountId}
                      onChange={(e) => handleAccountChange(e.target.value)}
                      disabled={loading || accountsState.loading}
                    >
                      {accountsState.loading ? (
                        <option value="" disabled>Loading accounts...</option>
                      ) : accountsState.error ? (
                        <option value="" disabled>Failed to load accounts</option>
                      ) : (
                        <>
                          <option value="">None</option>
                          {accountsState.data.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>

                  {/* Lead */}
                  <div className="activity-form-group">
                    <div className="activity-form-label-row">
                      <label className="activity-form-label" htmlFor="activity-lead">
                        Lead
                      </label>
                      {leadsState.error && (
                        <button
                          type="button"
                          className="activity-form-retry-btn"
                          onClick={loadLeads}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                    <select
                      id="activity-lead"
                      className="activity-form-select"
                      value={leadId}
                      onChange={(e) => setLeadId(e.target.value)}
                      disabled={loading || leadsState.loading}
                    >
                      {leadsState.loading ? (
                        <option value="" disabled>Loading leads...</option>
                      ) : leadsState.error ? (
                        <option value="" disabled>Failed to load leads</option>
                      ) : (
                        <>
                          <option value="">None</option>
                          {filteredLeads.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.full_name} {l.email ? `(${l.email})` : ""}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    {accountId && filteredLeads.length === 0 && !leadsState.loading && (
                      <span className="activity-form-hint-text">
                        No leads linked to this account
                      </span>
                    )}
                  </div>

                  {/* Contact */}
                  <div className="activity-form-group">
                    <div className="activity-form-label-row">
                      <label className="activity-form-label" htmlFor="activity-contact">
                        Contact
                      </label>
                      {contactsState.error && (
                        <button
                          type="button"
                          className="activity-form-retry-btn"
                          onClick={loadContacts}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                    <select
                      id="activity-contact"
                      className="activity-form-select"
                      value={contactId}
                      onChange={(e) => setContactId(e.target.value)}
                      disabled={loading || contactsState.loading}
                    >
                      {contactsState.loading ? (
                        <option value="" disabled>Loading contacts...</option>
                      ) : contactsState.error ? (
                        <option value="" disabled>Failed to load contacts</option>
                      ) : (
                        <>
                          <option value="">None</option>
                          {filteredContacts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.full_name} {c.email ? `(${c.email})` : ""}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    {accountId && filteredContacts.length === 0 && !contactsState.loading && (
                      <span className="activity-form-hint-text">
                        No contacts linked to this account
                      </span>
                    )}
                  </div>

                  {/* Deal */}
                  <div className="activity-form-group">
                    <div className="activity-form-label-row">
                      <label className="activity-form-label" htmlFor="activity-deal">
                        Deal
                      </label>
                      {dealsState.error && (
                        <button
                          type="button"
                          className="activity-form-retry-btn"
                          onClick={loadDeals}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                    <select
                      id="activity-deal"
                      className="activity-form-select"
                      value={dealId}
                      onChange={(e) => setDealId(e.target.value)}
                      disabled={loading || dealsState.loading}
                    >
                      {dealsState.loading ? (
                        <option value="" disabled>Loading deals...</option>
                      ) : dealsState.error ? (
                        <option value="" disabled>Failed to load deals</option>
                      ) : (
                        <>
                          <option value="">None</option>
                          {filteredDeals.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} {d.amount ? `($${Number(d.amount).toLocaleString()})` : ""}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    {accountId && filteredDeals.length === 0 && !dealsState.loading && (
                      <span className="activity-form-hint-text">
                        No deals linked to this account
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════
                SECTION 5 — Industry-Related Records
               ═══════════════════════════════════════════════════ */}
            {relatedModules.length > 0 && (
              <div className="activity-form-section">
                <div className="activity-form-section-header">
                  <div className="activity-form-section-icon">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                  </div>
                  <div className="activity-form-section-title-wrap">
                    <h4 className="activity-form-section-title">Industry-Related Records</h4>
                    <p className="activity-form-section-subtitle">
                      Link this task to relevant industry records.
                    </p>
                  </div>
                  {relatedModulesLoading && (
                    <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "auto" }}>
                      Loading config...
                    </span>
                  )}
                  {relatedModulesError && (
                    <span style={{ fontSize: "0.75rem", color: "#ef4444", marginLeft: "auto" }}>
                      ({relatedModulesError})
                    </span>
                  )}
                </div>

                <div className="activity-form-section-card">
                  <div className="activity-form-grid-2">
                    {relatedModules.map((item) => {
                      const modKey = item.module;
                      const recState = moduleRecords[modKey] || { loading: false, error: null, data: [] };
                      const selectedVal = selectedRelatedRecords[modKey] || "";

                      // For sprint: use availableSprints filtered by selected project
                      const displayRecords =
                        modKey === "software_sprint" ? availableSprints : recState.data;

                      const fieldError = fieldErrors[modKey];

                      return (
                        <div className="activity-form-group" key={modKey}>
                          <div className="activity-form-label-row">
                            <label className="activity-form-label" htmlFor={`activity-mod-${modKey}`}>
                              {item.label}
                            </label>
                            {recState.error && (
                              <button
                                type="button"
                                className="activity-form-retry-btn"
                                onClick={() => loadModuleRecords(modKey)}
                              >
                                Retry
                              </button>
                            )}
                          </div>

                          <select
                            id={`activity-mod-${modKey}`}
                            className={`activity-form-select ${fieldError ? "has-error" : ""}`}
                            value={selectedVal}
                            onChange={(e) => handleIndustryRecordChange(modKey, e.target.value)}
                            disabled={loading || recState.loading}
                          >
                            {recState.loading ? (
                              <option value="" disabled>
                                Loading {item.label.toLowerCase()}s...
                              </option>
                            ) : recState.error ? (
                              <option value="" disabled>
                                Failed to load {item.label.toLowerCase()}s
                              </option>
                            ) : (
                              <>
                                <option value="">-- None --</option>
                                {displayRecords.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name} {r.secondaryText ? ` ${r.secondaryText}` : ""}
                                  </option>
                                ))}
                              </>
                            )}
                          </select>

                          {fieldError && (
                            <span className="activity-form-error-text">{fieldError}</span>
                          )}

                          {modKey === "software_sprint" &&
                            selectedRelatedRecords.software_project &&
                            displayRecords.length === 0 &&
                            !recState.loading && (
                              <span className="activity-form-hint-text">
                                No sprints found for the selected project
                              </span>
                            )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Modal Footer */}
          <div className="activity-modal-footer">
            <button
              type="button"
              className="activity-modal-btn-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="activity-modal-btn-submit"
              disabled={loading}
            >
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
