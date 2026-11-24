import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CreateRentalAgreementModal from "../../components/rentals/CreateRentalAgreementModal";
import RentalBookingRequestsPanel from "../../components/rentals/RentalBookingRequestsPanel";
import { RentalStatusBadge } from "../../components/rentals/RentalWidgets";
import {
  AlertTriangleIcon,
  BuildingIcon,
  ClockIcon,
  CoinsIcon,
  CreditCardIcon,
  KeyRoundIcon,
  LogOutIcon,
} from "../../components/common/SupportPortalIcons";
import { getPropertyNameMap } from "../../services/customerBookingWorkflowService";
import { getRentalDashboardSummary, listRentalAgreements } from "../../services/rentalService";
import { getApiErrorMessage } from "../../utils/apiError";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { formatDay, formatRent } from "../../utils/rentalHelpers";
import { RENTAL_AGREEMENT_STATUSES } from "../../types/rental";
import type { RentalAgreement, RentalDashboardSummary } from "../../types/rental";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";
import "./Rentals.css";

const PAGE_SIZE = 15;

/**
 * Staff rentals and leases: portfolio figures from GET /api/v1/rentals/dashboard/summary and every agreement from
 * GET /api/v1/rentals/agreements, with search, status / type filters and paging. Creating an agreement needs
 * booking.create; the page itself needs booking.view. Authorization is enforced by the backend on every request.
 */
