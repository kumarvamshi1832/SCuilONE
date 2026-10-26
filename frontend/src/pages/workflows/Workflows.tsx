
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  getLeads,
  updateLead,
  getLeadAssignmentHistory,
  type LeadAssignmentHistoryItem,
} from "../../services/leadService";
import { getUsers } from "../../services/userService";
import type { Lead } from "../../types/lead";
import type { User } from "../../types/user";
import "./Workflows.css";
import WorkflowAutomation from "./WorkflowAutomation";

const MAX_ACTIVE_LEADS = 5;
const ACTIVE_STATUSES = ["New", "Contacted", "Qualified"];
const HISTORY_PAGE_SIZE = 10;

type LoadState = "loading" | "success" | "error";

export default function Workflows() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedSalespersonId, setSelectedSalespersonId] = useState("");
  const [overrideCapacity, setOverrideCapacity] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [assignmentError, setAssignmentError] = useState("");

  const [history, setHistory] = useState<LeadAssignmentHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage("");

    try {
      const [leadData, userData] = await Promise.all([
        getLeads(),
        getUsers(),
      ]);

      setLeads(leadData);
      setUsers(userData);
      setLoadState("success");
    } catch (error) {
      console.error("Failed to load workflow data:", error);
      setErrorMessage(
        "Unable to load workflow data. Check your connection and permissions, then try again."
      );
      setLoadState("error");
    }
  }, []);

  const loadAssignmentHistory = useCallback(async (page: number) => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const result = await getLeadAssignmentHistory(
        page,
        HISTORY_PAGE_SIZE
      );

      setHistory(result.items);
      setHistoryTotal(result.total);
      setHistoryTotalPages(result.total_pages);
      setHistoryPage(result.page);
    } catch (error) {
      console.error("Failed to load assignment history:", error);
      setHistoryError(
        "Unable to load assignment history. Check your permissions or try again."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadAssignmentHistory(1);
  }, [loadAssignmentHistory]);

  const salesUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.role?.toLowerCase().replace(/_/g, " ") === "sales user"
      ),
    [users]
  );

  const activeLeads = useMemo(
    () => leads.filter((lead) => ACTIVE_STATUSES.includes(lead.status)),
    [leads]
  );

  const unassignedLeads = useMemo(
    () => activeLeads.filter((lead) => !lead.assigned_to),
    [activeLeads]
  );

  const workloads = useMemo(
    () =>
      salesUsers.map((user) => {
        const assignedLeads = activeLeads.filter(
          (lead) => lead.assigned_to === user.id
        );

        const count = assignedLeads.length;
        const remaining = Math.max(0, MAX_ACTIVE_LEADS - count);

        return {
          user,
          count,
          remaining,
          percentage: Math.min(100, (count / MAX_ACTIVE_LEADS) * 100),
          isFull: count >= MAX_ACTIVE_LEADS,
        };
      }),
    [salesUsers, activeLeads]
  );

  const totalCapacity = salesUsers.length * MAX_ACTIVE_LEADS;

  const assignedActiveLeads = activeLeads.filter(
    (lead) => Boolean(lead.assigned_to)
  ).length;

  const availableSlots = workloads.reduce(
    (total, workload) => total + workload.remaining,
    0
  );

  const fullSalespeople = workloads.filter(
    (workload) => workload.isFull
  ).length;

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId);

  const targetWorkload = workloads.find(
    (workload) => workload.user.id === selectedSalespersonId
  );

  const handleAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setAssignmentMessage("");
    setAssignmentError("");

    if (!selectedLeadId || !selectedSalespersonId) {
      setAssignmentError("Select a lead and a salesperson.");
      return;
    }

    if (!selectedLead) {
      setAssignmentError("The selected lead could not be found.");
      return;
    }

    if (selectedLead.assigned_to === selectedSalespersonId) {
      setAssignmentError(
        "This lead is already assigned to that salesperson."
      );
      return;
    }

    if (!targetWorkload) {
      setAssignmentError("Select a valid salesperson.");
      return;
    }

    if (overrideCapacity && !overrideReason.trim()) {
      setAssignmentError("Enter a reason for the capacity override.");
      return;
    }

    const leadCountsTowardCapacity = ACTIVE_STATUSES.includes(
      selectedLead.status
    );

    const targetCountAfterAssignment =
      targetWorkload.count -
      (leadCountsTowardCapacity &&
      selectedLead.assigned_to === selectedSalespersonId
        ? 1
        : 0);

    if (
      leadCountsTowardCapacity &&
      targetCountAfterAssignment >= MAX_ACTIVE_LEADS &&
      !overrideCapacity
    ) {
      setAssignmentError(
        "This salesperson has reached the five-active-lead limit. An authorized manager override is required."
      );
      return;
    }

    setAssignmentLoading(true);

    try {
      await updateLead(selectedLeadId, {
        assigned_to: selectedSalespersonId,
        override_capacity: overrideCapacity,
        override_reason: overrideCapacity ? overrideReason.trim() : null,
      });

      setAssignmentMessage("Lead assigned successfully.");
      setSelectedLeadId("");
      setSelectedSalespersonId("");
      setOverrideCapacity(false);
      setOverrideReason("");

      await Promise.all([
        loadData(),
        loadAssignmentHistory(1),
      ]);
    } catch (error: unknown) {
      const apiError = error as {
        response?: {
          data?: {
            detail?: string | { msg?: string }[];
            message?: string;
          };
        };
        message?: string;
      };

      const detail = apiError.response?.data?.detail;

      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((item) => item.msg || "Invalid input").join(", ")
            : apiError.response?.data?.message ||
              apiError.message ||
              "Unable to assign the lead.";

      setAssignmentError(message);
    } finally {
      setAssignmentLoading(false);
    }
  };

  const formatDate = (date: string) => {
    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "—";
    }

    return parsedDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTime = (date: string) => {
    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "—";
    }

    return parsedDate.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="workflows-page">
      <div className="workflows-heading">
        <div>
          <div className="workflows-eyebrow">SALES OPERATIONS</div>
          <h1>Workflow Overview</h1>
          <p>
            Monitor lead distribution, salesperson capacity, and assignment
            workload across your team.
          </p>
        </div>

        <button
          className="workflow-refresh"
          onClick={() => {
            void loadData();
            void loadAssignmentHistory(historyPage);
          }}
          disabled={loadState === "loading" || assignmentLoading}
        >
          <span className={loadState === "loading" ? "workflow-spin" : ""}>
            ↻
          </span>
          Refresh
        </button>
      </div>

      {loadState === "error" && (
        <div className="workflow-alert" role="alert">
          <div>
            <strong>Couldn't load workflow data</strong>
            <p>{errorMessage}</p>
          </div>
          <button onClick={() => void loadData()}>Try again</button>
        </div>
      )}

      {loadState === "loading" && (
        <div className="workflow-loading" role="status">
          Loading your workflow data...
        </div>
      )}

      {loadState === "success" && (
        <>
          <div className="workflow-metrics">
            <article className="workflow-metric">
              <div className="workflow-metric-top">
                <span>Active Salespeople</span>
                <span className="workflow-metric-icon blue">♙</span>
              </div>
              <strong>{salesUsers.length}</strong>
              <p>Users with the Sales User role</p>
            </article>

            <article className="workflow-metric">
              <div className="workflow-metric-top">
                <span>Active Leads</span>
                <span className="workflow-metric-icon purple">↗</span>
              </div>
              <strong>{activeLeads.length}</strong>
              <p>New, contacted, and qualified leads</p>
            </article>

            <article className="workflow-metric">
              <div className="workflow-metric-top">
                <span>Unassigned Leads</span>
                <span className="workflow-metric-icon orange">◷</span>
              </div>
              <strong>{unassignedLeads.length}</strong>
              <p>Active leads without an assignee</p>
            </article>

            <article className="workflow-metric">
              <div className="workflow-metric-top">
                <span>Available Slots</span>
                <span className="workflow-metric-icon green">✓</span>
              </div>
              <strong>{availableSlots}</strong>
              <p>Remaining capacity across the team</p>
            </article>
          </div>

          <div className="workflow-main-grid">
            <section className="workflow-panel">
              <div className="workflow-panel-heading">
                <div>
                  <h2>Salesperson Workload</h2>
                  <p>Active leads compared with the five-lead limit</p>
                </div>
                <span className="workflow-count">
                  {workloads.length} users
                </span>
              </div>

              {workloads.length === 0 ? (
                <div className="workflow-empty">
                  <span>♙</span>
                  <strong>No salespeople found</strong>
                  <p>
                    Add users with the Sales User role to see workload
                    information.
                  </p>
                </div>
              ) : (
                <div className="workflow-workload-list">
                  {workloads.map((workload) => (
                    <div className="workflow-workload" key={workload.user.id}>
                      <div className="workflow-person">
                        <div className="workflow-avatar">
                          {(workload.user.full_name || "U")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div className="workflow-person-info">
                          <strong>{workload.user.full_name}</strong>
                          <span>{workload.user.email}</span>
                        </div>

                        <div className="workflow-capacity">
                          <strong>
                            {workload.count}/{MAX_ACTIVE_LEADS}
                          </strong>
                          <span>active leads</span>
                        </div>
                      </div>

                      <div className="workflow-progress-track">
                        <div
                          className={`workflow-progress-fill ${
                            workload.isFull ? "full" : ""
                          }`}
                          style={{ width: `${workload.percentage}%` }}
                        />
                      </div>

                      <div className="workflow-workload-footer">
                        <span>
                          {workload.isFull
                            ? "Capacity reached"
                            : `${workload.remaining} slots available`}
                        </span>

                        <span
                          className={`workflow-status ${
                            workload.isFull ? "at-capacity" : "available"
                          }`}
                        >
                          {workload.isFull ? "Full" : "Available"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="workflow-panel workflow-capacity-panel">
              <div className="workflow-panel-heading">
                <div>
                  <h2>Team Capacity</h2>
                  <p>Current distribution snapshot</p>
                </div>
              </div>

              <div className="workflow-capacity-total">
                <span>Total team capacity</span>
                <strong>{totalCapacity}</strong>
                <p>{MAX_ACTIVE_LEADS} active leads per salesperson</p>
              </div>

              <div className="workflow-capacity-row">
                <span>Assigned active leads</span>
                <strong>{assignedActiveLeads}</strong>
              </div>

              <div className="workflow-capacity-row">
                <span>Unassigned active leads</span>
                <strong>{unassignedLeads.length}</strong>
              </div>

              <div className="workflow-capacity-row">
                <span>Salespeople at capacity</span>
                <strong>{fullSalespeople}</strong>
              </div>

              <div className="workflow-capacity-note">
                <span>ⓘ</span>
                <p>
                  Workload is calculated from the current lead and user API
                  responses. Assignment history shows recorded audit events.
                </p>
              </div>
            </section>
          </div>

          <section className="workflow-panel workflow-assignment-panel">
            <div className="workflow-panel-heading">
              <div>
                <h2>Lead Assignment Management</h2>
                <p>Assign or reassign leads to your sales team.</p>
              </div>
            </div>

            <div className="workflow-assignment-body">
              {assignmentMessage && (
                <div className="workflow-assignment-success" role="status">
                  {assignmentMessage}
                </div>
              )}

              {assignmentError && (
                <div className="workflow-assignment-error" role="alert">
                  {assignmentError}
                </div>
              )}

              <form
                onSubmit={handleAssignment}
                className="workflow-assignment-form"
              >
                <div className="workflow-form-field">
                  <label htmlFor="workflow-lead">Select lead</label>
                  <select
                    id="workflow-lead"
                    value={selectedLeadId}
                    onChange={(event) => setSelectedLeadId(event.target.value)}
                    required
                  >
                    <option value="">Choose a lead</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.full_name} — {lead.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="workflow-form-field">
                  <label htmlFor="workflow-salesperson">
                    Assign to salesperson
                  </label>
                  <select
                    id="workflow-salesperson"
                    value={selectedSalespersonId}
                    onChange={(event) =>
                      setSelectedSalespersonId(event.target.value)
                    }
                    required
                  >
                    <option value="">Choose a salesperson</option>
                    {workloads.map((workload) => (
                      <option
                        key={workload.user.id}
                        value={workload.user.id}
                      >
                        {workload.user.full_name} — {workload.count}/
                        {MAX_ACTIVE_LEADS}
                        {workload.isFull ? " (At capacity)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {targetWorkload && (
                  <div className="workflow-assignment-capacity">
                    <strong>
                      Current workload: {targetWorkload.count}/
                      {MAX_ACTIVE_LEADS}
                    </strong>
                    <span>
                      {targetWorkload.isFull
                        ? "Capacity reached. An authorized override may be required for an active lead."
                        : `${targetWorkload.remaining} active lead slot(s) available.`}
                    </span>
                  </div>
                )}

                <label className="workflow-override-toggle">
                  <input
                    type="checkbox"
                    checked={overrideCapacity}
                    onChange={(event) =>
                      setOverrideCapacity(event.target.checked)
                    }
                  />
                  <span>Request capacity override</span>
                </label>

                {overrideCapacity && (
                  <div className="workflow-form-field">
                    <label htmlFor="workflow-override-reason">
                      Override reason
                    </label>
                    <textarea
                      id="workflow-override-reason"
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      placeholder="Explain why this assignment is necessary"
                      rows={3}
                      required
                    />
                    <small>
                      The backend checks override permission and records the
                      reason. Users without permission will be rejected.
                    </small>
                  </div>
                )}

                <button
                  type="submit"
                  className="workflow-assign-button"
                  disabled={assignmentLoading}
                >
                  {assignmentLoading ? "Saving assignment..." : "Assign Lead"}
                </button>
              </form>
            </div>
          </section>

          <section className="workflow-panel workflow-leads-panel">
            <div className="workflow-panel-heading">
              <div>
                <h2>Unassigned Active Leads</h2>
                <p>Leads that currently have no salesperson assigned</p>
              </div>
              <span className="workflow-count">
                {unassignedLeads.length} leads
              </span>
            </div>

            {unassignedLeads.length === 0 ? (
              <div className="workflow-empty compact">
                <strong>No unassigned active leads</strong>
                <p>
                  All active leads currently have an assignee, or there are no
                  active leads.
                </p>
              </div>
            ) : (
              <div className="workflow-table-wrapper">
                <table className="workflow-table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassignedLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td>
                          <strong>{lead.full_name}</strong>
                        </td>
                        <td>{lead.email || "—"}</td>
                        <td>
                          <span
                            className={`workflow-lead-status ${lead.status
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {lead.status}
                          </span>
                        </td>
                        <td>{formatDate(lead.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="workflow-panel workflow-history-panel">
            <div className="workflow-panel-heading">
              <div>
                <h2>Assignment History</h2>
                <p>
                  Review lead reassignment and capacity override activity.
                </p>
              </div>
              <span className="workflow-count">
                {historyTotal} records
              </span>
            </div>

            {historyError && (
              <div className="workflow-assignment-error" role="alert">
                <span>{historyError}</span>
                <button
                  type="button"
                  onClick={() => void loadAssignmentHistory(historyPage)}
                >
                  Try again
                </button>
              </div>
            )}

            {historyLoading ? (
              <div className="workflow-loading" role="status">
                Loading assignment history...
              </div>
            ) : history.length === 0 ? (
              <div className="workflow-empty compact">
                <strong>No assignment history found</strong>
                <p>
                  Recorded assignment audit events will appear here when
                  available.
                </p>
              </div>
            ) : (
              <>
                <div className="workflow-table-wrapper">
                  <table className="workflow-table workflow-history-table">
                    <thead>
                      <tr>
                        <th>Lead</th>
                        <th>Previous Assignee</th>
                        <th>New Assignee</th>
                        <th>Approved By</th>
                        <th>Reason</th>
                        <th>Action</th>
                        <th>Date &amp; Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((record) => (
                        <tr key={record.id}>
                          <td>
                            <strong>
                              {record.lead_name || "Deleted lead"}
                            </strong>
                          </td>
                          <td>
                            {record.previous_assignee_name || "Unassigned"}
                          </td>
                          <td>
                            {record.new_assignee_name || "Unassigned"}
                          </td>
                          <td>{record.approved_by_name || "—"}</td>
                          <td className="workflow-history-reason">
                            {record.reason || "—"}
                          </td>
                          <td>
                            <span className="workflow-lead-status qualified">
                              {record.action.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td>{formatDateTime(record.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="workflow-history-pagination">
                  <span>
                    Page {historyPage} of {Math.max(1, historyTotalPages)}
                    {" · "}
                    {historyTotal} total records
                  </span>

                  <div>
                    <button
                      type="button"
                      className="workflow-refresh"
                      disabled={historyPage <= 1 || historyLoading}
                      onClick={() =>
                        void loadAssignmentHistory(historyPage - 1)
                      }
                    >
                      Previous
                    </button>

                    <button
                      type="button"
                      className="workflow-refresh"
                      disabled={
                        historyPage >= historyTotalPages || historyLoading
                      }
                      onClick={() =>
                        void loadAssignmentHistory(historyPage + 1)
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          <p className="workflow-footnote">
            Workload reflects current lead and user data. Assignment history
            displays recorded audit events for your tenant.
          </p>
        </>
      )}
       <WorkflowAutomation />
    </div>
  );
}
