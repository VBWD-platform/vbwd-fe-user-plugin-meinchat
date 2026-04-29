/**
 * Debounced nickname-prefix search composable.
 *
 * UI use: bind `query` to a text input; the composable refetches 300 ms
 * after the user stops typing. Empty / 1-char queries clear results
 * without hitting the network.
 */
import { ref, watch } from 'vue';
import { type NicknameSearchHit, searchNicknames } from '../api';

const DEFAULT_DEBOUNCE_MS = 300;

export function useNicknameSearch(debounceMs = DEFAULT_DEBOUNCE_MS) {
  const query = ref('');
  const results = ref<NicknameSearchHit[]>([]);
  const loading = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFiredQuery = '';

  watch(query, (value) => {
    if (timer) clearTimeout(timer);
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0) {
      results.value = [];
      return;
    }
    timer = setTimeout(async () => {
      lastFiredQuery = trimmed;
      loading.value = true;
      try {
        const response = await searchNicknames(trimmed);
        // Drop stale results — a slow request could otherwise overwrite
        // the response of a newer query that's already returned.
        if (lastFiredQuery === trimmed) {
          results.value = response.items;
        }
      } finally {
        loading.value = false;
      }
    }, debounceMs);
  });

  return { query, results, loading };
}
