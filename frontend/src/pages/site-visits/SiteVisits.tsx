import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getSiteVisits,
  createSiteVisit,
} from "../../services/siteVisitService";
import { getBuyerRequirements } from "../../services/buyerRequirementService";
import { fetchApiMatchesForRequirement } from "../../services/propertyMatchService";
import { getProperties } from "../../services/propertyService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { resolveModulePermissions } from "../../utils/modulePermissions";
import { parseBackendDate } from "../../utils/bookingJourney";
import { classifyCrmRole } from "../../utils/authRouting";
import type {
  SiteVisit,
  SiteVisitCreate,
} from "../../types/siteVisit";
import { SITE_VISIT_STATUSES } from "../../types/siteVisit";
import type { PropertyMatch } from "../../types/propertyMatch";
import type { Property } from "../../types/property";
import type { User } from "../../types/user";
import type { BuyerRequirement } from "../../types/buyerRequirement";
import type { Lead } from "../../types/lead";
import type { Contact } from "../../types/contact";
import UpdateSiteVisitModal from "../../components/site-visits/UpdateSiteVisitModal";
import SiteVisitJourney from "../../components/site-visits/SiteVisitJourney";
import SiteVisitHistory from "../../components/history/SiteVisitHistory";
import { FollowUpBadge, SiteVisitStatusBadge } from "../../components/site-visits/SiteVisitWidgets";
import { followUpState } from "../../utils/siteVisitHelpers";
import "./SiteVisits.css";

/** Values of the Schedule Site Visit form. Date and times are the raw <input> strings. */
interface ScheduleForm {
  requirementId: string;
  matchId: string;
  assignedTo: string;
  visitDate: string;
  startTime: string;
  endTime: string;
}

type ScheduleFieldErrors = Partial<Record<keyof ScheduleForm, string>>;

const EMPTY_SCHEDULE_FORM: ScheduleForm = {
  requirementId: "",
  matchId: "",
  assignedTo: "",
  visitDate: "",
  startTime: "",
  endTime: "",
};

/** Local-time instant for a date input (YYYY-MM-DD) and time input (HH:mm). */
const toLocalDate = (date: string, time: string): Date => new Date(`${date}T${time}`);

/** Today as YYYY-MM-DD in local time, for the date input's min hint. */
const todayInputValue = (): string => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
};

