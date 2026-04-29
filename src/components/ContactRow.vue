<template>
  <div
    class="contact-row"
    data-testid="contact-row"
  >
    <div
      class="contact-row__main"
      @click="$emit('open')"
    >
      <div class="contact-row__avatar">
        @
      </div>
      <div class="contact-row__text">
        <div class="contact-row__top">
          <strong>@{{ contact.peer_nickname || '?' }}</strong>
          <span
            v-if="contact.alias"
            class="contact-row__alias"
          >({{ contact.alias }})</span>
        </div>
        <div
          v-if="contact.note"
          class="contact-row__note"
        >
          {{ contact.note }}
        </div>
      </div>
    </div>
    <div class="contact-row__actions">
      <button
        type="button"
        :title="contact.pinned ? $t('meinchat.contacts.unpin') : $t('meinchat.contacts.pin')"
        data-testid="contact-pin"
        @click="$emit('toggle-pin')"
      >
        {{ contact.pinned ? '📌' : '📍' }}
      </button>
      <button
        type="button"
        data-testid="contact-remove"
        :title="$t('meinchat.contacts.remove')"
        @click="$emit('remove')"
      >
        🗑
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ContactRow } from '../api';

defineProps<{ contact: ContactRow }>();
defineEmits<{
  open: [];
  'toggle-pin': [];
  remove: [];
}>();
</script>

<style scoped>
.contact-row {
  display: flex;
  align-items: center;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
}
.contact-row__main { flex: 1; display: flex; gap: 0.6rem; cursor: pointer; }
.contact-row__avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700;
}
.contact-row__top { display: flex; gap: 0.4rem; align-items: baseline; }
.contact-row__alias {
  color: var(--vbwd-text-muted, #6b7280);
  font-size: 0.85rem;
}
.contact-row__note { font-size: 0.8rem; color: var(--vbwd-text-muted, #6b7280); }
.contact-row__actions { display: flex; gap: 0.3rem; }
.contact-row__actions button {
  background: transparent; border: 0; cursor: pointer; font-size: 1rem;
}
</style>
