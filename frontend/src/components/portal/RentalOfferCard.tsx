import React from "react";
import { resolveImageUrl, handleImageError } from "../../utils/imageUrl";
import { formatDay } from "../../utils/rentalHelpers";
import type { PropertyOffer } from "../../types/propertyOffer";
import type { PortalPropertyMatch } from "../../types/customerPortalBuyerRequirement";
import type { NegotiationSummary } from "../../utils/offerDisplay";

export interface RentalOfferCardItem {
  match: PortalPropertyMatch;
  offer: PropertyOffer;
  summary: NegotiationSummary;
  propertyName: string;
  propertyImage: string | null;
  propertyLocation: string | null;
  propertyType: string | null;
  listedRent: string;
  monthlyRent: string;
  rawProposed: number;
  rawListed: number;
  diffInfo: { text: string; isAbove: boolean; isBelow: boolean; isEqual: boolean; diffAmount: number; diffPct: number } | null;
  securityDeposit: string | null;
  durationText: string | null;
  propertyId: string;
  matchId: string;
  requirementId: string | null;
  requestId: string | null;
  staffName: string;
  submittedAt: string;
  expiresAt: string | null;
  isLapsed: boolean;
  status: string;
}

interface RentalOfferCardProps {
  item: RentalOfferCardItem;
  onViewOffer: () => void;
  onAcceptOffer: () => void;
  onRejectOffer: () => void;
  onCounterOffer: () => void;
}

export const RentalOfferCard: React.FC<RentalOfferCardProps> = ({
  item,
  onViewOffer,
  onAcceptOffer,
  onRejectOffer,
  onCounterOffer,
}) => {
  const isCounter = Boolean(item.offer.parent_offer_id);
  const isExpiringSoon = item.expiresAt
    ? new Date(item.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000
    : false;

  return (
    <article className="cp-req-card cp-rental-card cp-rental-offer-card">
      <div className="cp-req-card-head cp-rental-card-head">
        {item.propertyImage && (
          <div className="cp-rental-offer-thumb-wrap">
            <img
              src={resolveImageUrl(item.propertyImage)}
              alt={item.propertyName}
              className="cp-rental-offer-thumb"
              onError={handleImageError}
            />
          </div>
        )}
        <div className="cp-rental-card-title-group" style={{ flex: 1, minWidth: 0 }}>
          <h3 className="cp-req-card-title cp-rental-card-title">{item.propertyName}</h3>
          <p className="cp-req-card-sub cp-rental-card-sub">
            {item.propertyLocation ? `${item.propertyLocation} · ` : ""}
            Ref #{item.offer.id.slice(0, 8).toUpperCase()}
            {item.requirementId ? ` · Req #${item.requirementId.slice(0, 8).toUpperCase()}` : ""}
            {item.requestId ? ` · Booking #${item.requestId.slice(0, 8).toUpperCase()}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="cp-prop-chip">{isCounter ? "Counteroffer" : "Staff Proposal"}</span>
          <span className="neg-badge neg-badge-submitted">Awaiting your response</span>
        </div>
      </div>

      <div className="cp-rental-card-body">
        {/* Pricing Comparison Banner */}
        <div className="cp-rental-offer-pricing-banner">
          <div className="cp-rental-offer-price-col">
            <span className="cp-rental-offer-price-label">Listed Rent</span>
            <span className="cp-rental-offer-listed-val">{item.listedRent}</span>
          </div>
          <div className="cp-rental-offer-price-col">
            <span className="cp-rental-offer-price-label">Staff Proposed Rent</span>
            <span className="cp-rental-offer-price-val">{item.monthlyRent}</span>
            {item.diffInfo && (
              <span
                className={`cp-rental-offer-diff ${
                  item.diffInfo.isAbove ? "diff-above" : item.diffInfo.isBelow ? "diff-below" : "diff-equal"
                }`}
              >
                {item.diffInfo.text}
              </span>
            )}
          </div>
          {item.securityDeposit && (
            <div className="cp-rental-offer-deposit-col">
              <span className="cp-rental-offer-deposit-label">Security Deposit</span>
              <span className="cp-rental-offer-deposit-val">{item.securityDeposit}</span>
            </div>
          )}
        </div>

        <dl className="cp-req-facts cp-rental-facts">
          <div className="cp-req-fact cp-rental-fact">
            <dt>Submitted By</dt>
            <dd>{item.staffName || "Property Team"}</dd>
          </div>
          <div className="cp-req-fact cp-rental-fact">
            <dt>Submitted Date</dt>
            <dd>{formatDay(item.submittedAt)}</dd>
          </div>
          <div className="cp-req-fact cp-rental-fact">
            <dt>Valid Until</dt>
            <dd className={isExpiringSoon ? "cp-expiry-warning" : ""}>
              {item.expiresAt ? formatDay(item.expiresAt) : "No expiry date"}
            </dd>
          </div>
          <div className="cp-req-fact cp-rental-fact">
            <dt>Lease Duration</dt>
            <dd>{item.durationText ?? "12 months (Standard)"}</dd>
          </div>
          <div className="cp-req-fact cp-rental-fact">
            <dt>Negotiation Status</dt>
            <dd>
              <span className="neg-badge neg-badge-submitted">{item.status}</span>
            </dd>
          </div>
        </dl>

        {(item.offer.terms || item.summary.latestMessage) && (
          <p className="cp-ticket-snippet cp-rental-offer-snippet">
            <strong>Terms / Notes:</strong> “{item.offer.terms || item.summary.latestMessage?.text}”
          </p>
        )}
      </div>

      <div className="cp-rental-card-foot cp-rental-offer-actions">
        <button
          type="button"
          className="btn-primary cp-rental-card-btn"
          onClick={onViewOffer}
        >
          View Offer
        </button>
        <button
          type="button"
          className="btn-secondary cp-rental-card-btn cp-btn-accept"
          onClick={onAcceptOffer}
        >
          Accept Offer
        </button>
        <button
          type="button"
          className="btn-secondary cp-rental-card-btn"
          onClick={onCounterOffer}
        >
          Counter Offer
        </button>
        <button
          type="button"
          className="btn-secondary cp-rental-card-btn cp-btn-reject"
          onClick={onRejectOffer}
        >
          Reject Offer
        </button>
      </div>
    </article>
  );
};

export default RentalOfferCard;
