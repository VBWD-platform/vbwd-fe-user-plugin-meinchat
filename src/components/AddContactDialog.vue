<template>
  <div
    class="dialog-backdrop"
    data-testid="add-contact-dialog"
    @click.self="$emit('cancel')"
  >
    <form
      class="dialog"
      @submit.prevent="onSubmit"
    >
      <h2>{{ $t('meinchat.contacts.add') }}</h2>
      <label>
        {{ $t('meinchat.contacts.nickname') }}
        <input
          v-model="search.query.value"
          type="text"
          autofocus
          data-testid="add-contact-nickname"
        >
      </label>
      <ul
        v-if="search.results.value.length > 0"
        class="dialog__suggestions"
      >
        <li
          v-for="hit in search.results.value"
          :key="hit.user_id"
          @click="selectNickname(hit.nickname)"
        >
          @{{ hit.nickname }}
        </li>
      </ul>
      <label>
        {{ $t('meinchat.contacts.alias') }}
        <input
          v-model="alias"
          type="text"
          maxlength="64"
        >
      </label>
      <label>
        {{ $t('meinchat.contacts.note') }}
        <textarea
          v-model="note"
          maxlength="500"
          rows="2"
        />
      </label>
      <label class="dialog__pin">
        <input
          v-model="pinned"
          type="checkbox"
        >
        {{ $t('meinchat.contacts.pinOnAdd') }}
      </label>
      <p
        v-if="error"
        class="dialog__error"
      >
        {{ error }}
      </p>
      <div class="dialog__actions">
        <button
          type="button"
          @click="$emit('cancel')"
        >
          {{ $t('meinchat.cancel') }}
        </button>
        <button
          type="submit"
          :disabled="!search.query.value.trim() || saving"
        >
          {{ $t('meinchat.contacts.save') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useNicknameSearch } from '../composables/useNicknameSearch';
import { useContactsStore } from '../stores/useContactsStore';

const emit = defineEmits<{
  added: [];
  cancel: [];
}>();

const search = useNicknameSearch();
const alias = ref('');
const note = ref('');
const pinned = ref(false);
const error = ref<string>('');
const saving = ref(false);

const store = useContactsStore();

function selectNickname(nick: string) {
  search.query.value = nick;
  search.results.value = [];
}

async function onSubmit() {
  error.value = '';
  saving.value = true;
  try {
    await store.add({
      nickname: search.query.value.trim().toLowerCase(),
      alias: alias.value || undefined,
      note: note.value || undefined,
      pinned: pinned.value,
    });
    emit('added');
  } catch (err: any) {
    error.value = err?.error || 'Failed to add contact';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.dialog {
  background: var(--vbwd-card-bg, #fff);
  color: var(--vbwd-text, #222);
  padding: 1.4rem;
  border-radius: 10px;
  min-width: 320px; max-width: 92vw;
  display: flex; flex-direction: column; gap: 0.7rem;
}
.dialog h2 { margin: 0 0 0.3rem; }
.dialog label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
.dialog input,
.dialog textarea {
  padding: 0.4rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--vbwd-border, #d1d5db);
  font: inherit;
  background: var(--vbwd-card-bg, #fff);
  color: var(--vbwd-text, #222);
}
.dialog__pin { flex-direction: row; align-items: center; gap: 0.4rem; }
.dialog__suggestions {
  list-style: none; margin: 0; padding: 0;
  border: 1px solid var(--vbwd-border, #d1d5db);
  max-height: 8rem; overflow-y: auto; border-radius: 6px;
}
.dialog__suggestions li { padding: 0.35rem 0.6rem; cursor: pointer; }
.dialog__suggestions li:hover { background: var(--vbwd-row-hover, rgba(0,0,0,0.04)); }
.dialog__error { color: var(--vbwd-color-danger, #e74c3c); margin: 0; font-size: 0.85rem; }
.dialog__actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
.dialog__actions button {
  padding: 0.45rem 0.9rem; border-radius: 6px; border: 0; cursor: pointer; font-weight: 500;
}
.dialog__actions button[type='submit'] {
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
}
.dialog__actions button[type='submit']:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
