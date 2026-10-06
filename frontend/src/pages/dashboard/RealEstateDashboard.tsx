import { useEffect, useState } from "react";
import RealEstateOverview from "../../components/dashboard/RealEstateOverview";
import RecentUsers from "../../components/dashboard/RecentUsers";
import { getDashboardSummary, getRecentActivities } from "../../services/dashboardService";
import { getUsers } from "../../services/userService";
import { DashboardSummary, Activity } from "../../types/dashboard";
import { User } from "../../types/user";
import LeadFormModal from "../../components/leads/LeadFormModal";
// import type { Lead } from "../../types/lead";
import "./RealEstateDashboard.css";

export default function RealEstateDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  
  const [user, setUser] = useState<{name: string, role: string} | null>(null);

  useEffect(() => {
    getDashboardSummary().then(setSummary);
    getRecentActivities().then(setActivities);
    getUsers().then(setUsers);
    
    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "User",
          role: parsed.role || "Tenant Admin"
        });
      } catch (e) {
        setUser({ name: "User", role: "Tenant Admin" });
      }
    } else {
      setUser({ name: "User", role: "Tenant Admin" });
    }
  }, []);

  return (
    <div className="real-estate-dashboard">
      <div className="welcome-section">
        <h1>Welcome back, {user?.name}!</h1>
        <p className="text-muted">Here's an overview of your company activity.</p>
      </div>

      <RealEstateOverview summary={summary} />

      <div className="dashboard-grid">
        <div className="grid-main">
          <RecentUsers users={users} />
          
          <div className="dashboard-section-card mt-4">
            <div className="section-header">
              <h3>Real Estate Activity</h3>
            </div>
            <div className="activity-list">
              {activities.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No recent activity found.
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
            <div className="quick-actions-list">
              <button className="btn-quick-action">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                Add New Property
              </button>
              <button className="btn-quick-action" onClick={() => setIsLeadFormOpen(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                Create Lead
              </button>
              <button className="btn-quick-action">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                Schedule Visit
              </button>
              <button className="btn-quick-action outline">
                View Reports
              </button>
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
