/**
 * Reads the operator-tunable messaging retention/size knobs from
 * ``GET /api/v1/messaging/limits`` and exposes them to the UI.
 *
 * The values change rarely (an operator restarts the api when they tune
 * them), so we cache the result in a MODULE-SCOPE ``ref`` shared across
 * every consumer and only re-fetch when the cache is stale (older than
 * 24 h) or when the caller forces a refresh. On a failed fetch we keep
 * the previously cached value intact and surface the error separately —
 * a transient network blip must not blank out good retention copy.
 */
import { ref } from 'vue';
import { type MessagingLimits, getMessagingLimits } from '../api';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Module-scope cache shared by all consumers of the composable.
const data = ref<MessagingLimits | null>(null);
const loading = ref(false);
const error = ref<unknown>(null);
let lastFetchedAt = 0;

async function fetchAndCache(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const limits = await getMessagingLimits();
    data.value = limits;
    lastFetchedAt = Date.now();
  } catch (caughtError) {
    // Preserve the previous good value; just expose the error.
    error.value = caughtError;
  } finally {
    loading.value = false;
  }
}

function isStale(): boolean {
  return data.value === null || Date.now() - lastFetchedAt >= CACHE_TTL_MS;
}

export function useMessagingLimits() {
  /**
   * Fetch the limits, honouring the 24 h cache. Pass ``force = true`` to
   * always re-fetch regardless of cache age.
   */
  async function refresh(force = false): Promise<void> {
    if (!force && !isStale()) return;
    await fetchAndCache();
  }

  return { data, loading, error, refresh };
}

/** Test helper — clears the module-scope cache between specs. */
export function _resetMessagingLimits(): void {
  data.value = null;
  loading.value = false;
  error.value = null;
  lastFetchedAt = 0;
}
