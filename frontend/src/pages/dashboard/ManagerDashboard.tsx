import { useEffect, useState } from "react";
import RealEstateOverview from "../../components/dashboard/RealEstateOverview";
import { getDashboardSummary, getRecentActivities } from "../../services/dashboardService";
import { DashboardSummary, Activity } from "../../types/dashboard";
import LeadFormModal from "../../components/leads/LeadFormModal";
import type { Lead } from "../../types/lead";
import "./RealEstateDashboard.css";

export default function ManagerDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);

  useEffect(() => {
    getDashboardSummary().then(setSummary);
    getRecentActivities().then(setActivities);

    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "User",
          role: parsed.role || "Manager",
        });
      } catch (e) {
        setUser({ name: "User", role: "Manager" });
      }
    } else {
      setUser({ name: "User", role: "Manager" });
    }
  }, []);

  return (
    <div className="real-estate-dashboard">
      <div className="welcome-section">
        <h1>Welcome back, {user?.name}!</h1>
        <p className="text-muted">
          Here is your Manager Overview & Operational Performance summary.
        </p>
      </div>

      <RealEstateOverview summary={summary} />

      <div className="dashboard-grid">
        <div className="grid-main">
          <div className="dashboard-section-card">
            <div className="section-header">
              <h3>Manager Activity Feed</h3>
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
              <h3>Manager Quick Actions</h3>
            </div>
            <div className="quick-actions-list">
              <button className="btn-quick-action" onClick={() => setIsLeadFormOpen(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
                Create Lead
              </button>
              <button className="btn-quick-action">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
                Schedule Site Visit
              </button>
              <button className="btn-quick-action">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
                Assign Deal
              </button>
              <button className="btn-quick-action outline">View Reports</button>
            </div>
          </div>
        </div>
      </div>
      
      {isLeadFormOpen && (
        <LeadFormModal
          onClose={() => setIsLeadFormOpen(false)}
          onSuccess={(savedLead) => {
            setIsLeadFormOpen(false);
          }}
        />
      )}
    </div>
  );
}
