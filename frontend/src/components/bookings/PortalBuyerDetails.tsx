import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { submitBuyerDetails } from "../../services/customerPortalJourneyService";
import { getPortalErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { draftFromNominee, hasNomineeErrors, nomineePayload, validateNominees } from "../../utils/bookingNominees";
import { NOMINEE_LIMITS } from "../../types/bookingNominee";
import type { NomineeDraft, NomineeErrors } from "../../types/bookingNominee";
import type { BookingRequestDetail } from "../../types/customerBookingJourney";
import { NomineesEditor, NomineesView } from "./NomineesEditor";
import "./BuyerNominees.css";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface PortalBuyerDetailsProps {
  detail: BookingRequestDetail;
  holdExpired: boolean;
  /** Re-fetches the request so the saved details come from the API. */
  onChanged: () => Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
}

/**
 * Customer form for the buyer's contact details and nominees. The backend requires them (HTTP 409 otherwise)
 * before a payment can be submitted, and locks them again once a payment is pending or verified.
 */
export default function PortalBuyerDetails({ detail, holdExpired, onChanged, notify }: PortalBuyerDetailsProps) {
  const booking = detail.booking;
  const submittedAt = booking?.buyer_details_submitted_at ?? null;
  const paymentSubmitted = detail.payments.some((p) => p.status === "Pending" || p.status === "Verified");
  const editable =
    detail.status === "Approved" && (booking?.status ?? "Pending") === "Pending" && !holdExpired && !paymentSubmitted;

  const [editing, setEditing] = useState(editable && !submittedAt);
  const [name, setName] = useState(booking?.buyer_name ?? "");
  const [phone, setPhone] = useState(booking?.buyer_phone ?? "");
  const [email, setEmail] = useState(booking?.buyer_email ?? "");
  const [address, setAddress] = useState(booking?.buyer_address ?? "");
  const [drafts, setDrafts] = useState<NomineeDraft[]>(() => (booking?.nominees ?? []).map(draftFromNominee));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [nomineeErrors, setNomineeErrors] = useState<NomineeErrors>({ rows: {}, form: null });
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Load the saved values into the form whenever the request is (re)fetched while the form is closed.
  useEffect(() => {
    if (editing) return;
    setName(booking?.buyer_name ?? "");
    setPhone(booking?.buyer_phone ?? "");
    setEmail(booking?.buyer_email ?? "");
    setAddress(booking?.buyer_address ?? "");
    setDrafts((booking?.nominees ?? []).map(draftFromNominee));
  }, [booking, editing]);

  // Close the form if the details become locked (payment submitted, hold expired, ...).
  useEffect(() => {
    if (!editable) setEditing(false);
  }, [editable]);

  if (!detail.booking_id) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    setServerError(null);

    const errors: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (trimmedName.length < 2) errors.name = "Enter the buyer’s full name.";
    else if (trimmedName.length > 200) errors.name = "At most 200 characters.";
    if (trimmedPhone.length < NOMINEE_LIMITS.buyerPhoneMin) errors.phone = `Enter a phone number (at least ${NOMINEE_LIMITS.buyerPhoneMin} characters).`;
    else if (trimmedPhone.length > NOMINEE_LIMITS.phoneMax) errors.phone = `At most ${NOMINEE_LIMITS.phoneMax} characters.`;
    if (email.trim() && !EMAIL_RE.test(email.trim())) errors.email = "Enter a valid email address.";
    if (address.trim().length > NOMINEE_LIMITS.buyerAddressMax) errors.address = `At most ${NOMINEE_LIMITS.buyerAddressMax} characters.`;
    const nomineeFound = validateNominees(drafts);
    setFieldErrors(errors);
    setNomineeErrors(nomineeFound);
    if (Object.keys(errors).length > 0 || hasNomineeErrors(nomineeFound)) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const result = await submitBuyerDetails(detail.id, {
        buyer_name: trimmedName,
        buyer_phone: trimmedPhone,
        buyer_email: email.trim() || null,
        buyer_address: address.trim() || null,
        nominees: nomineePayload(drafts),
      });
      notify(result.message || "Buyer and nominee details submitted.");
      setEditing(false);
      await onChanged();
    } catch (err) {
      // 409 explains why the details are locked (payment already submitted, hold expired, ...).
      setServerError(getPortalErrorMessage(err, "Your details could not be saved. Please try again."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const err = (key: string) =>
    fieldErrors[key] ? (
      <small className="nm-error" role="alert">
        {fieldErrors[key]}
      </small>
    ) : null;

  return (
    <section className="cp-panel bn-section" aria-label="Buyer and nominee details" style={{ marginTop: 0 }}>
      <h2 className="cp-panel-title">
        <span>Buyer &amp; nominee details</span>
        <span className={`bn-status ${submittedAt ? "done" : "todo"}`}>
          {submittedAt ? `Submitted ${formatBookingDateTime(submittedAt)}` : "Required before payment"}
        </span>
      </h2>

      {!submittedAt && detail.status === "Approved" && !editing && editable && (
        <p className="bn-note">Please complete these details. They are needed before you can submit a payment.</p>
      )}

      {editing ? (
        <form className="bn-form" onSubmit={submit} noValidate>
          <div className="nm-grid">
            <div className={`nm-field ${fieldErrors.name ? "has-error" : ""}`}>
              <label htmlFor="bd-name">Buyer full name <span className="nm-req">*</span></label>
              <input id="bd-name" value={name} maxLength={200} disabled={saving} onChange={(e) => setName(e.target.value)} />
              {err("name")}
            </div>
            <div className={`nm-field ${fieldErrors.phone ? "has-error" : ""}`}>
              <label htmlFor="bd-phone">Phone <span className="nm-req">*</span></label>
              <input id="bd-phone" type="tel" value={phone} maxLength={NOMINEE_LIMITS.phoneMax} disabled={saving} onChange={(e) => setPhone(e.target.value)} />
              {err("phone")}
            </div>
            <div className={`nm-field ${fieldErrors.email ? "has-error" : ""}`}>
              <label htmlFor="bd-email">Email</label>
              <input id="bd-email" type="email" value={email} disabled={saving} onChange={(e) => setEmail(e.target.value)} />
              {err("email")}
            </div>
          </div>
          <div className={`nm-field ${fieldErrors.address ? "has-error" : ""}`}>
            <label htmlFor="bd-address">Address</label>
            <textarea id="bd-address" rows={3} value={address} maxLength={NOMINEE_LIMITS.buyerAddressMax} disabled={saving} onChange={(e) => setAddress(e.target.value)} />
            {err("address")}
          </div>

          <p className="bn-sub">Nominees</p>
          <NomineesEditor value={drafts} onChange={setDrafts} errors={nomineeErrors} disabled={saving} />

          {serverError && (
            <div className="bn-alert" role="alert">
              {serverError}
            </div>
          )}
          <div className="bn-actions">
            {submittedAt && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : submittedAt ? "Update details" : "Submit details"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="bn-details">
            <div>
              <dt>Buyer name</dt>
              <dd>{booking?.buyer_name || "—"}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{booking?.buyer_phone || "—"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{booking?.buyer_email || "—"}</dd>
            </div>
            <div className="wide">
              <dt>Address</dt>
              <dd>{booking?.buyer_address || "—"}</dd>
            </div>
          </dl>
          <p className="bn-sub">Nominees ({booking?.nominees?.length ?? 0})</p>
          <NomineesView nominees={booking?.nominees ?? []} />
          {editable ? (
            <div className="bn-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                {submittedAt ? "Edit details" : "Add details"}
              </button>
            </div>
          ) : (
            <p className="bn-note">
              {paymentSubmitted
                ? "These details are locked because a payment has been submitted. Contact our team if a correction is needed."
                : holdExpired
                ? "The booking hold has expired. Contact our team before changing these details."
                : "These details can only be changed while the booking request is approved and not yet confirmed."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
