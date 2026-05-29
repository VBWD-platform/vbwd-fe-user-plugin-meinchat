/**
 * Single source of truth for the client-side retention window (S28.2 §2.4,
 * DRY corner of §6). Both the eviction sweep and the settings UI answer the
 * same question through here:
 *
 *   current eviction TTL (days) = min(user_setting, server_suggested)
 *
 * "Shorten-only, best-effort" — a well-behaved client never keeps messages
 * longer than the server suggests; it MAY keep them shorter if the user
 * picked a smaller number. This is a UX default, not a security control.
 */
export const CLIENT_RETENTION_STORAGE_KEY = 'meinchat.client_retention_days';
export const MILLIS_PER_DAY = 86_400_000;

/** Reads the user's chosen retention from localStorage, or null if unset. */
export function readUserRetentionDays(): number | null {
  const raw = localStorage.getItem(CLIENT_RETENTION_STORAGE_KEY);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Resolves the effective retention in days: the user's setting clamped to
 * the server-suggested maximum, or the server-suggested value when the user
 * has not chosen one.
 */
export function resolveRetentionDays(serverSuggestedDays: number): number {
  const userDays = readUserRetentionDays();
  if (userDays === null) return serverSuggestedDays;
  return Math.max(0, Math.min(userDays, serverSuggestedDays));
}