export default function Rentals() {
  const { industry } = useParams<{ industry: string }>();
  const navigate = useNavigate();
  const canView = useMemo(() => hasFeaturePermission("booking.view"), []);
  const canCreate = useMemo(() => hasFeaturePermission("booking.create"), []);
  const canUpdate = useMemo(() => hasFeaturePermission("booking.update"), []);
  /** Agreements and booking requests are separate lifecycles, each with its own statuses and actions. */
  const [tab, setTab] = useState<"agreements" | "requests">("agreements");

  const [agreements, setAgreements] = useState<RentalAgreement[]>([]);
  const [summary, setSummary] = useState<RentalDashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [propertyNames, setPropertyNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [list, sum, names] = await Promise.allSettled([listRentalAgreements(), getRentalDashboardSummary(), getPropertyNameMap()]);
    if (list.status === "fulfilled") setAgreements(list.value);
    else setError(getApiErrorMessage(list.reason, "Failed to load rental agreements."));
    setSummary(sum.status === "fulfilled" ? sum.value : null);
    setSummaryError(sum.status === "rejected");
    if (names.status === "fulfilled") setPropertyNames(names.value);
    setLoading(false);
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPage(0), [search, statusFilter, typeFilter]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agreements.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (typeFilter && a.agreement_type !== typeFilter) return false;
      if (!q) return true;
      return [a.customer_name, a.id, propertyNames[a.property_id] ?? "", a.status].some((v) => v.toLowerCase().includes(q));
    });
  }, [agreements, search, statusFilter, typeFilter, propertyNames]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const base = `/${industry ?? "real-estate"}/rentals`;

  if (!canView) {
    return (
      <div className="ins-page">
        <div className="page-header">
          <h1>Rentals &amp; Leases</h1>
        </div>
        <div className="leads-table-container">
          <div className="ins-empty">
            <h3>You do not have access to rentals</h3>
            <p>Ask your administrator for the &ldquo;View bookings&rdquo; permission.</p>
          </div>
        </div>
      </div>
    );
  }

  const hasFilters = Boolean(search || statusFilter || typeFilter);
  const money = (v: unknown) => (v === undefined || v === null ? "—" : formatRent(v as string | number));

  return (
    <div className="ins-page">
      {toast && (
        <div className="ins-alert" role="status" style={{ position: "fixed", right: 24, bottom: 24, zIndex: 2000 }}>
          <span>{toast}</span>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Rentals &amp; Leases</h1>
          <p className="text-muted">Agreements, rent schedules, deposits, move-outs and renewals for rent and lease properties.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          {canCreate && tab === "agreements" && (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              New agreement
            </button>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Rentals sections" style={{ display: "flex", gap: 8, margin: "0 0 14px", flexWrap: "wrap" }}>
        <button role="tab" aria-selected={tab === "agreements"} className={tab === "agreements" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("agreements")}>
          Agreements
        </button>
        <button role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("requests")}>
          Booking requests
        </button>
      </div>

      {tab === "requests" && (
        <RentalBookingRequestsPanel
          propertyNames={propertyNames}
          canCreate={canCreate}
          canUpdate={canUpdate}
          onOpenAgreement={(agreementId) => navigate(`${base}/${agreementId}`)}
          onNotify={setToast}
        />
      )}

      {tab === "agreements" && (
        <>
      {summaryError && (
        <div className="ins-alert" role="status">
          <span>The portfolio figures could not be loaded. The agreements below are unaffected.</span>
        </div>
      )}
      {summary && (
        <div className="ins-kpi-grid rentals-summary-grid">
          <div className="ins-kpi rentals-kpi green rentals-kpi-agreement">
            <div className="rentals-kpi-header">
              <span className="ins-kpi-label">Active agreements</span>
              <div className="rentals-kpi-icon-box green" aria-hidden="true">
                <BuildingIcon size={17} />
              </div>
            </div>
            <span className="ins-kpi-value">{summary.active_agreements}</span>
          </div>

          <div className="ins-kpi rentals-kpi amber rentals-kpi-agreement">
            <div className="rentals-kpi-header">
              <span className="ins-kpi-label">Expiring in 30 days</span>
              <div className="rentals-kpi-icon-box amber" aria-hidden="true">
                <ClockIcon size={17} />
              </div>
            </div>
            <span className="ins-kpi-value">{summary.agreements_expiring_next_30_days}</span>
          </div>

          <div className="ins-kpi rentals-kpi red rentals-kpi-agreement">
            <div className="rentals-kpi-header">
              <span className="ins-kpi-label">Overdue rent items</span>
              <div className="rentals-kpi-icon-box red" aria-hidden="true">
                <AlertTriangleIcon size={17} />
              </div>
            </div>
            <span className="ins-kpi-value">{summary.overdue_schedule_items}</span>
          </div>

          <div className="ins-kpi rentals-kpi purple rentals-kpi-agreement">
            <div className="rentals-kpi-header">
              <span className="ins-kpi-label">Open exit requests</span>
              <div className="rentals-kpi-icon-box purple" aria-hidden="true">
                <LogOutIcon size={17} />
              </div>
            </div>
            <span className="ins-kpi-value">{summary.open_exit_requests}</span>
          </div>

          <div className="ins-kpi rentals-kpi green rentals-kpi-financial">
            <div className="rentals-kpi-header">
              <span className="ins-kpi-label">Rent due in next 30 days</span>
              <div className="rentals-kpi-icon-box green" aria-hidden="true">
                <CoinsIcon size={17} />
              </div>
            </div>
            <span className="ins-kpi-value">{money(summary.scheduled_rent_next_30_days)}</span>
          </div>

          <div className="ins-kpi rentals-kpi amber rentals-kpi-financial">
            <div className="rentals-kpi-header">
              <span className="ins-kpi-label">Outstanding rent</span>
              <div className="rentals-kpi-icon-box amber" aria-hidden="true">
                <CreditCardIcon size={17} />
              </div>
            </div>
            <span className="ins-kpi-value">{money(summary.outstanding_rent)}</span>
          </div>

          <div className="ins-kpi rentals-kpi purple rentals-kpi-financial">
            <div className="rentals-kpi-header">
              <span className="ins-kpi-label">Deposits held</span>
              <div className="rentals-kpi-icon-box purple" aria-hidden="true">
                <KeyRoundIcon size={17} />
              </div>
            </div>
            <span className="ins-kpi-value">{money(summary.security_deposit_liability)}</span>
          </div>
        </div>
      )}

      <div className="ins-toolbar">
        <div className="leads-search-box">
          <input type="text" placeholder="Search by customer, property or status…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search agreements" />
        </div>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {RENTAL_AGREEMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
          <option value="">Rent &amp; Lease</option>
          <option value="Rent">Rent</option>
          <option value="Lease">Lease</option>
        </select>
        {hasFilters && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setTypeFilter("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="ins-alert error" role="alert">
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="leads-table-container">
        {loading && agreements.length === 0 ? (
          <div className="ins-loading" aria-busy="true">
            <div className="leads-loading-spinner" /> Loading agreements…
          </div>
        ) : !error && agreements.length === 0 ? (
          <div className="ins-empty">
            <h3>No rental agreements yet</h3>
            <p>{canCreate ? "Create an agreement for a rent or lease property to start collecting rent." : "Agreements appear here once they are created."}</p>
          </div>
        ) : agreements.length > 0 && filtered.length === 0 ? (
          <div className="ins-empty">
            <h3>No matching agreements</h3>
            <p>Try adjusting the search or filters.</p>
          </div>
        ) : (
          agreements.length > 0 && (
            <>
              <div className="ins-table-wrap">
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Property</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th className="num">Rent</th>
                      <th>Term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((a) => (
                      <tr key={a.id} onClick={() => navigate(`${base}/${a.id}`)} style={{ cursor: "pointer" }}>
                        <td>
                          <strong>{a.customer_name}</strong>
                          <div className="text-muted" style={{ fontSize: "0.78rem" }}>#{a.id.slice(0, 8).toUpperCase()}</div>
                        </td>
                        <td>{propertyNames[a.property_id] ?? "—"}</td>
                        <td>{a.agreement_type}</td>
                        <td>
                          <RentalStatusBadge status={a.status} />
                        </td>
                        <td className="num">{formatRent(a.rent_amount, a.rent_frequency)}</td>
                        <td>
                          {formatDay(a.agreement_start)} → {a.agreement_end ? formatDay(a.agreement_end) : "open-ended"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className="ins-pager">
                  <button className="btn-secondary ins-btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <span>
                    Page {page + 1} of {pageCount}
                  </span>
                  <button className="btn-secondary ins-btn-sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              )}
            </>
          )
        )}
      </div>

        </>
      )}

      {creating && (
        <CreateRentalAgreementModal
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            setToast("Draft agreement created. Open it to send it to the customer for signature.");
            navigate(`${base}/${created.id}`);
          }}
        />
      )}
    </div>
  );
}
