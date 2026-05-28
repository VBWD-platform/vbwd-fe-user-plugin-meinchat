<template>
  <section
    class="profile-nickname"
    data-testid="profile-nickname-section"
  >
    <header class="profile-nickname__header">
      <h2>{{ $t('meinchat.nickname.title') }}</h2>
    </header>
    <p class="profile-nickname__hint">
      {{ $t('meinchat.nickname.hint') }}
    </p>
    <form
      class="profile-nickname__form"
      @submit.prevent="onSubmit"
    >
      <label
        class="profile-nickname__label"
        for="profile-nickname-input"
      >{{ $t('meinchat.nickname.label') }}</label>
      <div class="profile-nickname__inputrow">
        <span class="profile-nickname__at">@</span>
        <input
          id="profile-nickname-input"
          v-model="draft"
          type="text"
          minlength="3"
          maxlength="32"
          required
          autocomplete="off"
          data-testid="profile-nickname-input"
        >
        <NicknameAvailabilityIndicator
          :nickname="draft"
          :current-nickname="store.nickname ?? ''"
        />
      </div>
      <p
        v-if="error"
        class="profile-nickname__error"
        data-testid="profile-nickname-error"
      >
        {{ error }}
      </p>
      <p
        v-if="success"
        class="profile-nickname__success"
        data-testid="profile-nickname-success"
      >
        {{ success }}
      </p>
      <button
        type="submit"
        class="btn primary profile-nickname__save"
        :disabled="!isDirty || saving"
        data-testid="profile-nickname-save"
      >
        {{ saving ? $t('common.saving') : $t('meinchat.nickname.save') }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
/**
 * Compact "choose a nickname" block injected by the meinchat plugin into
 * the fe-user Profile page (mirror of ``ProfileNicknameSection.swift`` in
 * the iOS app). For richer flow / history / collisions handling, the
 * "Advanced" link leads to the full ``NicknameSettingsView``.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import NicknameAvailabilityIndicator from './NicknameAvailabilityIndicator.vue';
import { useNicknameStore } from '../stores/useNicknameStore';

const { t } = useI18n();
const store = useNicknameStore();
const draft = ref('');
const error = ref('');
const success = ref('');
const saving = ref(false);

const isDirty = computed(() => draft.value !== (store.nickname ?? ''));

onMounted(async () => {
  try {
    await store.fetchMine();
  } catch {
    // Not having a nickname yet is the expected default — surface no
    // error, just leave the input empty so the user can pick one.
  }
  draft.value = store.nickname ?? '';
});

async function onSubmit() {
  error.value = '';
  success.value = '';
  saving.value = true;
  try {
    await store.update(draft.value.trim().toLowerCase());
    success.value = t('meinchat.nickname.savedToast');
  } catch (err) {
    const apiErr = err as { error?: string; message?: string } | undefined;
    error.value = apiErr?.error || apiErr?.message || t('meinchat.nickname.saveFailed');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.profile-nickname__header h2 {
  margin: 0;
}
.profile-nickname__hint {
  color: #666;
  font-size: 0.9rem;
  margin: 0.5rem 0 1rem;
}
.profile-nickname__form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.profile-nickname__label {
  font-size: 0.9rem;
  color: #2c3e50;
  font-weight: 500;
}
.profile-nickname__inputrow {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.profile-nickname__at {
  color: #666;
  font-weight: 500;
}
.profile-nickname__inputrow input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
}
.profile-nickname__inputrow input:focus {
  outline: none;
  border-color: var(--vbwd-color-primary, #2563eb);
}
.profile-nickname__error {
  color: #b91c1c;
  font-size: 0.9rem;
  margin: 0;
}
.profile-nickname__success {
  color: #15803d;
  font-size: 0.9rem;
  margin: 0;
}
.profile-nickname__save {
  align-self: flex-start;
  margin-top: 0.25rem;
}
</style>
