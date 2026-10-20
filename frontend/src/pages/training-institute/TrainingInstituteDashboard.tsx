import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import {
  trainingDashboardStats,
  enrollmentTrendData,
  courseDistributionData,
  upcomingBatches,
  upcomingDemos,
  recentTrainingLeads,
  RecentTrainingLead
} from "../../data/trainingInstituteMockData";
import { useTheme } from "../../context/ThemeContext";
import LeadFormModal from "../../components/leads/LeadFormModal";
import heroImg from "../../assets/training_hero.jpg";
import promoImg from "../../assets/training_promo.jpg";
import "./TrainingInstituteDashboard.css";

interface KpiCardProps {
  title: string;
  value: number | string;
  trend?: string;
  colorClass?: string;
  icon: JSX.Element;
}

function KpiCard({ title, value, trend, colorClass = "indigo", icon }: KpiCardProps) {
  return (
    <div className={`ti-kpi-card ${colorClass}`}>
      <div className="ti-kpi-icon-wrapper">{icon}</div>
      <div className="ti-kpi-info">
        <h4 className="ti-kpi-title">{title}</h4>
        <div className="ti-kpi-value">{value}</div>
        {trend && <div className="ti-kpi-trend">{trend}</div>}
      </div>
    </div>
  );
}

const getInitials = (name: string) => {
  return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
};