export default function SiteVisits() {
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [requirements, setRequirements] = useState<BuyerRequirement[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allMatches, setAllMatches] = useState<PropertyMatch[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [matchesLoadFailed, setMatchesLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<SiteVisit | null>(null);
  const [viewingVisit, setViewingVisit] = useState<SiteVisit | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Schedule Site Visit form
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(EMPTY_SCHEDULE_FORM);
  const [fieldErrors, setFieldErrors] = useState<ScheduleFieldErrors>({});

  // Toast
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const formatApiError = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (typeof first === "string") return first;
      if (first && typeof first.msg === "string") {
        const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
        return field && field !== "body" && field !== "query" ? `${field}: ${first.msg}` : first.msg;
      }
    }
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
      return detail.message;
    }
    return err?.message || fallback;
  };

  // Permissions
  // Resolved like the other CRM modules: an explicit permission list on the stored user wins,
  // otherwise the grants the backend seeds for the signed-in role (site_visit.create / .update).
  // The backend still enforces require_permission on every request.
  const userPermissions = useMemo(() => {
    const perms = resolveModulePermissions("site_visit");
    return { canCreate: perms.create, canUpdate: perms.update };
  }, []);

  // Fetch reference datasets (requirements, leads, contacts, properties, users, real property matches)
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getBuyerRequirements().catch(() => [] as BuyerRequirement[]),
      getLeads().catch(() => [] as Lead[]),
      getContacts().catch(() => [] as Contact[]),
      getProperties().catch(() => [] as Property[]),
      getUsers().catch(() => [] as User[]),
    ])
      .then(async ([reqs, leadList, contactList, props, usrList]) => {
        if (cancelled) return;
        setRequirements(reqs);
        setLeads(leadList);
        setContacts(contactList);
        setProperties(props);
        setUsers(usrList);

        // Matches come from the backend only: a site visit can only be created for a real match id.
        let failed = false;
        const matchResults = await Promise.all(
          reqs.map((r) =>
            fetchApiMatchesForRequirement(r.id).catch(() => {
              failed = true;
              return [] as PropertyMatch[];
            })
          )
        );
        if (cancelled) return;
        setAllMatches(matchResults.flat());
        setMatchesLoadFailed(failed);
      })
      .finally(() => {
        if (!cancelled) setRefsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const leadMap = useMemo(() => {
    const map = new Map<string, string>();
    leads.forEach((l) => map.set(l.id, l.full_name || l.email || "Lead"));
    return map;
  }, [leads]);

  const contactMap = useMemo(() => {
    const map = new Map<string, string>();
    contacts.forEach((c) => map.set(c.id, c.full_name || c.email || "Contact"));
    return map;
  }, [contacts]);

  /** Agents the backend will accept: active users of this tenant who are not read-only auditors. */
  const eligibleAgents = useMemo(
    () =>
      users.filter((u) => {
        const status = String(u.status || "").toLowerCase();
        if (status && status !== "active") return false;
        return classifyCrmRole(u.role) !== "AUDITOR";
      }),
    [users]
  );

  const requirementLabel = useCallback(
    (r: BuyerRequirement): string => {
      const buyer =
        (r.lead_id ? leadMap.get(r.lead_id) : undefined) ||
        (r.contact_id ? contactMap.get(r.contact_id) : undefined) ||
        r.lead_name ||
        r.contact_name ||
        "Buyer";
      const where = r.preferred_city ? ` • ${r.preferred_city}` : "";
      return `${buyer} — ${r.property_type}${where}`;
    },
    [leadMap, contactMap]
  );

  const propertyMap = useMemo(() => {
    const map = new Map<string, Property>();
    properties.forEach((p) => map.set(p.id, p));
    return map;
  }, [properties]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.full_name || u.email));
    return map;
  }, [users]);

  const matchMap = useMemo(() => {
    const map = new Map<string, PropertyMatch>();
    allMatches.forEach((m) => map.set(m.id, m));
    return map;
  }, [allMatches]);

  /** Customer name and phone for a property match (buyer requirement -> lead or contact). */
  const customerInfoForMatch = useCallback(
    (matchId: string): { name: string; phone: string } => {
      const match = matchMap.get(matchId);
      const requirement = match ? requirements.find((r) => r.id === match.buyer_requirement_id) : undefined;
      const lead = requirement?.lead_id ? leads.find((l) => l.id === requirement.lead_id) : undefined;
      const contact = requirement?.contact_id ? contacts.find((c) => c.id === requirement.contact_id) : undefined;
      return {
        name: lead?.full_name || contact?.full_name || requirement?.lead_name || requirement?.contact_name || "",
        phone: lead?.phone || contact?.phone || "",
      };
    },
    [matchMap, requirements, leads, contacts]
  );

  /** Every visit of the viewed visit's customer + property (for the visit history), read from the API. */
  const [matchVisits, setMatchVisits] = useState<SiteVisit[] | null>(null);
  useEffect(() => {
    if (!viewingVisit) {
      setMatchVisits(null);
      return;
    }
    let cancelled = false;
    getSiteVisits({ property_match_id: viewingVisit.property_match_id, limit: 100 })
      .then((rows) => !cancelled && setMatchVisits(rows))
      .catch(() => !cancelled && setMatchVisits(null));
    return () => {
      cancelled = true;
    };
  }, [viewingVisit]);

  // Fetch Site Visits
  const fetchVisitsList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSiteVisits({
        status: statusFilter || undefined,
        assigned_to: assignedFilter || undefined,
        limit: 100,
      });
      setSiteVisits(data);
    } catch (err: any) {
      console.error("Failed to load site visits:", err);
      setError(formatApiError(err, "Failed to load site visits."));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, assignedFilter]);

  useEffect(() => {
    fetchVisitsList();
  }, [fetchVisitsList]);

  // Statistics
  const stats = useMemo(() => {
    const total = siteVisits.length;
    const scheduled = siteVisits.filter((v) => v.status === "Scheduled").length;
    const completed = siteVisits.filter((v) => v.status === "Completed").length;
    const cancelled = siteVisits.filter(
      (v) => v.status === "Cancelled" || v.status === "No-show"
    ).length;
    const requested = siteVisits.filter((v) => v.status === "Requested").length;
    const followUps = siteVisits.map((v) => followUpState(v));
    const followOverdue = followUps.filter((f) => f === "overdue").length;
    const followPending = followUps.filter((f) => f === "pending").length + followOverdue;
    return { total, scheduled, completed, cancelled, requested, followPending, followOverdue };
  }, [siteVisits]);

  // Filtered visits
  const filteredVisits = useMemo(() => {
    return siteVisits.filter((v) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = matchMap.get(v.property_match_id);
        const prop = match ? propertyMap.get(match.property_id) : null;
        const propName = prop?.name?.toLowerCase() || "";
        const city = prop?.city?.toLowerCase() || "";
        const agent = (v.assigned_to ? userMap.get(v.assigned_to) || "" : "").toLowerCase();
        const feedback = (v.buyer_feedback || "").toLowerCase();
        const outcome = (v.outcome || "").toLowerCase();

        if (
          !propName.includes(q) &&
          !city.includes(q) &&
          !agent.includes(q) &&
          !feedback.includes(q) &&
          !outcome.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [siteVisits, searchQuery, matchMap, propertyMap, userMap]);

  // Date formatters
  const formatDateTimeRange = (startStr: string, endStr: string) => {
    try {
      // The backend returns naive UTC timestamps; parseBackendDate treats them as UTC so the
      // scheduled time is shown in the viewer's local time (same as the booking journey screens).
      const start = parseBackendDate(startStr);
      const end = parseBackendDate(endStr);
      if (!start || !end) return `${startStr} - ${endStr}`;
      return `${start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })} • ${start.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })} - ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return `${startStr} - ${endStr}`;
    }
  };

  // ── Schedule Site Visit ────────────────────────────────────────────────

  /** Requirements (customer / lead) that have at least one real property match to visit. */
  const schedulableRequirements = useMemo(() => {
    const withMatches = new Set(allMatches.map((m) => m.buyer_requirement_id));
    return requirements.filter((r) => withMatches.has(r.id));
  }, [requirements, allMatches]);

  /** Matched properties for the customer selected in the form. */
  const matchesForSelectedRequirement = useMemo(
    () => allMatches.filter((m) => m.buyer_requirement_id === scheduleForm.requirementId),
    [allMatches, scheduleForm.requirementId]
  );

  const selectedMatch = useMemo(
    () => allMatches.find((m) => m.id === scheduleForm.matchId) || null,
    [allMatches, scheduleForm.matchId]
  );

  /** When no agent is picked the backend assigns the property match's own salesperson. */
  const defaultAgentName = selectedMatch?.assigned_to
    ? userMap.get(selectedMatch.assigned_to) || "assigned salesperson"
    : null;

  const openScheduleModal = () => {
    setScheduleForm(EMPTY_SCHEDULE_FORM);
    setFieldErrors({});
    setFormError(null);
    setIsCreateOpen(true);
  };

  const closeScheduleModal = () => {
    if (submitting) return;
    setIsCreateOpen(false);
    setScheduleForm(EMPTY_SCHEDULE_FORM);
    setFieldErrors({});
    setFormError(null);
  };

  const updateScheduleField = (field: keyof ScheduleForm, value: string) => {
    setScheduleForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "requirementId") {
        // The property list depends on the customer: reset it, and pre-select when there is only one.
        const options = allMatches.filter((m) => m.buyer_requirement_id === value);
        next.matchId = options.length === 1 && options[0] ? options[0].id : "";
      }
      return next;
    });
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      if (field === "requirementId") delete next.matchId;
      if (field === "startTime") delete next.endTime;
      return next;
    });
    setFormError(null);
  };

  const validateScheduleForm = (form: ScheduleForm): ScheduleFieldErrors => {
    const errors: ScheduleFieldErrors = {};
    if (!form.requirementId) errors.requirementId = "Select a customer / lead.";
    if (!form.matchId) errors.matchId = "Select a property.";
    if (!form.visitDate) errors.visitDate = "Select the visit date.";
    if (!form.startTime) errors.startTime = "Select a start time.";
    if (!form.endTime) errors.endTime = "Select an end time.";

    if (form.visitDate && form.startTime && form.endTime) {
      const start = toLocalDate(form.visitDate, form.startTime);
      const end = toLocalDate(form.visitDate, form.endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        errors.visitDate = "Enter a valid date and time.";
      } else if (end <= start) {
        errors.endTime = "End time must be after the start time.";
      }
    }
    return errors;
  };

  // Create Site Visit — POST /api/v1/site-visits/ { property_match_id, scheduled_start, scheduled_end, assigned_to }
  const handleCreateVisit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const errors = validateScheduleForm(scheduleForm);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const payload: SiteVisitCreate = {
        property_match_id: scheduleForm.matchId,
        scheduled_start: toLocalDate(scheduleForm.visitDate, scheduleForm.startTime).toISOString(),
        scheduled_end: toLocalDate(scheduleForm.visitDate, scheduleForm.endTime).toISOString(),
        // null lets the backend fall back to the property match's own salesperson.
        assigned_to: scheduleForm.assignedTo || null,
      };

      const created = await createSiteVisit(payload);

      setIsCreateOpen(false);
      setScheduleForm(EMPTY_SCHEDULE_FORM);
      setFieldErrors({});
      showToast("Site visit scheduled successfully!");

      // Make sure the new appointment is not hidden by an active filter, then reload from the server
      // so the table, grid and every statistic (all derived from the list) are refreshed together.
      const hiddenByStatus = !!statusFilter && statusFilter !== created.status;
      const hiddenByAgent = !!assignedFilter && assignedFilter !== (created.assigned_to || "");
      if (hiddenByStatus) setStatusFilter("");
      if (hiddenByAgent) setAssignedFilter("");
      if (searchQuery) setSearchQuery("");
      if (hiddenByStatus || hiddenByAgent) {
        // The filter state change triggers fetchVisitsList through its effect.
        return;
      }
      await fetchVisitsList();
    } catch (err: any) {
      console.error("Create site visit error:", err);
      const status = err?.response?.status;
      const message = formatApiError(err, "Failed to schedule site visit.");
      setFormError(
        status === 409
          ? `Scheduling conflict: ${message}`
          : status === 403
          ? "You do not have permission to schedule site visits."
          : message
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Scheduled":
        return "badge-scheduled";
      case "Completed":
        return "badge-completed";
      case "Cancelled":
        return "badge-cancelled";
      case "Rescheduled":
        return "badge-rescheduled";
      case "Requested":
        return "badge-requested";
      default:
        return "badge-noshow";
    }
  };

  return (
    <div className="site-visits-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: toastMessage.type === "error" ? "#e53e3e" : "#06b6d4",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 9999,
            fontWeight: 600,
          }}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="site-visits-header">
        <div className="header-titles">
          <div className="title-row">
            <h1>Site Visits & Inspections</h1>
            <span className="count-chip">{siteVisits.length} Appointments</span>
          </div>
          <p className="subtitle">
            Schedule property viewings, log buyer interest feedback, and coordinate inspections
          </p>
        </div>

        <div className="header-actions">
          {/* View Mode Toggle */}
          <div className="view-mode-toggle">
            <button
              className={`toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              Table
            </button>
            <button
              className={`toggle-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Card Grid View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              Grid
            </button>
          </div>

          {userPermissions.canCreate && (
            <button
              type="button"
              className="btn-schedule-visit"
              onClick={openScheduleModal}
              title="Schedule a new site visit"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Schedule Site Visit
            </button>
          )}
        </div>
      </div>

      {(stats.requested > 0 || stats.followPending > 0) && (
        <div className="sv-form-notice" role="status" style={{ margin: "0 0 16px" }}>
          {stats.requested > 0 && (
            <span>
              <strong>{stats.requested}</strong> customer visit request{stats.requested === 1 ? "" : "s"} awaiting confirmation.{" "}
            </span>
          )}
          {stats.followPending > 0 && (
            <span>
              <strong>{stats.followPending}</strong> follow-up{stats.followPending === 1 ? "" : "s"} pending
              {stats.followOverdue > 0 ? ` (${stats.followOverdue} overdue)` : ""}.
            </span>
          )}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="site-visits-summary-grid">
        <div className="kpi-card cyan">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Total Visits</span>
            <span className="kpi-value">{stats.total}</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Scheduled</span>
            <span className="kpi-value">{stats.scheduled}</span>
          </div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Completed</span>
            <span className="kpi-value">{stats.completed}</span>
          </div>
        </div>

        <div className="kpi-card purple">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Cancelled / No-show</span>
            <span className="kpi-value">{stats.cancelled}</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="site-visits-filter-container">
        <div className="filter-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by property, city, agent, feedback..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
              &times;
            </button>
          )}
        </div>

        <div className="filter-dropdowns-group">
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {SITE_VISIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
          >
            <option value="">All Salespersons</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>

          {(searchQuery || statusFilter || assignedFilter) && (
            <button
              className="btn-clear-filters"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("");
                setAssignedFilter("");
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Loading, Error or Content */}
      {loading ? (
        <div className="site-visits-loading-state">
          <div className="spinner"></div>
          <p style={{ margin: 0, color: "#64748b" }}>Loading site visits & appointments...</p>
        </div>
      ) : error ? (
        <div className="site-visits-error-state">
          <p style={{ margin: "0 0 12px", color: "#e53e3e", fontWeight: 600 }}>{error}</p>
          <button className="btn-schedule-visit" onClick={fetchVisitsList}>
            Retry Loading
          </button>
        </div>
      ) : filteredVisits.length === 0 ? (
        <div className="site-visits-empty-card">
          <div className="empty-visit-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <h3>No Site Visits Found</h3>
          <p>
            {searchQuery || statusFilter || assignedFilter
              ? "No site visits match your active search filters. Try clearing filters."
              : "No property visits have been scheduled yet. Schedule appointments to showcase properties to interested buyers."}
          </p>
          {userPermissions.canCreate && !searchQuery && !statusFilter && !assignedFilter && (
            <button type="button" className="btn-schedule-visit" onClick={openScheduleModal}>
              Schedule Site Visit
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* Card Grid View */
        <div className="site-visits-grid">
          {filteredVisits.map((visit) => {
            const match = matchMap.get(visit.property_match_id);
            const prop = match ? propertyMap.get(match.property_id) : null;
            const badgeClass = getStatusBadgeClass(visit.status);

            return (
              <div key={visit.id} className="visit-card">
                <div className="visit-card-header">
                  <div className="visit-datetime-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>{formatDateTimeRange(visit.scheduled_start, visit.scheduled_end)}</span>
                  </div>
                  <span className={`badge ${badgeClass}`}>{visit.status}</span>
                </div>

                <h3 className="visit-prop-name">
                  {prop ? prop.name : `Property #${visit.property_match_id.substring(0, 8)}`}
                </h3>

                <div className="visit-buyer-line">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span>
                    Agent: {visit.assigned_to ? userMap.get(visit.assigned_to) || "Assigned" : "Unassigned"}
                  </span>
                </div>

                <div className="visit-details-box">
                  {prop && (
                    <div className="visit-detail-row">
                      <span style={{ color: "#64748b" }}>Location & Price:</span>
                      <span style={{ fontWeight: 600 }}>
                        {prop.city} • ₹{Number(prop.price).toLocaleString("en-IN")}
                      </span>
                    </div>
                  )}
                  {visit.outcome && (
                    <div className="visit-detail-row">
                      <span style={{ color: "#64748b" }}>Outcome:</span>
                      <span style={{ fontWeight: 600, color: "#0891b2" }}>{visit.outcome}</span>
                    </div>
                  )}
                  {visit.interest_level && (
                    <div className="visit-detail-row">
                      <span style={{ color: "#64748b" }}>Interest:</span>
                      <span>{visit.interest_level}</span>
                    </div>
                  )}
                  {visit.follow_up_required && (
                    <div className="visit-detail-row">
                      <span style={{ color: "#64748b" }}>Follow-up:</span>
                      <FollowUpBadge visit={visit} />
                    </div>
                  )}
                  {visit.cancellation_reason && (
                    <div className="visit-detail-row">
                      <span style={{ color: "#ef4444" }}>Reason:</span>
                      <span style={{ color: "#b91c1c", fontStyle: "italic" }}>{visit.cancellation_reason}</span>
                    </div>
                  )}
                </div>

                <div className="visit-card-footer">
                  <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    ID: {visit.id.substring(0, 8)}...
                  </span>

                  <div className="action-buttons-group">
                    <button
                      className="btn-action-icon"
                      title="View Details"
                      onClick={() => setViewingVisit(visit)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    </button>

                    {userPermissions.canUpdate && (
                      <button
                        className="btn-action-icon"
                        title="Update Outcome / Status"
                        onClick={() => {
                          setEditingVisit(visit);
                          setFormError(null);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="site-visits-table-container">
          <table className="site-visits-table">
            <thead>
              <tr>
                <th>Scheduled Date & Time</th>
                <th>Property</th>
                <th>Assigned Agent</th>
                <th>Status</th>
                <th>Feedback / Outcome</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVisits.map((visit) => {
                const match = matchMap.get(visit.property_match_id);
                const prop = match ? propertyMap.get(match.property_id) : null;
                const badgeClass = getStatusBadgeClass(visit.status);

                return (
                  <tr key={visit.id}>
                    <td>
                      <div className="visit-datetime-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>{formatDateTimeRange(visit.scheduled_start, visit.scheduled_end)}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {prop ? prop.name : `Property #${visit.property_match_id.substring(0, 8)}...`}
                      </div>
                      {prop && (
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {prop.city} • ₹{Number(prop.price).toLocaleString("en-IN")}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ color: "#94a3b8" }}>
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        <span>{visit.assigned_to ? userMap.get(visit.assigned_to) || "Assigned" : "Unassigned"}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{visit.status}</span>
                    </td>
                    <td>
                      {visit.outcome ? (
                        <div>
                          <span style={{ fontWeight: 600, color: "#0891b2", fontSize: "0.8rem" }}>
                            {visit.outcome}
                          </span>
                          {visit.interest_level && (
                            <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "6px" }}>
                              ({visit.interest_level})
                            </span>
                          )}
                        </div>
                      ) : visit.cancellation_reason ? (
                        <span style={{ fontSize: "0.8rem", color: "#ef4444", fontStyle: "italic" }}>
                          {visit.cancellation_reason}
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Pending visit</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons-group" style={{ justifyContent: "flex-end" }}>
                        <button
                          className="btn-action-icon"
                          title="View Details"
                          onClick={() => setViewingVisit(visit)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>

                        {userPermissions.canUpdate && (
                          <button
                            className="btn-action-icon"
                            title="Update Outcome / Status"
                            onClick={() => {
                              setEditingVisit(visit);
                              setFormError(null);
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Schedule Site Visit Modal ─── */}
      {isCreateOpen && (
        <div className="modal-overlay" onClick={closeScheduleModal}>
          <div
            className="modal-card sv-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sv-schedule-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="sv-schedule-title">Schedule Site Visit</h2>
              <button
                type="button"
                className="modal-close-btn"
                aria-label="Close"
                onClick={closeScheduleModal}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateVisit} noValidate className="sv-modal-form">
              <div className="modal-body">
                {formError && (
                  <div className="sv-form-alert" role="alert">
                    {formError}
                  </div>
                )}

                {!refsLoading && schedulableRequirements.length === 0 && (
                  <div className="sv-form-notice">
                    {matchesLoadFailed
                      ? "Property matches could not be loaded. Close this window and try again."
                      : "No buyer has a matched property yet. Go to Buyer Requirements > Find Matches and match a property first."}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="sv-requirement">Customer / Lead *</label>
                  <select
                    id="sv-requirement"
                    value={scheduleForm.requirementId}
                    onChange={(e) => updateScheduleField("requirementId", e.target.value)}
                    disabled={refsLoading || submitting}
                    aria-invalid={!!fieldErrors.requirementId}
                  >
                    <option value="">
                      {refsLoading ? "Loading customers..." : "Select customer / lead"}
                    </option>
                    {schedulableRequirements.map((r) => (
                      <option key={r.id} value={r.id}>
                        {requirementLabel(r)}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.requirementId && (
                    <span className="sv-field-error">{fieldErrors.requirementId}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="sv-property">Property *</label>
                  <select
                    id="sv-property"
                    value={scheduleForm.matchId}
                    onChange={(e) => updateScheduleField("matchId", e.target.value)}
                    disabled={!scheduleForm.requirementId || submitting}
                    aria-invalid={!!fieldErrors.matchId}
                  >
                    <option value="">
                      {scheduleForm.requirementId ? "Select property" : "Select a customer first"}
                    </option>
                    {matchesForSelectedRequirement.map((m) => {
                      const prop = propertyMap.get(m.property_id);
                      return (
                        <option key={m.id} value={m.id}>
                          {prop
                            ? `${prop.name}${prop.city ? ` (${prop.city})` : ""}`
                            : `Property match #${m.id.substring(0, 8)}`}
                        </option>
                      );
                    })}
                  </select>
                  {fieldErrors.matchId && <span className="sv-field-error">{fieldErrors.matchId}</span>}
                </div>

                {selectedMatch && (
                  <div className="sv-form-notice" style={{ marginBottom: 14 }} aria-live="polite">
                    <div><strong>Customer:</strong> {customerInfoForMatch(selectedMatch.id).name || "—"}</div>
                    <div><strong>Phone:</strong> {customerInfoForMatch(selectedMatch.id).phone || "No phone on file"}</div>
                    <div>
                      <strong>Property:</strong> {propertyMap.get(selectedMatch.property_id)?.name ?? "—"}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: "0.78rem", wordBreak: "break-all" }}>
                      <strong style={{ fontFamily: "inherit" }}>Property ID:</strong> {selectedMatch.property_id}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="sv-agent">Assigned Sales Agent</label>
                  <select
                    id="sv-agent"
                    value={scheduleForm.assignedTo}
                    onChange={(e) => updateScheduleField("assignedTo", e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">
                      {defaultAgentName
                        ? `Default — ${defaultAgentName}`
                        : "Default — property match salesperson"}
                    </option>
                    {eligibleAgents.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                  </select>
                  <span className="sv-field-hint">
                    Leave on default to use the salesperson already assigned to the match. An agent
                    cannot have two overlapping visits.
                  </span>
                </div>

                <div className="sv-schedule-grid">
                  <div className="form-group">
                    <label htmlFor="sv-date">Visit Date *</label>
                    <input
                      id="sv-date"
                      type="date"
                      value={scheduleForm.visitDate}
                      onChange={(e) => updateScheduleField("visitDate", e.target.value)}
                      min={todayInputValue()}
                      disabled={submitting}
                      aria-invalid={!!fieldErrors.visitDate}
                    />
                    {fieldErrors.visitDate && (
                      <span className="sv-field-error">{fieldErrors.visitDate}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="sv-start">Start Time *</label>
                    <input
                      id="sv-start"
                      type="time"
                      value={scheduleForm.startTime}
                      onChange={(e) => updateScheduleField("startTime", e.target.value)}
                      disabled={submitting}
                      aria-invalid={!!fieldErrors.startTime}
                    />
                    {fieldErrors.startTime && (
                      <span className="sv-field-error">{fieldErrors.startTime}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="sv-end">End Time *</label>
                    <input
                      id="sv-end"
                      type="time"
                      value={scheduleForm.endTime}
                      onChange={(e) => updateScheduleField("endTime", e.target.value)}
                      disabled={submitting}
                      aria-invalid={!!fieldErrors.endTime}
                    />
                    {fieldErrors.endTime && <span className="sv-field-error">{fieldErrors.endTime}</span>}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeScheduleModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || refsLoading || schedulableRequirements.length === 0}
                >
                  {submitting ? "Scheduling..." : "Schedule Appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Update / Reschedule / Complete / Cancel Visit Modal ─── */}
      {editingVisit && (
        <UpdateSiteVisitModal
          visit={editingVisit}
          onClose={() => setEditingVisit(null)}
          onSaved={(updated) => {
            setSiteVisits((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
            showToast(updated.status === "Rescheduled" ? "Site visit rescheduled. The customer has been notified." : "Site visit updated.");
            setEditingVisit(null);
          }}
        />
      )}

      {/* ─── View Visit Modal: details, follow-up and the visit history of this customer and property ─── */}
      {viewingVisit && (() => {
        const viewMatch = matchMap.get(viewingVisit.property_match_id);
        const viewProp = viewMatch ? propertyMap.get(viewMatch.property_id) : undefined;
        const viewCustomer = customerInfoForMatch(viewingVisit.property_match_id);
        const propertyLabel = viewProp?.name ?? "Property";
        // All visits of this customer + property; always includes the one being viewed.
        const journeyVisits = (matchVisits && matchVisits.length > 0 ? matchVisits : siteVisits.filter((v) => v.property_match_id === viewingVisit.property_match_id)).some((v) => v.id === viewingVisit.id)
          ? (matchVisits && matchVisits.length > 0 ? matchVisits : siteVisits.filter((v) => v.property_match_id === viewingVisit.property_match_id))
          : [...(matchVisits ?? []), viewingVisit];
        const followState = followUpState(viewingVisit);
        const label: React.CSSProperties = { fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" };
        const tile: React.CSSProperties = { background: "rgba(100,116,139,0.08)", padding: "10px 14px", borderRadius: "8px" };
        return (
          <div className="modal-overlay" onClick={() => setViewingVisit(null)}>
            <div className="modal-card" style={{ maxWidth: "760px" }} role="dialog" aria-modal="true" aria-labelledby="sv-view-title" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 id="sv-view-title">Site Visit Details</h2>
                  <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    {propertyLabel}
                    {viewCustomer.name ? ` · ${viewCustomer.name}` : ""}
                  </div>
                </div>
                <button className="modal-close-btn" aria-label="Close" onClick={() => setViewingVisit(null)}>
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <div className="details-spec-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "18px" }}>
                  <div style={tile}>
                    <div style={label}>Status</div>
                    <div style={{ marginTop: "4px" }}><SiteVisitStatusBadge status={viewingVisit.status} /></div>
                  </div>
                  <div style={tile}>
                    <div style={label}>Outcome</div>
                    <div style={{ fontWeight: 600, marginTop: "2px" }}>{viewingVisit.outcome || "Not recorded"}</div>
                  </div>
                  <div style={tile}>
                    <div style={label}>Interest Level</div>
                    <div style={{ fontWeight: 600, marginTop: "2px" }}>{viewingVisit.interest_level || "Not specified"}</div>
                  </div>
                  <div style={tile}>
                    <div style={label}>Assigned Agent</div>
                    <div style={{ fontWeight: 600, marginTop: "2px" }}>{viewingVisit.assigned_to ? userMap.get(viewingVisit.assigned_to) || "Assigned" : "Unassigned"}</div>
                  </div>
                  <div style={tile}>
                    <div style={label}>Customer</div>
                    <div style={{ fontWeight: 600, marginTop: "2px" }}>{viewCustomer.name || "—"}</div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{viewCustomer.phone || "No phone on file"}</div>
                  </div>
                  <div style={tile}>
                    <div style={label}>Property ID</div>
                    <div style={{ fontFamily: "monospace", fontSize: "0.78rem", marginTop: "2px", wordBreak: "break-all" }}>{viewMatch?.property_id ?? "—"}</div>
                  </div>
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <div style={label}>Time Window</div>
                  <div style={{ fontWeight: 600, marginTop: "2px" }}>
                    {formatDateTimeRange(viewingVisit.scheduled_start, viewingVisit.scheduled_end)}
                  </div>
                </div>

                {viewingVisit.buyer_feedback && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={label}>Buyer Feedback</div>
                    <p style={{ margin: "4px 0 0", background: "rgba(100,116,139,0.06)", padding: "10px 12px", borderRadius: "6px", whiteSpace: "pre-wrap" }}>
                      {viewingVisit.buyer_feedback}
                    </p>
                  </div>
                )}

                <div style={{ marginBottom: "16px" }}>
                  <div style={label}>Follow-up</div>
                  {viewingVisit.follow_up_required ? (
                    <div style={{ marginTop: "4px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                      <FollowUpBadge visit={viewingVisit} />
                      <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                        {followState === "overdue" ? "The follow-up date has passed." : "A follow-up with this buyer is still to be done."}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontWeight: 600, marginTop: "2px" }}>Not required</div>
                  )}
                </div>

                {viewingVisit.cancellation_reason && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ ...label, color: "#ef4444" }}>Cancellation Reason</div>
                    <p style={{ margin: "4px 0 0", color: "#991b1b", background: "#fee2e2", padding: "10px 12px", borderRadius: "6px" }}>
                      {viewingVisit.cancellation_reason}
                    </p>
                  </div>
                )}

                <div style={{ display: "grid", gap: "22px", marginTop: "8px" }}>
                  <SiteVisitJourney
                    visits={journeyVisits}
                    currentId={viewingVisit.id}
                    propertyName={propertyLabel}
                    resolveUser={(id) => (id ? userMap.get(id) ?? null : null)}
                  />
                  <SiteVisitHistory visitId={viewingVisit.id} resolveUser={(id) => (id ? userMap.get(id) ?? null : null)} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setViewingVisit(null)}>
                  Close
                </button>
                {userPermissions.canUpdate && (
                  <button
                    className="btn-primary"
                    onClick={() => {
                      const visit = viewingVisit;
                      setViewingVisit(null);
                      setEditingVisit(visit);
                    }}
                  >
                    Update appointment
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
