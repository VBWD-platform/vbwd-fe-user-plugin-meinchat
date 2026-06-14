<template>
  <div
    class="dialog-backdrop"
    data-testid="create-room-dialog"
    @click.self="$emit('cancel')"
  >
    <div class="dialog">
      <h2>{{ $t('meinchat.rooms.create') }}</h2>

      <input
        v-model="name"
        type="text"
        :placeholder="$t('meinchat.rooms.namePlaceholder')"
        data-testid="create-room-name"
      >

      <div
        v-if="selected.length > 0"
        class="dialog__chips"
      >
        <span
          v-for="member in selected"
          :key="member.user_id"
          class="dialog__chip"
          data-testid="create-room-chip"
        >
          @{{ member.nickname }}
          <button
            type="button"
            class="dialog__chip-x"
            @click="remove(member.user_id)"
          >
            ✕
          </button>
        </span>
      </div>

      <input
        v-model="search.query.value"
        type="text"
        :placeholder="$t('meinchat.find.placeholder')"
        data-testid="create-room-search"
      >
      <ul
        v-if="candidates.length > 0"
        class="dialog__suggestions"
      >
        <li
          v-for="hit in candidates"
          :key="hit.user_id"
          class="dialog__row"
        >
          <span>@{{ hit.nickname }}</span>
          <button
            type="button"
            data-testid="create-room-add"
            @click="add(hit)"
          >
            {{ $t('meinchat.rooms.add') }}
          </button>
        </li>
      </ul>

      <div class="dialog__actions">
        <button
          type="button"
          data-testid="create-room-cancel"
          @click="$emit('cancel')"
        >
          {{ $t('meinchat.cancel') }}
        </button>
        <button
          type="button"
          data-testid="create-room-submit"
          :disabled="selected.length === 0"
          @click="onSubmit"
        >
          {{ $t('meinchat.rooms.create') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { NicknameSearchHit } from '../api';
import { useNicknameSearch } from '../composables/useNicknameSearch';

const emit = defineEmits<{
  create: [{ member_nicknames: string[]; name?: string }];
  cancel: [];
}>();

const search = useNicknameSearch();
const name = ref('');
const selected = ref<NicknameSearchHit[]>([]);

// Drop already-picked nicknames from the suggestion list so a member can't be
// added twice (the backend de-dups too, but this keeps the UI honest).
const candidates = computed(() =>
  search.results.value.filter(
    (hit) => !selected.value.some((picked) => picked.user_id === hit.user_id),
  ),
);

function add(hit: NicknameSearchHit) {
  if (selected.value.some((picked) => picked.user_id === hit.user_id)) return;
  selected.value = [...selected.value, hit];
}

function remove(userId: string) {
  selected.value = selected.value.filter((picked) => picked.user_id !== userId);
}

function onSubmit() {
  if (selected.value.length === 0) return;
  const trimmedName = name.value.trim();
  emit('create', {
    member_nicknames: selected.value.map((member) => member.nickname),
    ...(trimmedName ? { name: trimmedName } : {}),
  });
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
  padding: 1.4rem; border-radius: 10px;
  min-width: 360px; max-width: 92vw;
  display: flex; flex-direction: column; gap: 0.7rem;
}
.dialog h2 { margin: 0 0 0.3rem; }
.dialog input {
  padding: 0.45rem 0.6rem; border-radius: 6px;
  border: 1px solid var(--vbwd-border, #d1d5db);
  font: inherit;
  background: var(--vbwd-card-bg, #fff); color: var(--vbwd-text, #222);
}
.dialog__chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.dialog__chip {
  display: inline-flex; align-items: center; gap: 0.25rem;
  background: var(--vbwd-card-bg-soft, #f3f4f6);
  border-radius: 999px; padding: 0.15rem 0.5rem; font-size: 0.8rem;
}
.dialog__chip-x {
  border: 0; background: transparent; cursor: pointer;
  color: var(--vbwd-color-danger, #e74c3c); font-size: 0.7rem;
}
.dialog__suggestions { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; }
.dialog__row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
}
.dialog__row button {
  font-size: 0.78rem; padding: 0.3rem 0.6rem;
  border-radius: 6px; border: 0; cursor: pointer;
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
}
.dialog__actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
.dialog__actions button {
  padding: 0.45rem 0.9rem; border-radius: 6px; border: 0; cursor: pointer;
}
.dialog__actions button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