export default function TrainingInstituteDashboard() {
  const { theme } = useTheme();

  // Multi-source reactive dark mode detector to guarantee synchronization
  const [effectiveTheme, setEffectiveTheme] = useState<string>(() => {
    if (typeof document !== "undefined") {
      const isBodyDark = document.body.classList.contains("dark") || document.body.className.includes("dark");
      const isHtmlDark = document.documentElement.classList.contains("dark") || document.documentElement.className.includes("dark");
      const isWrapperDark = !!document.querySelector(".dashboard-wrapper.dark");
      if (theme === "dark" || isBodyDark || isHtmlDark || isWrapperDark) return "dark";
    }
    return theme || "light";
  });

  useEffect(() => {
    const checkDark = () => {
      const isBodyDark = document.body.classList.contains("dark") || document.body.className.includes("dark");
      const isHtmlDark = document.documentElement.classList.contains("dark") || document.documentElement.className.includes("dark");
      const isWrapperDark = !!document.querySelector(".dashboard-wrapper.dark");
      const currentDark = theme === "dark" || isBodyDark || isHtmlDark || isWrapperDark;
      setEffectiveTheme(currentDark ? "dark" : "light");
    };

    checkDark();

    const observer = new MutationObserver(checkDark);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, [theme]);

  const isDark = effectiveTheme === "dark";

  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [leadsList, setLeadsList] = useState<RecentTrainingLead[]>(recentTrainingLeads);
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "User",
          role: parsed.role || "Institute Admin"
        });
      } catch (e) {
        setUser({ name: "User", role: "Institute Admin" });
      }
    } else {
      setUser({ name: "User", role: "Institute Admin" });
    }
  }, []);

  const filteredLeads = selectedStatus === "ALL"
    ? leadsList
    : leadsList.filter(l => l.status.toUpperCase().replace(/\s+/g, '_') === selectedStatus);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Enrolled":
        return "ti-badge-enrolled";
      case "Demo Booked":
        return "ti-badge-demo";
      case "New":
        return "ti-badge-new";
      case "Contacted":
        return "ti-badge-contacted";
      case "Follow Up":
      default:
        return "ti-badge-follow";
    }
  };

  const getModeBadgeClass = (mode: string) => {
    switch (mode) {
      case "Online Live":
        return "ti-mode-online";
      case "In-Person Lab":
        return "ti-mode-lab";
      case "Hybrid":
      default:
        return "ti-mode-hybrid";
    }
  };

  return (
    <div className={`training-dashboard ${isDark ? "dark" : ""}`}>
      {/* Welcome Banner */}
      <div className="ti-welcome-section">
        <div className="ti-welcome-content">
          <div className="ti-institute-badge">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            Training Institute CRM
          </div>
          <h1>Welcome back, {user?.name}! 🎓</h1>
          <p className="text-muted">
            Track student inquiries, monitor active course batches, and manage career placements all in one unified command center.
          </p>
          <div className="ti-hero-actions">
            <button className="ti-btn-hero-primary" onClick={() => setIsLeadModalOpen(true)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Student Inquiry
            </button>
            <button className="ti-btn-hero-secondary" onClick={() => setSelectedStatus("DEMO_BOOKED")}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Upcoming Demo Classes
            </button>
          </div>
        </div>
        <div className="ti-welcome-image">
          <img src={heroImg} alt="Training Institute Cohort" />
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="ti-kpi-grid">
        <KpiCard
          title="Total Student Inquiries"
          value={trainingDashboardStats.totalInquiries}
          trend="↑ 18.4% from last month"
          colorClass="indigo"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <KpiCard
          title="Active Trainees Enrolled"
          value={trainingDashboardStats.activeStudents}
          trend="↑ 12.6% active in batches"
          colorClass="green"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          }
        />
        <KpiCard
          title="Active & Upcoming Batches"
          value={trainingDashboardStats.activeBatches}
          trend="4 batches starting this week"
          colorClass="blue"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        />
        <KpiCard
          title="Placement Success Rate"
          value={trainingDashboardStats.completionRate}
          trend={`${trainingDashboardStats.placementsAchieved} graduates placed`}
          colorClass="orange"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="7" />
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
            </svg>
          }
        />
      </div>

      {/* Main Grid: Charts & Modules */}
      <div className="ti-dashboard-grid">
        <div className="ti-grid-main">
          {/* Charts Row */}
          <div className="ti-charts-row">
            {/* Enrollment Growth Trend */}
            <div className="ti-chart-card">
              <div className="ti-section-header">
                <div>
                  <h3>Admissions & Inquiries Trend</h3>
                  <small className="ti-section-subtitle">Monthly conversion comparison</small>
                </div>
              </div>
              <div className="ti-chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={enrollmentTrendData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#475569" : "#e2e8f0"} />
                    <XAxis
                      dataKey="month"
                      stroke={isDark ? "#B8C5D8" : "#64748b"}
                      tick={{ fill: isDark ? "#B8C5D8" : "#64748b", fontSize: 12 }}
                      tickLine={false}
                      axisLine={{ stroke: isDark ? "#475569" : "#e2e8f0" }}
                    />
                    <YAxis
                      stroke={isDark ? "#B8C5D8" : "#64748b"}
                      tick={{ fill: isDark ? "#B8C5D8" : "#64748b", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: isDark ? "#1e293b" : "#ffffff",
                        borderColor: isDark ? "#475569" : "#e2e8f0",
                        color: isDark ? "#E2E8F0" : "#0f172a",
                        borderRadius: "8px",
                        boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.5)" : "0 4px 12px rgba(0,0,0,0.15)"
                      }}
                      itemStyle={{ color: isDark ? "#E2E8F0" : "#0f172a" }}
                      labelStyle={{ color: isDark ? "#F8FAFC" : "#0f172a", fontWeight: 600 }}
                      cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ top: -40 }}
                      iconType="circle"
                      formatter={(value) => (
                        <span style={{ color: isDark ? "#B8C5D8" : "#475569", fontSize: 13, fontWeight: 500 }}>
                          {value}
                        </span>
                      )}
                    />
                    <Bar dataKey="inquiries" name="Inquiries" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={16} />
                    <Bar dataKey="enrolled" name="Enrolled" fill="#10b981" radius={[4, 4, 0, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Course Stream Distribution */}
            <div className="ti-chart-card">
              <div className="ti-section-header">
                <div>
                  <h3>Course Popularity</h3>
                  <small className="ti-section-subtitle">Enrollment by technology stream</small>
                </div>
              </div>
              <div className="ti-chart-container ti-donut-chart-container">
                <div className="ti-donut-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={courseDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={82}
                        paddingAngle={3}
                        dataKey="value"
                        stroke={isDark ? "#1e293b" : "#ffffff"}
                        strokeWidth={2}
                      >
                        {courseDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1e293b" : "#ffffff",
                          borderColor: isDark ? "#475569" : "#e2e8f0",
                          color: isDark ? "#E2E8F0" : "#0f172a",
                          borderRadius: "8px",
                          boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.5)" : "0 4px 12px rgba(0,0,0,0.15)"
                        }}
                        itemStyle={{ color: isDark ? "#E2E8F0" : "#0f172a" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="ti-pie-center-label">
                    <div className="ti-pie-center-value">196</div>
                    <div className="ti-pie-center-text">Students</div>
                  </div>
                </div>
                <div className="ti-custom-legend">
                  {courseDistributionData.map(entry => (
                    <div key={entry.name} className="ti-legend-item">
                      <div className="ti-legend-label">
                        <span className="ti-legend-dot" style={{ backgroundColor: entry.fill }}></span>
                        <span>{entry.name}</span>
                      </div>
                      <div className="ti-legend-value">{entry.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Batches Table */}
          <div className="ti-section-card">
            <div className="ti-section-header">
              <div>
                <h3>Upcoming Training Batches</h3>
                <small className="ti-section-subtitle">Live schedule and cohort capacities</small>
              </div>
              <button className="ti-btn-link">View All Batches</button>
            </div>
            <div className="ti-table-responsive">
              <table className="ti-data-table">
                <thead>
                  <tr>
                    <th>Course & Batch</th>
                    <th>Lead Trainer</th>
                    <th>Schedule</th>
                    <th>Delivery Mode</th>
                    <th>Enrolled / Capacity</th>
                    <th>Start Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingBatches.map(batch => {
                    const fillPercent = Math.min(100, Math.round((batch.enrolledCount / batch.capacity) * 100));
                    return (
                      <tr key={batch.id}>
                        <td>
                          <div className="ti-table-cell-title">{batch.course}</div>
                          <span className="ti-table-cell-subtext">{batch.batchCode}</span>
                        </td>
                        <td>{batch.trainer}</td>
                        <td className="ti-table-cell-schedule">{batch.schedule}</td>
                        <td>
                          <span className={`ti-mode-badge ${getModeBadgeClass(batch.mode)}`}>
                            {batch.mode}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span className="ti-table-cell-metric">{batch.enrolledCount}/{batch.capacity}</span>
                            <span className="ti-table-cell-subtext">({fillPercent}%)</span>
                          </div>
                          <div className="ti-progress-track">
                            <div className="ti-progress-fill" style={{ width: `${fillPercent}%` }}></div>
                          </div>
                        </td>
                        <td className="ti-table-cell-date">{batch.startDate}</td>
                        <td>
                          <span className={`ti-badge ${batch.status === "Starting Soon" ? "ti-badge-demo" : "ti-badge-enrolled"}`}>
                            {batch.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Student Leads / Inquiries */}
          <div className="ti-section-card">
            <div className="ti-section-header">
              <div>
                <h3>Recent Student Inquiries</h3>
                <small className="ti-section-subtitle">Prospective candidates and admission pipeline</small>
              </div>
              <div className="ti-filter-btn-group">
                <button
                  className={`ti-btn-link ${selectedStatus === "ALL" ? "active" : ""}`}
                  onClick={() => setSelectedStatus("ALL")}
                >
                  All ({leadsList.length})
                </button>
                <button
                  className={`ti-btn-link ${selectedStatus === "ENROLLED" ? "active" : ""}`}
                  onClick={() => setSelectedStatus("ENROLLED")}
                >
                  Enrolled
                </button>
                <button
                  className={`ti-btn-link ${selectedStatus === "DEMO_BOOKED" ? "active" : ""}`}
                  onClick={() => setSelectedStatus("DEMO_BOOKED")}
                >
                  Demo Booked
                </button>
              </div>
            </div>
            <div className="ti-table-responsive">
              <table className="ti-data-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Contact Info</th>
                    <th>Course of Interest</th>
                    <th>Batch Preference</th>
                    <th>Status</th>
                    <th>Assigned Counselor</th>
                    <th>Inquiry Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map(lead => (
                    <tr key={lead.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span className="ti-avatar-circle">{getInitials(lead.name)}</span>
                          <span className="ti-table-cell-title">{lead.name}</span>
                        </div>
                      </td>
                      <td>
                        <div className="ti-table-cell-contact-email">{lead.email}</div>
                        <span className="ti-table-cell-subtext">{lead.phone}</span>
                      </td>
                      <td className="ti-table-cell-course">{lead.course}</td>
                      <td className="ti-table-cell-preference">{lead.batchPreference}</td>
                      <td>
                        <span className={`ti-badge ${getStatusBadgeClass(lead.status)}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td>{lead.assignedCounselor}</td>
                      <td className="ti-table-cell-date">{lead.createdOn}</td>
                    </tr>
                  ))}
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={7} className="ti-table-empty">
                        No inquiries found under this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Side Panel: Demos, Quick Actions, Promo */}
        <div className="ti-grid-side">
          {/* Quick Actions */}
          <div className="ti-section-card">
            <div className="ti-section-header">
              <h3>Quick Actions</h3>
            </div>
            <div className="ti-quick-actions-grid">
              <button className="ti-action-btn" onClick={() => setIsLeadModalOpen(true)}>
                <div className="ti-action-icon-circle indigo">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                </div>
                <span>New Inquiry</span>
              </button>
              <button className="ti-action-btn" onClick={() => setSelectedStatus("DEMO_BOOKED")}>
                <div className="ti-action-icon-circle green">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <span>Live Demo</span>
              </button>
              <button className="ti-action-btn">
                <div className="ti-action-icon-circle blue">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </div>
                <span>New Batch</span>
              </button>
              <button className="ti-action-btn">
                <div className="ti-action-icon-circle orange">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <span>Reports</span>
              </button>
            </div>
          </div>

          {/* Upcoming Masterclasses / Demos */}
          <div className="ti-section-card">
            <div className="ti-section-header">
              <h3>Upcoming Demo Sessions</h3>
              <span className="ti-badge ti-badge-demo">{upcomingDemos.length} Scheduled</span>
            </div>
            <div className="ti-demos-list">
              {upcomingDemos.map(demo => (
                <div key={demo.id} className="ti-demo-item">
                  <div className="ti-demo-time-box">
                    <div>{demo.time}</div>
                    <span className="ti-demo-time-tag">TODAY</span>
                  </div>
                  <div className="ti-demo-details">
                    <h5 className="ti-demo-title">{demo.title}</h5>
                    <div className="ti-demo-meta">
                      <span>👤 {demo.trainer}</span>
                      <span>•</span>
                      <span>🎓 {demo.course}</span>
                      <span>•</span>
                      <span className={`ti-mode-badge ${demo.mode === "Online" ? "ti-mode-online" : "ti-mode-lab"}`}>
                        {demo.registeredCount} Enrolled
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Promotional / Academy Card */}
          <div className="ti-promo-card">
            <div className="ti-promo-content">
              <h3>Empowering Next-Gen Tech Talent</h3>
              <p>
                From foundational software development to advanced AI systems, manage candidate journey from lead to placed professional.
              </p>
              <button
                className="ti-btn-hero-primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => setIsLeadModalOpen(true)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Enroll New Student
              </button>
              <div className="ti-promo-img-wrapper">
                <img src={promoImg} alt="Tech Skills Certified" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reusable Lead Form Modal */}
      {isLeadModalOpen && (
        <LeadFormModal
          onClose={() => setIsLeadModalOpen(false)}
          onSuccess={(savedLead) => {
            setIsLeadModalOpen(false);
            if (savedLead) {
              const newEntry: RecentTrainingLead = {
                id: Date.now(),
                name: savedLead.full_name || "New Candidate",
                email: savedLead.email || "candidate@email.com",
                phone: savedLead.phone || "-",
                course: "Full Stack Development",
                batchPreference: "Upcoming Batch",
                status: "New",
                assignedCounselor: user?.name || "Assigned Counselor",
                createdOn: "Just Now"
              };
              setLeadsList(prev => [newEntry, ...prev]);
            }
          }}
        />
      )}
    </div>
  );
}
