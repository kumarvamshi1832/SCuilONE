/** E-mail address helpers shared by the compose / log forms. The backend re-validates everything. */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "Jane <jane@x.com>" -> "jane@x.com"; a bare address is returned unchanged. */
export const extractAddress = (raw: string): string => {
  const trimmed = raw.trim();
  const match = trimmed.match(/<([^<>]+)>\s*$/);
  return (match?.[1] ?? trimmed).trim();
};

export const isValidEmailAddress = (raw: string): boolean => {
  const address = extractAddress(raw);
  return address.length <= 255 && EMAIL_RE.test(address);
};

/** Splits a comma / semicolon / new-line separated field into unique, trimmed entries. */
export const parseAddressList = (raw: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const key = extractAddress(part).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(part);
      }
    });
  return out;
};

export const findInvalidAddress = (list: string[]): string | null =>
  list.find((entry) => !isValidEmailAddress(entry)) ?? null;

/** Converts a `datetime-local` value (browser local time) to the naive-UTC string the e-mail log stores. */
export const localInputToNaiveUtc = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19);
};
