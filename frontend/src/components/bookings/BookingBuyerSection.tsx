import { useRef, useState } from "react";
import ModalPortal from "../common/ModalPortal";
import { replaceBookingNominees } from "../../services/bookingService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { draftFromNominee, hasNomineeErrors, nomineePayload, validateNominees } from "../../utils/bookingNominees";
import type { Booking } from "../../types/booking";
import type { BookingNominee, NomineeDraft, NomineeErrors } from "../../types/bookingNominee";
import { NomineesEditor, NomineesView } from "./NomineesEditor";
import "../../pages/insights/CrmInsights.css";
import "./BuyerNominees.css";

interface BookingBuyerSectionProps {
  booking: Booking;
  /** booking.update permission. */
  canEdit: boolean;
  onNomineesSaved: (nominees: BookingNominee[]) => void;
}

/** Buyer details and nominees of a booking (staff view). Nominees are edited through the dedicated endpoint. */
export default function BookingBuyerSection({ booking, canEdit, onNomineesSaved }: BookingBuyerSectionProps) {
  const nominees = booking.nominees ?? [];
  const cancelled = booking.status === "Cancelled";
  const submittedAt = booking.buyer_details_submitted_at ?? null;

  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<NomineeDraft[]>([]);
  const [errors, setErrors] = useState<NomineeErrors>({ rows: {}, form: null });
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const open = () => {
    setDrafts(nominees.map(draftFromNominee));
    setErrors({ rows: {}, form: null });
    setServerError(null);
    setEditing(true);
  };

  const save = async () => {
    if (savingRef.current) return;
    const found = validateNominees(drafts);
    setErrors(found);
    setServerError(null);
    if (hasNomineeErrors(found)) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await replaceBookingNominees(booking.id, nomineePayload(drafts));
      onNomineesSaved(saved);
      setEditing(false);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setServerError(
        status === 409
          ? getApiErrorMessage(err, "Nominees cannot be changed on a cancelled booking.")
          : getApiErrorMessage(err, "The nominees could not be saved.")
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="bn-section" aria-label="Buyer details and nominees">
      <div className="bn-head">
        <h3>Buyer details &amp; nominees</h3>
        <span className={`bn-status ${submittedAt ? "done" : "todo"}`}>
          {submittedAt ? `Details submitted ${formatBookingDateTime(submittedAt)}` : "Buyer details not submitted by the customer"}
        </span>
      </div>

      <dl className="bn-details">
        <div>
          <dt>Buyer name</dt>
          <dd>{booking.buyer_name || "—"}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{booking.buyer_email || "—"}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{booking.buyer_phone || "—"}</dd>
        </div>
        <div className="wide">
          <dt>Address</dt>
          <dd>{booking.buyer_address || "—"}</dd>
        </div>
      </dl>

      <div className="bn-head">
        <p className="bn-sub">Nominees ({nominees.length})</p>
        {canEdit && !cancelled && (
          <button type="button" className="btn-secondary" onClick={open}>
            {nominees.length > 0 ? "Edit nominees" : "Add nominees"}
          </button>
        )}
      </div>
      {cancelled && <p className="bn-note">Nominees cannot be changed on a cancelled booking.</p>}
      <NomineesView nominees={nominees} />

      {editing && (
        <ModalPortal>
          <div className="ins-modal-overlay" role="presentation">
            <div className="ins-modal em-modal-wide" role="dialog" aria-modal="true" aria-labelledby="bn-edit-title" style={{ maxWidth: 760 }}>
              <div className="ins-modal-header">
                <h3 id="bn-edit-title">Nominees · {booking.buyer_name}</h3>
                <button className="ins-modal-close" onClick={() => !saving && setEditing(false)} disabled={saving} aria-label="Close">
                  ×
                </button>
              </div>
              <div className="ins-modal-body bn-form">
                <NomineesEditor value={drafts} onChange={setDrafts} errors={errors} disabled={saving} />
                {serverError && <div className="bn-alert" role="alert">{serverError}</div>}
              </div>
              <div className="ins-modal-footer">
                <button className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : "Save nominees"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </section>
  );
}
