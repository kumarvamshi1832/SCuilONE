export const formatDateTime = (dateString?: string | null): string => {
  if (!dateString) return "—";

  // Ensure naive UTC strings (if any) are parsed as UTC, though usually Z is provided.
  // The user explicitly stated backend returns Z or +00:00, which new Date parses correctly as UTC.
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};
