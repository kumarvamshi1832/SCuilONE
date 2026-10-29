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

  const hasPermission = (permission: string): boolean => {
    const userStr = sessionStorage.getItem("user");
    if (!userStr) return true;
    try {
      const storedUser = JSON.parse(userStr);
      const roleName = String(storedUser.role?.name || storedUser.role || "").toUpperCase();
      if (
        roleName.includes("OWNER") ||
        roleName.includes("ADMIN") ||
        roleName.includes("MANAGER")
      ) {
        return true;
      }
      let permissions: any[] = [];
      if (Array.isArray(storedUser.permissions)) {
        permissions = storedUser.permissions;
      } else if (storedUser.role && Array.isArray(storedUser.role.permissions)) {
        permissions = storedUser.role.permissions;
      } else if (Array.isArray(storedUser.role_permissions)) {
        permissions = storedUser.role_permissions;
      }
      if (permissions.length === 0) return true;
      return permissions.some((item) => {
        if (typeof item === "string") {
          return item.toLowerCase() === permission.toLowerCase();
        }
        if (item && typeof item === "object" && typeof item.name === "string") {
          return item.name.toLowerCase() === permission.toLowerCase();
        }
        return false;
      });
    } catch {
      return true;
    }
  };

  const canCreateProperty = hasPermission("property.create");
  const canCreateLead = hasPermission("lead.create");
  const canScheduleVisit = hasPermission("visit.create") || hasPermission("activity.create");
  const canViewBookings = hasPermission("booking.view");
  const canViewReports = hasPermission("report.view");

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
      .then((profile) => setProfileName(profile.full_name || ""))
      .catch((error) => console.error("Failed to load profile:", error));
  }, []);

  useEffect(() => {
    const contentEl = document.querySelector(".dashboard-content");
    if (contentEl) {
      contentEl.classList.add("dashboard-content-real-estate");
      contentEl.classList.add("dashboard-content-slate-navy");
      return () => {
        contentEl.classList.remove("dashboard-content-real-estate");
        contentEl.classList.remove("dashboard-content-slate-navy");
      };
    }
  }, []);

  const currentDateFormatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="real-estate-dashboard">
      {/* ─── Dashboard Heading ─── */}
      <div className="welcome-section">
        <div className="welcome-text-group">
          <h1>Welcome back, {profileName || user?.name || "User"}!</h1>
          <p className="text-muted">Here's an overview of your real estate business.</p>
        </div>
        <div className="welcome-date-badge">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>{currentDateFormatted}</span>
        </div>
      </div>


      {/* ─── B, C, D. Primary, Secondary & Operational KPI Cards ─── */}
      <RealEstateOverview summary={summary} />

      {/* ─── E, F, G. Lead Status, Deals by Stage, Task Overview Charts ─── */}
      {summary && <DashboardCharts summary={summary} />}

      {/* ─── H, I. Recent Users (Left) + Quick Actions (Right) ─── */}
      <div className="dashboard-users-actions-grid">
        <div className="dashboard-users-col">
          <RecentUsers users={users} />
        </div>

        <div className="dashboard-actions-col">
          <div className="dashboard-section-card quick-actions-card">
            <div className="section-header">
              <h3 className="section-title">Quick Actions</h3>
            </div>
            <div className="quick-actions-list">
              {canCreateProperty && (
                <button
                  type="button"
                  className="btn-quick-action primary"
                  onClick={() => navigate(`${basePath}/properties`)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span>Add New Property</span>
                </button>
              )}

              {canCreateLead && (
                <button
                  type="button"
                  className="btn-quick-action primary"
                  onClick={() => setIsLeadFormOpen(true)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span>Create Lead</span>
                </button>
              )}

              {canScheduleVisit && (
                <button
                  type="button"
                  className="btn-quick-action primary"
                  onClick={() => navigate(`${basePath}/site-visits`)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <path d="M12 14v4M10 16h4" />
                  </svg>
                  <span>Schedule Visit</span>
                </button>
              )}

              {canViewBookings && (
                <button
                  type="button"
                  className="btn-quick-action outline"
                  onClick={() => navigate(`${basePath}/bookings`)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span>View Bookings</span>
                </button>
              )}

              {canViewReports && (
                <button
                  type="button"
                  className="btn-quick-action outline"
                  onClick={() => navigate(`${basePath}/reports`)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 20V10 M12 20V4 M6 20v-4" />
                  </svg>
                  <span>View Reports</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── J. Bottom Section: Real Estate Activity (Compact Full-Width Card) ─── */}
      <div className="dashboard-activity-section">
        <div className="dashboard-section-card activity-section-card">
          <div className="section-header">
            <h3 className="section-title">Real Estate Activity</h3>
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
                    <div className="activity-dot" />
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
            getDashboardSummary().then(setSummary);
            getRecentActivities().then(setActivities);
          }}
        />
      )}
    </div>
  );
}
