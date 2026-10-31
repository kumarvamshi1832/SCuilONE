import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  LifeBuoyIcon,
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  RefreshIcon,
} from "../../components/common/SupportPortalIcons";
import { getPortalTickets } from "../../services/customerPortalTicketService";
import { getPortalProfile, getPortalCustomer } from "../../services/customerPortalAuthService";
import type { PortalTicket, PortalProfileResponse } from "../../types/customerPortal";
import "./CustomerPortalDashboard.css";

export default function CustomerPortalDashboard() {
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [profile, setProfile] = useState<PortalProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localCustomer = getPortalCustomer();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketsRes, profileRes] = await Promise.all([
        getPortalTickets({ limit: 100 }),
        getPortalProfile().catch(() => null),
      ]);
      setTickets(ticketsRes.items);
      if (profileRes) setProfile(profileRes);
    } catch (err: any) {
      console.error("Failed to load portal dashboard:", err);
      setError(err?.response?.data?.detail || "Unable to load tickets for your account.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const contactName =
    profile?.contact?.full_name || localCustomer?.email?.split("@")[0] || "Customer";
  const accountName = profile?.account?.name || "Client Portal";

  // KPIs
  const kpis = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === "Open").length;
    const inProgress = tickets.filter(
      (t) => t.status === "In Progress" || t.status === "Waiting on Customer"
    ).length;
    const resolvedClosed = tickets.filter(
      (t) => t.status === "Resolved" || t.status === "Closed"
    ).length;
    return { total, open, inProgress, resolvedClosed };
  }, [tickets]);

  // Top 5 recent tickets
  const recentTickets = useMemo(() => {
    return tickets.slice(0, 5);
  }, [tickets]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Open":
        return <span className="badge-status status-open">Open</span>;
      case "In Progress":
        return <span className="badge-status status-in-progress">In Progress</span>;
      case "Waiting on Customer":
        return <span className="badge-status status-waiting">Waiting on You</span>;
      case "Resolved":
        return <span className="badge-status status-resolved">Resolved</span>;
      case "Closed":
        return <span className="badge-status status-closed">Closed</span>;
      default:
        return <span className="badge-status">{status}</span>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const prio = priority.toLowerCase();
    return <span className={`badge-priority prio-${prio}`}>{priority}</span>;
  };

  return (
    <div className="cp-dashboard">
      {/* Welcome Banner */}
      <div className="cp-welcome-banner">
        <div className="cp-welcome-text">
          <h1>Welcome, {contactName}</h1>
          <p>
            Connected to <strong>{accountName}</strong>. Manage your support requests, track ongoing resolutions, and collaborate directly with our engineering team.
          </p>
        </div>
        <Link to="/portal/tickets?new=true" className="cp-banner-btn">
          <PlusIcon size={16} />
          <span>Submit New Ticket</span>
        </Link>
      </div>

      {/* KPI Metrics */}
      <div className="cp-kpis">
        <div className="cp-kpi-card">
          <div className="cp-kpi-icon blue">
            <LifeBuoyIcon size={24} />
          </div>
          <div>
            <div className="cp-kpi-label">Total Account Tickets</div>
            <div className="cp-kpi-value">{kpis.total}</div>
          </div>
        </div>

        <div className="cp-kpi-card">
          <div className="cp-kpi-icon amber">
            <ClockIcon size={24} />
          </div>
          <div>
            <div className="cp-kpi-label">Open Tickets</div>
            <div className="cp-kpi-value">{kpis.open}</div>
          </div>
        </div>

        <div className="cp-kpi-card">
          <div className="cp-kpi-icon purple">
            <AlertCircleIcon size={24} />
          </div>
          <div>
            <div className="cp-kpi-label">In Progress</div>
            <div className="cp-kpi-value">{kpis.inProgress}</div>
          </div>
        </div>

        <div className="cp-kpi-card">
          <div className="cp-kpi-icon emerald">
            <CheckCircleIcon size={24} />
          </div>
          <div>
            <div className="cp-kpi-label">Resolved / Closed</div>
            <div className="cp-kpi-value">{kpis.resolvedClosed}</div>
          </div>
        </div>
      </div>

      {/* Recent Tickets Section */}
      <div className="cp-section-card">
        <div className="cp-section-header">
          <h2>Recent Support Tickets</h2>
          <Link to="/portal/tickets" className="cp-section-link">
            <span>View All Tickets ({kpis.total})</span>
            <ArrowRightIcon size={15} />
          </Link>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            <RefreshIcon size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            <div>Loading support tickets...</div>
          </div>
        ) : error ? (
          <div className="support-alert error">
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        ) : recentTickets.length === 0 ? (
          <div className="empty-state">
            <LifeBuoyIcon size={40} style={{ opacity: 0.3, margin: "0 auto 10px" }} />
            <h3>No Support Tickets Found</h3>
            <p>Your account does not have any active support tickets right now.</p>
            <Link
              to="/portal/tickets?new=true"
              className="btn-primary"
              style={{ display: "inline-flex", marginTop: 12 }}
            >
              <PlusIcon size={16} />
              <span>Submit Your First Ticket</span>
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="support-table">
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentTickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link
                        to={`/portal/tickets/${t.id}`}
                        className="ticket-number-link"
                      >
                        {t.ticket_number}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 600 }}>{t.subject}</td>
                    <td>
                      <span className="badge-category">{t.category}</span>
                    </td>
                    <td>{getPriorityBadge(t.priority)}</td>
                    <td>{getStatusBadge(t.status)}</td>
                    <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        to={`/portal/tickets/${t.id}`}
                        className="btn-secondary"
                        style={{ padding: "6px 12px", textDecoration: "none" }}
                      >
                        <span>View</span>
                        <ExternalLinkIcon size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

