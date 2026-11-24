import { formatBookingMoney, parseBackendDate } from "./bookingJourney";
import type { PropertyOffer } from "../types/propertyOffer";

/** Customer/staff wording for every status the backend can return (statuses are never invented here). */
export const OFFER_STATUS_TEXT: Record<string, string> = {
  Submitted: "Awaiting response",
  Countered: "Countered",
  Accepted: "Accepted",
  Rejected: "Rejected",
  Withdrawn: "Withdrawn",
  "Pending Owner Approval": "Awaiting owner approval",
  Expired: "Expired",
};

export const offerStatusText = (status: string): string => OFFER_STATUS_TEXT[status] ?? status;
export const offerStatusSlug = (status: string): string => status.toLowerCase().replace(/[^a-z]+/g, "-");

/**
 * Detects whether a listing or requirement type represents a rental or lease (case-insensitive).
 * Handles "Rent", "For Rent", "Lease", "For Lease", "rent", "lease".
 */
export const isRentalListing = (listingType?: string | null): boolean => {
  if (!listingType) return false;
  const lower = listingType.trim().toLowerCase();
  return lower.includes("rent") || lower.includes("lease");
};

/**
 * Calculates and formats the difference between proposed amount and listed amount.
 * Returns difference text and percentage comparison, e.g. "+₹ 1,000 (1.8% above listed)".
 */
export const formatOfferDiff = (
  proposed: number | string | null | undefined,
  listed: number | string | null | undefined,
  currency: string = "INR"
): { text: string; isAbove: boolean; isBelow: boolean; isEqual: boolean; diffAmount: number; diffPct: number } | null => {
  const p = Number(proposed);
  const l = Number(listed);
  if (!(l > 0) || !(p > 0) || Number.isNaN(p) || Number.isNaN(l)) return null;
  const diff = p - l;
  const pct = (diff / l) * 100;
  if (Math.abs(diff) < 0.05) {
    return { text: "Equal to listed rent", isAbove: false, isBelow: false, isEqual: true, diffAmount: 0, diffPct: 0 };
  }
  const formattedDiff = formatOfferMoney(Math.abs(diff), "One-time", currency);
  const formattedPct = Math.abs(pct).toFixed(1);
  if (diff > 0) {
    return {
      text: `+${formattedDiff} (${formattedPct}% above listed)`,
      isAbove: true,
      isBelow: false,
      isEqual: false,
      diffAmount: diff,
      diffPct: pct,
    };
  }
  return {
    text: `-${formattedDiff} (${formattedPct}% below listed)`,
    isAbove: false,
    isBelow: true,
    isEqual: false,
    diffAmount: diff,
    diffPct: pct,
  };
};

const FREQUENCY_SUFFIX: Record<string, string> = {
  Monthly: " / month",
  Quarterly: " / quarter",
  Yearly: " / year",
  "One-time": "",
};

const toNumber = (value: string | number | null | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};

