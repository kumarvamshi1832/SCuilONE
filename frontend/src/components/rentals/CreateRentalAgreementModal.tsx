import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createRentalAgreement } from "../../services/rentalService";
import { getBuyerRequirements } from "../../services/buyerRequirementService";
import { getContacts } from "../../services/contactService";
import { getLeads } from "../../services/leadService";
import { getOffersForMatch } from "../../services/propertyOfferService";
import { getProperties } from "../../services/propertyService";
import { fetchApiMatchesForRequirement } from "../../services/propertyMatchService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatDay, formatRent, todayInput, validateRentalForm, type RentalFormErrors, type RentalFormValues } from "../../utils/rentalHelpers";
import { ActionDialog, Field, inputStyle } from "../booking-journey/StaffBookingActions";
import { RENTAL_FREQUENCIES } from "../../types/rental";
import type { RentalAgreement, RentalFrequency } from "../../types/rental";
import type { Contact } from "../../types/contact";
import type { Lead } from "../../types/lead";
import type { Property } from "../../types/property";
import type { PropertyOffer } from "../../types/propertyOffer";

const EMPTY: RentalFormValues = {
  propertyId: "",
  customerKind: "",
  customerId: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  rentAmount: "",
  depositAmount: "",
  maintenanceAmount: "0",
  maintenanceFrequency: "Monthly",
  agreementStart: "",
  agreementEnd: "",
  lockInMonths: "0",
  noticePeriodDays: "30",
  dueDay: "5",
  lateFeeType: "Fixed",
  lateFeeAmount: "0",
  lateFeeGraceDays: "0",
  escalationPercentage: "",
  escalationIntervalMonths: "",
  notes: "",
  acceptedOfferId: "",
  propertyMatchId: "",
  buyerRequirementId: "",
};

interface AcceptedOffer {
  offer: PropertyOffer;
  matchId: string;
  requirementId: string;
}

/**
 * Creates a Draft rent / lease agreement (POST /api/v1/rentals/agreements). The property's listing type fixes the
 * agreement type and its price frequency; when the customer has an accepted offer on the property it can be linked,
 * which the server only accepts if the rent equals the offer amount.
 */
