import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPortalBookings, getPortalSiteVisits } from "../services/customerPortalCommercialService";
import { getBookingRequests } from "../services/customerPortalJourneyService";
import { getApiErrorMessage } from "../utils/apiError";
import { buildBookingRecords } from "../utils/portalBookingRecords";
import type { BookingRecord } from "../utils/portalBookingRecords";
import type { BookingRequest } from "../types/customerBookingJourney";
import type { PortalBooking, PortalSiteVisit } from "../types/customerPortal";

interface State {
  bookings: PortalBooking[];
  requests: BookingRequest[];
  visits: PortalSiteVisit[];
}

/**
 * Loads the logged-in customer's bookings and booking requests from the customer portal APIs
 * (portal token only - ownership is enforced by the backend) and merges them into booking records.
 *
 * A failed call is reported, never silently turned into "no bookings": `error` is set when nothing could be
 * loaded, `warning` when only one of the two sources failed (the other is still shown).
 */
export function usePortalBookingRecords(enabled = true) {
  const [data, setData] = useState<State>({ bookings: [], requests: [], visits: [] });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const mine = ++seq.current;
    setLoading(true);
    const [bookings, requests, visits] = await Promise.allSettled([
      getPortalBookings(),
      getBookingRequests(),
      getPortalSiteVisits(), // only used to name request-only rows; optional
    ]);
    if (mine !== seq.current) return; // a newer load superseded this one

    if (bookings.status === "rejected" && requests.status === "rejected") {
      setError(getApiErrorMessage(bookings.reason, "Failed to load your bookings."));
      setWarning(null);
    } else {
      setError(null);
      const missing: string[] = [];
      if (bookings.status === "rejected") missing.push(`bookings (${getApiErrorMessage(bookings.reason, "request failed")})`);
      if (requests.status === "rejected") missing.push(`booking requests (${getApiErrorMessage(requests.reason, "request failed")})`);
      setWarning(missing.length ? `Some information could not be loaded: ${missing.join("; ")}.` : null);
      setData({
        bookings: bookings.status === "fulfilled" && Array.isArray(bookings.value) ? bookings.value : [],
        requests: requests.status === "fulfilled" ? requests.value : [],
        visits: visits.status === "fulfilled" && Array.isArray(visits.value) ? visits.value : [],
      });
      setLoaded(true);
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // A different workspace is a different customer record set: reload instead of showing the previous one.
  useEffect(() => {
    const onSwitch = () => {
      setData({ bookings: [], requests: [], visits: [] });
      setLoaded(false);
      void load();
    };
    window.addEventListener("portal:workspace-switched", onSwitch);
    return () => window.removeEventListener("portal:workspace-switched", onSwitch);
  }, [load]);

  const records: BookingRecord[] = useMemo(
    () => buildBookingRecords(data.bookings, data.requests, data.visits),
    [data]
  );

  return { records, loading, error, warning, loaded, reload: load };
}
