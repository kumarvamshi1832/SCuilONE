import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

import {
  educationDashboardStats,
  leadsTrendData,
  applicationStatusData,
  upcomingConsultations,
  recentEducationLeads
} from "../../data/educationConsultingMockData";

import "./EducationConsultingDashboard.css";
import heroImg from "../../assets/education_hero.jpg";
import promoImg from "../../assets/education_promo.jpg";

interface KpiCardProps {
  title: string;
  value: number | string;
  icon: JSX.Element;
  trend?: string;
  colorClass?: string;
}

function KpiCard({ title, value, icon, trend, colorClass = "blue" }: KpiCardProps) {
  return (
    <div className={`edu-kpi-card ${colorClass}`}>
      <div className="edu-kpi-icon-wrapper">{icon}</div>
      <div className="edu-kpi-info">
        <h4 className="edu-kpi-title">{title}</h4>
        <div className="edu-kpi-value">{value}</div>
        {trend && <div className="edu-kpi-trend">{trend}</div>}
      </div>
    </div>
  );
}

const getCountryFlag = (country: string) => {
  const flags: Record<string, string> = {
    'Canada': '🇨🇦',
    'UK': '🇬🇧',
    'Australia': '🇦🇺',
    'Germany': '🇩🇪',
    'USA': '🇺🇸',
  };
  return flags[country] || '🌐';
};

const getInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

export default function EducationConsultingDashboard() {
  const [user, setUser] = useState<{ name: string, role: string } | null>(null);

  useEffect(() => {
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
    <div className="education-dashboard">
      <div className="edu-welcome-section">
        <div className="edu-welcome-content">
          <h1>Welcome back, {user?.name}! 👋</h1>
          <p className="text-muted">Here's what's happening with your Education Consulting CRM today.</p>
        </div>
        <div className="edu-welcome-image">
          <img src={heroImg} alt="Education Hero" />
        </div>
      </div>

      <div className="edu-kpi-grid">
        <KpiCard
          title="Total Leads"
          value={educationDashboardStats.totalLeads}
          trend="↑ 12% from last month"
          colorClass="green"
          icon={<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"></path></svg>}
        />
        <KpiCard
          title="Admitted Students"
          value={educationDashboardStats.admittedStudents}
          trend="↑ 18% from last month"
          colorClass="blue"
          icon={<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2.12-1.15V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72l5 2.73 5-2.73v3.72z"></path></svg>}
        />
        <KpiCard
          title="Applications"
          value={educationDashboardStats.applications}
          trend="↑ 10% from last month"
          colorClass="orange"
          icon={<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>}
        />
        <KpiCard
          title="Consultations"
          value={educationDashboardStats.consultations}
          trend="↑ 8% from last month"
          colorClass="red"
          icon={<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"></path></svg>}
        />
      </div>

      <div className="edu-dashboard-grid">
        <div className="grid-main">

          <div className="charts-row">
            <div className="dashboard-section-card chart-card leads-trend-card">
              <div className="section-header">
                <h3>Leads Trend</h3>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leadsTrendData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="month" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', color: 'var(--text-color)', borderRadius: '8px' }}
                      itemStyle={{ color: 'var(--text-color)' }}
                      cursor={{ fill: 'transparent' }}
                    />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ top: -40 }} iconType="circle" />
                    <Bar dataKey="newLeads" name="New Leads" fill="#10b981" radius={[4, 4, 0, 0]} barSize={16} />
                    <Bar dataKey="converted" name="Converted" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="dashboard-section-card chart-card app-status-card">
              <div className="section-header">
                <h3>Application Status</h3>
              </div>
              <div className="chart-container donut-chart-container">
                <div className="donut-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={applicationStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {applicationStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', color: 'var(--text-color)', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pie-center-label">
                    <div className="pie-center-value">156</div>
                    <div className="pie-center-text">Total</div>
                  </div>
                </div>
                <div className="custom-legend">
                  {applicationStatusData.map(entry => (
                    <div key={entry.name} className="custom-legend-item">
                      <div className="legend-label">
                        <span className="legend-dot" style={{ backgroundColor: entry.fill }}></span>
                        {entry.name}
                      </div>
                      <div className="legend-value">{entry.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-section-card mt-4">
            <div className="section-header">
              <h3>Recent Leads</h3>
              <button className="btn-link">View All</button>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Country Interest</th>
                    <th>Program</th>
                    <th>Status</th>
                    <th>Assigned To</th>
                    <th>Created On</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEducationLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <div className="d-flex align-items-center">
                          <div className={`avatar-xs mr-2 bg-${lead.id}`}>{getInitials(lead.name)}</div>
                          <span className="fw-medium">{lead.name}</span>
                        </div>
                      </td>
                      <td><span className="text-muted">{lead.email}</span></td>
                      <td>
                        <div className="d-flex align-items-center">
                          <span className="mr-2" style={{ fontSize: '1.2rem' }}>{getCountryFlag(lead.country)}</span>
                          <span className="fw-medium">{lead.country}</span>
                        </div>
                      </td>
                      <td><span className="text-muted">{lead.program}</span></td>
                      <td>
                        <span className={`status-badge status-${lead.status.toLowerCase().replace(/\s+/g, '-')}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td><span className="text-muted">{lead.assignedTo}</span></td>
                      <td><span className="text-muted">{lead.createdOn}</span></td>
                      <td>
                        <button className="btn-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid-side">
          <div className="dashboard-section-card pb-0">
            <div className="section-header">
              <h3>Upcoming Consultations</h3>
              <button className="btn-link">View All</button>
            </div>
            <div className="consultations-list">
              {upcomingConsultations.map((consultation) => (
                <div key={consultation.id} className="consultation-item">
                  <div className="consultation-time">
                    {consultation.time}
                  </div>
                  <div className={`avatar-sm bg-${consultation.id} mr-3`}>{getInitials(consultation.name)}</div>
                  <div className="consultation-details">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <h4 className="consultation-name">{consultation.name}</h4>
                        <p className="consultation-topic">{consultation.topic}</p>
                      </div>
                      <span className={`pill-badge pill-${consultation.type.toLowerCase().replace(/\s+/g, '-')}`}>{consultation.type}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="promo-card mt-4">
            <div className="promo-content">
              <h3>Helping Students<br />Build Global Futures</h3>
              <p>From career guidance to university admissions, we make dreams happen.</p>
              <button className="btn-primary mt-3 promo-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Create New Lead
              </button>
            </div>
            <div className="promo-img-container">
              <img src={promoImg} alt="Promo Graphic" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
