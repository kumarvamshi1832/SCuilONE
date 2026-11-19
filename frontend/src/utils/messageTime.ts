import { parseBackendDate } from "./bookingJourney";

/**
 * Chat and e-mail timestamps. The backend stores some of them as naive UTC (no zone suffix), so every
 * value goes through `parseBackendDate` before formatting - otherwise the browser would read it as local time.
 */

export const formatMessageDateTime = (value: string | null | undefined): string => {
  const date = parseBackendDate(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Compact time for inbox rows: time today, weekday this week, otherwise a short date. */
export const formatShortTime = (value: string | null | undefined): string => {
  const date = parseBackendDate(value);
  if (!date) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays < 6) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
};

/** Label for a day divider inside a thread ("Today", "Yesterday" or a date). */
export const formatDayLabel = (value: string | null | undefined): string => {
  const date = parseBackendDate(value);
  if (!date) return "";
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
};

/** Stable key for grouping messages by calendar day. */
export const dayKey = (value: string | null | undefined): string => {
  const date = parseBackendDate(value);
  return date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : "unknown";
};
