import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { decideOffer, decideOwnerApproval, getOffersForMatch, proposeOffer, recordBuyerOffer } from "../../services/propertyOfferService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { byCreatedAt, formatOfferMoney, offerStatusSlug, offerStatusText, parseOfferAmount, threadState } from "../../utils/offerDisplay";
import type { UserNameResolver } from "../../utils/recordHistory";
import type { PropertyOffer } from "../../types/propertyOffer";
import "./Negotiation.css";

export interface NegotiationOption {
  /** property_match_id - the negotiation thread is keyed by it. */
  matchId: string;
  propertyName: string;
  /** Only the listed price (and currency) is used. */
  property?: { price: number | string; currency?: string };
}

interface Props {
  /** The customer (buyer) all of the options belong to. */
  buyerName: string;
  options: NegotiationOption[];
  initialMatchId: string;
  /** buyer_requirement.view - without it the thread is not requested at all. */
  canView: boolean;
  /** buyer_requirement.update - needed to propose, record and decide offers. */
  canManage: boolean;
  resolveUser?: UserNameResolver;
  onClose: () => void;
  notify: (message: string, type?: "success" | "error") => void;
}

const percentDiff = (value: number, base: number): string => {
  if (!(base > 0)) return "";
  const pct = ((value - base) / base) * 100;
  if (Math.abs(pct) < 0.05) return "equal to the listed price";
  return `${Math.abs(pct).toFixed(1)}% ${pct < 0 ? "below" : "above"} the listed price`;
};

type Mode = "propose" | "record" | "counter" | null;
type ConfirmKind = "Accepted" | "Rejected" | "OwnerApprove" | "OwnerReject";
interface ConfirmState {
  kind: ConfirmKind;
  offer: PropertyOffer;
}

const CONFIRM_COPY: Record<ConfirmKind, { title: string; body: string; yes: string }> = {
  Accepted: {
    title: "Accept this offer?",
    body: "Accepting closes the negotiation at this price. If the property needs owner approval the offer then waits for it; otherwise the property may be held for the buyer.",
    yes: "Yes, accept",
  },
  Rejected: { title: "Reject this offer?", body: "Rejecting ends this offer. A new offer can be made afterwards.", yes: "Yes, reject" },
  OwnerApprove: {
    title: "Approve on the owner's behalf?",
    body: "This confirms the owner accepts the offer. Only a tenant owner or administrator can do this.",
    yes: "Yes, approve",
  },
  OwnerReject: { title: "Reject on the owner's behalf?", body: "The offer is rejected and the buyer is told.", yes: "Yes, reject" },
};

