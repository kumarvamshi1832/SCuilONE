import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircleIcon,
  BuildingIcon,
  CheckCircleIcon,
  GridIcon,
  RefreshIcon,
  TableIcon,
} from "../../components/common/SupportPortalIcons";
import PortalRentalRequests from "../../components/portal/PortalRentalRequests";
import PortalOfferNegotiation from "../../components/portal/PortalOfferNegotiation";
import { RentalOfferCard, type RentalOfferCardItem } from "../../components/portal/RentalOfferCard";
import { RentalStatusBadge } from "../../components/rentals/RentalWidgets";
import {
  getPortalPropertyNameMap,
  getPortalRentalAgreements,
  getPortalRentalBookingRequests,
  getPortalRentalProperties,
} from "../../services/customerPortalRentalService";
import { loadPortalMatches } from "../../services/customerPortalBookingNegotiation";
import { getPortalOffers } from "../../services/customerPortalOfferService";
import { emitPortalNotificationsChanged } from "../../services/customerPortalNotificationService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatDay, formatRent } from "../../utils/rentalHelpers";
import {
  byCreatedAt,
  formatOfferDiff,
  formatOfferMoney,
  isRentalListing,
  summarizeNegotiation,
} from "../../utils/offerDisplay";
import type { RentalAgreement } from "../../types/rental";
import type { PortalPropertyMatch } from "../../types/customerPortalBuyerRequirement";
import type { PropertyOffer } from "../../types/propertyOffer";
import type {
  EligibleRentalProperty,
  RentalBookingRequest,
} from "../../types/rentalBookingRequest";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";
import "../../components/booking-journey/BookingJourney.css";
import "./CustomerPortalRentals.css";

/** What the customer should do next, from the agreement status the backend returned. */
const nextStep = (a: RentalAgreement): string => {
  switch (a.status) {
    case "Pending Signature":
      return a.customer_signed_at
        ? "You have signed. Pay the security deposit (if due); our team will activate the agreement."
        : "Review and sign your agreement.";
    case "Active":
      return "";
    case "Termination Requested":
      return "Your exit request is being processed.";
    case "Expired":
      return "This agreement has reached its end date. Contact our team about renewal or move-out.";
    case "Terminated":
    case "Completed":
      return "This agreement has ended.";
    default:
      return "";
  }
};

export type RentalOfferItem = RentalOfferCardItem;

