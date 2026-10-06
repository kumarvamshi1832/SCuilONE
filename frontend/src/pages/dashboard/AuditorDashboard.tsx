import { useEffect, useState } from "react";
import RecentUsers from "../../components/dashboard/RecentUsers";
import { getDashboardSummary, getRecentActivities } from "../../services/dashboardService";
import { getUsers } from "../../services/userService";
import { DashboardSummary, Activity } from "../../types/dashboard";
import { User } from "../../types/user";
import LeadFormModal from "../../components/leads/LeadFormModal";
// import type { Lead } from "../../types/lead";
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
  } catch (e) {}
  return false;
};

export default function AuditorDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);

  useEffect(() => {
    getDashboardSummary().then(setSummary);
    getRecentActivities().then(setActivities);
    if (hasPermission("user.view")) {
      getUsers().then(setUsers);
    }

    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "User",
          role: parsed.role || "Auditor",
        });
      } catch (e) {
        setUser({ name: "User", role: "Auditor" });
      }
    } else {
      setUser({ name: "User", role: "Auditor" });
    }
  }, []);

  return (
    <div className="real-estate-dashboard">
      <div className="welcome-section">
        <h1>Welcome back, {user?.name}!</h1>
        <p className="text-muted">View CRM data and reports with read-only access.</p>
      </div>

      <div className="kpi-grid">
        {hasPermission("property.view") && (
          <div className="kpi-card blue">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Total Properties</h4>
              <div className="kpi-value">{summary?.totalProperties === -1 ? "-" : summary?.totalProperties}</div>
            </div>
          </div>
        )}

        {hasPermission("lead.view") && (
          <div className="kpi-card orange">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Total Leads</h4>
              <div className="kpi-value">{summary?.totalLeads === -1 ? "-" : summary?.totalLeads}</div>
            </div>
          </div>
        )}

        {hasPermission("deal.view") && (
          <div className="kpi-card purple">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Open Deals</h4>
              <div className="kpi-value">{summary?.openDeals === -1 ? "-" : summary?.openDeals}</div>
            </div>
          </div>
        )}

        {hasPermission("visit.view") && (
          <div className="kpi-card teal">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Site Visits</h4>
              <div className="kpi-value">{summary?.siteVisits === -1 ? "-" : summary?.siteVisits}</div>
            </div>
          </div>
        )}

        {hasPermission("booking.view") && (
          <div className="kpi-card red">
            <div className="kpi-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <div className="kpi-info">
              <h4 className="kpi-title">Bookings</h4>
              <div className="kpi-value">{summary?.bookings === -1 ? "-" : summary?.bookings}</div>
            </div>
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="grid-main">
          {hasPermission("user.view") && (
            <RecentUsers users={users} />
          )}

          <div className="dashboard-section-card mt-4">
            <div className="section-header">
              <h3>Recent System Activities</h3>
            </div>
            <div className="activity-list">
              {activities.length > 0 ? (
                activities.map((act) => (
                  <div key={act.id} className="activity-item">
                    <div className="activity-dot"></div>
                    <div className="activity-content">
                      <p className="activity-desc">{act.description}</p>
                      <span className="activity-time">{act.timestamp}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted" style={{ textAlign: "center", padding: "1rem" }}>No recent activity available.</p>
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
              {hasPermission("property.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Add New Property
                </button>
              )}
              {hasPermission("lead.create") && (
                <button className="btn-quick-action" onClick={() => setIsLeadFormOpen(true)} style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Lead
                </button>
              )}
              {hasPermission("visit.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Schedule Visit
                </button>
              )}
              {hasPermission("report.view") && (
                <button className="btn-quick-action outline" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-4"></path></svg>
                  View Reports
                </button>
              )}

              {(!hasPermission("property.create") && !hasPermission("lead.create") && !hasPermission("visit.create") && !hasPermission("report.view")) && (
                <p className="text-muted" style={{ textAlign: "center", margin: 0 }}>No actions available.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isLeadFormOpen && (
        <LeadFormModal
          onClose={() => setIsLeadFormOpen(false)}
          onSuccess={() => {
  setIsLeadFormOpen(false);
}}
        />
      )}
    </div>
  );
}
