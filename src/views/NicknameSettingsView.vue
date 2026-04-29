<template>
  <div
    class="meinchat-settings"
    data-testid="meinchat-nickname-settings"
  >
    <h2>{{ $t('meinchat.nickname.title') }}</h2>
    <p class="meinchat-settings__hint">
      {{ $t('meinchat.nickname.hint') }}
    </p>
    <form @submit.prevent="onSubmit">
      <label>
        {{ $t('meinchat.nickname.label') }}
        <div class="meinchat-settings__inputrow">
          <span class="meinchat-settings__at">@</span>
          <input
            v-model="draft"
            type="text"
            minlength="3"
            maxlength="32"
            required
            autocomplete="off"
            data-testid="nickname-input"
          >
          <NicknameAvailabilityIndicator
            :nickname="draft"
            :current-nickname="store.nickname ?? ''"
          />
        </div>
      </label>
      <p
        v-if="error"
        class="meinchat-settings__error"
      >
        {{ error }}
      </p>
      <p
        v-if="success"
        class="meinchat-settings__success"
      >
        {{ success }}
      </p>
      <button
        type="submit"
        :disabled="!isDirty || saving"
        data-testid="nickname-save"
      >
        {{ $t('meinchat.nickname.save') }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import NicknameAvailabilityIndicator from '../components/NicknameAvailabilityIndicator.vue';
import { useNicknameStore } from '../stores/useNicknameStore';

const store = useNicknameStore();
const draft = ref('');
const error = ref('');
const success = ref('');
const saving = ref(false);

const isDirty = computed(() => draft.value !== (store.nickname ?? ''));

onMounted(async () => {
  await store.fetchMine();
  draft.value = store.nickname ?? '';
});

async function onSubmit() {
  error.value = '';
  success.value = '';
  saving.value = true;
  try {
    await store.update(draft.value.trim().toLowerCase());
    success.value = 'Saved';
  } catch (err: any) {
    error.value = err?.error || 'Failed to save';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.meinchat-settings {
  max-width: 560px;
  margin: 0 auto;
  padding: 2rem 1rem;
  color: var(--vbwd-text, #222);
}
.meinchat-settings__hint { color: var(--vbwd-text-muted, #6b7280); }
.meinchat-settings__inputrow {
  display: flex; align-items: center; gap: 0.4rem;
  border: 1px solid var(--vbwd-border, #d1d5db);
  border-radius: 6px; padding: 0.4rem 0.6rem;
  background: var(--vbwd-card-bg, #fff);
}
.meinchat-settings__at { color: var(--vbwd-text-muted, #6b7280); }
.meinchat-settings__inputrow input {
  flex: 1; border: 0; outline: none; font: inherit;
  background: transparent; color: inherit;
}
.meinchat-settings__error { color: var(--vbwd-color-danger, #e74c3c); }
.meinchat-settings__success { color: var(--vbwd-color-success, #16a34a); }
button {
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
  border: 0; padding: 0.5rem 1.1rem; border-radius: 6px; cursor: pointer; font-size: 0.95rem;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