/** The customer's own rent / lease agreements & offers (GET /api/v1/customer-portal/rental-agreements). */
export default function CustomerPortalRentals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const respondParam = searchParams.get("respond");
  const offerParam = searchParams.get("offer");

  const [agreements, setAgreements] = useState<RentalAgreement[] | undefined>(undefined);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Rental Offers
  const [rentalOffers, setRentalOffers] = useState<RentalOfferItem[] | undefined>(undefined);
  const [allRentalMatches, setAllRentalMatches] = useState<PortalPropertyMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<PortalPropertyMatch | null>(null);
  const [modalAction, setModalAction] = useState<"offer" | "counter" | "accept" | "reject">("offer");
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [agreementsViewMode, setAgreementsViewMode] = useState<"grid" | "table">(() => {
    try {
      return (localStorage.getItem("cp_rental_agreements_view") as "grid" | "table") || "grid";
    } catch {
      return "grid";
    }
  });

  const handleToggleAgreementsView = (mode: "grid" | "table") => {
    setAgreementsViewMode(mode);
    try {
      localStorage.setItem("cp_rental_agreements_view", mode);
    } catch {
      /* storage unavailable */
    }
  };

  const load = useCallback(async () => {
    setError(null);
    setLoadingOffers(true);

    // 1. Rental agreements
    try {
      setAgreements(await getPortalRentalAgreements());
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load your rental agreements."));
      setAgreements((prev) => prev ?? []);
    }

    // 2. Property name lookup
    getPortalPropertyNameMap().then(setNames).catch(() => undefined);

    // 3. Rental properties & requests for enrichment (security deposit, term)
    let rentalPropsMap: Record<string, EligibleRentalProperty> = {};
    let rentalReqs: RentalBookingRequest[] = [];
    try {
      const [props, reqs] = await Promise.all([
        getPortalRentalProperties().catch(() => [] as EligibleRentalProperty[]),
        getPortalRentalBookingRequests().catch(() => [] as RentalBookingRequest[]),
      ]);
      props.forEach((p) => {
        rentalPropsMap[p.id] = p;
      });
      rentalReqs = reqs;
    } catch {
      /* best effort */
    }

    // 4. Load matches and find rental property offers
    try {
      const allMatches = await loadPortalMatches().catch(() => [] as PortalPropertyMatch[]);
      const rentalMatches = allMatches.filter(
        (m) =>
          isRentalListing(m.property.listing_type) ||
          isRentalListing(m.requirement_type) ||
          rentalPropsMap[m.property.id] !== undefined
      );
      const candidates = rentalMatches.length > 0 ? rentalMatches : allMatches;
      setAllRentalMatches(candidates);

      const offerResults = await Promise.allSettled(
        candidates.map(async (m) => {
          const offers = await getPortalOffers(m.match_id).catch(() => [] as PropertyOffer[]);
          return { match: m, offers: [...offers].sort(byCreatedAt) };
        })
      );

      const items: RentalOfferItem[] = [];
      offerResults.forEach((res) => {
        if (res.status !== "fulfilled") return;
        const { match, offers } = res.value;
        if (offers.length === 0) return;
        const summary = summarizeNegotiation(offers);
        const openOffer = summary.state.open ?? summary.state.latest;
        if (!openOffer) return;

        // Check whether this negotiation is for a rental/lease transaction
        const isRental =
          isRentalListing(match.property.listing_type) ||
          isRentalListing(match.requirement_type) ||
          (Boolean(openOffer.price_frequency) && openOffer.price_frequency !== "One-time") ||
          rentalPropsMap[match.property.id] !== undefined;
        if (!isRental) return;

        const matchedReq = rentalReqs.find(
          (r) => r.property_match_id === match.match_id || r.property_id === match.property.id
        );

        const propData = rentalPropsMap[match.property.id];
        const propertyName = match.property.name
          ? match.property.unit_number
            ? `${match.property.name} (Unit ${match.property.unit_number})`
            : match.property.name
          : names[match.property.id] || propData?.name || "Rental Property";

        const propertyLocation = [
          match.property.unit_number ? `Unit ${match.property.unit_number}` : null,
          match.property.address,
          match.property.city,
          match.property.state,
        ]
          .filter(Boolean)
          .join(" · ") || null;

        const propertyImage =
          match.property.images?.find((i) => i.is_primary)?.image_url ??
          match.property.images?.[0]?.image_url ??
          null;

        const currency = match.property.currency || "INR";
        const priceFreq = openOffer.price_frequency || "Monthly";
        const monthlyRent = formatOfferMoney(openOffer.offered_price, priceFreq, currency);
        const listedRent = formatOfferMoney(match.property.price, priceFreq, currency);
        const rawProposed = Number(openOffer.offered_price);
        const rawListed = Number(match.property.price);
        const diffInfo = formatOfferDiff(openOffer.offered_price, match.property.price, currency);

        const depositVal =
          propData?.security_deposit ||
          (match.property as any)?.security_deposit ||
          matchedReq?.approved_deposit_amount ||
          matchedReq?.proposed_deposit_amount;
        const securityDeposit = depositVal
          ? formatOfferMoney(depositVal, "One-time", currency)
          : null;

        const durationVal = matchedReq?.duration_months
          ? `${matchedReq.duration_months} months`
          : propData?.minimum_term_months
          ? propData.maximum_term_months && propData.maximum_term_months !== propData.minimum_term_months
            ? `${propData.minimum_term_months}–${propData.maximum_term_months} months`
            : `${propData.minimum_term_months} months`
          : null;

        const item: RentalOfferItem = {
          match,
          offer: openOffer,
          summary,
          propertyName,
          propertyImage,
          propertyLocation,
          propertyType: match.property.property_type || "Rental Property",
          listedRent,
          monthlyRent,
          rawProposed,
          rawListed,
          diffInfo,
          securityDeposit,
          durationText: durationVal,
          propertyId: match.property.id,
          matchId: match.match_id,
          requirementId: match.requirement_id ?? null,
          requestId: matchedReq?.id ?? null,
          staffName: "Property Team",
          submittedAt: openOffer.created_at,
          expiresAt: openOffer.expires_at ?? null,
          isLapsed: Boolean(summary.state.lapsed),
          status: summary.offerStatus ?? openOffer.status,
        };

        // Only include offers currently awaiting the customer's response in this section
        if (summary.awaiting === "customer") {
          items.push(item);
        }
      });

      setRentalOffers(items);
    } catch {
      setRentalOffers([]);
    } finally {
      setLoadingOffers(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Handle auto-open when navigating with ?respond=true and/or ?offer=<offerId>
  useEffect(() => {
    if (!respondParam && !offerParam) return;
    if (loadingOffers) return;

    if (offerParam) {
      // 1. Search in pending offers
      const fromPending = rentalOffers?.find(
        (item) => item.offer.id === offerParam || item.summary.state.latest?.id === offerParam
      );
      if (fromPending) {
        setSelectedMatch(fromPending.match);
        return;
      }

      // 2. Search across all candidate rental matches
      const findAndOpen = async () => {
        for (const m of allRentalMatches) {
          const offers = await getPortalOffers(m.match_id).catch(() => [] as PropertyOffer[]);
          if (offers.some((o) => o.id === offerParam)) {
            setSelectedMatch(m);
            return;
          }
        }
      };
      void findAndOpen();
      return;
    }

    if (respondParam === "true" && rentalOffers && rentalOffers.length > 0) {
      const first = rentalOffers[0];
      if (first) setSelectedMatch(first.match);
    }
  }, [respondParam, offerParam, loadingOffers, rentalOffers, allRentalMatches]);

  const handleCloseModal = () => {
    setSelectedMatch(null);
    setModalAction("offer");
    if (respondParam || offerParam) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("respond");
      nextParams.delete("offer");
      setSearchParams(nextParams, { replace: true });
    }
    void load();
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotice({ message, type });
    emitPortalNotificationsChanged();
    setTimeout(() => {
      setNotice((curr) => (curr?.message === message ? null : curr));
    }, 5000);
  };

  return (
    <div className="cp-tickets-page cp-rentals-page">
      <div className="cp-tickets-header cp-rentals-page-header">
        <div className="cp-rentals-page-header-text">
          <h1>My Rentals &amp; Leases</h1>
          <p>Review rental offers, sign agreements, pay rent &amp; security deposits, and manage your tenancy.</p>
        </div>
        <button className="btn-secondary cp-rentals-refresh-btn" onClick={() => void load()} aria-label="Refresh">
          <RefreshIcon size={15} />
          <span>Refresh</span>
        </button>
      </div>

      {notice && (
        <div className={`support-alert ${notice.type === "error" ? "error" : "success"}`} role="alert">
          {notice.type === "error" ? <AlertCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
          <span>{notice.message}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{error}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {/* Dedicated Section: Rental Offers Awaiting Your Response */}
      {rentalOffers && rentalOffers.length > 0 && (
        <section
          className="cp-panel cp-rentals-section cp-rental-offers-section"
          aria-label="Rental offers awaiting your response"
        >
          <div className="cp-rentals-section-header">
            <div className="cp-rentals-section-title-wrap">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 className="cp-rentals-section-title">Rental Offers Awaiting Your Response</h2>
                <span className="cp-rental-offers-badge">
                  {rentalOffers.length} {rentalOffers.length === 1 ? "Offer" : "Offers"}
                </span>
              </div>
              <p className="cp-rentals-section-desc">
                Review proposed monthly rental amounts, security deposits, and terms from our property team. Accept,
                counter, or decline.
              </p>
            </div>
          </div>

          <div className="cp-rentals-grid cp-rental-offers-grid">
            {rentalOffers.map((item) => (
              <RentalOfferCard
                key={item.offer.id}
                item={item}
                onViewOffer={() => {
                  setModalAction("offer");
                  setSelectedMatch(item.match);
                }}
                onAcceptOffer={() => {
                  setModalAction("accept");
                  setSelectedMatch(item.match);
                }}
                onRejectOffer={() => {
                  setModalAction("reject");
                  setSelectedMatch(item.match);
                }}
                onCounterOffer={() => {
                  setModalAction("counter");
                  setSelectedMatch(item.match);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Offer Negotiation Modal */}
      {selectedMatch && (
        <PortalOfferNegotiation
          item={selectedMatch}
          initialAction={modalAction}
          onClose={handleCloseModal}
          notify={(msg, type) => {
            showToast(msg, type ?? "success");
            void load();
          }}
        />
      )}

      <PortalRentalRequests names={names} onChanged={() => void load()} />

      <section className="cp-panel cp-rentals-section" aria-label="Rental agreements">
        <div className="cp-rentals-section-header">
          <div className="cp-rentals-section-title-wrap">
            <h2 className="cp-rentals-section-title">Rental Agreements</h2>
            <p className="cp-rentals-section-desc">Review, sign, and manage your active and past rent or lease agreements.</p>
          </div>
          <div className="cp-rentals-header-actions">
            <div className="cp-view-toggle" role="group" aria-label="Rental agreements view mode">
              <button
                type="button"
                className={`cp-view-toggle-btn ${agreementsViewMode === "grid" ? "active" : ""}`}
                onClick={() => handleToggleAgreementsView("grid")}
                aria-pressed={agreementsViewMode === "grid"}
                title="Grid view"
              >
                <GridIcon size={14} />
                <span>Grid</span>
              </button>
              <button
                type="button"
                className={`cp-view-toggle-btn ${agreementsViewMode === "table" ? "active" : ""}`}
                onClick={() => handleToggleAgreementsView("table")}
                aria-pressed={agreementsViewMode === "table"}
                title="Table view"
              >
                <TableIcon size={14} />
                <span>Table</span>
              </button>
            </div>
          </div>
        </div>

        {agreements === undefined ? (
          <div className="cp-rentals-grid" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cp-skeleton cp-rental-skeleton" />
            ))}
          </div>
        ) : agreements.length === 0 && !error ? (
          <div className="cp-empty-state cp-rentals-empty-state">
            <BuildingIcon size={40} />
            <h3>No rental agreements yet</h3>
            <p>When our team prepares a rent or lease agreement for you, it appears here so you can review and sign it.</p>
          </div>
        ) : agreementsViewMode === "table" ? (
          <div className="cp-table-card" style={{ marginTop: 12 }}>
            <div className="cp-table-responsive">
              <table className="cp-table cp-rentals-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Property Status</th>
                    <th>Agreement Status</th>
                    <th>Rent</th>
                    <th>Deposit</th>
                    <th>Term</th>
                    <th>Next Step</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {agreements.map((a) => {
                    const isBooked = a.status !== "Terminated" && a.status !== "Cancelled";
                    const step = nextStep(a);
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="cp-table-cell-title">
                            <strong>{names[a.property_id] ?? `${a.agreement_type} property`}</strong>
                            <span className="cp-table-cell-sub">
                              {a.agreement_type} agreement · #{a.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                        </td>
                        <td>
                          {isBooked ? (
                            <RentalStatusBadge status="Booked" />
                          ) : (
                            <span style={{ color: "var(--cp-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td>
                          <RentalStatusBadge status={a.status} />
                        </td>
                        <td>
                          <div className="cp-table-cell-amount">
                            <strong>{formatRent(a.rent_amount, a.rent_frequency)}</strong>
                          </div>
                        </td>
                        <td>
                          <div className="cp-table-cell-amount">
                            <strong>{formatRent(a.deposit_amount)}</strong>
                          </div>
                        </td>
                        <td>
                          <div className="cp-table-cell-dates">
                            <span>
                              {formatDay(a.agreement_start)} → {a.agreement_end ? formatDay(a.agreement_end) : "open-ended"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="cp-table-cell-note">
                            {step ? (
                              <span className="cp-nextstep-text">{step}</span>
                            ) : (
                              <span style={{ color: "var(--cp-text-muted)" }}>—</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Link
                            to={`/portal/rentals/${a.id}`}
                            className="btn-secondary cp-table-action-btn"
                          >
                            {a.status === "Pending Signature" && !a.customer_signed_at ? "Review & sign" : "View details"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="cp-rentals-grid">
            {agreements.map((a) => {
              const isBooked = a.status !== "Terminated" && a.status !== "Cancelled";
              return (
                <article key={a.id} className="cp-req-card cp-rental-card">
                  <div className="cp-req-card-head cp-rental-card-head">
                    <div className="cp-rental-card-title-group">
                      <h3 className="cp-req-card-title cp-rental-card-title">{names[a.property_id] ?? `${a.agreement_type} property`}</h3>
                      <p className="cp-req-card-sub cp-rental-card-sub">
                        {a.agreement_type} agreement · #{a.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {isBooked && <RentalStatusBadge status="Booked" />}
                      <RentalStatusBadge status={a.status} />
                    </div>
                  </div>
                  <div className="cp-rental-card-body">
                    <dl className="cp-req-facts cp-rental-facts">
                      {isBooked && (
                        <div className="cp-req-fact cp-rental-fact">
                          <dt>Property Status</dt>
                          <dd>
                            <RentalStatusBadge status="Booked" />
                          </dd>
                        </div>
                      )}
                      <div className="cp-req-fact cp-rental-fact">
                        <dt>Rent</dt>
                        <dd>{formatRent(a.rent_amount, a.rent_frequency)}</dd>
                      </div>
                      <div className="cp-req-fact cp-rental-fact">
                        <dt>Deposit</dt>
                        <dd>{formatRent(a.deposit_amount)}</dd>
                      </div>
                      <div className="cp-req-fact cp-rental-fact full-width">
                        <dt>Term</dt>
                        <dd>
                          {formatDay(a.agreement_start)} → {a.agreement_end ? formatDay(a.agreement_end) : "open-ended"}
                        </dd>
                      </div>
                    </dl>
                    {nextStep(a) && <p className="cp-ticket-snippet cp-rental-snippet">{nextStep(a)}</p>}
                  </div>
                  <div className="cp-rental-card-foot">
                    <Link to={`/portal/rentals/${a.id}`} className="btn-primary cp-rental-card-btn">
                      {a.status === "Pending Signature" && !a.customer_signed_at ? "Review & sign" : "View details"}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
