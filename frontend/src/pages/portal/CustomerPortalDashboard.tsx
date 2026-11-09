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
  ReceiptIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalDashboard,
  getPortalProfile,
  getPortalCustomer,
  DEFAULT_PORTAL_DASHBOARD,
} from "../../services/customerPortalAuthService";
import {
  getPortalEstimates,
  getPortalBookings,
  getPortalSiteVisits,
  isEstimatePendingApproval,
} from "../../services/customerPortalCommercialService";
import type {
  PortalDashboardResponse,
  PortalProfileResponse,
  PortalBooking,
  PortalSiteVisit,
} from "../../types/customerPortal";
import { normalizeIndustry } from "../../utils/industryUtils";
import "./CustomerPortalDashboard.css";

function formatCurrency(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "$0.00";
  let str = String(value).trim();
  // Strip duplicate leading dollar signs if present (e.g. "$$0.00" -> "$0.00")
  while (str.startsWith("$$")) {
    str = str.slice(1);
  }
  if (str.startsWith("$")) {
    return str;
  }
  const num = Number(str.replace(/[^0-9.-]+/g, ""));
  if (isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

export default function CustomerPortalDashboard() {
  const [dashboard, setDashboard] = useState<PortalDashboardResponse | null>(null);
  const [profile, setProfile] = useState<PortalProfileResponse | null>(null);
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [siteVisits, setSiteVisits] = useState<PortalSiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localCustomer = getPortalCustomer();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Force-refresh profile to ensure latest workspace metadata
      const profileRes = await getPortalProfile(true).catch(() => null);
      if (profileRes) setProfile(profileRes);

      const normalizedInd = normalizeIndustry(
        profileRes?.tenant?.industry || profileRes?.account?.industry
      );
      const isRE =
        normalizedInd === "real-estate" ||
        Boolean(
          profileRes?.tenant?.industry?.toLowerCase().replace(/[^a-z]/g, "").includes("realestate")
        );

      const [dashRes, secondaryRes, visitsRes] = await Promise.all([
        getPortalDashboard().catch(() => DEFAULT_PORTAL_DASHBOARD),
        isRE
          ? getPortalBookings().catch(() => [])
          : getPortalEstimates().catch(() => []),
        isRE
          ? getPortalSiteVisits().catch(() => [])
          : Promise.resolve([]),
      ]);

      const baseDashboard: PortalDashboardResponse = JSON.parse(
        JSON.stringify(dashRes || DEFAULT_PORTAL_DASHBOARD)
      );

      if (isRE) {
        setBookings(Array.isArray(secondaryRes) ? secondaryRes : []);
        setSiteVisits(Array.isArray(visitsRes) ? visitsRes : []);
      } else {
        setBookings([]);
        setSiteVisits([]);
        if (Array.isArray(secondaryRes)) {
          const totalEstimates = secondaryRes.length;
          const pendingApprovalCount = secondaryRes.filter((e) =>
            isEstimatePendingApproval(e.status)
          ).length;

          baseDashboard.commercial_and_delivery = {
            ...baseDashboard.commercial_and_delivery,
            total_estimates: totalEstimates,
            pending_approval_estimates: pendingApprovalCount,
          };
        }
      }

      setDashboard(baseDashboard);
    } catch (err: any) {
      console.warn("Non-fatal issue loading portal dashboard:", err);
      setDashboard(DEFAULT_PORTAL_DASHBOARD);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleWorkspaceSwitch = () => {
      // Clear previous metrics on workspace change to prevent stale data flash
      setDashboard(null);
      setBookings([]);
      setSiteVisits([]);
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

  // Industry determination
  const normalizedIndustry = normalizeIndustry(
    profile?.tenant?.industry || profile?.account?.industry
  );
  const isRealEstate =
    normalizedIndustry === "real-estate" ||
    Boolean(
      profile?.tenant?.industry?.toLowerCase().replace(/[^a-z]/g, "").includes("realestate")
    );

  const support = dashboard?.support;
  const commercial = dashboard?.commercial_and_delivery;
  const billing = dashboard?.billing;
  const documents = dashboard?.documents;
  const realEstate = dashboard?.real_estate;

  // Real Estate derived calculations
  const totalBookingsCount = realEstate?.total_bookings ?? bookings.length;
  const activeBookingsCount =
    realEstate?.active_bookings ??
    bookings.filter((b) => !["Cancelled", "Rejected"].includes(b.status)).length;
  const totalSiteVisitsCount = siteVisits.length;
  const upcomingVisitsCount = siteVisits.filter(
    (v) => !["Cancelled", "Completed"].includes(v.status)
  ).length;

  const uniquePropertyIds = new Set<string>();
  bookings.forEach((b) => {
    if (b.property?.id || b.property?.name) {
      uniquePropertyIds.add(b.property.id || b.property.name);
    }
  });
  siteVisits.forEach((v) => {
    if (v.property?.id || v.property?.name) {
      uniquePropertyIds.add(v.property.id || v.property.name);
    }
  });
  const totalPropertiesCount = uniquePropertyIds.size || totalBookingsCount;

  // Calculate real estate payment totals if bookings present, fallback to billing metrics
  const sumAgreedPrice = bookings.reduce(
    (sum, b) => sum + (typeof b.agreed_price === "number" ? b.agreed_price : 0),
    0
  );
  const sumVerifiedPaid = bookings.reduce(
    (sum, b) => sum + (typeof b.verified_paid_amount === "number" ? b.verified_paid_amount : 0),
    0
  );
  const sumRemaining = bookings.reduce(
    (sum, b) => sum + (typeof b.remaining_balance === "number" ? b.remaining_balance : 0),
    0
  );

  const displayTotalAgreed =
    sumAgreedPrice > 0 ? formatCurrency(sumAgreedPrice) : formatCurrency(billing?.total_invoiced);
  const displayVerifiedPaid =
    sumVerifiedPaid > 0 ? formatCurrency(sumVerifiedPaid) : formatCurrency(billing?.total_paid);
  const displayRemaining =
    sumRemaining > 0 ? formatCurrency(sumRemaining) : formatCurrency(billing?.outstanding_balance);

  return (
    <div className="cp-dashboard">
      {/* Welcome Banner */}
      <div className="cp-welcome-banner">
        <div className="cp-welcome-text">
          <h1>Welcome, {contactName}</h1>
          <p>
            Connected to <strong>{accountName}</strong>.{" "}
            {isRealEstate
              ? "Overview of your property reservations, site visits, payment installments, documents, and support requests."
              : "Overview of your commercial contracts, projects, invoices, documents, and support requests."}
          </p>
        </div>
        <div className="cp-banner-actions">
          <button
            type="button"
            className="cp-banner-btn cp-banner-btn-secondary"
            onClick={loadData}
            title="Refresh dashboard metrics"
            disabled={loading}
          >
            <RefreshIcon size={16} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <Link to="/portal/tickets?new=true" className="cp-banner-btn cp-banner-btn-primary">
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
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--cp-text-muted)" }}>
          <RefreshIcon size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
          <div>Loading unified client portal metrics...</div>
        </div>
      ) : (
        <>
          {/* SECTION 1: INDUSTRY-SPECIFIC PRIMARY DELIVERY SECTION */}
          {isRealEstate ? (
            /* REAL ESTATE PORTFOLIO */
            <div className="cp-section-block">
              <div className="cp-section-header">
                <div className="cp-section-title-wrap">
                  <h2 className="cp-section-title">Real Estate Portfolio</h2>
                  <span className="cp-section-tag">Properties & Reservations</span>
                </div>
              </div>

              <div className="cp-kpis four-col">
                <div className="cp-kpi-card">
                  <div className="cp-kpi-icon emerald">
                    <BuildingIcon size={22} />
                  </div>
                  <div className="cp-kpi-content">
                    <div className="cp-kpi-label">Property Bookings</div>
                    <div className="cp-kpi-value">{totalBookingsCount}</div>
                    <div className="cp-kpi-sub">
                      {activeBookingsCount} active reservations
                    </div>
                  </div>
                </div>

                <div className="cp-kpi-card">
                  <div className="cp-kpi-icon blue">
                    <ClockIcon size={22} />
                  </div>
                  <div className="cp-kpi-content">
                    <div className="cp-kpi-label">Scheduled Site Visits</div>
                    <div className="cp-kpi-value">{totalSiteVisitsCount}</div>
                    <div className="cp-kpi-sub">
                      {upcomingVisitsCount} upcoming • {totalSiteVisitsCount - upcomingVisitsCount} completed
                    </div>
                  </div>
                </div>

                <div className="cp-kpi-card">
                  <div className="cp-kpi-icon purple">
                    <CheckCircleIcon size={22} />
                  </div>
                  <div className="cp-kpi-content">
                    <div className="cp-kpi-label">Properties & Units</div>
                    <div className="cp-kpi-value">{totalPropertiesCount}</div>
                    <div className="cp-kpi-sub">
                      Assigned units & floor plans
                    </div>
                  </div>
                </div>

                <div className="cp-kpi-card">
                  <div className="cp-kpi-icon amber">
                    <FileTextIcon size={22} />
                  </div>
                  <div className="cp-kpi-content">
                    <div className="cp-kpi-label">Shared Documents</div>
                    <div className="cp-kpi-value">{documents?.shared_documents ?? 0}</div>
                    <div className="cp-kpi-sub">Title deeds, NOCs & contracts</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* SOFTWARE COMPANY COMMERCIAL & DELIVERY */
            <div className="cp-section-block">
              <div className="cp-section-header">
                <div className="cp-section-title-wrap">
                  <h2 className="cp-section-title">Commercial & Project Delivery</h2>
                  <span className="cp-section-tag">Active Agreements & Roadmap</span>
                </div>
              </div>

              <div className="cp-kpis four-col">
                <div className="cp-kpi-card">
                  <div className="cp-kpi-icon blue">
                    <FileTextIcon size={22} />
                  </div>
                  <div className="cp-kpi-content">
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
                  <div className="cp-kpi-content">
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
                  <div className="cp-kpi-content">
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
                  <div className="cp-kpi-content">
                    <div className="cp-kpi-label">Shared Documents</div>
                    <div className="cp-kpi-value">{documents?.shared_documents ?? 0}</div>
                    <div className="cp-kpi-sub">Verified documents available</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: BILLING & FINANCIAL OVERVIEW */}
          <div className="cp-section-block">
            <div className="cp-section-header">
              <div className="cp-section-title-wrap">
                <h2 className="cp-section-title">
                  {isRealEstate ? "Property Payments & Financial Overview" : "Billing & Financial Overview"}
                </h2>
                <span className="cp-section-tag">
                  {isRealEstate ? "Installments & Verified Payments" : "Invoices & Balances"}
                </span>
              </div>
            </div>

            <div className={`cp-kpis ${isRealEstate ? "four-col" : "three-col"}`}>
              <div className="cp-kpi-card">
                <div className="cp-kpi-icon blue">
                  <FileTextIcon size={22} />
                </div>
                <div className="cp-kpi-content">
                  <div className="cp-kpi-label">
                    {isRealEstate ? "Total Invoiced / Value" : "Total Invoices"}
                  </div>
                  <div className="cp-kpi-value">
                    {isRealEstate ? displayTotalAgreed : (billing?.total_invoices ?? 0)}
                  </div>
                  <div className="cp-kpi-sub">
                    {isRealEstate ? (
                      "Total contracted commitments"
                    ) : billing?.overdue_invoices ? (
                      <span style={{ color: "#EF4444", fontWeight: 600 }}>
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
                <div className="cp-kpi-content">
                  <div className="cp-kpi-label">Total Paid</div>
                  <div className="cp-kpi-value" style={{ color: "#10B981" }}>
                    {isRealEstate ? displayVerifiedPaid : formatCurrency(billing?.total_paid)}
                  </div>
                  <div className="cp-kpi-sub">
                    {isRealEstate
                      ? `Of ${displayTotalAgreed} verified receipts`
                      : `Of ${formatCurrency(billing?.total_invoiced)} total invoiced`}
                  </div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon amber">
                  <ClockIcon size={22} />
                </div>
                <div className="cp-kpi-content">
                  <div className="cp-kpi-label">Outstanding Balance</div>
                  <div
                    className="cp-kpi-value"
                    style={{
                      color:
                        Number(String(isRealEstate ? displayRemaining : billing?.outstanding_balance || "0").replace(/[^0-9.-]+/g, "")) > 0
                          ? "#F59E0B"
                          : undefined,
                    }}
                  >
                    {isRealEstate ? displayRemaining : formatCurrency(billing?.outstanding_balance)}
                  </div>
                  <div className="cp-kpi-sub">
                    {isRealEstate ? "Pending installment balance" : "Current amount due"}
                  </div>
                </div>
              </div>

              {isRealEstate && (
                <div className="cp-kpi-card">
                  <div className="cp-kpi-icon purple">
                    <ReceiptIcon size={22} />
                  </div>
                  <div className="cp-kpi-content">
                    <div className="cp-kpi-label">Installment Invoices</div>
                    <div className="cp-kpi-value">{billing?.total_invoices ?? bookings.length}</div>
                    <div className="cp-kpi-sub">
                      {billing?.overdue_invoices ? (
                        <span style={{ color: "#EF4444", fontWeight: 600 }}>
                          {billing.overdue_invoices} overdue
                        </span>
                      ) : (
                        "Installments up-to-date"
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: SUPPORT & SERVICE DESK */}
          <div className="cp-section-block">
            <div className="cp-section-header">
              <div className="cp-section-title-wrap">
                <h2 className="cp-section-title">Support & Service Desk</h2>
                <span className="cp-section-tag">Account Tickets</span>
              </div>
            </div>

            <div className="cp-kpis four-col">
              <div className="cp-kpi-card">
                <div className="cp-kpi-icon blue">
                  <LifeBuoyIcon size={22} />
                </div>
                <div className="cp-kpi-content">
                  <div className="cp-kpi-label">Total Account Tickets</div>
                  <div className="cp-kpi-value">{support?.total_tickets ?? 0}</div>
                  <div className="cp-kpi-sub">Lifetime support requests</div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon amber">
                  <ClockIcon size={22} />
                </div>
                <div className="cp-kpi-content">
                  <div className="cp-kpi-label">Open Tickets</div>
                  <div className="cp-kpi-value">{support?.open_tickets ?? 0}</div>
                  <div className="cp-kpi-sub">
                    {isRealEstate ? "Currently under agent review" : "Currently under engineering review"}
                  </div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon purple">
                  <AlertCircleIcon size={22} />
                </div>
                <div className="cp-kpi-content">
                  <div className="cp-kpi-label">Waiting on You</div>
                  <div className="cp-kpi-value">{support?.waiting_on_customer ?? 0}</div>
                  <div className="cp-kpi-sub">Requires customer response</div>
                </div>
              </div>

              <div className="cp-kpi-card">
                <div className="cp-kpi-icon emerald">
                  <CheckCircleIcon size={22} />
                </div>
                <div className="cp-kpi-content">
                  <div className="cp-kpi-label">Resolved / Closed</div>
                  <div className="cp-kpi-value">{support?.resolved_or_closed_tickets ?? 0}</div>
                  <div className="cp-kpi-sub">Completed resolutions</div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: NAVIGATION ACTION TILES */}
          <div className="cp-section-block">
            <div className="cp-section-header">
              <div className="cp-section-title-wrap">
                <h2 className="cp-section-title">
                  {isRealEstate ? "Real Estate Portals & Shortcuts" : "Quick Portals & Workspaces"}
                </h2>
                <span className="cp-section-tag">Shortcuts</span>
              </div>
            </div>

            <div className="cp-action-tiles">
              {isRealEstate ? (
                <>
                  <Link to="/portal/bookings" className="cp-action-tile">
                    <div className="cp-action-tile-icon emerald">
                      <BuildingIcon size={20} />
                    </div>
                    <div className="cp-action-tile-title">Property Bookings</div>
                    <div className="cp-action-tile-desc">View unit reservations & installment progress</div>
                    <span className="cp-action-tile-link">View Bookings &rarr;</span>
                  </Link>

                  <Link to="/portal/site-visits" className="cp-action-tile">
                    <div className="cp-action-tile-icon blue">
                      <ClockIcon size={20} />
                    </div>
                    <div className="cp-action-tile-title">Site Visits</div>
                    <div className="cp-action-tile-desc">Inspect scheduled walkthroughs & visits</div>
                    <span className="cp-action-tile-link">View Site Visits &rarr;</span>
                  </Link>

                  <Link to="/portal/properties" className="cp-action-tile">
                    <div className="cp-action-tile-icon purple">
                      <CheckCircleIcon size={20} />
                    </div>
                    <div className="cp-action-tile-title">Properties & Units</div>
                    <div className="cp-action-tile-desc">Inspect property details & unit specifications</div>
                    <span className="cp-action-tile-link">View Properties &rarr;</span>
                  </Link>

                  <Link to="/portal/invoices" className="cp-action-tile">
                    <div className="cp-action-tile-icon amber">
                      <ReceiptIcon size={20} />
                    </div>
                    <div className="cp-action-tile-title">Payment Receipts</div>
                    <div className="cp-action-tile-desc">Inspect installment bills & payment receipts</div>
                    <span className="cp-action-tile-link">View Receipts &rarr;</span>
                  </Link>

                  <Link to="/portal/documents" className="cp-action-tile">
                    <div className="cp-action-tile-icon cyan">
                      <FileTextIcon size={20} />
                    </div>
                    <div className="cp-action-tile-title">Shared Documents</div>
                    <div className="cp-action-tile-desc">Download agreements, deeds & floor plans</div>
                    <span className="cp-action-tile-link">View Documents &rarr;</span>
                  </Link>

                  <Link to="/portal/tickets" className="cp-action-tile">
                    <div className="cp-action-tile-icon blue">
                      <LifeBuoyIcon size={20} />
                    </div>
                    <div className="cp-action-tile-title">Support Tickets</div>
                    <div className="cp-action-tile-desc">Manage inquiries & property support tickets</div>
                    <span className="cp-action-tile-link">View Tickets &rarr;</span>
                  </Link>
                </>
              ) : (
                <>
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
                    <div className="cp-action-tile-icon cyan">
                      <FileTextIcon size={20} />
                    </div>
                    <div className="cp-action-tile-title">Shared Documents</div>
                    <div className="cp-action-tile-desc">Download shared files & resources</div>
                    <span className="cp-action-tile-link">View Documents &rarr;</span>
                  </Link>

                  <Link to="/portal/tickets" className="cp-action-tile">
                    <div className="cp-action-tile-icon blue">
                      <LifeBuoyIcon size={20} />
                    </div>
                    <div className="cp-action-tile-title">Support Tickets</div>
                    <div className="cp-action-tile-desc">Manage support cases & resolutions</div>
                    <span className="cp-action-tile-link">View Tickets &rarr;</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
