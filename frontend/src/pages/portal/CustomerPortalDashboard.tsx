import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  LifeBuoyIcon,
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshIcon,
  FileTextIcon,
  ShieldIcon,
  BuildingIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalDashboard,
  getPortalProfile,
  getPortalCustomer,
} from "../../services/customerPortalAuthService";
import type {
  PortalDashboardResponse,
  PortalProfileResponse,
} from "../../types/customerPortal";
import "./CustomerPortalDashboard.css";

export default function CustomerPortalDashboard() {
  const [dashboard, setDashboard] = useState<PortalDashboardResponse | null>(null);
  const [profile, setProfile] = useState<PortalProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localCustomer = getPortalCustomer();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, profileRes] = await Promise.all([
        getPortalDashboard(),
        getPortalProfile().catch(() => null),
      ]);
      setDashboard(dashRes);
      if (profileRes) setProfile(profileRes);
    } catch (err: any) {
      console.error("Failed to load portal dashboard:", err);
      setError(
        err?.response?.data?.detail ||
          "Unable to load unified dashboard metrics for your account."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleWorkspaceSwitch = () => {
      loadData();
    };
    window.addEventListener("portal:workspace-switched", handleWorkspaceSwitch);
    return () => {
      window.removeEventListener("portal:workspace-switched", handleWorkspaceSwitch);
    };
  }, []);

  const contactName =
    profile?.contact?.full_name || localCustomer?.email?.split("@")[0] || "Customer";
  const accountName = profile?.account?.name || "Client Portal";
  const isRealEstate =
    profile?.tenant?.industry?.toLowerCase().includes("real estate") || false;

  const support = dashboard?.support;
  const commercial = dashboard?.commercial_and_delivery;
  const billing = dashboard?.billing;
  const documents = dashboard?.documents;
  const realEstate = dashboard?.real_estate;

  return (
    <div className="cp-dashboard">
      {/* Welcome Banner */}
      <div className="cp-welcome-banner">
        <div className="cp-welcome-text">
          <h1>Welcome, {contactName}</h1>
          <p>
            Connected to <strong>{accountName}</strong>. Overview of your commercial contracts, projects, invoices, documents, and support requests.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="cp-banner-btn"
            style={{ background: "rgba(255, 255, 255, 0.15)", border: "1px solid rgba(255, 255, 255, 0.25)" }}
            onClick={loadData}
            title="Refresh dashboard metrics"
          >
            <RefreshIcon size={16} />
            <span>Refresh</span>
          </button>
          <Link to="/portal/tickets?new=true" className="cp-banner-btn">
            <PlusIcon size={16} />
            <span>Submit New Ticket</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="support-alert error" style={{ marginBottom: 24 }}>
          <AlertCircleIcon size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading && !dashboard ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
          <RefreshIcon size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
          <div>Loading unified client portal metrics...</div>
        </div>
      ) : (
        <>
          {/* SECTION 1: COMMERCIAL & DELIVERY */}
          <div className="cp-section-block" style={{ marginBottom: 28 }}>
            <div className="cp-section-header">
              <h2 className="cp-section-title">Commercial & Project Delivery</h2>
              <span className="cp-section-tag">Active Agreements & Roadmap</span>
            </div>

            <div className="cp-kpis">
              <div className="cp-kpi-card">
                <div className="cp-kpi-icon blue">
                  <FileTextIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Software Estimates</div>
                  <div className="cp-kpi-value">{commercial?.total_estimates ?? 0}</div>
                  <div className="cp-kpi-sub">
                    {commercial?.pending_approval_estimates ?? 0} pending approval
                  </div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon emerald">
                  <ShieldIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Contracts</div>
                  <div className="cp-kpi-value">{commercial?.total_contracts ?? 0}</div>
                  <div className="cp-kpi-sub">
                    {commercial?.pending_signature_contracts ?? 0} pending signature • {commercial?.active_contracts ?? 0} active
                  </div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon purple">
                  <CheckCircleIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Active Projects</div>
                  <div className="cp-kpi-value">{commercial?.active_projects ?? 0}</div>
                  <div className="cp-kpi-sub">
                    {commercial?.total_projects ?? 0} total contracted projects
                  </div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon amber">
                  <FileTextIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Shared Documents</div>
                  <div className="cp-kpi-value">{documents?.shared_documents ?? 0}</div>
                  <div className="cp-kpi-sub">Verified documents available</div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: BILLING & FINANCIALS */}
          <div className="cp-section-block" style={{ marginBottom: 28 }}>
            <div className="cp-section-header">
              <h2 className="cp-section-title">Billing & Financial Overview</h2>
              <span className="cp-section-tag">Invoices & Balances</span>
            </div>

            <div className="cp-kpis">
              <div className="cp-kpi-card">
                <div className="cp-kpi-icon blue">
                  <FileTextIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Total Invoices</div>
                  <div className="cp-kpi-value">{billing?.total_invoices ?? 0}</div>
                  <div className="cp-kpi-sub">
                    {billing?.overdue_invoices ? (
                      <span style={{ color: "#ef4444", fontWeight: 600 }}>
                        {billing.overdue_invoices} overdue
                      </span>
                    ) : (
                      "0 overdue"
                    )}
                  </div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon emerald">
                  <CheckCircleIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Total Paid</div>
                  <div className="cp-kpi-value">
                    ${billing?.total_paid ?? "0.00"}
                  </div>
                  <div className="cp-kpi-sub">
                    Of ${billing?.total_invoiced ?? "0.00"} total invoiced
                  </div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon amber">
                  <ClockIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Outstanding Balance</div>
                  <div className="cp-kpi-value" style={{ color: Number(billing?.outstanding_balance || 0) > 0 ? "#f59e0b" : undefined }}>
                    ${billing?.outstanding_balance ?? "0.00"}
                  </div>
                  <div className="cp-kpi-sub">Current amount due</div>
                </div>
              </div>

              {isRealEstate && (
                <div className="cp-kpi-card">
                  <div className="cp-kpi-icon emerald">
                    <BuildingIcon size={22} />
                  </div>
                  <div>
                    <div className="cp-kpi-label">Property Bookings</div>
                    <div className="cp-kpi-value">{realEstate?.total_bookings ?? 0}</div>
                    <div className="cp-kpi-sub">{realEstate?.active_bookings ?? 0} active</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: SUPPORT & RESOLUTION */}
          <div className="cp-section-block" style={{ marginBottom: 28 }}>
            <div className="cp-section-header">
              <h2 className="cp-section-title">Support & Service Desk</h2>
              <span className="cp-section-tag">Account Tickets</span>
            </div>

            <div className="cp-kpis">
              <div className="cp-kpi-card">
                <div className="cp-kpi-icon blue">
                  <LifeBuoyIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Total Account Tickets</div>
                  <div className="cp-kpi-value">{support?.total_tickets ?? 0}</div>
                  <div className="cp-kpi-sub">Lifetime support requests</div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon amber">
                  <ClockIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Open Tickets</div>
                  <div className="cp-kpi-value">{support?.open_tickets ?? 0}</div>
                  <div className="cp-kpi-sub">Currently under engineering review</div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon purple">
                  <AlertCircleIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Waiting on You</div>
                  <div className="cp-kpi-value">{support?.waiting_on_customer ?? 0}</div>
                  <div className="cp-kpi-sub">Requires customer response</div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon emerald">
                  <CheckCircleIcon size={22} />
                </div>
                <div>
                  <div className="cp-kpi-label">Resolved / Closed</div>
                  <div className="cp-kpi-value">{support?.resolved_or_closed_tickets ?? 0}</div>
                  <div className="cp-kpi-sub">Completed resolutions</div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Action Tiles */}
          <div className="cp-action-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <Link to="/portal/estimates" className="cp-action-tile">
              <div className="cp-action-tile-icon blue">
                <FileTextIcon size={20} />
              </div>
              <div className="cp-action-tile-title">Review Estimates</div>
              <div className="cp-action-tile-desc">Inspect revisions & approve proposals</div>
              <span className="cp-action-tile-link">View Estimates &rarr;</span>
            </Link>

            <Link to="/portal/contracts" className="cp-action-tile">
              <div className="cp-action-tile-icon emerald">
                <ShieldIcon size={20} />
              </div>
              <div className="cp-action-tile-title">Sign Contracts</div>
              <div className="cp-action-tile-desc">Inspect scopes, terms & sign agreements</div>
              <span className="cp-action-tile-link">View Contracts &rarr;</span>
            </Link>

            <Link to="/portal/projects" className="cp-action-tile">
              <div className="cp-action-tile-icon purple">
                <CheckCircleIcon size={20} />
              </div>
              <div className="cp-action-tile-title">Track Projects</div>
              <div className="cp-action-tile-desc">View sprint delivery & milestones</div>
              <span className="cp-action-tile-link">View Projects &rarr;</span>
            </Link>

            <Link to="/portal/invoices" className="cp-action-tile">
              <div className="cp-action-tile-icon amber">
                <FileTextIcon size={20} />
              </div>
              <div className="cp-action-tile-title">Invoices & Billing</div>
              <div className="cp-action-tile-desc">Inspect itemized bills & payment receipts</div>
              <span className="cp-action-tile-link">View Invoices &rarr;</span>
            </Link>

            <Link to="/portal/documents" className="cp-action-tile">
              <div className="cp-action-tile-icon blue">
                <FileTextIcon size={20} />
              </div>
              <div className="cp-action-tile-title">Shared Documents</div>
              <div className="cp-action-tile-desc">Download shared files & resources</div>
              <span className="cp-action-tile-link">View Documents &rarr;</span>
            </Link>

            <Link to="/portal/tickets" className="cp-action-tile">
              <div className="cp-action-tile-icon emerald">
                <LifeBuoyIcon size={20} />
              </div>
              <div className="cp-action-tile-title">Support Tickets</div>
              <div className="cp-action-tile-desc">Manage support cases & resolutions</div>
              <span className="cp-action-tile-link">View Tickets &rarr;</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
