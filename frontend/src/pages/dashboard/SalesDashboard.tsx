import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getLeads } from "../../services/leadService";
import { getMyTasks } from "../../services/activityService";
import { getUsers } from "../../services/userService";
import type { Lead } from "../../types/lead";
import type { Activity } from "../../types/activity";
import type { User } from "../../types/user";
import LeadFormModal from "../../components/leads/LeadFormModal";
import LeadViewModal from "../../components/leads/LeadViewModal";
import ActivityViewModal from "../../components/activities/ActivityViewModal";
import { formatDateTime } from "../../utils/dateFormatter";
import { normalizeIndustry } from "../../utils/industryUtils";
import "./RealEstateDashboard.css";

export default function SalesDashboard() {
  const [user, setUser] = useState<{ name: string; role: string; permissions?: any[] } | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [viewTask, setViewTask] = useState<Activity | null>(null);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const navigate = useNavigate();
  const { industry } = useParams();

  const tenantStr = sessionStorage.getItem("tenant");
  let tenantIndustry = "real-estate";
  if (tenantStr) {
    try {
      const t = JSON.parse(tenantStr);
      if (t?.industry) tenantIndustry = normalizeIndustry(t.industry);
    } catch(e) {}
  }
  const currentIndustry = normalizeIndustry(industry || tenantIndustry);
  const basePath = `/${currentIndustry}`;

  useEffect(() => {
    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        let perms: any[] = [];
        if (Array.isArray(parsed.permissions)) perms = parsed.permissions;
        else if (parsed.role && Array.isArray(parsed.role.permissions)) perms = parsed.role.permissions;
        else if (Array.isArray(parsed.role_permissions)) perms = parsed.role_permissions;
        
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "User",
          role: parsed.role || "Sales User",
          permissions: perms
        });
      } catch (e) {
        setUser({ name: "User", role: "Sales User", permissions: [] });
      }
    } else {
      setUser({ name: "User", role: "Sales User", permissions: [] });
    }

    getLeads()
      .then((data) => setLeads(data || []))
      .catch(() => setLeads([]))
      .finally(() => setLoadingLeads(false));

    getMyTasks()
      .then((data) => setTasks(data || []))
      .catch(() => setTasks([]))
      .finally(() => setLoadingTasks(false));

    getUsers()
      .then((data) => setUsers(data || []))
      .catch(() => {});
  }, []);

  // Real-time refresh when tasks/leads are created elsewhere
  useEffect(() => {
    const handleUpdate = () => {
      getMyTasks().then((data) => setTasks(data || [])).catch(() => {});
      getLeads().then((data) => setLeads(data || [])).catch(() => {});
    };
    window.addEventListener("crm:activity-updated", handleUpdate);
    return () => window.removeEventListener("crm:activity-updated", handleUpdate);
  }, []);

  const hasPermission = (perm: string) => {
    if (!user) return false;
    const perms = user.permissions || [];
    return perms.some(p => {
      if (typeof p === 'string') return p.toLowerCase() === perm.toLowerCase();
      if (p && typeof p === 'object' && (p as any).name) return (p as any).name.toLowerCase() === perm.toLowerCase();
      return false;
    });
  };

  const renderTaskDueDate = (dueDate?: string | null) => {
    if (!dueDate) return <span className="task-empty-cell">—</span>;
    const formatted = formatDateTime(dueDate);
    if (formatted === "—") return <span className="task-empty-cell">—</span>;
    const parts = formatted.split(", ");
    if (parts.length === 2) {
      return (
        <div className="task-date-cell">
          <span className="task-date-main">{parts[0]}</span>
          <span className="task-date-sub">{parts[1]}</span>
        </div>
      );
    }
    return <span className="task-date-main">{formatted}</span>;
  };

  return (
    <div className="real-estate-dashboard">
      <div className="welcome-section">
        <h1>Welcome back, {user?.name}!</h1>
        <p className="text-muted">Here is your sales overview and today's activities.</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card blue">
          <div className="kpi-info">
            <h4 className="kpi-title">My Leads</h4>
            <div className="kpi-value">{loadingLeads ? "..." : leads.length}</div>
          </div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-info">
            <h4 className="kpi-title">New Leads</h4>
            <div className="kpi-value">{loadingLeads ? "..." : leads.filter(l => l.status === 'New').length}</div>
          </div>
        </div>
        <div className="kpi-card orange">
          <div className="kpi-info">
            <h4 className="kpi-title">Tasks Due Today</h4>
            <div className="kpi-value">
              {loadingTasks
                ? "..."
                : tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled").length}
            </div>
          </div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-info">
            <h4 className="kpi-title">Open Deals</h4>
            <div className="kpi-value">-</div>
          </div>
        </div>
        <div className="kpi-card teal">
          <div className="kpi-info">
            <h4 className="kpi-title">Deals Won</h4>
            <div className="kpi-value">-</div>
          </div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-info">
            <h4 className="kpi-title">Deal Value</h4>
            <div className="kpi-value">-</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="grid-main">
          
          <div className="dashboard-section-card">
            <div className="section-header">
              <h3>Lead Pipeline</h3>
            </div>
            <div className="pipeline-container" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', overflowX: 'auto' }}>
               <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                  <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>New</h4>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
               </div>
               <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                  <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Contacted</h4>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
               </div>
               <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                  <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Qualified</h4>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
               </div>
               <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                  <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Negotiation</h4>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
               </div>
               <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                  <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Closed</h4>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
               </div>
            </div>
          </div>

          <div className="dashboard-section-card today-tasks-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-header today-tasks-header">
              <h3 className="today-tasks-title">Today's Tasks</h3>
              <Link to={`${basePath}/activities`} className="view-all-link today-tasks-view-all">
                View All Activities →
              </Link>
            </div>
            {hasPermission("task.view") || hasPermission("activity.view") || true ? (
              <div className="table-responsive today-tasks-table-responsive">
                <table className="today-tasks-table roles-table">
                  <thead>
                    <tr>
                      <th className="tasks-col-due-date">Due Date</th>
                      <th className="tasks-col-title">Task Title</th>
                      <th className="tasks-col-lead">Related Lead</th>
                      <th className="tasks-col-priority">Priority</th>
                      <th className="tasks-col-status">Status</th>
                      <th className="tasks-col-action">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTasks ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted" style={{ padding: '2rem' }}>
                          Loading tasks...
                        </td>
                      </tr>
                    ) : tasks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted" style={{ padding: '2rem' }}>
                          No tasks scheduled.
                        </td>
                      </tr>
                    ) : (
                      tasks.slice(0, 8).map((task) => {
                        const relatedLead = leads.find((l) => l.id === task.lead_id);
                        return (
                          <tr key={task.id} className="today-tasks-row">
                            <td className="tasks-col-due-date">
                              {renderTaskDueDate(task.due_date)}
                            </td>
                            <td className="tasks-col-title">
                              <div className="task-title-cell">
                                <button
                                  type="button"
                                  className="task-title-btn"
                                  onClick={() => setViewTask(task)}
                                  title="Click to view task details"
                                >
                                  {task.title}
                                </button>
                              </div>
                            </td>
                            <td className="tasks-col-lead">
                              <div className="task-lead-cell">
                                {relatedLead ? (
                                  <button
                                    type="button"
                                    className="task-lead-btn"
                                    onClick={() => setViewLead(relatedLead)}
                                    title={`Click to view lead: ${relatedLead.full_name}`}
                                  >
                                    {relatedLead.full_name}
                                  </button>
                                ) : task.lead_id ? (
                                  <span className="task-lead-muted">Lead #{task.lead_id.slice(0, 8)}</span>
                                ) : (
                                  <span className="task-empty-cell">—</span>
                                )}
                              </div>
                            </td>
                            <td className="tasks-col-priority">
                              <span
                                className={`task-badge priority-badge priority-${(task.priority || 'medium').toLowerCase()}`}
                              >
                                {task.priority || 'Medium'}
                              </span>
                            </td>
                            <td className="tasks-col-status">
                              <span
                                className={`task-badge status-badge status-${(task.status || 'pending').toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                {task.status || 'Pending'}
                              </span>
                            </td>
                            <td className="tasks-col-action">
                              <button
                                type="button"
                                className="task-action-view-btn"
                                onClick={() => setViewTask(task)}
                                aria-label={`View task details for ${task.title}`}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 You do not have permission to view tasks.
              </div>
            )}
          </div>

          <div className="dashboard-section-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h3>My Recent Leads</h3>
            </div>
            {hasPermission("lead.view") ? (
              <div className="table-responsive" style={{ overflowX: 'auto' }}>
                <table className="roles-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '10px 12px', minWidth: '130px', textAlign: 'left' }}>Lead Name</th>
                      <th style={{ padding: '10px 12px', minWidth: '90px', textAlign: 'left' }}>Account</th>
                      <th style={{ padding: '10px 12px', minWidth: '220px', textAlign: 'left' }}>Contact</th>
                      <th style={{ padding: '10px 12px', minWidth: '90px', textAlign: 'left' }}>Stage</th>
                      <th style={{ padding: '10px 12px', minWidth: '90px', textAlign: 'left' }}>Priority</th>
                      <th style={{ padding: '10px 12px', minWidth: '120px', textAlign: 'left' }}>Next Task</th>
                      <th style={{ padding: '10px 12px', minWidth: '190px', textAlign: 'left' }}>Updated</th>
                      <th style={{ padding: '10px 12px', minWidth: '80px', textAlign: 'left' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingLeads ? (
                      <tr>
                        <td colSpan={8} className="text-center text-muted" style={{ padding: '2rem' }}>
                          Loading...
                        </td>
                      </tr>
                    ) : leads.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center text-muted" style={{ padding: '2rem' }}>
                          No leads found.
                        </td>
                      </tr>
                    ) : (
                      leads.slice(0, 5).map((lead) => (
                        <tr key={lead.id}>
                          <td style={{ padding: '10px 12px' }}>{lead.full_name || "Unknown"}</td>
                          <td style={{ padding: '10px 12px' }}>-</td>
                          <td style={{ padding: '10px 12px', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={lead.email}>
                            {lead.email}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span className={`status-badge ${lead.status?.toLowerCase() === 'new' ? 'active' : 'inactive'}`}>{lead.status}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>-</td>
                          <td style={{ padding: '10px 12px' }}>-</td>
                          <td style={{ padding: '10px 12px' }}>
                            {lead.updated_at ? formatDateTime(lead.updated_at) : (lead.created_at ? formatDateTime(lead.created_at) : "N/A")}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <Link to={`${basePath}/leads/${lead.id}`} className="view-all-link">View</Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 You do not have permission to view leads.
              </div>
            )}
          </div>

          <div className="dashboard-section-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h3>My Recent Deals</h3>
            </div>
            {hasPermission("deal.view") ? (
              <div className="table-responsive">
                <table className="roles-table">
                  <thead>
                    <tr>
                      <th>Deal Name</th>
                      <th>Account</th>
                      <th>Stage</th>
                      <th>Amount</th>
                      <th>Expected Close</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={7} className="text-center text-muted" style={{ padding: '2rem' }}>
                        No active deals.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 You do not have permission to view deals.
              </div>
            )}
          </div>
        </div>

        <div className="grid-side">
          <div className="dashboard-section-card">
            <div className="section-header">
              <h3>My Performance</h3>
            </div>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
             
            </div>
          </div>

          <div className="dashboard-section-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h3>Quick Actions</h3>
            </div>
            <div className="quick-actions-list" style={{ padding: '1rem' }}>
              {hasPermission("lead.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setIsLeadFormOpen(true)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Lead
                </button>
              )}
              {hasPermission("contact.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate(`${basePath}/contacts`)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Add Contact
                </button>
              )}
              {hasPermission("account.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate(`${basePath}/accounts`)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Account
                </button>
              )}
              {hasPermission("deal.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate(`${basePath}/deals`)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Deal
                </button>
              )}
              {hasPermission("task.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate(`${basePath}/tasks`)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Task
                </button>
              )}

              {(!hasPermission("lead.create") && !hasPermission("contact.create") && !hasPermission("account.create") && !hasPermission("deal.create") && !hasPermission("task.create")) && (
                 <p className="text-muted" style={{ textAlign: 'center', margin: 0 }}>No quick actions available.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isLeadFormOpen && (
        <LeadFormModal
          onClose={() => setIsLeadFormOpen(false)}
          onSuccess={(savedLead) => {
            setIsLeadFormOpen(false);
            setLeads(prev => [savedLead, ...prev]);
            getMyTasks().then(setTasks).catch(() => {});
          }}
        />
      )}

      {viewTask && (
        <ActivityViewModal
          activity={viewTask}
          users={users}
          leads={leads}
          contacts={[]}
          accounts={[]}
          deals={[]}
          onViewLead={(lead) => {
            setViewTask(null);
            setViewLead(lead);
          }}
          onClose={() => setViewTask(null)}
        />
      )}

      {viewLead && (
        <LeadViewModal
          lead={viewLead}
          users={users}
          onClose={() => setViewLead(null)}
          onEdit={() => setViewLead(null)}
        />
      )}
    </div>
  );
}
