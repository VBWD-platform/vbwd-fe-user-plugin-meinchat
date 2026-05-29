<template>
  <section
    v-if="data"
    class="meinchat-retention"
    data-testid="meinchat-retention-section"
  >
    <header class="meinchat-retention__header">
      <h2>{{ $t('meinchat.retention.title') }}</h2>
    </header>
    <p
      class="meinchat-retention__body"
      data-testid="meinchat-retention-text"
    >
      {{ $t('meinchat.retention.body', { deviceDays, serverDays }) }}
    </p>

    <label class="meinchat-retention__control">
      <span>{{ $t('meinchat.retention.keep_label', { max: deviceDays }) }}</span>
      <input
        v-model.number="clientRetentionDays"
        type="number"
        :min="0"
        :max="deviceDays"
        step="1"
        data-testid="meinchat-client-retention-input"
        @input="onRetentionInput"
      >
    </label>
  </section>
</template>

<script setup lang="ts">
/**
 * Profile card injected by the meinchat plugin that tells the user how
 * long their chats live — on this device and on the server. Both numbers
 * come straight from ``useMessagingLimits`` (the operator-tunable
 * ``/messaging/limits`` knobs); nothing is hard-coded here.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useMessagingLimits } from '../composables/useMessagingLimits';
import {
  CLIENT_RETENTION_STORAGE_KEY,
  readUserRetentionDays,
} from '../composables/clientRetention';

const { data, refresh } = useMessagingLimits();

const deviceDays = computed(
  () => data.value?.messages_retention_days_client_suggested ?? 0,
);
const serverDays = computed(
  () => data.value?.messages_retention_days_server ?? 0,
);

// Shorten-only client retention (best-effort UX default — S28.2 §2.4).
// Persisted under ``meinchat.client_retention_days``; the eviction sweep
// reads the same key via the shared resolver.
const clientRetentionDays = ref<number>(readUserRetentionDays() ?? 0);

function persist(days: number): void {
  localStorage.setItem(CLIENT_RETENTION_STORAGE_KEY, String(days));
}

/**
 * Clamp to ``[0, server_suggested]`` on every edit. HTML5 ``max`` blocks
 * the spinner arrows, but a typed/pasted value can still exceed it — so we
 * clamp the v-model explicitly and write the clamped value back.
 */
function onRetentionInput(): void {
  // The cache's "server-suggested" ceiling is the client-suggested value
  // (``deviceDays``) — the operator's recommended on-device window.
  const max = deviceDays.value;
  let next = clientRetentionDays.value;
  if (!Number.isFinite(next) || next < 0) next = 0;
  if (max > 0 && next > max) next = max;
  clientRetentionDays.value = next;
  persist(next);
}

// When the server-suggested max arrives (or shrinks), re-clamp the stored
// value so it never exceeds the recommended window.
watch(deviceDays, (max) => {
  if (max > 0 && clientRetentionDays.value > max) {
    clientRetentionDays.value = max;
    persist(max);
  }
});

onMounted(() => {
  // Best-effort: a failed fetch leaves the section hidden (data === null)
  // rather than rendering a misleading retention window.
  void refresh();
});
</script>

<style scoped>
.meinchat-retention__header h2 {
  margin: 0;
}
.meinchat-retention__body {
  color: #666;
  font-size: 0.9rem;
  margin: 0.5rem 0 0;
}
</style>
