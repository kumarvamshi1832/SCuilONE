import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMyProfile } from "../../services/profileService";
import RealEstateOverview from "../../components/dashboard/RealEstateOverview";
import RecentUsers from "../../components/dashboard/RecentUsers";
import { getDashboardSummary, getRecentActivities } from "../../services/dashboardService";
import { getUsers } from "../../services/userService";
import { DashboardSummary, Activity } from "../../types/dashboard";
import { User } from "../../types/user";
import LeadFormModal from "../../components/leads/LeadFormModal";
import DashboardCharts from "../../components/dashboard/DashboardCharts";
import { normalizeIndustry } from "../../utils/industryUtils";
import "./RealEstateDashboard.css";

export default function RealEstateDashboard() {
  const navigate = useNavigate();
  const { industry } = useParams();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [profileName, setProfileName] = useState("");

  const getBasePath = () => {
    if (industry) return `/${normalizeIndustry(industry)}`;
    const tenantStr = sessionStorage.getItem("tenant");
    if (tenantStr) {
      try {
        const t = JSON.parse(tenantStr);
        if (t?.industry) return `/${normalizeIndustry(t.industry)}`;
      } catch (e) {}
    }
    return "/real-estate";
  };

  const basePath = getBasePath();

  useEffect(() => {
    const refreshSummary = () => {
      getDashboardSummary().then(setSummary);
      getRecentActivities().then(setActivities);
    };

    refreshSummary();
    getUsers().then(setUsers);

    window.addEventListener("crm:activity-updated", refreshSummary);

    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "User",
          role: parsed.role || "Tenant Admin",
        });
      } catch (e) {
        setUser({ name: "User", role: "Tenant Admin" });
      }
    } else {
      setUser({ name: "User", role: "Tenant Admin" });
    }

    return () => {
      window.removeEventListener("crm:activity-updated", refreshSummary);
    };
  }, []);

  useEffect(() => {
    getMyProfile()
      .then((profile) => setProfileName(profile.full_name || "User"))
      .catch((error) => console.error("Failed to load profile:", error));
  }, []);

  return (
    <div className="real-estate-dashboard">
      <div className="welcome-section">
        <h1>Welcome back, {profileName || user?.name || "User"}!</h1>
        <p className="text-muted">Here's an overview of your company activity.</p>
      </div>

      {/* ─── 1. KPI Cards Row ─── */}
      <RealEstateOverview summary={summary} />

      {/* ─── 2. Top Analytics Section: Lead Status, Deals by Stage, Task Overview ─── */}
      {summary && <DashboardCharts summary={summary} />}

      {/* ─── 3. Middle Section: Recent Users (Left) + Quick Actions (Right) ─── */}
      <div className="dashboard-users-actions-grid">
        <div className="dashboard-users-col">
          <RecentUsers users={users} />
        </div>

        <div className="dashboard-actions-col">
          <div className="dashboard-section-card quick-actions-card">
            <div className="section-header">
              <h3>Quick Actions</h3>
            </div>
            <div className="quick-actions-list">
              <button
                type="button"
                className="btn-quick-action"
                onClick={() => navigate(`${basePath}/properties`)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Add New Property</span>
              </button>
              <button
                type="button"
                className="btn-quick-action"
                onClick={() => setIsLeadFormOpen(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Create Lead</span>
              </button>
              <button
                type="button"
                className="btn-quick-action"
                onClick={() => navigate(`${basePath}/tasks`)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Schedule Visit</span>
              </button>
              <button
                type="button"
                className="btn-quick-action outline"
                onClick={() => navigate(`${basePath}/reports`)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 20V10 M12 20V4 M6 20v-4" />
                </svg>
                <span>View Reports</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4. Bottom Section: Real Estate Activity (Compact Full-Width Card) ─── */}
      <div className="dashboard-activity-section">
        <div className="dashboard-section-card activity-section-card">
          <div className="section-header">
            <h3>Real Estate Activity</h3>
          </div>
          <div className="activity-list-container">
            {activities.length === 0 ? (
              <div className="activity-empty-state">
                <p>No recent activity found.</p>
              </div>
            ) : (
              <div className="activity-list">
                {activities.map((act) => (
                  <div key={act.id} className="activity-item">
                    <div className="activity-dot"></div>
                    <div className="activity-content">
                      <p className="activity-desc">{act.description}</p>
                      <span className="activity-time">{act.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lead Form Modal */}
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
