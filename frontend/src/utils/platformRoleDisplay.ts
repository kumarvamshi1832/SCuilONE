import { PLATFORM_ROLE_KEYS, normalizeRoleKey } from "./authRouting";

/**
 * Turns a platform role identifier into the label shown in the dashboard welcome heading.
 *
 * Only identifiers that already exist in PLATFORM_ROLE_KEYS are recognised. Anything else resolves
 * to `null` so callers can show a neutral message instead of guessing a role.
 *
 *   PLATFORM_SUPER_ADMIN -> "Super Admin"
 *   PLATFORM_ADMIN       -> "Platform Admin"
 *   SECURITY_ADMINISTRATOR / "Security Administrator" -> "Security Administrator"
 */
export function platformRoleLabel(rawRole: unknown): string | null {
  if (typeof rawRole !== "string") return null;
  const key = normalizeRoleKey(rawRole);
  if (!key || !PLATFORM_ROLE_KEYS.has(key)) return null;
  if (key === "PLATFORM_SUPER_ADMIN") return "Super Admin";
  return key
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/** First candidate (in priority order) that is a recognised platform role. */
export function resolvePlatformRoleLabel(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const label = platformRoleLabel(candidate);
    if (label) return label;
  }
  return null;
}
