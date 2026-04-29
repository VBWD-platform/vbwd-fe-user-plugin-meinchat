<template>
  <span
    v-if="display"
    :class="['indicator', `indicator--${state}`]"
    data-testid="nickname-availability"
  >
    <span class="indicator__dot" />
    {{ display }}
  </span>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { searchNicknames } from '../api';

const props = defineProps<{
  /** The nickname being typed in the input. */
  nickname: string;
  /** The user's currently saved nickname — passed in to avoid flagging
   * "taken" when the user is just re-typing their own slug. */
  currentNickname?: string;
}>();

type State = 'idle' | 'checking' | 'available' | 'taken';

const state = ref<State>('idle');
const display = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.nickname,
  (raw) => {
    const candidate = (raw || '').trim().toLowerCase();
    state.value = 'idle';
    display.value = '';

    // Re-typing your own slug isn't taken — return early.
    if (candidate === (props.currentNickname || '').toLowerCase()) return;
    if (candidate.length < 3) return;

    state.value = 'checking';
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const result = await searchNicknames(candidate);
        // Search excludes the caller server-side. An exact-string match
        // therefore means *another* user owns it.
        const taken = result.items.some((hit) => hit.nickname === candidate);
        if (props.nickname.trim().toLowerCase() !== candidate) return; // stale
        state.value = taken ? 'taken' : 'available';
        display.value = taken ? 'Taken' : 'Available';
      } catch {
        state.value = 'idle';
        display.value = '';
      }
    }, 300);
  },
  { immediate: true },
);
</script>

<style scoped>
.indicator {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
  font-size: 0.8rem;
  color: var(--vbwd-text-muted, #6b7280);
}
.indicator--available { color: var(--vbwd-color-success, #16a34a); }
.indicator--taken { color: var(--vbwd-color-danger, #e74c3c); }
.indicator__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
}
</style>