const toExpiryIso = (local: string): string | null => {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Staff negotiation workspace for one buyer and property, on the current /api/v1/property-offers contract:
 *   - staff PROPOSE a price (a "Seller" offer the customer answers in their portal) or RECORD an offline buyer offer;
 *   - staff Accept / Reject / Counter a BUYER offer; they cannot answer their own offers (the customer does) or withdraw;
 *   - an accepted offer may wait for owner approval; accepted offers can hold the property;
 *   - offers expire (default 7 days) and the server marks a lapsed one Expired when someone tries to decide it.
 * Every figure and event comes from the API; nothing is stored or simulated on the client.
 */
export default function NegotiationPanel({ buyerName, options, initialMatchId, canView, canManage, resolveUser, onClose, notify }: Props) {
  const [matchId, setMatchId] = useState(initialMatchId);
  /** undefined = loading. */
  const [offers, setOffers] = useState<PropertyOffer[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [expiry, setExpiry] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const option = options.find((o) => o.matchId === matchId) ?? options[0];
  const currency = option?.property?.currency || "INR";
  const listedPrice = Number(option?.property?.price);

  const load = useCallback(async () => {
    if (!canView || !matchId) {
      setOffers([]);
      return;
    }
    setLoadError(null);
    try {
      setOffers([...(await getOffersForMatch(matchId))].sort(byCreatedAt));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, "Failed to load the negotiation history."));
      setOffers((prev) => prev ?? []);
    }
  }, [canView, matchId]);

  useEffect(() => {
    setOffers(undefined);
    setMode(null);
    setConfirm(null);
    void load();
  }, [load]);

  const resetForm = () => {
    setMode(null);
    setAmount("");
    setRemarks("");
    setExpiry("");
    setFieldError(null);
    setExpiryError(null);
    setFormError(null);
  };

  const openMode = (next: Exclude<Mode, null>, preset?: PropertyOffer) => {
    setMode(next);
    setAmount(preset ? String(Number(preset.offered_price)) : "");
    setRemarks("");
    setExpiry("");
    setFieldError(null);
    setExpiryError(null);
    setFormError(null);
  };

  /* ─── derived state ─── */

  const list = useMemo(() => offers ?? [], [offers]);
  const state = useMemo(() => threadState(list), [list]);
  const { accepted, pendingOwner, open, lapsed, latest } = state;
  const nameOf = (id: string | null | undefined) => (id ? resolveUser?.(id) ?? "A team member" : "Customer");
  const amountOf = (id: string | null | undefined) => list.find((o) => o.id === id)?.offered_price;
  const frequency = (latest ?? list[0])?.price_frequency;
  const money = (v: string | number | null | undefined, freq?: string | null) => formatOfferMoney(v, freq ?? frequency, currency);

  const events = useMemo(() => {
    type Ev = { key: string; at: string; type: "offer" | "decision"; offer: PropertyOffer };
    const out: Ev[] = [];
    for (const o of list) {
      out.push({ key: `o-${o.id}`, at: o.created_at, type: "offer", offer: o });
      if (o.responded_at && o.status !== "Submitted") out.push({ key: `d-${o.id}`, at: o.responded_at, type: "decision", offer: o });
    }
    return out.sort((a, b) => (new Date(a.at).getTime() || 0) - (new Date(b.at).getTime() || 0));
  }, [list]);

  /* ─── actions ─── */

  const afterWrite = async (message: string) => {
    resetForm();
    setConfirm(null);
    notify(message);
    await load();
  };

  const staleCheck = (err: unknown) => {
    // A 409 means the thread changed underneath us (or expired) - show the latest state.
    if ((err as { response?: { status?: number } })?.response?.status === 409) void load();
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage || !mode) return;
    const [value, problem] = parseOfferAmount(amount);
    if (problem || value === null) {
      setFieldError(problem);
      return;
    }
    const expiresIso = toExpiryIso(expiry);
    if (expiry && (!expiresIso || new Date(expiresIso).getTime() <= Date.now())) {
      setExpiryError("Choose an expiry in the future, or leave it empty for the default of 7 days.");
      return;
    }
    if (remarks.length > 5000) {
      setFormError("Remarks can be at most 5000 characters.");
      return;
    }
    setFieldError(null);
    setExpiryError(null);
    setFormError(null);
    setBusy(true);
    try {
      if (mode === "propose") {
        await proposeOffer({ property_match_id: matchId, offered_price: value, terms: remarks.trim() || null, expires_at: expiresIso });
        await afterWrite("Price proposed. The customer has been notified and can respond in their portal.");
      } else if (mode === "record") {
        await recordBuyerOffer({ property_match_id: matchId, offered_price: value, terms: remarks.trim() || null, expires_at: expiresIso });
        await afterWrite("The buyer's offer was recorded.");
      } else if (mode === "counter" && open) {
        await decideOffer(open.id, { decision: "Countered", counter_price: value, counter_terms: remarks.trim() || null, response_notes: remarks.trim() || null });
        await afterWrite("Counteroffer sent. The customer has been notified.");
      }
    } catch (err) {
      setFormError(getApiErrorMessage(err, "The offer could not be saved."));
      staleCheck(err);
    } finally {
      setBusy(false);
    }
  };

  const submitConfirm = async () => {
    if (!confirm || !canManage) return;
    setBusy(true);
    setConfirmError(null);
    try {
      if (confirm.kind === "OwnerApprove" || confirm.kind === "OwnerReject") {
        await decideOwnerApproval(confirm.offer.id, confirm.kind === "OwnerApprove");
        setConfirmNotes("");
        await afterWrite(confirm.kind === "OwnerApprove" ? "Offer approved on the owner's behalf." : "Offer rejected on the owner's behalf.");
      } else {
        await decideOffer(confirm.offer.id, { decision: confirm.kind, response_notes: confirmNotes.trim() || null });
        setConfirmNotes("");
        await afterWrite(confirm.kind === "Accepted" ? "Offer accepted." : "Offer rejected.");
      }
    } catch (err) {
      setConfirmError(getApiErrorMessage(err, "The decision could not be saved."));
      staleCheck(err);
    } finally {
      setBusy(false);
    }
  };

  /** The server marks a lapsed offer Expired when a decision is attempted on it (and answers 409). */
  const markExpired = async () => {
    if (!lapsed) return;
    setBusy(true);
    try {
      await decideOffer(lapsed.id, { decision: "Rejected" });
      await load();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409 && /expired/i.test(getApiErrorMessage(err, ""))) {
        notify("The lapsed offer is now marked Expired. You can make a new offer.");
      } else {
        notify(getApiErrorMessage(err, "The offer could not be updated."), "error");
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const askConfirm = (kind: ConfirmKind, offer: PropertyOffer) => {
    setConfirmNotes("");
    setConfirmError(null);
    setConfirm({ kind, offer });
  };

  /* ─── render ─── */

  const formTitle = mode === "propose" ? "Propose a price to the customer" : mode === "record" ? "Record the buyer's offer" : "Send counteroffer";
  const amountLabel = mode === "counter" ? "Counteroffer amount" : mode === "propose" ? "Proposed amount" : "Offered amount";
  const busyOrClosed = busy;

  return (
    <div className="neg-overlay" onClick={onClose}>
      <div className="neg-modal" role="dialog" aria-modal="true" aria-labelledby="neg-title" onClick={(e) => e.stopPropagation()}>
        <header className="neg-header">
          <div>
            <h2 id="neg-title">Negotiation</h2>
            <div className="neg-sub">Customer: {buyerName}</div>
          </div>
          <button type="button" className="neg-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </header>

        <div className="neg-body">
          {options.length > 1 && (
            <label className="neg-field">
              <span>Property</span>
              <select value={matchId} onChange={(e) => setMatchId(e.target.value)} disabled={busyOrClosed}>
                {options.map((o) => (
                  <option key={o.matchId} value={o.matchId}>
                    {o.propertyName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {options.length === 1 && option && <div className="neg-property">{option.propertyName}</div>}

          {!canView && (
            <div className="neg-alert" role="alert">
              You don&rsquo;t have permission to view negotiations.
            </div>
          )}

          {canView && (
            <>
              <div className="neg-summary">
                <div className="neg-stat">
                  <span className="neg-stat-label">Listed price</span>
                  <strong>{option?.property ? money(option.property.price) : "—"}</strong>
                </div>
                <div className="neg-stat">
                  <span className="neg-stat-label">Latest {latest?.offer_type === "Seller" ? "staff offer" : "customer offer"}</span>
                  <strong>{latest ? money(latest.offered_price, latest.price_frequency) : "No offer yet"}</strong>
                  {latest && Number.isFinite(listedPrice) && <small>{percentDiff(Number(latest.offered_price), listedPrice)}</small>}
                </div>
                <div className="neg-stat">
                  <span className="neg-stat-label">Status</span>
                  {latest ? <span className={`neg-badge neg-badge-${offerStatusSlug(latest.status)}`}>{offerStatusText(latest.status)}</span> : <strong>Not started</strong>}
                  {latest && <small>{formatBookingDateTime(latest.created_at)}</small>}
                </div>
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
                  {Number.isFinite(listedPrice) && (
                    <li className="neg-trail-step">
                      <small>Listed</small>
                      <strong>{money(listedPrice)}</strong>
                    </li>
                  )}
                  {list.map((o) => (
                    <li key={o.id} className={`neg-trail-step neg-trail-${o.offer_type === "Seller" ? "seller" : "buyer"}`}>
                      <small>{o.offer_type === "Seller" ? (o.parent_offer_id ? "Counter" : "Proposed") : o.parent_offer_id ? "Customer counter" : "Customer offer"}</small>
                      <strong>{money(o.offered_price, o.price_frequency)}</strong>
                    </li>
                  ))}
                </ol>
              )}

              {/* outcome banners */}
              {offers && accepted && (
                <div className="neg-banner neg-banner-accepted" role="status">
                  <strong>Agreed at {money(accepted.offered_price, accepted.price_frequency)}.</strong> The offer was accepted
                  {accepted.responded_at ? ` on ${formatBookingDateTime(accepted.responded_at)}` : ""}. This negotiation is closed.
                  {accepted.hold_expires_at ? ` The property is held until ${formatBookingDateTime(accepted.hold_expires_at)}.` : ""}
                </div>
              )}
              {offers && !accepted && pendingOwner && (
                <div className="neg-banner neg-banner-pending" role="status">
                  <strong>Accepted at {money(pendingOwner.offered_price, pendingOwner.price_frequency)} — waiting for the owner&rsquo;s approval.</strong> This
                  property requires owner approval before the offer is final.
                </div>
              )}

              {/* actions */}
              {offers && !accepted && !canManage && <p className="neg-muted">You can view this negotiation, but your role can&rsquo;t make or decide offers.</p>}

              {offers && !accepted && canManage && !mode && (
                <div className="neg-actions">
                  {pendingOwner && (
                    <>
                      <button type="button" className="btn-primary" onClick={() => askConfirm("OwnerApprove", pendingOwner)}>
                        Approve as owner
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => askConfirm("OwnerReject", pendingOwner)}>
                        Reject as owner
                      </button>
                    </>
                  )}

                  {!pendingOwner && lapsed && (
                    <>
                      <p className="neg-muted" style={{ flexBasis: "100%", margin: 0 }}>
                        The {lapsed.offer_type === "Seller" ? "staff" : "customer"} offer of <strong>{money(lapsed.offered_price, lapsed.price_frequency)}</strong> passed its
                        expiry ({formatBookingDateTime(lapsed.expires_at)}). It must be marked expired before a new offer can be made.
                      </p>
                      <button type="button" className="btn-primary" disabled={busy} onClick={() => void markExpired()}>
                        Mark as expired
                      </button>
                    </>
                  )}

                  {!pendingOwner && !lapsed && !open && (
                    <>
                      <p className="neg-muted" style={{ flexBasis: "100%", margin: 0 }}>
                        {list.length === 0 ? "No offer has been made yet." : "There is no open offer."} Propose a price to the customer, or record an offer the buyer made by
                        phone or in person.
                      </p>
                      <button type="button" className="btn-primary" onClick={() => openMode("propose")}>
                        Propose price
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => openMode("record")}>
                        Record buyer&rsquo;s offer
                      </button>
                    </>
                  )}

                  {!pendingOwner && open && open.offer_type === "Buyer" && (
                    <>
                      <p className="neg-muted" style={{ flexBasis: "100%", margin: 0 }}>
                        Customer offer of <strong>{money(open.offered_price, open.price_frequency)}</strong> is awaiting your response
                        {open.expires_at ? ` (valid until ${formatBookingDateTime(open.expires_at)})` : ""}.
                      </p>
                      <button type="button" className="btn-primary" onClick={() => askConfirm("Accepted", open)}>
                        Accept
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => openMode("counter", open)}>
                        Counteroffer
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => askConfirm("Rejected", open)}>
                        Reject
                      </button>
                    </>
                  )}

                  {!pendingOwner && open && open.offer_type === "Seller" && (
                    <p className="neg-muted" style={{ flexBasis: "100%", margin: 0 }}>
                      Your {open.parent_offer_id ? "counteroffer" : "proposal"} of <strong>{money(open.offered_price, open.price_frequency)}</strong> is waiting for the
                      customer to accept, reject or counter it in their portal
                      {open.expires_at ? ` (valid until ${formatBookingDateTime(open.expires_at)})` : ""}.
                    </p>
                  )}
                </div>
              )}

              {mode && canManage && (
                <form className="neg-form" onSubmit={submitForm} noValidate>
                  <h3>{formTitle}</h3>
                  {mode === "counter" && open && (
                    <p className="neg-muted" style={{ margin: 0 }}>
                      Responding to the customer&rsquo;s offer of <strong>{money(open.offered_price, open.price_frequency)}</strong>
                      {Number.isFinite(listedPrice) ? <> (listed at {money(listedPrice)})</> : null}.
                    </p>
                  )}
                  {mode === "propose" && (
                    <p className="neg-muted" style={{ margin: 0 }}>
                      The customer is notified and answers in their portal. The price is per {frequency && frequency !== "One-time" ? frequency.toLowerCase().replace("ly", "") : "sale"} as listed on the property.
                    </p>
                  )}
                  <label className="neg-field">
                    <span>{amountLabel} ({currency})</span>
                    <input
                      inputMode="decimal"
                      autoFocus
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g. 85000"
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={fieldError ? "neg-amount-error" : undefined}
                    />
                    {fieldError && (
                      <small id="neg-amount-error" className="neg-error">
                        {fieldError}
                      </small>
                    )}
                  </label>
                  {mode !== "counter" && (
                    <label className="neg-field">
                      <span>Offer valid until (optional)</span>
                      <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                      {expiryError ? <small className="neg-error">{expiryError}</small> : <small className="neg-muted">Defaults to 7 days when left empty.</small>}
                    </label>
                  )}
                  <label className="neg-field">
                    <span>Remarks (optional)</span>
                    <textarea rows={3} maxLength={5000} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Terms, conditions or negotiation notes" />
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
                      {busy ? "Saving…" : mode === "counter" ? "Send counteroffer" : mode === "propose" ? "Send proposal" : "Record offer"}
                    </button>
                  </div>
                </form>
              )}

              {/* history */}
              <section aria-label="Negotiation history">
                <h3 className="neg-section-title">Negotiation history</h3>
                {offers && list.length === 0 && !loadError && <p className="neg-muted">No offers have been made on this property yet.</p>}
                {offers && list.length > 0 && (
                  <ol className="neg-timeline">
                    {events.map((ev) => {
                      const o = ev.offer;
                      if (ev.type === "offer") {
                        const parentAmount = amountOf(o.parent_offer_id);
                        const isSeller = o.offer_type === "Seller";
                        const title = isSeller ? (o.parent_offer_id ? "Staff counteroffer" : "Staff proposal") : o.parent_offer_id ? "Customer counteroffer" : "Customer offer";
                        const status = o.status === "Submitted" && state.lapsed?.id === o.id ? "Expired" : o.status;
                        return (
                          <li key={ev.key} className={`neg-event ${isSeller ? "neg-event-seller" : "neg-event-buyer"}`}>
                            <div className="neg-event-head">
                              <strong>{title}</strong>
                              <span className="neg-amount">{money(o.offered_price, o.price_frequency)}</span>
                              <span className={`neg-badge neg-badge-${offerStatusSlug(status)}`}>{offerStatusText(status)}</span>
                            </div>
                            <div className="neg-meta">
                              {formatBookingDateTime(o.created_at)} · {isSeller ? `Sent by ${nameOf(o.created_by)}` : o.created_by ? `Recorded by ${nameOf(o.created_by)} for ${buyerName}` : `Submitted by ${buyerName}`}
                              {o.expires_at ? ` · valid until ${formatBookingDateTime(o.expires_at)}` : ""}
                            </div>
                            {parentAmount !== undefined && (
                              <div className="neg-meta">
                                Previous offer {money(parentAmount, o.price_frequency)} → {money(o.offered_price, o.price_frequency)}
                              </div>
                            )}
                            {Number.isFinite(listedPrice) && <div className="neg-meta">{percentDiff(Number(o.offered_price), listedPrice)}</div>}
                            {o.terms && <p className="neg-remarks">{o.terms}</p>}
                          </li>
                        );
                      }
                      const label =
                        o.status === "Countered" ? "Offer countered" : o.status === "Accepted" ? "Offer accepted" : o.status === "Pending Owner Approval" ? "Accepted — awaiting owner approval" : o.status === "Rejected" ? "Offer rejected" : `Offer ${o.status.toLowerCase()}`;
                      return (
                        <li key={ev.key} className={`neg-event neg-event-decision neg-event-${offerStatusSlug(o.status)}`}>
                          <div className="neg-event-head">
                            <strong>{label}</strong>
                            <span className="neg-amount">{money(o.offered_price, o.price_frequency)}</span>
                          </div>
                          <div className="neg-meta">
                            {formatBookingDateTime(ev.at)} · {o.offer_type === "Seller" ? (o.responded_by ? nameOf(o.responded_by) : buyerName) : o.responded_by ? nameOf(o.responded_by) : "Customer"}
                          </div>
                          {o.response_notes && <p className="neg-remarks">{o.response_notes}</p>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
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
          <div className="neg-confirm" role="alertdialog" aria-modal="true" aria-labelledby="neg-confirm-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="neg-confirm-title">{CONFIRM_COPY[confirm.kind].title}</h3>
            <p>
              {confirm.offer.offer_type === "Seller" ? "Staff offer" : "Customer offer"} of <strong>{money(confirm.offer.offered_price, confirm.offer.price_frequency)}</strong>.{" "}
              {CONFIRM_COPY[confirm.kind].body}
            </p>
            {(confirm.kind === "Accepted" || confirm.kind === "Rejected") && (
              <label className="neg-field">
                <span>Notes (optional)</span>
                <textarea rows={2} maxLength={5000} value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} />
              </label>
            )}
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
                {busy ? "Saving…" : CONFIRM_COPY[confirm.kind].yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
