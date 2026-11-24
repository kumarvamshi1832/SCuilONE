import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import PortalRequirementRevisions from "../../components/portal/PortalRequirementRevisions";
import PortalOfferNegotiation from "../../components/portal/PortalOfferNegotiation";
import { RentalOfferCard, type RentalOfferCardItem } from "../../components/portal/RentalOfferCard";
import { getPortalOffers } from "../../services/customerPortalOfferService";
import { emitPortalNotificationsChanged } from "../../services/customerPortalNotificationService";
import { getPortalSiteVisits } from "../../services/customerPortalCommercialService";
import { loadPortalMatches } from "../../services/customerPortalBookingNegotiation";
import { getPortalErrorMessage } from "../../utils/portalApiError";
import {
  formatOfferDiff,
  formatOfferMoney,
  isRentalListing,
  summarizeNegotiation,
  type NegotiationSummary,
} from "../../utils/offerDisplay";
import type {
  PortalBuyerRequirement,
  PortalPropertyMatch,
} from "../../types/customerPortalBuyerRequirement";
import type { PortalSiteVisit } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";
import "./CustomerPortalRentals.css";

type DetailTab = "matches" | "shortlist" | "revisions";

export default function CustomerPortalBuyerRequirementDetail() {
  const { requirementId } = useParams<{ requirementId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const respondParam = searchParams.get("respond");
  const offerParam = searchParams.get("offer");

  const [requirement, setRequirement] = useState<PortalBuyerRequirement | null>(null);
  const [matches, setMatches] = useState<PortalPropertyMatch[]>([]);
  const [shortlist, setShortlist] = useState<PortalPropertyMatch[]>([]);
  const [siteVisits, setSiteVisits] = useState<PortalSiteVisit[]>([]);
  const [pendingOffers, setPendingOffers] = useState<RentalOfferCardItem[]>([]);
  const [matchOfferSummaries, setMatchOfferSummaries] = useState<
    Record<string, { summary: NegotiationSummary; item: RentalOfferCardItem }>
  >({});
  const [selectedOfferMatch, setSelectedOfferMatch] = useState<PortalPropertyMatch | null>(null);
  const [modalAction, setModalAction] = useState<"offer" | "counter" | "accept" | "reject">("offer");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("matches");
  /** Bumped by Refresh so the revision history is fetched again too. */
  const [revisionsRefresh, setRevisionsRefresh] = useState(0);
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [visitTarget, setVisitTarget] = useState<PortalPropertyMatch | null>(null);
  const [detailTarget, setDetailTarget] = useState<PortalPropertyMatch | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const matchesRef = useRef<HTMLDivElement>(null);
  const shortlistRef = useRef<HTMLDivElement>(null);
  const revisionsRef = useRef<HTMLDivElement>(null);
  const isManualScrollRef = useRef(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    emitPortalNotificationsChanged();
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    if (!requirementId) return;
    setLoading(true);
    setPageError(null);
    setSectionError(null);
    let req: PortalBuyerRequirement;
    try {
      req = await getPortalBuyerRequirement(requirementId);
      setRequirement(req);
    } catch (err) {
      setRequirement(null);
      setPageError(getPortalErrorMessage(err, "Failed to load this requirement."));
      setLoading(false);
      return;
    }
    const [matchesResult, shortlistResult, visitsResult, allPortalMatches] = await Promise.allSettled([
      getPortalRequirementMatches(requirementId),
      getPortalRequirementShortlist(requirementId),
      getPortalSiteVisits(),
      loadPortalMatches(),
    ]);
    const failures: string[] = [];
    if (matchesResult.status === "fulfilled" || allPortalMatches.status === "fulfilled") {
      const apiMatches = matchesResult.status === "fulfilled" ? matchesResult.value : [];
      const extraMatches =
        allPortalMatches.status === "fulfilled"
          ? allPortalMatches.value.filter(
              (m) =>
                m.requirement_id === requirementId &&
                !apiMatches.some((am) => am.match_id === m.match_id)
            )
          : [];
      const combinedMatches = [...apiMatches, ...extraMatches];
      const enrichedMatches = combinedMatches.map((m) => ({
        ...m,
        requirement_id: requirementId,
        requirement_type: req.requirement_type,
      }));
      setMatches(enrichedMatches);

      // Asynchronously load offer details for all matched properties
      const offerPromises = enrichedMatches.map(async (m) => {
        try {
          const offers = await getPortalOffers(m.match_id);
          const summary = summarizeNegotiation(offers);
          const isRental = isRentalListing(m.property.listing_type) || isRentalListing(req.requirement_type);
          const rawProposed = Number(summary.staffOffer?.offered_price ?? summary.state.open?.offered_price ?? 0);
          const rawListed = Number(m.property.price ?? 0);
          const diffInfo =
            rawProposed > 0 && rawListed > 0
              ? formatOfferDiff(rawProposed, rawListed, m.property.currency)
              : null;

          const cardItem: RentalOfferCardItem = {
            match: m,
            offer: (summary.staffOffer || summary.state.open || offers[0])!,
            summary,
            propertyName: m.property.name,
            propertyImage:
              (m.property.images?.find((img) => img.is_primary) || m.property.images?.[0])?.image_url ?? null,
            propertyLocation:
              [m.property.unit_number ? `Unit ${m.property.unit_number}` : null, m.property.city, m.property.state]
                .filter(Boolean)
                .join(" · ") || null,
            propertyType: m.property.property_type ?? null,
            listedRent: formatOfferMoney(rawListed, isRental ? "Monthly" : undefined, m.property.currency),
            monthlyRent: formatOfferMoney(rawProposed, isRental ? "Monthly" : undefined, m.property.currency),
            rawProposed,
            rawListed,
            diffInfo,
            securityDeposit: (m.property as any)?.security_deposit
              ? formatOfferMoney((m.property as any)?.security_deposit, "One-time", m.property.currency)
              : null,
            durationText: req.min_duration_months ? `${req.min_duration_months} months` : "12 months (Standard)",
            propertyId: m.property.id,
            matchId: m.match_id,
            requirementId: requirementId ?? null,
            requestId: null,
            staffName: (summary.staffOffer as any)?.created_by_name || "Property Team",
            submittedAt: summary.staffOffer?.created_at || summary.state.open?.created_at || new Date().toISOString(),
            expiresAt: summary.staffOffer?.expires_at || summary.state.open?.expires_at || null,
            isLapsed: Boolean(
              summary.staffOffer?.expires_at && new Date(summary.staffOffer.expires_at).getTime() < Date.now()
            ),
            status: "Awaiting your response",
          };

          return { match: m, offers, summary, cardItem };
        } catch {
          return null;
        }
      });

      const offerResults = await Promise.all(offerPromises);
      const pending: RentalOfferCardItem[] = [];
      const summariesMap: Record<string, { summary: NegotiationSummary; item: RentalOfferCardItem }> = {};

      offerResults.forEach((res) => {
        if (!res) return;
        summariesMap[res.match.match_id] = { summary: res.summary, item: res.cardItem };
        if (res.summary.awaiting === "customer") {
          pending.push(res.cardItem);
        }
      });

      setPendingOffers(pending);
      setMatchOfferSummaries(summariesMap);
    } else {
      setMatches([]);
      setPendingOffers([]);
      setMatchOfferSummaries({});
      failures.push(getPortalErrorMessage(matchesResult.reason, "Failed to load matched properties."));
    }
    if (shortlistResult.status === "fulfilled") setShortlist(shortlistResult.value);
    else {
      setShortlist([]);
      failures.push(getPortalErrorMessage(shortlistResult.reason, "Failed to load your shortlist."));
    }
    if (visitsResult.status === "fulfilled") setSiteVisits(visitsResult.value);
    else setSiteVisits([]);
    setSectionError(failures.length ? failures.join(" ") : null);
    setLoading(false);
  }, [requirementId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if ((respondParam || offerParam) && matches.length > 0) {
      const matchWithOffer = matches.find((m) => {
        const item = matchOfferSummaries[m.match_id];
        return (
          item?.item.offer.id === offerParam ||
          m.match_id === offerParam ||
          (respondParam && item?.summary.awaiting === "customer")
        );
      });
      if (matchWithOffer) {
        setSelectedOfferMatch(matchWithOffer);
        setModalAction("offer");
      }
    }
  }, [respondParam, offerParam, matches, matchOfferSummaries]);

  const handleCloseOfferModal = () => {
    setSelectedOfferMatch(null);
    setModalAction("offer");
    if (respondParam || offerParam) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("respond");
      nextParams.delete("offer");
      setSearchParams(nextParams, { replace: true });
    }
    void load();
  };

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

  const scrollToSection = (targetTab: DetailTab) => {
    setTab(targetTab);
    isManualScrollRef.current = true;
    const targetRef =
      targetTab === "matches"
        ? matchesRef
        : targetTab === "shortlist"
        ? shortlistRef
        : revisionsRef;

    if (targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    window.setTimeout(() => {
      isManualScrollRef.current = false;
    }, 850);
  };

  useEffect(() => {
    const scrollContainer = document.querySelector(".cp-content-wrapper") || window;
    const handleScroll = () => {
      if (isManualScrollRef.current) return;
      const offset = 140; // Clearance for header and sticky tab bar
      const containerTop =
        scrollContainer instanceof HTMLElement ? scrollContainer.getBoundingClientRect().top : 0;

      const sections: Array<{ id: DetailTab; ref: React.RefObject<HTMLDivElement | null> }> = [
        { id: "matches", ref: matchesRef },
        { id: "shortlist", ref: shortlistRef },
        { id: "revisions", ref: revisionsRef },
      ];

      let active: DetailTab = "matches";
      for (const s of sections) {
        if (s.ref.current) {
          const rect = s.ref.current.getBoundingClientRect();
          if (rect.top - containerTop <= offset) {
            active = s.id;
          }
        }
      }
      setTab((prev) => (prev !== active ? active : prev));
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

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

      <div className="cp-tab-bar cp-sticky-tab-bar" role="tablist" aria-label="Requirement sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "matches"}
          className={`cp-tab ${tab === "matches" ? "active" : ""}`}
          onClick={() => scrollToSection("matches")}
        >
          Matched properties ({matches.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "shortlist"}
          className={`cp-tab ${tab === "shortlist" ? "active" : ""}`}
          onClick={() => scrollToSection("shortlist")}
        >
          My Shortlist ({shortlist.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "revisions"}
          className={`cp-tab ${tab === "revisions" ? "active" : ""}`}
          onClick={() => scrollToSection("revisions")}
        >
          Revision History
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ marginLeft: "auto", alignSelf: "center" }}
          onClick={() => {
            setRevisionsRefresh((n) => n + 1);
            void load();
          }}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshIcon size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {sectionError && (
        <div className="support-alert error" role="alert" style={{ marginBottom: 16 }}>
          <AlertCircleIcon size={18} />
          <span>{sectionError}</span>
        </div>
      )}

      {/* ─── Dedicated Section: Rental Offers Awaiting Your Response ─── */}
      {pendingOffers.length > 0 && (
        <section
          className="cp-detail-section cp-rental-offers-section"
          aria-label="Rental offers awaiting your response"
        >
          <div className="cp-detail-section-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 className="cp-detail-section-title">Rental Offers Awaiting Your Response</h2>
                <span className="cp-rental-offers-badge">
                  {pendingOffers.length} {pendingOffers.length === 1 ? "Offer" : "Offers"}
                </span>
              </div>
              <p className="cp-detail-section-subtitle">
                Review proposed monthly rental amounts, security deposits, and terms proposed by our property team.
              </p>
            </div>
          </div>
          <div className="cp-rentals-grid cp-rental-offers-grid">
            {pendingOffers.map((item) => (
              <RentalOfferCard
                key={item.offer.id}
                item={item}
                onViewOffer={() => {
                  setModalAction("offer");
                  setSelectedOfferMatch(item.match);
                }}
                onAcceptOffer={() => {
                  setModalAction("accept");
                  setSelectedOfferMatch(item.match);
                }}
                onRejectOffer={() => {
                  setModalAction("reject");
                  setSelectedOfferMatch(item.match);
                }}
                onCounterOffer={() => {
                  setModalAction("counter");
                  setSelectedOfferMatch(item.match);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── SECTION 1: Matched Properties ─── */}
      <section
        id="matched-properties-section"
        ref={matchesRef}
        className="cp-detail-section"
        aria-label="Matched properties"
      >
        <div className="cp-detail-section-header">
          <div>
            <h2 className="cp-detail-section-title">
              Matched Properties ({matches.length})
            </h2>
            <p className="cp-detail-section-subtitle">
              Available properties matched to this requirement based on your preferred criteria.
            </p>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="cp-table-card">
            <div className="cp-empty-state">
              <BuildingIcon size={40} />
              <h3>No matched properties yet</h3>
              <p>
                Our team has not matched any available properties to this requirement yet.
                You will be notified as soon as new matching listings are available.
              </p>
            </div>
          </div>
        ) : (
          <div className="cp-prop-grid">
            {matches.map((item) => {
              const saved = shortlistedIds.has(item.match_id);
              const busy = busyMatchId === item.match_id;
              const offerInfo = matchOfferSummaries[item.match_id];
              const hasActiveOffer = offerInfo?.summary.awaiting === "customer";
              return (
                <PortalPropertyMatchCard
                  key={`match-${item.match_id}`}
                  item={item}
                  subtitle={
                    hasActiveOffer && offerInfo ? (
                      <div className="cp-match-card-offer-banner">
                        <div className="cp-match-card-offer-head">
                          <span className="neg-badge neg-badge-submitted">⚡ Offer Received: Awaiting Response</span>
                          {offerInfo.item.diffInfo && (
                            <span
                              className={`cp-rental-offer-diff-pill ${
                                offerInfo.item.diffInfo.isAbove
                                  ? "diff-above"
                                  : offerInfo.item.diffInfo.isBelow
                                  ? "diff-below"
                                  : "diff-equal"
                              }`}
                            >
                              {offerInfo.item.diffInfo.text}
                            </span>
                          )}
                        </div>
                        <div className="cp-match-card-offer-pricing">
                          <span className="cp-match-card-offer-price">{offerInfo.item.monthlyRent}</span>
                          <span className="cp-match-card-offer-orig">Listed: {offerInfo.item.listedRent}</span>
                        </div>
                        <div className="cp-match-card-offer-actions">
                          <button
                            type="button"
                            className="btn-primary cp-btn-xs"
                            onClick={() => {
                              setModalAction("offer");
                              setSelectedOfferMatch(item);
                            }}
                          >
                            View Offer
                          </button>
                          <button
                            type="button"
                            className="btn-secondary cp-btn-xs"
                            onClick={() => {
                              setModalAction("accept");
                              setSelectedOfferMatch(item);
                            }}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn-secondary cp-btn-xs"
                            onClick={() => {
                              setModalAction("counter");
                              setSelectedOfferMatch(item);
                            }}
                          >
                            Counter
                          </button>
                          <button
                            type="button"
                            className="btn-secondary cp-btn-xs"
                            onClick={() => {
                              setModalAction("reject");
                              setSelectedOfferMatch(item);
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ) : null
                  }
                >
                  <button
                    className="btn-secondary"
                    onClick={() => setDetailTarget(item)}
                    disabled={busy}
                  >
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
                    hasCompletedVisit(item.property) ? (
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
                      <button
                        className="btn-secondary"
                        onClick={() => setVisitTarget(item)}
                        disabled={busy}
                      >
                        Request site visit
                      </button>
                    )
                  )}
                </PortalPropertyMatchCard>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── SECTION 2: My Shortlist ─── */}
      <section
        id="my-shortlist-section"
        ref={shortlistRef}
        className="cp-detail-section"
        aria-label="My shortlist"
      >
        <div className="cp-detail-section-header">
          <div>
            <h2 className="cp-detail-section-title">
              My Shortlist ({shortlist.length})
            </h2>
            <p className="cp-detail-section-subtitle">
              Properties you shortlisted for this requirement. Compare options or request site visits.
            </p>
          </div>
        </div>

        {shortlist.length === 0 ? (
          <div className="cp-table-card">
            <div className="cp-empty-state">
              <BuildingIcon size={40} />
              <h3>Your shortlist is empty</h3>
              <p>
                Save properties from the Matched Properties section above to compare them and request a site visit.
              </p>
            </div>
          </div>
        ) : (
          <div className="cp-prop-grid">
            {shortlist.map((item) => {
              const busy = busyMatchId === item.match_id;
              return (
                <PortalPropertyMatchCard key={`shortlist-${item.match_id}`} item={item}>
                  <button
                    className="btn-secondary"
                    onClick={() => setDetailTarget(item)}
                    disabled={busy}
                  >
                    View Details
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleToggleShortlist(item)}
                    disabled={busy}
                  >
                    {busy ? "Please wait…" : "Remove from My Shortlist"}
                  </button>
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
                    <button
                      className="btn-primary"
                      onClick={() => setVisitTarget(item)}
                      disabled={busy}
                    >
                      Request site visit
                    </button>
                  )}
                </PortalPropertyMatchCard>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── SECTION 3: Revision History ─── */}
      <section
        id="revision-history-section"
        ref={revisionsRef}
        className="cp-detail-section"
        aria-label="Revision history"
      >
        <div className="cp-detail-section-header">
          <div>
            <h2 className="cp-detail-section-title">Revision History</h2>
            <p className="cp-detail-section-subtitle">
              Audit trail of changes made to this requirement's criteria and preferences.
            </p>
          </div>
        </div>

        <PortalRequirementRevisions
          requirementId={requirement.id}
          refreshToken={revisionsRefresh}
        />
      </section>

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
            getPortalSiteVisits().then(setSiteVisits).catch(() => undefined);
          }}
        />
      )}

      {selectedOfferMatch && (
        <PortalOfferNegotiation
          item={selectedOfferMatch}
          initialAction={modalAction}
          onClose={handleCloseOfferModal}
          notify={(msg, type) => {
            showToast(msg, type ?? "success");
            void load();
          }}
        />
      )}
    </div>
  );
}
