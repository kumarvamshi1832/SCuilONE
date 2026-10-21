import { useState } from "react";
import "../users/Users.css";
import { protoProjects } from "../../data/softwareCompanyProtoData";

const Placeholder = ({ title, description }: { title: string; description: string }) => (
  <div style={{ padding: "32px", animation: "fadeIn 0.3s ease-in-out" }}>
    <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "8px" }}>{title}</h1>
    <p style={{ color: "#718096", fontSize: "0.95rem" }}>{description}</p>
  </div>
);

export const Contacts = () => (
  <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
    <div className="page-header">
      <div>
        <h1>Contacts</h1>
        <p className="text-muted">Software client and stakeholder contacts management.</p>
      </div>
    </div>
  </div>
);

export const Accounts = () => (
  <Placeholder
    title="Clients & Accounts"
    description="Software client company profiles and account management will be available here."
  />
);

export const Tasks = () => (
  <Placeholder
    title="Tasks"
    description="Sprint tasks, bug trackers, and developer assignments will be available here."
  />
);

export const Activities = () => (
  <Placeholder
    title="Activities"
    description="Client communication and system activity logs will be available here."
  />
);

export const Reports = () => (
  <Placeholder
    title="Reports"
    description="Software delivery, team velocity, and revenue analytics reports."
  />
);

export const Settings = () => (
  <Placeholder
    title="Settings"
    description="Company preferences, API integrations, and tenant settings."
  />
);

/* ─────────────────────────────────────────────────────────────────────────────
 * Dedicated Software Company Views
 * ───────────────────────────────────────────────────────────────────────────── */

