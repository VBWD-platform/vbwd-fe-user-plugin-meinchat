<template>
  <div
    class="dialog-backdrop"
    data-testid="find-user-dialog"
    @click.self="$emit('cancel')"
  >
    <div class="dialog">
      <h2>{{ $t('meinchat.find.title') }}</h2>
      <input
        v-model="search.query.value"
        type="text"
        autofocus
        :placeholder="$t('meinchat.find.placeholder')"
        data-testid="find-user-input"
      >
      <ul
        v-if="search.results.value.length > 0"
        class="dialog__suggestions"
      >
        <li
          v-for="hit in search.results.value"
          :key="hit.user_id"
          class="dialog__row"
        >
          <span>@{{ hit.nickname }}</span>
          <span class="dialog__row-actions">
            <button
              type="button"
              data-testid="find-user-start-chat"
              @click="$emit('start-chat', hit.nickname)"
            >
              {{ $t('meinchat.find.startChat') }}
            </button>
            <button
              type="button"
              data-testid="find-user-save-contact"
              @click="$emit('save-contact', hit.nickname)"
            >
              {{ $t('meinchat.find.saveContact') }}
            </button>
          </span>
        </li>
      </ul>
      <p
        v-else-if="search.query.value && !search.loading.value"
        class="dialog__empty"
      >
        {{ $t('meinchat.find.noResults') }}
      </p>
      <div class="dialog__actions">
        <button
          type="button"
          @click="$emit('cancel')"
        >
          {{ $t('meinchat.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNicknameSearch } from '../composables/useNicknameSearch';

const search = useNicknameSearch();

defineEmits<{
  'start-chat': [nickname: string];
  'save-contact': [nickname: string];
  cancel: [];
}>();
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
  min-width: 360px; max-width: 92vw;
  display: flex; flex-direction: column; gap: 0.7rem;
}
.dialog h2 { margin: 0 0 0.3rem; }
.dialog input {
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--vbwd-border, #d1d5db);
  font: inherit;
  background: var(--vbwd-card-bg, #fff);
  color: var(--vbwd-text, #222);
}
.dialog__suggestions { list-style: none; margin: 0; padding: 0; }
.dialog__row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
}
.dialog__row-actions { display: flex; gap: 0.4rem; }
.dialog__row-actions button {
  font-size: 0.78rem; padding: 0.3rem 0.6rem;
  border-radius: 6px; border: 0; cursor: pointer;
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
}
.dialog__empty { color: var(--vbwd-text-muted, #6b7280); margin: 0; }
.dialog__actions { display: flex; justify-content: flex-end; }
.dialog__actions button {
  padding: 0.45rem 0.9rem; border-radius: 6px; border: 0; cursor: pointer;
}
</style>