/** "₹ 85,000 / month" for recurring (rent / lease) offers, "₹ 1,25,00,000" for a one-time sale price. */
export const formatOfferMoney = (value: string | number | null | undefined, frequency?: string | null, currency = "INR"): string => {
  const n = toNumber(value);
  if (Number.isNaN(n)) return "—";
  const suffix = FREQUENCY_SUFFIX[frequency ?? "One-time"] ?? "";
  const body = currency === "INR" ? `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `${body}${suffix}`;
};

/** Validates a money input (positive, at most 2 decimals, fits the 14-digit column); returns [amount, error]. */
export const parseOfferAmount = (raw: string): [number | null, string | null] => {
  const text = raw.trim().replace(/,/g, "");
  if (!text) return [null, "Enter an amount."];
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return [null, "Enter a valid amount with at most 2 decimal places."];
  const n = Number(text);
  if (!(n > 0)) return [null, "The amount must be greater than zero."];
  if (n > 999_999_999_999.99) return [null, "The amount is too large."];
  return [n, null];
};

const time = (value: string | null | undefined): number => parseBackendDate(value ?? undefined)?.getTime() ?? 0;
export const byCreatedAt = (a: PropertyOffer, b: PropertyOffer): number => time(a.created_at) - time(b.created_at);

/** True when an unanswered offer is past its expiry (the server flips it to "Expired" on the next decision attempt). */
export const isLapsed = (offer: Pick<PropertyOffer, "status" | "expires_at">, now: number = Date.now()): boolean =>
  offer.status === "Submitted" && Boolean(offer.expires_at) && time(offer.expires_at) <= now;

export interface ThreadState {
  accepted?: PropertyOffer;
  pendingOwner?: PropertyOffer;
  /** The one unanswered offer that has not lapsed. */
  open?: PropertyOffer;
  /** An unanswered offer past its expiry. It still blocks new offers on the server until it is marked Expired. */
  lapsed?: PropertyOffer;
  latest?: PropertyOffer;
}

/** Where a negotiation stands, derived only from the offers the API returned (oldest first). */
export const threadState = (offers: PropertyOffer[], now: number = Date.now()): ThreadState => {
  const reversed = [...offers].reverse();
  const accepted = reversed.find((o) => o.status === "Accepted");
  const pendingOwner = reversed.find((o) => o.status === "Pending Owner Approval");
  const submitted = reversed.find((o) => o.status === "Submitted");
  return {
    accepted,
    pendingOwner,
    open: submitted && !isLapsed(submitted, now) ? submitted : undefined,
    lapsed: submitted && isLapsed(submitted, now) ? submitted : undefined,
    latest: offers.length > 0 ? offers[offers.length - 1] : undefined,
  };
};

export interface NegotiationMessage {
  text: string;
  /** From the customer's point of view. */
  from: "You" | "Our team";
  at: string;
}

export interface NegotiationSummary {
  state: ThreadState;
  /** Who has to act next. */
  awaiting: "customer" | "staff" | "owner" | "none";
  /** Customer-facing wording for the negotiation as a whole. */
  negotiationStatus: string;
  /** The newest offer or counteroffer made by staff. */
  staffOffer?: PropertyOffer;
  /** Status of that staff offer ("Expired" once it lapsed). */
  offerStatus: string | null;
  latestMessage: NegotiationMessage | null;
}

/**
 * Customer-facing summary of one negotiation thread, derived only from the offers the API returned (oldest first).
 * A message is either an offer's own remarks (`terms`, written by whoever made the offer) or the notes written when the
 * other side answered it (`response_notes`).
 */
export const summarizeNegotiation = (offers: PropertyOffer[], now: number = Date.now()): NegotiationSummary => {
  const state = threadState(offers, now);
  const { accepted, pendingOwner, open, lapsed, latest } = state;

  const staffOffer = [...offers].reverse().find((o) => o.offer_type === "Seller");
  const offerStatus = staffOffer ? (lapsed?.id === staffOffer.id ? "Expired" : staffOffer.status) : null;

  let awaiting: NegotiationSummary["awaiting"] = "none";
  let negotiationStatus: string;
  if (!latest) negotiationStatus = "No offer yet";
  else if (accepted) negotiationStatus = "Offer agreed";
  else if (pendingOwner) {
    awaiting = "owner";
    negotiationStatus = "Awaiting owner approval";
  } else if (open) {
    awaiting = open.offer_type === "Seller" ? "customer" : "staff";
    negotiationStatus = awaiting === "customer" ? "Awaiting your response" : "Awaiting our team's response";
  } else if (lapsed) negotiationStatus = "Offer expired";
  else if (latest.status === "Rejected") negotiationStatus = "Closed — offer rejected";
  else if (latest.status === "Expired") negotiationStatus = "Closed — offer expired";
  else negotiationStatus = offerStatusText(latest.status);

  let latestMessage: NegotiationMessage | null = null;
  const consider = (text: string | null, from: NegotiationMessage["from"], at: string | null) => {
    if (!text || !text.trim() || !at) return;
    if (!latestMessage || time(at) >= time(latestMessage.at)) latestMessage = { text: text.trim(), from, at };
  };
  for (const o of offers) {
    consider(o.terms, o.offer_type === "Seller" ? "Our team" : "You", o.created_at);
    consider(o.response_notes, o.offer_type === "Seller" ? "You" : "Our team", o.responded_at);
  }
  return { state, awaiting, negotiationStatus, staffOffer, offerStatus, latestMessage };
};

export interface RequestOfferDetails {
  /** The specific offer record associated with this state, if any */
  offer: PropertyOffer | null;
  /** Offer amount (number or string) */
  offeredPrice: number | string | null;
  /** Offer frequency ("Monthly", "One-time", etc.) */
  priceFrequency: string | null;
  /** Currency (defaults to "INR") */
  currency: string;
  /** Formatted money string, e.g. "₹ 25,000 / month" */
  formattedPrice: string | null;
  /** Short status label, e.g. "Offer received", "Offer agreed", "Counteroffer submitted", "Offer expired", "Offer rejected" */
  statusLabel: string | null;
  /** Chip tone or badge style */
  tone: "info" | "warn" | "ok" | "error";
  /** Offer ID */
  offerId: string | null;
  /** Whether a negotiated offer exists */
  hasNegotiatedOffer: boolean;
  /** Deposit or booking amount from the booking request */
  bookingAmount: string | null;
  /** Formatted booking or deposit amount, e.g. "₹ 50,000" */
  formattedBookingAmount: string | null;
}

/**
 * Resolves the unified offer details and pricing for a booking request across all portal surfaces:
 * Notification alerts, booking requests list table, request detail page, and negotiation modals.
 *
 * Guarantees that the active / agreed offer price is always mapped consistently and never confused
 * with the booking amount (token/deposit) or base property price.
 */
export const resolveRequestOfferDetails = (
  request?: { agreed_price?: string | null; booking_amount?: string | null; status?: string } | null,
  summary?: NegotiationSummary | null,
  currency = "INR",
  isRental = false
): RequestOfferDetails => {
  let offer: PropertyOffer | null = null;
  let statusLabel: string | null = null;
  let tone: RequestOfferDetails["tone"] = "info";
  let hasNegotiatedOffer = false;

  if (summary) {
    if (summary.state.accepted) {
      offer = summary.state.accepted;
      statusLabel = "Offer agreed";
      tone = "ok";
      hasNegotiatedOffer = true;
    } else if (summary.state.pendingOwner) {
      offer = summary.state.pendingOwner;
      statusLabel = "Awaiting owner approval";
      tone = "info";
      hasNegotiatedOffer = true;
    } else if (summary.state.open) {
      offer = summary.state.open;
      statusLabel =
        summary.awaiting === "customer"
          ? offer.parent_offer_id
            ? "Counteroffer received — respond"
            : "Offer received — respond"
          : "Your counteroffer is with our team";
      tone = summary.awaiting === "customer" ? "warn" : "info";
      hasNegotiatedOffer = true;
    } else if (summary.state.lapsed) {
      offer = summary.state.lapsed;
      statusLabel = "Offer expired";
      tone = "error";
      hasNegotiatedOffer = true;
    } else if (summary.state.latest) {
      offer = summary.state.latest;
      statusLabel =
        offer.status === "Rejected"
          ? "Offer rejected"
          : offer.status === "Expired"
          ? "Offer expired"
          : `Offer ${offerStatusText(offer.status).toLowerCase()}`;
      tone = offer.status === "Rejected" || offer.status === "Expired" ? "error" : "info";
      hasNegotiatedOffer = true;
    } else if (summary.staffOffer) {
      offer = summary.staffOffer;
      statusLabel = summary.offerStatus ? offerStatusText(summary.offerStatus) : "Proposed offer";
      tone = "info";
      hasNegotiatedOffer = true;
    }
  }

  let offeredPrice: number | string | null = null;
  let priceFrequency: string | null = null;

  if (offer) {
    offeredPrice = offer.offered_price;
    priceFrequency = offer.price_frequency;
  } else if (request?.agreed_price) {
    offeredPrice = request.agreed_price;
    priceFrequency = isRental ? "Monthly" : "One-time";
    statusLabel =
      request.status === "Approved"
        ? "Price approved"
        : request.status === "Confirmed"
        ? "Booking confirmed"
        : null;
    tone = "ok";
  }

  const formattedPrice =
    offeredPrice != null ? formatOfferMoney(offeredPrice, priceFrequency, currency) : null;

  const bookingAmount = request?.booking_amount ?? null;
  const formattedBookingAmount = bookingAmount ? formatBookingMoney(bookingAmount) : null;

  return {
    offer,
    offeredPrice,
    priceFrequency,
    currency,
    formattedPrice,
    statusLabel,
    tone,
    offerId: offer?.id ?? null,
    hasNegotiatedOffer,
    bookingAmount,
    formattedBookingAmount,
  };
};
