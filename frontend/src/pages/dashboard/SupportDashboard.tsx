import { useEffect, useState } from "react";
import { getDashboardSummary, getRecentActivities } from "../../services/dashboardService";
import { DashboardSummary, Activity } from "../../types/dashboard";
import "./RealEstateDashboard.css";

const hasPermission = (perm: string) => {
  const userStr = sessionStorage.getItem("user");
  if (!userStr) return false;
  try {
    const u = JSON.parse(userStr);
    let perms: any[] = [];
    if (Array.isArray(u.permissions)) perms = u.permissions;
    else if (u.role && Array.isArray(u.role.permissions)) perms = u.role.permissions;
    else if (Array.isArray(u.role_permissions)) perms = u.role_permissions;

    return perms.some(p => {
      if (typeof p === 'string') return p.toLowerCase() === perm.toLowerCase();
      if (p && typeof p === 'object' && p.name) return p.name.toLowerCase() === perm.toLowerCase();
      return false;
    });
  } catch (e) { }
  return false;
};

export default function SupportDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    getDashboardSummary().then(setSummary);
    getRecentActivities().then(setActivities);

    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "User",
          role: parsed.role || "Support User",
        });
      } catch (e) {
        setUser({ name: "User", role: "Support User" });
      }
    } else {
      setUser({ name: "User", role: "Support User" });
    }
  }, []);

  return (
    <div className="real-estate-dashboard">
      <div className="welcome-section">
        <h1>Welcome back, {user?.name}!</h1>
        <p className="text-muted">Manage customer interactions and follow-ups.</p>
      </div>

      <div className="kpi-grid">
        {hasPermission("lead.view") && (
          <div className="kpi-card orange">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Leads</h4>
              <div className="kpi-value">{summary?.totalLeads === -1 ? "Unavailable" : (summary?.totalLeads || 0)}</div>
            </div>
          </div>
        )}

        {hasPermission("contact.view") && (
          <div className="kpi-card green">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Contacts</h4>
              <div className="kpi-value">-</div>
            </div>
          </div>
        )}

        {hasPermission("account.view") && (
          <div className="kpi-card blue">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Accounts</h4>
              <div className="kpi-value">-</div>
            </div>
          </div>
        )}

        {hasPermission("deal.view") && (
          <div className="kpi-card purple">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Deals</h4>
              <div className="kpi-value">{summary?.openDeals === -1 ? "-" : (summary?.openDeals || 0)}</div>
            </div>
          </div>
        )}

        {hasPermission("task.view") && (
          <div className="kpi-card teal">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Tasks</h4>
              <div className="kpi-value">-</div>
            </div>
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="grid-main">
          <div className="dashboard-section-card">
            <div className="section-header">
              <h3>Recent Support Activities</h3>
            </div>
            <div className="activity-list">
              {activities.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No recent support activities
                </div>
              ) : (
                activities.map((act) => (
                  <div key={act.id} className="activity-item">
                    <div className="activity-dot"></div>
                    <div className="activity-content">
                      <p className="activity-desc">{act.description}</p>
                      <span className="activity-time">{act.timestamp}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid-side">
          <div className="dashboard-section-card">
            <div className="section-header">
              <h3>Quick Actions</h3>
            </div>
            <div className="quick-actions-list" style={{ padding: '1rem' }}>
              {/* Contacts */}
              {hasPermission("contact.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Contact
                </button>
              )}

              {/* Accounts */}
              {hasPermission("account.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Account
                </button>
              )}

              {/* Tasks */}
              {hasPermission("task.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Task
                </button>
              )}

              {(!hasPermission("contact.create") && !hasPermission("contact.update") &&
                !hasPermission("account.create") && !hasPermission("account.update") &&
                !hasPermission("task.create") && !hasPermission("task.update")) && (
                  <p className="text-muted" style={{ textAlign: 'center', margin: 0 }}>No quick actions available.</p>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
