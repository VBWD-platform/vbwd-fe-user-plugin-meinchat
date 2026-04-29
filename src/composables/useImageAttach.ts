/**
 * Client-side image-attach validator + preview helper.
 *
 * `validate()` enforces the same MIME + size limits the backend will,
 * so users see a fast inline error instead of a 413 / 415 round-trip.
 * `makePreview` / `revokePreview` build short-lived object URLs so the
 * composer can render a thumbnail before the file leaves the browser.
 */
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function useImageAttach(options: { maxBytes?: number } = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxMb = Math.round(maxBytes / 1024 / 1024);

  function validate(file: File): ValidationResult {
    if (!ALLOWED_MIME.has(file.type)) {
      return {
        ok: false,
        reason: `Unsupported file type "${file.type || 'unknown'}". Use PNG, JPEG, or WEBP.`,
      };
    }
    if (file.size > maxBytes) {
      return {
        ok: false,
        reason: `File too large — max size is ${maxMb} MB.`,
      };
    }
    return { ok: true };
  }

  function makePreview(file: File): string {
    return URL.createObjectURL(file);
  }

  function revokePreview(url: string): void {
    URL.revokeObjectURL(url);
  }

  return { validate, makePreview, revokePreview, maxBytes };
}