export const Projects = () => {
  const [filter, setFilter] = useState<string>("All");

  const filteredProjects =
    filter === "All"
      ? protoProjects
      : protoProjects.filter((p) => p.status === filter);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return { bg: "#e0f2fe", text: "#0369a1" };
      case "Planning":
        return { bg: "#fef3c7", text: "#b45309" };
      case "Completed":
        return { bg: "#dcfce7", text: "#15803d" };
      case "On Hold":
        return { bg: "#fee2e2", text: "#b91c1c" };
      default:
        return { bg: "#f1f5f9", text: "#475569" };
    }
  };

  return (
    <div style={{ padding: "32px", animation: "fadeIn 0.3s ease-in-out" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 6px 0", color: "#1e293b" }}>
            Projects
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.95rem" }}>
            Track software delivery, milestones, sprint progress, and team assignments.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {["All", "Active", "Planning", "Completed", "On Hold"].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid",
                borderColor: filter === status ? "#1b64da" : "#cbd5e1",
                backgroundColor: filter === status ? "#1b64da" : "#ffffff",
                color: filter === status ? "#ffffff" : "#475569",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Project Name</th>
              <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Client</th>
              <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Status</th>
              <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Progress</th>
              <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Lead PM</th>
              <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Deadline</th>
            </tr>
          </thead>
          <tbody>
            {filteredProjects.map((proj) => {
              const colors = getStatusColor(proj.status);
              return (
                <tr key={proj.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "16px 20px", fontWeight: 600, color: "#1e293b", fontSize: "0.95rem" }}>
                    {proj.name}
                  </td>
                  <td style={{ padding: "16px 20px", color: "#475569", fontSize: "0.9rem" }}>
                    {proj.client}
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        backgroundColor: colors.bg,
                        color: colors.text,
                      }}
                    >
                      {proj.status}
                    </span>
                  </td>
                  <td style={{ padding: "16px 20px", width: "180px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ flex: 1, height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${proj.progress}%`,
                            height: "100%",
                            backgroundColor: proj.progress === 100 ? "#22c55e" : "#1b64da",
                            borderRadius: "3px",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", minWidth: "32px" }}>
                        {proj.progress}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "16px 20px", color: "#475569", fontSize: "0.9rem" }}>
                    {proj.projectManager}
                  </td>
                  <td style={{ padding: "16px 20px", color: "#64748b", fontSize: "0.88rem" }}>
                    {proj.deadline}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const TimeTracking = () => {
  const entries = [
    { dev: "Arjun Mehta", project: "E-Commerce Platform", task: "API Gateway Optimization", hours: 6.5, date: "Today" },
    { dev: "Priya Sharma", project: "Mobile Banking App", task: "Biometric Auth Flow", hours: 7.0, date: "Today" },
    { dev: "Rohan Gupta", project: "HR Management System", task: "Database Schema Migration", hours: 5.5, date: "Yesterday" },
    { dev: "Sneha Reddy", project: "CRM Integration Suite", task: "Webhook Listeners", hours: 8.0, date: "Yesterday" },
  ];

  return (
    <div style={{ padding: "32px", animation: "fadeIn 0.3s ease-in-out" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 6px 0", color: "#1e293b" }}>
          Time Tracking
        </h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.95rem" }}>
          Track developer worklogs, billable hours, sprint timesheets, and project budgets.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Total Billable Hours</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#1e293b", marginTop: "4px" }}>482.5 hrs</div>
          <div style={{ fontSize: "0.8rem", color: "#16a34a", marginTop: "4px" }}>+12% vs last month</div>
        </div>
        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Active Timers</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#1b64da", marginTop: "4px" }}>8 Devs</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>Currently logging time</div>
        </div>
        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Sprint Utilization</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#1e293b", marginTop: "4px" }}>91.4%</div>
          <div style={{ fontSize: "0.8rem", color: "#16a34a", marginTop: "4px" }}>Optimal capacity</div>
        </div>
      </div>

      <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Team Member</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Project</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Task Description</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Hours</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "14px 20px", fontWeight: 600, color: "#1e293b" }}>{e.dev}</td>
                <td style={{ padding: "14px 20px", color: "#475569" }}>{e.project}</td>
                <td style={{ padding: "14px 20px", color: "#64748b" }}>{e.task}</td>
                <td style={{ padding: "14px 20px", fontWeight: 600, color: "#1b64da" }}>{e.hours} hrs</td>
                <td style={{ padding: "14px 20px", color: "#64748b", fontSize: "0.88rem" }}>{e.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const Invoices = () => {
  const invoices = [
    { num: "INV-2026-081", client: "RetailMax India", amount: "₹450,000", status: "Paid", date: "Oct 12, 2026" },
    { num: "INV-2026-082", client: "FinServ Corp", amount: "₹620,000", status: "Pending", date: "Oct 14, 2026" },
    { num: "INV-2026-083", client: "SmartFactory Ltd", amount: "₹180,000", status: "Paid", date: "Oct 08, 2026" },
    { num: "INV-2026-084", client: "GlobalTech Solutions", amount: "₹340,000", status: "Overdue", date: "Sep 28, 2026" },
  ];

  return (
    <div style={{ padding: "32px", animation: "fadeIn 0.3s ease-in-out" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 6px 0", color: "#1e293b" }}>
          Invoices
        </h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.95rem" }}>
          Client billings, retainer cycles, milestone payments, and tax receipts.
        </p>
      </div>

      <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Invoice #</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Client</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Amount</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Status</th>
              <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Issue Date</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.num} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "14px 20px", fontWeight: 600, color: "#1b64da" }}>{inv.num}</td>
                <td style={{ padding: "14px 20px", color: "#1e293b" }}>{inv.client}</td>
                <td style={{ padding: "14px 20px", fontWeight: 700, color: "#1e293b" }}>{inv.amount}</td>
                <td style={{ padding: "14px 20px" }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      backgroundColor: inv.status === "Paid" ? "#dcfce7" : inv.status === "Pending" ? "#fef3c7" : "#fee2e2",
                      color: inv.status === "Paid" ? "#15803d" : inv.status === "Pending" ? "#b45309" : "#b91c1c",
                    }}
                  >
                    {inv.status}
                  </span>
                </td>
                <td style={{ padding: "14px 20px", color: "#64748b", fontSize: "0.88rem" }}>{inv.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const Proposals = () => (
  <Placeholder
    title="Proposals & Estimates"
    description="Manage client proposals, architectural estimates, RFP bids, and project scopes."
  />
);

export const Contracts = () => (
  <Placeholder
    title="Contracts & SOWs"
    description="Statements of Work (SOWs), Master Services Agreements (MSAs), and signed SLAs."
  />
);

export const SupportTickets = () => (
  <Placeholder
    title="Support Tickets"
    description="Client bug reports, escalation tickets, SLAs, and technical support desk."
  />
);

export const Courses = () => <Placeholder title="Courses" description="Courses and curriculum management will be available here." />;
export const Batches = () => <Placeholder title="Batches" description="Batches and cohort schedules will be available here." />;
export const Students = () => <Placeholder title="Students" description="Student profiles and enrollment tracking will be available here." />;
export const Trainers = () => <Placeholder title="Trainers" description="Trainers and instructor management will be available here." />;
export const DemoClasses = () => <Placeholder title="Demo Classes" description="Demo class schedules and attendee management will be available here." />;
export const Applications = () => <Placeholder title="Applications" description="University application management will be available here." />;
export const Universities = () => <Placeholder title="Universities" description="Partner universities directory will be available here." />;
export const Programs = () => <Placeholder title="Programs" description="Study programs directory will be available here." />;
export const Counselors = () => <Placeholder title="Counselors" description="Education counselors directory will be available here." />;
export const Consultations = () => <Placeholder title="Consultations" description="Consultation schedules will be available here." />;
export const FollowUps = () => <Placeholder title="Follow-ups" description="Follow-ups management will be available here." />;

export const Campaigns = () => (
  <div style={{ padding: '32px', animation: 'fadeIn 0.3s ease-in-out' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>Campaigns</h1>
      <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>Backend Module Pending</span>
    </div>
    <p style={{ color: '#718096', fontSize: '0.95rem', maxWidth: '650px', lineHeight: 1.6 }}>
      Multi-channel ad campaign management and marketing attribution require ad network integration (Google Ads API, Meta Marketing API) or dedicated backend campaign tables. Marketing leads are currently tracked and managed in the Leads module.
    </p>
  </div>
);

export const Services = () => (
  <div style={{ padding: '32px', animation: 'fadeIn 0.3s ease-in-out' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>Agency Services</h1>
      <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#2563eb', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>Catalog Extension</span>
    </div>
    <p style={{ color: '#718096', fontSize: '0.95rem', maxWidth: '650px', lineHeight: 1.6 }}>
      Agency service offerings (SEO Retainers, PPC Management, Social Media Retainers, Content Strategy) can be associated with client Deals and Accounts. Dedicated service catalog modeling will be available in future releases.
    </p>
  </div>
);

export const Policies = () => (
  <Placeholder
    title="Insurance Policies"
    description="Active, pending, and archived policyholder records will be managed here."
  />
);

export const Quotes = () => (
  <Placeholder
    title="Insurance Quotes"
    description="Insurance quotes, premium calculators, and underwriting proposals will be managed here."
  />
);

export const Claims = () => (
  <Placeholder
    title="Claims Management"
    description="Policyholder claim submissions, status tracking, settlements, and verification will be managed here."
  />
);

export const Renewals = () => (
  <Placeholder
    title="Upcoming Policy Renewals"
    description="Upcoming policy renewals, automated reminders, and premium collection follow-ups will be managed here."
  />
);

export const Payments = () => (
  <Placeholder
    title="Premium Payments"
    description="Insurance premium receipts, transaction history, and payment gateway logs will be managed here."
  />
);
