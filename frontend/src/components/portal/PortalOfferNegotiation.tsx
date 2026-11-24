import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { decidePortalOffer, getPortalOffers, submitPortalOffer } from "../../services/customerPortalOfferService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { byCreatedAt, formatOfferDiff, formatOfferMoney, offerStatusSlug, offerStatusText, parseOfferAmount, threadState } from "../../utils/offerDisplay";
import { resolveImageUrl, handleImageError } from "../../utils/imageUrl";
import type { PropertyOffer } from "../../types/propertyOffer";
import type { NegotiationTarget } from "../../types/customerPortalBuyerRequirement";
import "../negotiation/Negotiation.css";

type Mode = "offer" | "counter" | null;
type ConfirmKind = "Accepted" | "Rejected";

const toExpiryIso = (local: string): string | null => {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * The customer's view of the price negotiation for one matched property (customer-portal property-offers API).
 *   - the customer can submit an offer while nothing is unresolved;
 *   - a staff proposal / counteroffer can be Accepted, Rejected or Countered (never withdrawn);
 *   - the customer cannot decide their own offer: staff respond to it.
 * Ownership is enforced by the backend from the portal token. Everything shown comes from the API.
 */
export default function PortalOfferNegotiation({
  item,
  initialAction,
  onClose,
  notify,
}: {
  item: NegotiationTarget;
  initialAction?: "offer" | "counter" | "accept" | "reject";
  onClose: () => void;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const matchId = item.match_id;
  const currency = item.property.currency || "INR";
  const listing = item.property.listing_type;
  /** Customer offers on a rent/lease listing are priced per month (the backend default for portal offers). */
  const hintFrequency = listing === "Sale" ? "One-time" : "Monthly";

  /** undefined = loading. */
  const [offers, setOffers] = useState<PropertyOffer[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [expiry, setExpiry] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; offer: PropertyOffer } | null>(null);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionTriggeredRef = useRef(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setOffers([...(await getPortalOffers(matchId))].sort(byCreatedAt));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, "Failed to load your negotiation."));
      setOffers((prev) => prev ?? []);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(() => offers ?? [], [offers]);
  const state = useMemo(() => threadState(list), [list]);
  const { accepted, pendingOwner, open, lapsed, latest } = state;
  const money = (v: string | number | null | undefined, freq?: string | null) => formatOfferMoney(v, freq ?? latest?.price_frequency ?? hintFrequency, currency);
  const listed = item.property.price == null ? NaN : Number(item.property.price);

  const diffInfo = useMemo(
    () => (latest ? formatOfferDiff(latest.offered_price, item.property.price, currency) : null),
    [latest, item.property.price, currency]
  );

  const primaryImg = item.property.images?.find((img) => img.is_primary)?.image_url || item.property.images?.[0]?.image_url;
  const propLocation = [item.property.unit_number ? `Unit ${item.property.unit_number}` : null, item.property.address, item.property.city, item.property.state]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    if (!initialAction || actionTriggeredRef.current || !offers) return;
    const { open: openOffer } = threadState(offers);
    if (!openOffer) return;
    actionTriggeredRef.current = true;
    if (initialAction === "accept" && openOffer.offer_type === "Seller") {
      setConfirmNotes("");
      setConfirmError(null);
      setConfirm({ kind: "Accepted", offer: openOffer });
    } else if (initialAction === "reject" && openOffer.offer_type === "Seller") {
      setConfirmNotes("");
      setConfirmError(null);
      setConfirm({ kind: "Rejected", offer: openOffer });
    } else if (initialAction === "counter" && openOffer.offer_type === "Seller") {
      setMode("counter");
      setAmount(String(Number(openOffer.offered_price)));
    }
  }, [initialAction, offers]);

  const events = useMemo(() => {
    type Ev = { key: string; at: string; type: "offer" | "decision"; offer: PropertyOffer };
    const out: Ev[] = [];
    for (const o of list) {
      out.push({ key: `o-${o.id}`, at: o.created_at, type: "offer", offer: o });
      if (o.responded_at && o.status !== "Submitted") out.push({ key: `d-${o.id}`, at: o.responded_at, type: "decision", offer: o });
    }
    return out.sort((a, b) => (new Date(a.at).getTime() || 0) - (new Date(b.at).getTime() || 0));
  }, [list]);

  const resetForm = () => {
    setMode(null);
    setAmount("");
    setRemarks("");
    setExpiry("");
    setAmountError(null);
    setExpiryError(null);
    setFormError(null);
  };

  const finish = async (message: string) => {
    resetForm();
    setConfirm(null);
    notify(message);
    await load();
  };

  const staleCheck = (err: unknown) => {
    if ((err as { response?: { status?: number } })?.response?.status === 409) void load();
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    const [value, problem] = parseOfferAmount(amount);
    if (problem || value === null) {
      setAmountError(problem);
      return;
    }
    const expiresIso = toExpiryIso(expiry);
    if (expiry && (!expiresIso || new Date(expiresIso).getTime() <= Date.now())) {
      setExpiryError("Choose a time in the future, or leave this empty for the default of 7 days.");
      return;
    }
    if (mode === "counter" && !remarks.trim()) {
      setFormError("Tell us why you are countering, so our team can respond.");
      return;
    }
    setAmountError(null);
    setExpiryError(null);
    setFormError(null);
    setBusy(true);
    try {
      if (mode === "offer") {
        await submitPortalOffer({ property_match_id: matchId, offered_price: value, terms: remarks.trim() || null, expires_at: expiresIso });
        await finish("Your offer was sent to our team.");
      } else if (open) {
        await decidePortalOffer(open.id, { decision: "Countered", counter_price: value, counter_terms: remarks.trim() || null, response_notes: remarks.trim() || null });
        await finish("Your counteroffer was sent to our team.");
      }
    } catch (err) {
      setFormError(getApiErrorMessage(err, "Your offer could not be saved."));
      staleCheck(err);
    } finally {
      setBusy(false);
    }
  };

  const submitConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    setConfirmError(null);
    try {
      await decidePortalOffer(confirm.offer.id, { decision: confirm.kind, response_notes: confirmNotes.trim() || null });
      setConfirmNotes("");
      await finish(confirm.kind === "Accepted" ? "You accepted the offer." : "You rejected the offer.");
    } catch (err) {
      setConfirmError(getApiErrorMessage(err, "Your decision could not be saved."));
      staleCheck(err);
    } finally {
      setBusy(false);
    }
  };

  /** Responding to a lapsed staff offer makes the server mark it Expired (and answer 409). */
  const markExpired = async () => {
    if (!lapsed || lapsed.offer_type !== "Seller") return;
    setBusy(true);
    try {
      await decidePortalOffer(lapsed.id, { decision: "Rejected" });
      await load();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409 && /expired/i.test(getApiErrorMessage(err, ""))) notify("This offer has expired.");
      else notify(getApiErrorMessage(err, "The offer could not be updated."), "error");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const title = (o: PropertyOffer) =>
    o.offer_type === "Seller" ? (o.parent_offer_id ? "Our counteroffer" : "Our proposal") : o.parent_offer_id ? "Your counteroffer" : "Your offer";

  return (
    <div className="neg-overlay" onClick={onClose}>
      <div className="neg-modal" role="dialog" aria-modal="true" aria-labelledby="pon-title" onClick={(e) => e.stopPropagation()}>
        <header className="neg-header">
          <div>
            <h2 id="pon-title">Rental Negotiation &amp; Offers</h2>
            {item.property.name && <div className="neg-sub">{item.property.name}</div>}
          </div>
          <button type="button" className="neg-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </header>

        <div className="neg-body">
          {/* Property Context Card */}
          <div
            style={{
              display: "flex",
              gap: 14,
              padding: 12,
              borderRadius: 10,
              background: "rgba(100, 116, 139, 0.08)",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {primaryImg && (
              <img
                src={resolveImageUrl(primaryImg)}
                alt={item.property.name || "Property"}
                style={{
                  width: 80,
                  height: 60,
                  borderRadius: 8,
                  objectFit: "cover",
                  flexShrink: 0,
                  border: "1px solid rgba(100, 116, 139, 0.2)",
                }}
                onError={handleImageError}
              />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--cp-text, inherit)" }}>
                {item.property.name || "Property"}
              </div>
              {propLocation && (
                <div style={{ fontSize: "0.8125rem", color: "var(--cp-text-muted, #64748B)", marginTop: 2 }}>
                  {propLocation}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {item.property.listing_type && <span className="cp-prop-chip">{item.property.listing_type}</span>}
                {item.property.property_type && <span className="cp-prop-chip">{item.property.property_type}</span>}
                {item.requirement_id && (
                  <span className="cp-prop-chip">Req #{item.requirement_id.slice(0, 8).toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>

          <div className="neg-summary">
            <div className="neg-stat">
              <span className="neg-stat-label">Listed rent</span>
              <strong>{formatOfferMoney(item.property.price ?? null, hintFrequency, currency)}</strong>
            </div>
            <div className="neg-stat">
              <span className="neg-stat-label">Latest offer</span>
              <strong>{latest ? money(latest.offered_price, latest.price_frequency) : "No offer yet"}</strong>
              {diffInfo && (
                <span
                  className={`cp-rental-offer-diff ${
                    diffInfo.isAbove ? "diff-above" : diffInfo.isBelow ? "diff-below" : "diff-equal"
                  }`}
                  style={{ marginTop: 4 }}
                >
                  {diffInfo.text}
                </span>
              )}
            </div>
            <div className="neg-stat">
              <span className="neg-stat-label">Status</span>
              {latest ? (
                <span className={`neg-badge neg-badge-${offerStatusSlug(lapsed ? "Expired" : latest.status)}`}>
                  {offerStatusText(lapsed ? "Expired" : latest.status)}
                </span>
              ) : (
                <strong>Not started</strong>
              )}
              {open?.expires_at && <small>Valid until {formatBookingDateTime(open.expires_at)}</small>}
            </div>
            {item.property.security_deposit && (
              <div className="neg-stat">
                <span className="neg-stat-label">Security deposit</span>
                <strong>{formatOfferMoney(item.property.security_deposit, "One-time", currency)}</strong>
              </div>
            )}
          </div>

          {loadError && (
            <div className="neg-alert" role="alert">
              <span>{loadError}</span>
              <button type="button" className="btn-secondary" onClick={() => void load()}>
                Retry
              </button>
            </div>
          )}
          {offers === undefined && (
            <div aria-busy="true">
              <div className="neg-skeleton" />
              <div className="neg-skeleton" />
            </div>
          )}

          {offers && list.length > 0 && (
            <ol className="neg-trail" aria-label="Price trail">
              {Number.isFinite(listed) && (
                <li className="neg-trail-step">
                  <small>Listed</small>
                  <strong>{formatOfferMoney(listed, hintFrequency, currency)}</strong>
                </li>
              )}
              {list.map((o) => (
                <li key={o.id} className={`neg-trail-step neg-trail-${o.offer_type === "Seller" ? "seller" : "buyer"}`}>
                  <small>{o.offer_type === "Seller" ? "Ours" : "Yours"}</small>
                  <strong>{money(o.offered_price, o.price_frequency)}</strong>
                </li>
              ))}
            </ol>
          )}

          {offers && accepted && (
            <div className="neg-banner neg-banner-accepted" role="status">
              <strong>Agreed at {money(accepted.offered_price, accepted.price_frequency)}.</strong> The offer was accepted
              {accepted.responded_at ? ` on ${formatBookingDateTime(accepted.responded_at)}` : ""}.
              {accepted.hold_expires_at ? ` The property is held for you until ${formatBookingDateTime(accepted.hold_expires_at)}.` : ""} Our team will contact you about the next steps.
            </div>
          )}
          {offers && !accepted && pendingOwner && (
            <div className="neg-banner neg-banner-pending" role="status">
              <strong>Accepted at {money(pendingOwner.offered_price, pendingOwner.price_frequency)} — waiting for the owner&rsquo;s approval.</strong> We will notify you as soon as it is
              confirmed.
            </div>
          )}

          {offers && !accepted && !pendingOwner && !mode && (
            <div className="neg-actions">
              {lapsed && (
                <>
                  <p className="neg-muted" style={{ flexBasis: "100%", margin: 0 }}>
                    {lapsed.offer_type === "Seller" ? "Our offer" : "Your offer"} of <strong>{money(lapsed.offered_price, lapsed.price_frequency)}</strong> expired
                    {lapsed.expires_at ? ` on ${formatBookingDateTime(lapsed.expires_at)}` : ""}.
                  </p>
                  {lapsed.offer_type === "Seller" ? (
                    <button type="button" className="btn-primary" disabled={busy} onClick={() => void markExpired()}>
                      Update status
                    </button>
                  ) : (
                    <Link to="/portal/chat" className="btn-secondary" style={{ textDecoration: "none" }}>
                      Message our team to reopen the negotiation
                    </Link>
                  )}
                </>
              )}

              {!lapsed && !open && (
                <>
                  <p className="neg-muted" style={{ flexBasis: "100%", margin: 0 }}>
                    {list.length === 0 ? "You haven't made an offer on this property yet." : "There is no open offer."} Tell us the {hintFrequency === "One-time" ? "price" : "monthly rent"} you would like to offer.
                  </p>
                  <button type="button" className="btn-primary" onClick={() => setMode("offer")}>
                    Make an offer
                  </button>
                </>
              )}

              {!lapsed && open && open.offer_type === "Seller" && (
                <>
                  <p className="neg-muted" style={{ flexBasis: "100%", margin: 0 }}>
                    {open.parent_offer_id ? "Our team countered with" : "Our team proposed"} <strong>{money(open.offered_price, open.price_frequency)}</strong>
                    {open.expires_at ? ` — valid until ${formatBookingDateTime(open.expires_at)}` : ""}. Accept it, decline it, or make a counteroffer.
                  </p>
                  <button type="button" className="btn-primary" onClick={() => { setConfirmNotes(""); setConfirmError(null); setConfirm({ kind: "Accepted", offer: open }); }}>
                    Accept
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setMode("counter"); setAmount(String(Number(open.offered_price))); }}>
                    Make a counteroffer
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setConfirmNotes(""); setConfirmError(null); setConfirm({ kind: "Rejected", offer: open }); }}>
                    Reject
                  </button>
                </>
              )}

              {!lapsed && open && open.offer_type === "Buyer" && (
                <p className="neg-muted" style={{ flexBasis: "100%", margin: 0 }}>
                  Your {open.parent_offer_id ? "counteroffer" : "offer"} of <strong>{money(open.offered_price, open.price_frequency)}</strong> is with our team for review
                  {open.expires_at ? ` (valid until ${formatBookingDateTime(open.expires_at)})` : ""}. You will be notified when they respond.
                </p>
              )}
            </div>
          )}

          {mode && (
            <form className="neg-form" onSubmit={submitForm} noValidate>
              <h3>{mode === "offer" ? "Make an offer" : "Make a counteroffer"}</h3>
              {mode === "counter" && open && (
                <label className="neg-field">
                  <span>Our price</span>
                  <input value={money(open.offered_price, open.price_frequency)} readOnly aria-readonly="true" />
                </label>
              )}
              <label className="neg-field">
                <span>{mode === "counter" ? "Your counteroffer" : "Your offer"} ({currency}{hintFrequency === "One-time" ? "" : " per month"})</span>
                <input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amountError)} />
                {amountError && <small className="neg-error">{amountError}</small>}
              </label>
              {mode === "offer" && (
                <label className="neg-field">
                  <span>Offer valid until (optional)</span>
                  <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                  {expiryError ? <small className="neg-error">{expiryError}</small> : <small className="neg-muted">Defaults to 7 days when left empty.</small>}
                </label>
              )}
              <label className="neg-field">
                <span>{mode === "counter" ? "Reason for your counteroffer *" : "Remarks (optional)"}</span>
                <textarea rows={3} maxLength={5000} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </label>
              {formError && (
                <div className="neg-alert" role="alert">
                  {formError}
                </div>
              )}
              <div className="neg-form-actions">
                <button type="button" className="btn-secondary" onClick={resetForm} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Sending…" : mode === "counter" ? "Send counteroffer" : "Send offer"}
                </button>
              </div>
            </form>
          )}

          <section aria-label="Negotiation history">
            <h3 className="neg-section-title">Negotiation history</h3>
            {offers && list.length === 0 && !loadError && <p className="neg-muted">No offers have been made on this property yet.</p>}
            {offers && list.length > 0 && (
              <ol className="neg-timeline">
                {events.map((ev) => {
                  const o = ev.offer;
                  if (ev.type === "offer") {
                    const status = lapsed?.id === o.id ? "Expired" : o.status;
                    return (
                      <li key={ev.key} className={`neg-event ${o.offer_type === "Seller" ? "neg-event-seller" : "neg-event-buyer"}`}>
                        <div className="neg-event-head">
                          <strong>{title(o)}</strong>
                          <span className="neg-amount">{money(o.offered_price, o.price_frequency)}</span>
                          <span className={`neg-badge neg-badge-${offerStatusSlug(status)}`}>{offerStatusText(status)}</span>
                        </div>
                        <div className="neg-meta">
                          {formatBookingDateTime(o.created_at)}
                          {o.expires_at ? ` · valid until ${formatBookingDateTime(o.expires_at)}` : ""}
                        </div>
                        {o.terms && <p className="neg-remarks">{o.terms}</p>}
                      </li>
                    );
                  }
                  const mine = o.offer_type === "Seller"; // the customer decides staff offers; staff decide the customer's
                  const verb = o.status === "Countered" ? "countered" : o.status === "Accepted" ? "accepted" : o.status === "Pending Owner Approval" ? "accepted (awaiting owner approval)" : o.status.toLowerCase();
                  return (
                    <li key={ev.key} className={`neg-event neg-event-decision neg-event-${offerStatusSlug(o.status)}`}>
                      <div className="neg-event-head">
                        <strong>{mine ? `You ${verb} our offer` : `Our team ${verb} your offer`}</strong>
                        <span className="neg-amount">{money(o.offered_price, o.price_frequency)}</span>
                      </div>
                      <div className="neg-meta">{formatBookingDateTime(ev.at)}</div>
                      {o.response_notes && <p className="neg-remarks">{o.response_notes}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <footer className="neg-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>

      {confirm && (
        <div
          className="neg-overlay neg-overlay-top"
          onClick={(e) => {
            e.stopPropagation();
            if (!busy) setConfirm(null);
          }}
        >
          <div className="neg-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pon-confirm-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="pon-confirm-title">{confirm.kind === "Accepted" ? "Accept this offer?" : "Reject this offer?"}</h3>
            <p>
              Our {confirm.offer.parent_offer_id ? "counteroffer" : "proposal"} of <strong>{money(confirm.offer.offered_price, confirm.offer.price_frequency)}</strong>.{" "}
              {confirm.kind === "Accepted"
                ? "Accepting closes the negotiation at this price. The property may be held for you while the agreement is prepared."
                : "Rejecting ends this offer. You can still make a new offer afterwards."}
            </p>
            <label className="neg-field">
              <span>Notes (optional)</span>
              <textarea rows={2} maxLength={5000} value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} />
            </label>
            {confirmError && (
              <div className="neg-alert" role="alert">
                {confirmError}
              </div>
            )}
            <div className="neg-form-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>
                Go back
              </button>
              <button type="button" className="btn-primary" onClick={() => void submitConfirm()} disabled={busy}>
                {busy ? "Saving…" : confirm.kind === "Accepted" ? "Yes, accept" : "Yes, reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
