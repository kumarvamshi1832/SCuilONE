import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircleIcon,
  BuildingIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getAllPortalShortlistedProperties,
  removePortalShortlistProperty,
} from "../../services/customerPortalBuyerRequirementService";
import { getPortalSiteVisits } from "../../services/customerPortalCommercialService";
import { PortalPropertyMatchCard } from "../../components/portal/PortalPropertyMatchCard";
import { PortalSiteVisitRequestModal } from "../../components/portal/PortalSiteVisitRequestModal";
import { getPortalErrorMessage } from "../../utils/portalApiError";
import type { PortalShortlistedProperty } from "../../types/customerPortalBuyerRequirement";
import type { PortalSiteVisit } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";

export default function CustomerPortalShortlist() {
  const [items, setItems] = useState<PortalShortlistedProperty[]>([]);
  const [siteVisits, setSiteVisits] = useState<PortalSiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [visitTarget, setVisitTarget] = useState<PortalShortlistedProperty | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPartialWarning(null);
    try {
      const { items: loaded, failedRequirementIds } = await getAllPortalShortlistedProperties();
      setItems(loaded);
      getPortalSiteVisits().then(setSiteVisits).catch(() => undefined);
      if (failedRequirementIds.length > 0) {
        setPartialWarning(
          `Some shortlisted properties could not be loaded (${failedRequirementIds.length} requirement${
            failedRequirementIds.length === 1 ? "" : "s"
          }). Try refreshing.`
        );
      }
    } catch (err) {
      setItems([]);
      setError(getPortalErrorMessage(err, "Failed to load your shortlist."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const completedPropertyIds = useMemo(() => {
    const ids = new Set<string>();
    siteVisits.forEach((v) => {
      if (v.status?.toLowerCase() === "completed") {
        const pid = v.property?.id || v.property_id;
        if (pid) ids.add(pid);
      }
    });
    return ids;
  }, [siteVisits]);

  const completedPropertyNames = useMemo(() => {
    const names = new Set<string>();
    siteVisits.forEach((v) => {
      if (v.status?.toLowerCase() === "completed") {
        const name = (v.property?.name || v.property_title || "").trim().toLowerCase();
        if (name) names.add(name);
      }
    });
    return names;
  }, [siteVisits]);

  const hasCompletedVisit = useCallback(
    (prop: { id: string; name?: string | null }) => {
      if (completedPropertyIds.has(prop.id)) return true;
      if (prop.name && completedPropertyNames.has(prop.name.trim().toLowerCase())) return true;
      return false;
    },
    [completedPropertyIds, completedPropertyNames]
  );

  const handleRemove = async (item: PortalShortlistedProperty) => {
    const key = `${item.requirement.id}:${item.match_id}`;
    setBusyKey(key);
    try {
      await removePortalShortlistProperty(item.requirement.id, item.match_id);
      setItems((prev) => prev.filter((i) => `${i.requirement.id}:${i.match_id}` !== key));
      showToast("Removed from your shortlist.");
    } catch (err) {
      showToast(getPortalErrorMessage(err, "Could not remove this property."), "error");
    } finally {
      setBusyKey(null);
    }
  };

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

      <div className="cp-tickets-header">
        <div>
          <h1>Shortlist</h1>
          <p>Properties you saved from your matched results. Request a site visit for any of them.</p>
        </div>
        <button className="btn-secondary" onClick={load} disabled={loading} aria-label="Refresh shortlist">
          <RefreshIcon size={15} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{error}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={load}>
            Retry
          </button>
        </div>
      )}
      {partialWarning && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{partialWarning}</span>
        </div>
      )}

      {loading ? (
        <div className="cp-loading-grid" aria-busy="true" aria-label="Loading shortlist">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cp-skeleton" />
          ))}
        </div>
      ) : !error && items.length === 0 ? (
        <div className="cp-table-card">
          <div className="cp-empty-state">
            <BuildingIcon size={40} />
            <h3>Nothing shortlisted yet</h3>
            <p>Open one of your buyer requirements and save matched properties to see them here.</p>
            <Link to="/portal/buyer-requirements" className="btn-primary" style={{ marginTop: 16, textDecoration: "none" }}>
              Go to buyer requirements
            </Link>
          </div>
        </div>
      ) : (
        <div className="cp-prop-grid">
          {items.map((item) => {
            const key = `${item.requirement.id}:${item.match_id}`;
            const busy = busyKey === key;
            return (
              <PortalPropertyMatchCard
                key={key}
                item={item}
                subtitle={
                  <Link className="cp-ticket-link" to={`/portal/buyer-requirements/${item.requirement.id}`}>
                    {item.requirement.requirement_type} · {item.requirement.property_type} ·{" "}
                    {item.requirement.preferred_city}
                  </Link>
                }
              >
                {hasCompletedVisit(item.property) ? (
                  <button
                    type="button"
                    className="btn-primary cp-btn-visit-completed"
                    disabled
                    aria-disabled="true"
                    title="A site visit has already been completed for this property"
                    onClick={(e) => e.preventDefault()}
                  >
                    Site Visit Completed
                  </button>
                ) : (
                  <button className="btn-primary" onClick={() => setVisitTarget(item)} disabled={busy}>
                    Request site visit
                  </button>
                )}
                <button className="btn-secondary" onClick={() => handleRemove(item)} disabled={busy}>
                  {busy ? "Removing…" : "Remove"}
                </button>
              </PortalPropertyMatchCard>
            );
          })}
        </div>
      )}

      {visitTarget && (
        <PortalSiteVisitRequestModal
          propertyMatchId={visitTarget.match_id}
          propertyName={visitTarget.property.name}
          onClose={() => setVisitTarget(null)}
          onSubmitted={(result) => {
            setVisitTarget(null);
            showToast(result.message || "Site visit requested. Our team will confirm the appointment.");
            getPortalSiteVisits().then(setSiteVisits).catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}
