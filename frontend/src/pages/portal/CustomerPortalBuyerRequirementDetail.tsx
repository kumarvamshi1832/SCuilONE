import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  RefreshIcon,
  BuildingIcon,
} from "../../components/common/SupportPortalIcons";
import {
  addPortalShortlistProperty,
  getPortalBuyerRequirement,
  getPortalRequirementMatches,
  getPortalRequirementShortlist,
  removePortalShortlistProperty,
} from "../../services/customerPortalBuyerRequirementService";
import {
  PortalPropertyMatchCard,
  formatPortalMoney,
} from "../../components/portal/PortalPropertyMatchCard";
import { PortalSiteVisitRequestModal } from "../../components/portal/PortalSiteVisitRequestModal";
import { PortalPropertyDetailModal } from "../../components/portal/PortalPropertyDetailModal";
import { getPortalErrorMessage } from "../../utils/portalApiError";
import type {
  PortalBuyerRequirement,
  PortalPropertyMatch,
} from "../../types/customerPortalBuyerRequirement";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";

type DetailTab = "matches" | "shortlist";

export default function CustomerPortalBuyerRequirementDetail() {
  const { requirementId } = useParams<{ requirementId: string }>();

  const [requirement, setRequirement] = useState<PortalBuyerRequirement | null>(null);
  const [matches, setMatches] = useState<PortalPropertyMatch[]>([]);
  const [shortlist, setShortlist] = useState<PortalPropertyMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("matches");
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [visitTarget, setVisitTarget] = useState<PortalPropertyMatch | null>(null);
  const [detailTarget, setDetailTarget] = useState<PortalPropertyMatch | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    if (!requirementId) return;
    setLoading(true);
    setPageError(null);
    setSectionError(null);
    try {
      const req = await getPortalBuyerRequirement(requirementId);
      setRequirement(req);
    } catch (err) {
      setRequirement(null);
      setPageError(getPortalErrorMessage(err, "Failed to load this requirement."));
      setLoading(false);
      return;
    }
    const [matchesResult, shortlistResult] = await Promise.allSettled([
      getPortalRequirementMatches(requirementId),
      getPortalRequirementShortlist(requirementId),
    ]);
    const failures: string[] = [];
    if (matchesResult.status === "fulfilled") setMatches(matchesResult.value);
    else {
      setMatches([]);
      failures.push(getPortalErrorMessage(matchesResult.reason, "Failed to load matched properties."));
    }
    if (shortlistResult.status === "fulfilled") setShortlist(shortlistResult.value);
    else {
      setShortlist([]);
      failures.push(getPortalErrorMessage(shortlistResult.reason, "Failed to load your shortlist."));
    }
    setSectionError(failures.length ? failures.join(" ") : null);
    setLoading(false);
  }, [requirementId]);

  useEffect(() => {
    load();
  }, [load]);

  const shortlistedIds = useMemo(() => new Set(shortlist.map((s) => s.match_id)), [shortlist]);

  const handleToggleShortlist = async (item: PortalPropertyMatch) => {
    if (!requirementId) return;
    setBusyMatchId(item.match_id);
    try {
      if (shortlistedIds.has(item.match_id)) {
        await removePortalShortlistProperty(requirementId, item.match_id);
        setShortlist((prev) => prev.filter((s) => s.match_id !== item.match_id));
        showToast("Removed from your shortlist.");
      } else {
        await addPortalShortlistProperty(requirementId, item.match_id);
        setShortlist((prev) => [item, ...prev]);
        showToast("Saved to your shortlist.");
      }
    } catch (err) {
      showToast(getPortalErrorMessage(err, "Could not update your shortlist."), "error");
    } finally {
      setBusyMatchId(null);
    }
  };

  if (loading && !requirement) {
    return (
      <div className="cp-tickets-page" aria-busy="true">
        <div className="cp-skeleton" style={{ height: 120 }} />
        <div className="cp-loading-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cp-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (pageError || !requirement) {
    return (
      <div className="cp-tickets-page">
        <Link to="/portal/buyer-requirements" className="cp-back-link">
          <ArrowLeftIcon size={14} /> Back to requirements
        </Link>
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{pageError || "Requirement not found."}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const budget =
    requirement.min_budget && requirement.max_budget
      ? `${formatPortalMoney(requirement.min_budget)} – ${formatPortalMoney(requirement.max_budget)}`
      : requirement.max_budget
      ? `Up to ${formatPortalMoney(requirement.max_budget)}`
      : requirement.min_budget
      ? `From ${formatPortalMoney(requirement.min_budget)}`
      : "Flexible";

  const area =
    requirement.min_area && requirement.max_area
      ? `${Number(requirement.min_area)}–${Number(requirement.max_area)} ${requirement.area_unit}`
      : requirement.max_area
      ? `Up to ${Number(requirement.max_area)} ${requirement.area_unit}`
      : requirement.min_area
      ? `From ${Number(requirement.min_area)} ${requirement.area_unit}`
      : "Any";

  const list = tab === "matches" ? matches : shortlist;

  return (
    <div className="cp-tickets-page">
      {toast && (
        <div className="cp-toast-stack" role="status" aria-live="polite">
          <div className={`support-alert ${toast.type}`}>
            {toast.type === "success" ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <Link to="/portal/buyer-requirements" className="cp-back-link">
        <ArrowLeftIcon size={14} /> Back to requirements
      </Link>

      <div className="cp-tickets-header">
        <div>
          <h1>
            {requirement.requirement_type} · {requirement.property_type}
          </h1>
          <p>
            {[requirement.preferred_location, requirement.preferred_city].filter(Boolean).join(", ") ||
              "Any location"}
          </p>
        </div>
        <span className={`cp-req-status status-${requirement.status.toLowerCase()}`}>
          {requirement.status}
        </span>
      </div>

      <section className="cp-panel" aria-label="Requirement details">
        <dl className="cp-req-facts" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="cp-req-fact">
            <dt>Budget</dt>
            <dd>{budget}</dd>
          </div>
          <div className="cp-req-fact">
            <dt>Bedrooms</dt>
            <dd>{requirement.bedrooms ?? "Any"}</dd>
          </div>
          <div className="cp-req-fact">
            <dt>Area</dt>
            <dd>{area}</dd>
          </div>
          <div className="cp-req-fact">
            <dt>Submitted</dt>
            <dd>{new Date(requirement.created_at).toLocaleDateString()}</dd>
          </div>
          <div className="cp-req-fact">
            <dt>Last updated</dt>
            <dd>{new Date(requirement.updated_at).toLocaleDateString()}</dd>
          </div>
        </dl>
      </section>

      <div className="cp-tab-bar" role="tablist" aria-label="Matches and shortlist">
        <button
          role="tab"
          aria-selected={tab === "matches"}
          className={`cp-tab ${tab === "matches" ? "active" : ""}`}
          onClick={() => setTab("matches")}
        >
          Matched properties ({matches.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "shortlist"}
          className={`cp-tab ${tab === "shortlist" ? "active" : ""}`}
          onClick={() => setTab("shortlist")}
        >
          My Shortlist ({shortlist.length})
        </button>
        <button
          className="btn-secondary"
          style={{ marginLeft: "auto", alignSelf: "center" }}
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshIcon size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {sectionError && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{sectionError}</span>
        </div>
      )}

      {list.length === 0 ? (
        <div className="cp-table-card">
          <div className="cp-empty-state">
            <BuildingIcon size={40} />
            {tab === "matches" ? (
              <>
                <h3>No matched properties yet</h3>
                <p>
                  Our team has not matched any available properties to this requirement yet. You will be
                  notified when matches are added.
                </p>
              </>
            ) : (
              <>
                <h3>Your shortlist is empty</h3>
                <p>Save properties from the matched list to compare them and request a site visit.</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="cp-prop-grid">
          {list.map((item) => {
            const saved = shortlistedIds.has(item.match_id);
            const busy = busyMatchId === item.match_id;
            return (
              <PortalPropertyMatchCard key={item.match_id} item={item}>
                <button className="btn-secondary" onClick={() => setDetailTarget(item)} disabled={busy}>
                  View Details
                </button>
                <button
                  className={saved ? "btn-secondary" : "btn-primary"}
                  onClick={() => handleToggleShortlist(item)}
                  disabled={busy}
                >
                  {busy ? "Please wait…" : saved ? "Remove from My Shortlist" : "Add to My Shortlist"}
                </button>
                {saved && (
                  <button className="btn-secondary" onClick={() => setVisitTarget(item)} disabled={busy}>
                    Request site visit
                  </button>
                )}
              </PortalPropertyMatchCard>
            );
          })}
        </div>
      )}

      {detailTarget && (
        <PortalPropertyDetailModal item={detailTarget} onClose={() => setDetailTarget(null)}>
          <button
            className={shortlistedIds.has(detailTarget.match_id) ? "btn-secondary" : "btn-primary"}
            onClick={() => handleToggleShortlist(detailTarget)}
            disabled={busyMatchId === detailTarget.match_id}
          >
            {shortlistedIds.has(detailTarget.match_id) ? "Remove from My Shortlist" : "Add to My Shortlist"}
          </button>
          <button className="btn-secondary" onClick={() => setDetailTarget(null)}>
            Close
          </button>
        </PortalPropertyDetailModal>
      )}

      {visitTarget && (
        <PortalSiteVisitRequestModal
          propertyMatchId={visitTarget.match_id}
          propertyName={visitTarget.property.name}
          onClose={() => setVisitTarget(null)}
          onSubmitted={(result) => {
            setVisitTarget(null);
            showToast(result.message || "Site visit requested. Our team will confirm the appointment.");
          }}
        />
      )}
    </div>
  );
}
