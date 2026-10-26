import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getSiteVisits,
  createSiteVisit,
  updateSiteVisit,
} from "../../services/siteVisitService";
import { getBuyerRequirements } from "../../services/buyerRequirementService";
import { getMatchesForRequirement } from "../../services/propertyMatchService";
import { getProperties } from "../../services/propertyService";
import { getUsers } from "../../services/userService";
import type {
  SiteVisit,
  SiteVisitCreate,
  SiteVisitUpdate,
} from "../../types/siteVisit";
import {
  SITE_VISIT_STATUSES,
  SITE_VISIT_OUTCOMES,
  INTEREST_LEVELS,
} from "../../types/siteVisit";
import type { PropertyMatch } from "../../types/propertyMatch";
import type { Property } from "../../types/property";
import type { User } from "../../types/user";
import "./SiteVisits.css";

export default function SiteVisits() {
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [allMatches, setAllMatches] = useState<PropertyMatch[]>([]);
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

  // Create Form match selection helpers
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");

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
  const userPermissions = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (!stored) return { canCreate: true, canUpdate: true };
      const parsed = JSON.parse(stored);
      const perms: string[] = Array.isArray(parsed.permissions)
        ? parsed.permissions
        : parsed.role?.permissions || [];
      const role = String(parsed.role || "").toUpperCase();
      const isSuperOrAdmin =
        role.includes("ADMIN") || role.includes("MANAGER") || role === "TENANT ADMIN";

      const has = (p: string) =>
        isSuperOrAdmin || perms.some((x) => x.toLowerCase() === p.toLowerCase());

      return {
        canCreate: has("site_visit.create"),
        canUpdate: has("site_visit.update"),
      };
    } catch {
      return { canCreate: true, canUpdate: true };
    }
  }, []);

  // Fetch initial datasets
  useEffect(() => {
    Promise.all([
      getBuyerRequirements().catch(() => []),
      getProperties().catch(() => []),
      getUsers().catch(() => []),
    ]).then(async ([reqs, props, usrList]) => {
      setProperties(props);
      setUsers(usrList);

      // Load all matches across requirements
      const matchPromises = reqs.map((r) =>
        getMatchesForRequirement(r.id).catch(() => [])
      );
      const matchResults = await Promise.all(matchPromises);
      const flatMatches = matchResults.flat();
      setAllMatches(flatMatches);
      const firstMatch = flatMatches[0];
      if (firstMatch) {
        setSelectedMatchId(firstMatch.id);
      }
    });
  }, []);

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
    return { total, scheduled, completed, cancelled };
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
      const start = new Date(startStr);
      const end = new Date(endStr);
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

  // Create Site Visit
  const handleCreateVisit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const property_match_id = selectedMatchId;
    const startDate = String(formData.get("scheduled_start") || "");
    const endDate = String(formData.get("scheduled_end") || "");
    const assigned_to = String(formData.get("assigned_to") || "").trim() || null;

    if (!property_match_id || !startDate || !endDate) {
      setFormError("Please select a Property Match, Start Time, and End Time.");
      setSubmitting(false);
      return;
    }

    if (new Date(endDate) <= new Date(startDate)) {
      setFormError("Scheduled end time must be after scheduled start time.");
      setSubmitting(false);
      return;
    }

    try {
      const payload: SiteVisitCreate = {
        property_match_id,
        scheduled_start: new Date(startDate).toISOString(),
        scheduled_end: new Date(endDate).toISOString(),
        assigned_to,
      };

      const created = await createSiteVisit(payload);
      setSiteVisits((prev) => [created, ...prev]);
      showToast("Site visit scheduled successfully!");
      setIsCreateOpen(false);
    } catch (err: any) {
      console.error("Create site visit error:", err);
      setFormError(err?.response?.data?.detail || "Failed to schedule site visit.");
    } finally {
      setSubmitting(false);
    }
  };

  // Update / Complete / Reschedule / Cancel Visit
  const handleUpdateVisit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingVisit) return;
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const status = String(formData.get("status") || editingVisit.status);
    const startDate = String(formData.get("scheduled_start") || "");
    const endDate = String(formData.get("scheduled_end") || "");
    const outcome = String(formData.get("outcome") || "").trim() || null;
    const buyer_feedback = String(formData.get("buyer_feedback") || "").trim() || null;
    const interest_level = String(formData.get("interest_level") || "").trim() || null;
    const follow_up_required = formData.get("follow_up_required") === "on";
    const followUpDateStr = String(formData.get("follow_up_date") || "");
    const cancellation_reason = String(formData.get("cancellation_reason") || "").trim() || null;

    if (status === "Cancelled" && !cancellation_reason) {
      setFormError("Provide a cancellation reason when cancelling a site visit.");
      setSubmitting(false);
      return;
    }

    const payload: SiteVisitUpdate = {
      status,
      outcome: outcome as any,
      buyer_feedback,
      interest_level: interest_level as any,
      follow_up_required,
      follow_up_date: followUpDateStr ? new Date(followUpDateStr).toISOString() : null,
      cancellation_reason,
    };

    if (startDate && endDate) {
      if (new Date(endDate) <= new Date(startDate)) {
        setFormError("Scheduled end time must be after start time.");
        setSubmitting(false);
        return;
      }
      payload.scheduled_start = new Date(startDate).toISOString();
      payload.scheduled_end = new Date(endDate).toISOString();
    }

    try {
      const updated = await updateSiteVisit(editingVisit.id, payload);
      setSiteVisits((prev) =>
        prev.map((v) => (v.id === updated.id ? updated : v))
      );
      showToast("Site visit updated!");
      setEditingVisit(null);
    } catch (err: any) {
      console.error("Update visit error:", err);
      setFormError(err?.response?.data?.detail || "Failed to update site visit.");
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
              className="btn-schedule-visit"
              onClick={() => {
                setFormError(null);
                setIsCreateOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Schedule Visit
            </button>
          )}
        </div>
      </div>

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
            <button
              className="btn-schedule-visit"
              onClick={() => {
                setFormError(null);
                setIsCreateOpen(true);
              }}
            >
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
        <div className="modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-card" style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Schedule Site Visit</h2>
              <button className="modal-close-btn" onClick={() => setIsCreateOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateVisit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label>Select Property Match *</label>
                  {allMatches.length === 0 ? (
                    <div style={{ padding: "12px", background: "#fef3c7", color: "#92400e", borderRadius: "8px", fontSize: "0.85rem" }}>
                      No Property Matches exist yet. Go to Buyer Requirements &gt; Find Matches &gt; Match a Property first!
                    </div>
                  ) : (
                    <select
                      value={selectedMatchId}
                      onChange={(e) => setSelectedMatchId(e.target.value)}
                      required
                    >
                      {allMatches.map((m) => {
                        const prop = propertyMap.get(m.property_id);
                        return (
                          <option key={m.id} value={m.id}>
                            {prop ? `${prop.name} (${prop.city})` : `Match #${m.id.substring(0, 8)}`}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Start Date & Time *</label>
                    <input
                      type="datetime-local"
                      name="scheduled_start"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>End Date & Time *</label>
                    <input
                      type="datetime-local"
                      name="scheduled_end"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Assigned Salesperson (Optional)</label>
                  <select name="assigned_to">
                    <option value="">Default Match Salesperson</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || allMatches.length === 0}
                >
                  {submitting ? "Scheduling..." : "Schedule Appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit / Complete / Reschedule Visit Modal ─── */}
      {editingVisit && (
        <div className="modal-overlay" onClick={() => setEditingVisit(null)}>
          <div className="modal-card" style={{ maxWidth: "620px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Update Site Visit Appointment</h2>
              <button className="modal-close-btn" onClick={() => setEditingVisit(null)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateVisit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
                    {formError}
                  </div>
                )}

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      name="status"
                      defaultValue={editingVisit.status}
                    >
                      {SITE_VISIT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Outcome</label>
                    <select
                      name="outcome"
                      defaultValue={editingVisit.outcome || ""}
                    >
                      <option value="">Select Outcome</option>
                      {SITE_VISIT_OUTCOMES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Interest Level</label>
                  <select
                    name="interest_level"
                    defaultValue={editingVisit.interest_level || ""}
                  >
                    <option value="">Select Interest Level</option>
                    {INTEREST_LEVELS.map((il) => (
                      <option key={il} value={il}>
                        {il}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Buyer Feedback / Observations</label>
                  <textarea
                    name="buyer_feedback"
                    defaultValue={editingVisit.buyer_feedback || ""}
                    placeholder="Enter what the buyer liked, objections, pricing questions..."
                    rows={3}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      name="follow_up_required"
                      defaultChecked={editingVisit.follow_up_required}
                    />
                    Follow-up Required
                  </label>
                </div>

                <div className="form-group">
                  <label>Follow-up Date</label>
                  <input
                    type="date"
                    name="follow_up_date"
                    defaultValue={
                      editingVisit.follow_up_date
                        ? new Date(editingVisit.follow_up_date).toISOString().split("T")[0]
                        : ""
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Cancellation Reason (if cancelling)</label>
                  <input
                    type="text"
                    name="cancellation_reason"
                    defaultValue={editingVisit.cancellation_reason || ""}
                    placeholder="e.g. Buyer postponed travel plans"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingVisit(null)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Updates"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── View Visit Modal ─── */}
      {viewingVisit && (
        <div className="modal-overlay" onClick={() => setViewingVisit(null)}>
          <div className="modal-card" style={{ maxWidth: "580px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Site Visit Details</h2>
              <button className="modal-close-btn" onClick={() => setViewingVisit(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="details-spec-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginBottom: "18px" }}>
                <div style={{ background: "rgba(100,116,139,0.08)", padding: "10px 14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" }}>Status</div>
                  <div style={{ fontWeight: 600, marginTop: "2px" }}>{viewingVisit.status}</div>
                </div>
                <div style={{ background: "rgba(100,116,139,0.08)", padding: "10px 14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" }}>Outcome</div>
                  <div style={{ fontWeight: 600, marginTop: "2px" }}>{viewingVisit.outcome || "Not recorded"}</div>
                </div>
                <div style={{ background: "rgba(100,116,139,0.08)", padding: "10px 14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" }}>Interest Level</div>
                  <div style={{ fontWeight: 600, marginTop: "2px" }}>{viewingVisit.interest_level || "Not specified"}</div>
                </div>
                <div style={{ background: "rgba(100,116,139,0.08)", padding: "10px 14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" }}>Follow-up Required</div>
                  <div style={{ fontWeight: 600, marginTop: "2px" }}>{viewingVisit.follow_up_required ? "Yes" : "No"}</div>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" }}>Time Window</div>
                <div style={{ fontWeight: 600, marginTop: "2px" }}>
                  {formatDateTimeRange(viewingVisit.scheduled_start, viewingVisit.scheduled_end)}
                </div>
              </div>

              {viewingVisit.buyer_feedback && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" }}>Buyer Feedback</div>
                  <p style={{ margin: "4px 0 0", color: "#334155", background: "rgba(100,116,139,0.06)", padding: "10px 12px", borderRadius: "6px" }}>
                    {viewingVisit.buyer_feedback}
                  </p>
                </div>
              )}

              {viewingVisit.cancellation_reason && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#ef4444" }}>Cancellation Reason</div>
                  <p style={{ margin: "4px 0 0", color: "#991b1b", background: "#fee2e2", padding: "10px 12px", borderRadius: "6px" }}>
                    {viewingVisit.cancellation_reason}
                  </p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setViewingVisit(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
