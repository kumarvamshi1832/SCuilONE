/**
 * Decimal-safe INR helpers. All arithmetic is done on integer paise ("cents") so sums such as
 * 0.1 + 0.2 or 33.33 × 3 never drift. The API serialises Decimals as strings or numbers.
 */

/** Converts an API/user amount to integer paise. Returns 0 for empty or non-numeric input. */
export const toCents = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/**
 * Parses text typed by a user. Accepts digits with at most two decimals (commas allowed as thousands
 * separators). Returns null when the text is empty or not a valid amount, so callers can show an error.
 */
export const parseAmountToCents = (text: string): number | null => {
  const cleaned = text.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return toCents(cleaned);
};

/** Paise -> the plain decimal string the API expects, e.g. 500000 -> "5000.00". */
export const centsToDecimalString = (cents: number): string => (cents / 100).toFixed(2);

/** Paise -> number of rupees (for request bodies typed as number). */
export const centsToNumber = (cents: number): number => Math.round(cents) / 100;

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** ₹5,00,000 (paise only shown when present, e.g. ₹1,250.50). */
export const formatInrCents = (cents: number): string => INR.format(cents / 100);

/** Formats an API amount (string | number) as INR. */
export const formatInr = (value: string | number | null | undefined): string => formatInrCents(toCents(value));

export const sumCents = (values: Array<string | number | null | undefined>): number =>
  values.reduce<number>((sum, v) => sum + toCents(v), 0);

/** Splits `total` paise into `parts` whole-paise shares that add up to exactly `total` (the remainder goes to the last share). */
export const splitCents = (total: number, parts: number): number[] => {
  const n = Math.max(1, Math.floor(parts));
  const base = Math.floor(Math.max(0, total) / n);
  const shares = Array.from({ length: n }, () => base);
  shares[n - 1] = Math.max(0, total) - base * (n - 1);
  return shares;
};