export default function CreateRentalAgreementModal({ onClose, onCreated }: { onClose: () => void; onCreated: (agreement: RentalAgreement) => void | Promise<void> }) {
  const [values, setValues] = useState<RentalFormValues>({ ...EMPTY, agreementStart: todayInput() });
  const [errors, setErrors] = useState<RentalFormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [properties, setProperties] = useState<Property[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [offerLookup, setOfferLookup] = useState<"idle" | "loading" | "done">("idle");
  const [acceptedOffer, setAcceptedOffer] = useState<AcceptedOffer | null>(null);
  const [useOffer, setUseOffer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProperties({ limit: 100 }).catch(() => [] as Property[]), getContacts().catch(() => [] as Contact[]), getLeads().catch(() => [] as Lead[])]).then(
      ([props, contactList, leadList]) => {
        if (cancelled) return;
        // Only Rent / Lease listings that are free, or held (Reserved) for an accepted offer, can receive an agreement.
        setProperties(props.filter((p) => (p.listing_type === "Rent" || p.listing_type === "Lease") && (p.status === "Available" || p.status === "Reserved")));
        setContacts(contactList);
        setLeads(leadList);
        setRefsLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const property = properties.find((p) => p.id === values.propertyId) ?? null;
  const propertyFrequency = (property?.price_frequency && RENTAL_FREQUENCIES.includes(property.price_frequency as RentalFrequency) ? property.price_frequency : property ? "Monthly" : null) as RentalFrequency | null;
  const agreementType = property && (property.listing_type === "Rent" || property.listing_type === "Lease") ? property.listing_type : null;

  const set = <K extends keyof RentalFormValues>(key: K, value: RentalFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setApiError(null);
  };

  const pickProperty = (id: string) => {
    const p = properties.find((x) => x.id === id);
    setUseOffer(false);
    setAcceptedOffer(null);
    setValues((prev) => ({
      ...prev,
      propertyId: id,
      rentAmount: p ? String(Number(p.price)) : "",
      depositAmount: p?.security_deposit != null ? String(Number(p.security_deposit)) : prev.depositAmount,
      acceptedOfferId: "",
      propertyMatchId: "",
      buyerRequirementId: "",
    }));
    setErrors({});
  };

  const pickCustomer = (encoded: string) => {
    setUseOffer(false);
    setAcceptedOffer(null);
    if (!encoded) {
      setValues((prev) => ({ ...prev, customerKind: "", customerId: "", acceptedOfferId: "", propertyMatchId: "", buyerRequirementId: "" }));
      return;
    }
    const [kind, id] = encoded.split(":") as ["contact" | "lead", string];
    const c = kind === "contact" ? contacts.find((x) => x.id === id) : undefined;
    const l = kind === "lead" ? leads.find((x) => x.id === id) : undefined;
    setValues((prev) => ({
      ...prev,
      customerKind: kind,
      customerId: id,
      customerName: c?.full_name || l?.full_name || prev.customerName,
      customerEmail: c?.email || l?.email || "",
      customerPhone: c?.phone || l?.phone || "",
      acceptedOfferId: "",
      propertyMatchId: "",
      buyerRequirementId: "",
    }));
    setErrors((prev) => ({ ...prev, customerId: undefined, customerName: undefined }));
  };

  // Find an accepted offer for this customer + property (requirement -> match -> offers).
  useEffect(() => {
    if (!values.propertyId || !values.customerId) {
      setOfferLookup("idle");
      setAcceptedOffer(null);
      return;
    }
    let cancelled = false;
    setOfferLookup("loading");
    (async () => {
      try {
        const requirements = (await getBuyerRequirements()).filter((r) => (values.customerKind === "contact" ? r.contact_id : r.lead_id) === values.customerId);
        for (const requirement of requirements) {
          const matches = await fetchApiMatchesForRequirement(requirement.id).catch(() => []);
          const match = matches.find((m) => m.property_id === values.propertyId);
          if (!match) continue;
          const offers = await getOffersForMatch(match.id).catch(() => [] as PropertyOffer[]);
          const accepted = [...offers].reverse().find((o) => o.status === "Accepted");
          if (accepted) {
            if (!cancelled) setAcceptedOffer({ offer: accepted, matchId: match.id, requirementId: requirement.id });
            return;
          }
        }
        if (!cancelled) setAcceptedOffer(null);
      } finally {
        if (!cancelled) setOfferLookup("done");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [values.propertyId, values.customerId, values.customerKind]);

  const toggleOffer = (checked: boolean) => {
    setUseOffer(checked);
    setValues((prev) =>
      checked && acceptedOffer
        ? {
            ...prev,
            rentAmount: String(Number(acceptedOffer.offer.offered_price)),
            acceptedOfferId: acceptedOffer.offer.id,
            propertyMatchId: acceptedOffer.matchId,
            buyerRequirementId: acceptedOffer.requirementId,
          }
        : { ...prev, acceptedOfferId: "", propertyMatchId: "", buyerRequirementId: "" }
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const result = validateRentalForm(values, {
      agreementType,
      propertyFrequency,
      minimumTermMonths: property?.minimum_term_months ?? null,
      maximumTermMonths: property?.maximum_term_months ?? null,
      acceptedOfferPrice: useOffer && acceptedOffer ? Number(acceptedOffer.offer.offered_price) : null,
    });
    setErrors(result.errors);
    if (!result.payload) return;
    setBusy(true);
    setApiError(null);
    try {
      await onCreated(await createRentalAgreement(result.payload));
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The agreement could not be created."));
    } finally {
      setBusy(false);
    }
  };

  const customers = useMemo(
    () => [
      ...contacts.map((c) => ({ value: `contact:${c.id}`, label: `${c.full_name}${c.phone ? ` · ${c.phone}` : ""} (contact)` })),
      ...leads.map((l) => ({ value: `lead:${l.id}`, label: `${l.full_name}${l.phone ? ` · ${l.phone}` : ""} (lead)` })),
    ],
    [contacts, leads]
  );
  const err = (k: keyof RentalFormValues) => errors[k];
  const num = (id: string, label: string, key: keyof RentalFormValues, hint?: string, readOnly = false) => (
    <Field id={id} label={label} error={err(key)} hint={hint}>
      <input id={id} className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} inputMode="decimal" value={values[key]} readOnly={readOnly} onChange={(e) => set(key, e.target.value as never)} />
    </Field>
  );

  return (
    <ActionDialog title="New rent / lease agreement" titleId="rental-create-title" error={apiError} busy={busy} submitLabel="Create draft agreement" onClose={onClose} onSubmit={(e) => void submit(e)}>
      {refsLoading && <p className="text-muted" style={{ marginTop: 0 }}>Loading properties and customers…</p>}

      <Field id="ra-property" label="Property *" error={err("propertyId")} hint={!refsLoading && properties.length === 0 ? "No Rent or Lease listing is available. Add one under Properties first." : undefined}>
        <select id="ra-property" className="filter-select" style={inputStyle} value={values.propertyId} onChange={(e) => pickProperty(e.target.value)} disabled={refsLoading}>
          <option value="">Select property…</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.unit_number ? ` (Unit ${p.unit_number})` : ""} · {p.listing_type} · {formatRent(p.price, p.price_frequency || "Monthly")}
              {p.status === "Reserved" ? " · held" : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field id="ra-customer" label="Customer *" error={err("customerId")}>
        <select id="ra-customer" className="filter-select" style={inputStyle} value={values.customerKind ? `${values.customerKind}:${values.customerId}` : ""} onChange={(e) => pickCustomer(e.target.value)} disabled={refsLoading}>
          <option value="">Select contact or lead…</option>
          {customers.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      {values.customerKind === "lead" && (
        <p className="text-muted" style={{ fontSize: "0.8rem", marginTop: -6 }}>
          The customer can see and sign this agreement in the portal only if it is linked to a contact (or a buyer requirement of one).
        </p>
      )}

      {offerLookup === "loading" && <p className="text-muted" style={{ fontSize: "0.85rem" }}>Checking for an accepted offer…</p>}
      {offerLookup === "done" && acceptedOffer && (
        <label className="bj-note" style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={useOffer} onChange={(e) => toggleOffer(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <strong>Use the accepted offer</strong> of {formatRent(acceptedOffer.offer.offered_price, acceptedOffer.offer.price_frequency)} for this customer and property. The rent is then
            fixed to the offer, and the agreement is linked to it.
          </span>
        </label>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 14px" }}>
        <Field id="ra-name" label="Customer name *" error={err("customerName")}>
          <input id="ra-name" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} maxLength={200} value={values.customerName} onChange={(e) => set("customerName", e.target.value)} />
        </Field>
        <Field id="ra-email" label="Customer email">
          <input id="ra-email" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} value={values.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} />
        </Field>
        <Field id="ra-phone" label="Customer phone">
          <input id="ra-phone" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} value={values.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} />
        </Field>
        {num("ra-rent", `Rent (INR${propertyFrequency ? ` ${formatRent(0, propertyFrequency).replace("₹ 0 ", "")}` : ""}) *`, "rentAmount", useOffer ? "Fixed to the accepted offer." : undefined, useOffer)}
        {num("ra-deposit", "Security deposit (INR)", "depositAmount")}
        {num("ra-maint", "Maintenance (INR)", "maintenanceAmount")}
        <Field id="ra-maint-freq" label="Maintenance frequency">
          <select id="ra-maint-freq" className="filter-select" style={inputStyle} value={values.maintenanceFrequency} onChange={(e) => set("maintenanceFrequency", e.target.value as RentalFrequency)}>
            {RENTAL_FREQUENCIES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
        <Field id="ra-start" label="Start date *" error={err("agreementStart")}>
          <input id="ra-start" type="date" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} value={values.agreementStart} onChange={(e) => set("agreementStart", e.target.value)} />
        </Field>
        <Field
          id="ra-end"
          label="End date"
          error={err("agreementEnd")}
          hint={property?.minimum_term_months || property?.maximum_term_months ? `Allowed term: ${property?.minimum_term_months ?? "any"}–${property?.maximum_term_months ?? "any"} months.` : "Leave empty for an open-ended agreement."}
        >
          <input id="ra-end" type="date" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} value={values.agreementEnd} onChange={(e) => set("agreementEnd", e.target.value)} />
        </Field>
        {num("ra-lock", "Lock-in (months)", "lockInMonths")}
        {num("ra-notice", "Notice period (days)", "noticePeriodDays")}
        {num("ra-due", "Rent due day of month (1–28)", "dueDay")}
        <Field id="ra-late-type" label="Late fee type">
          <select id="ra-late-type" className="filter-select" style={inputStyle} value={values.lateFeeType} onChange={(e) => set("lateFeeType", e.target.value as "Fixed" | "Percentage")}>
            <option>Fixed</option>
            <option>Percentage</option>
          </select>
        </Field>
        {num("ra-late", values.lateFeeType === "Percentage" ? "Late fee (% of the rent)" : "Late fee (INR)", "lateFeeAmount")}
        {num("ra-grace", "Late fee grace (days)", "lateFeeGraceDays")}
        {num("ra-esc", "Annual escalation (%)", "escalationPercentage", "Optional.")}
        {num("ra-esc-int", "Escalation every (months)", "escalationIntervalMonths", "Required when escalation is set.")}
      </div>

      <Field id="ra-notes" label="Notes">
        <textarea id="ra-notes" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      {property && (
        <p className="text-muted" style={{ fontSize: "0.8rem", margin: 0 }}>
          {agreementType} agreement · price period {propertyFrequency} (set by the listing) · listed rent {formatRent(property.price, propertyFrequency)}
          {values.agreementStart ? ` · starts ${formatDay(values.agreementStart)}` : ""}
        </p>
      )}
    </ActionDialog>
  );
}
