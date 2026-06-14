/**
 * S86.3 D12 — first-level guest-session persistence for the bot widget.
 *
 * The public bot-widget has no logged-in session, so a provisioned GUEST is
 * identified solely by the short JWT the backend mints on `widget/start`. We
 * persist that token in BOTH a long-lived cookie AND `localStorage`, keyed by
 * the widget slug, so a refresh / return presents the same token to
 * `widget/start` — the backend then reuses the same GUEST + token balance
 * instead of provisioning a fresh one (which keeps D11's initial-token grant
 * idempotent against simple reloads).
 *
 * This is acknowledged best-effort overuse protection (cookies/localStorage are
 * clearable); a real device/browser-independent fingerprint is deferred (D12).
 */

const KEY_PREFIX = 'meinchat_guest_token__';
// ~180 days — "long-lived" so a returning visitor keeps the same guest.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function storageKey(widgetSlug: string): string {
  return `${KEY_PREFIX}${widgetSlug}`;
}

function readCookie(name: string): string | null {
  const entries = document.cookie ? document.cookie.split(';') : [];
  for (const entry of entries) {
    const [rawName, ...rawValue] = entry.split('=');
    if (rawName.trim() === name) {
      const value = decodeURIComponent(rawValue.join('=').trim());
      // A cleared cookie may linger with an empty value (e.g. happy-dom under
      // max-age=0) — treat empty as absent.
      return value || null;
    }
  }
  return null;
}

export function loadGuestToken(widgetSlug: string): string | null {
  const key = storageKey(widgetSlug);
  // localStorage is the primary store; the cookie is the fallback for the case
  // where localStorage was cleared but the cookie survived (or vice versa).
  const fromLocalStorage = readLocalStorage(key);
  if (fromLocalStorage) return fromLocalStorage;
  return readCookie(key);
}

export function persistGuestToken(widgetSlug: string, token: string): void {
  const key = storageKey(widgetSlug);
  writeLocalStorage(key, token);
  document.cookie =
    `${key}=${encodeURIComponent(token)};max-age=${COOKIE_MAX_AGE_SECONDS};path=/;samesite=lax`;
}

export function clearGuestToken(widgetSlug: string): void {
  const key = storageKey(widgetSlug);
  removeLocalStorage(key);
  document.cookie = `${key}=;max-age=0;path=/;samesite=lax`;
}

// localStorage may be unavailable (SSR, locked-down contexts); a failure must
// never break the widget — it falls back to cookie-only persistence.
function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Cookie persistence still applies.
  }
}

function removeLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Cookie clear still applies.
  }
}
