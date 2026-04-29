<template>
  <button
    class="inbox-row"
    type="button"
    data-testid="inbox-row"
    @click="$emit('click')"
  >
    <div class="inbox-row__avatar">
      @
    </div>
    <div class="inbox-row__main">
      <div class="inbox-row__top">
        <strong class="inbox-row__nick">@{{ conversation.peer_nickname || '?' }}</strong>
        <span
          v-if="conversation.last_message_at"
          class="inbox-row__time"
        >{{ formattedTime }}</span>
      </div>
      <div class="inbox-row__preview">
        {{ conversation.last_message_preview || '—' }}
      </div>
    </div>
    <span
      v-if="conversation.unread_count > 0"
      class="inbox-row__badge"
      data-testid="inbox-row-unread"
    >{{ conversation.unread_count }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ConversationRow } from '../api';

const props = defineProps<{ conversation: ConversationRow }>();
defineEmits<{ click: [] }>();

const formattedTime = computed(() => {
  if (!props.conversation.last_message_at) return '';
  const sent = new Date(props.conversation.last_message_at);
  const now = new Date();
  const sameDay = sent.toDateString() === now.toDateString();
  return sameDay
    ? sent.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : sent.toLocaleDateString();
});
</script>

<style scoped>
.inbox-row {
  width: 100%;
  display: flex;
  gap: 0.6rem;
  padding: 0.7rem 0.9rem;
  border: 0;
  border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
  background: transparent;
  cursor: pointer;
  text-align: left;
  align-items: center;
}
.inbox-row:hover { background: var(--vbwd-row-hover, rgba(0,0,0,0.03)); }
.inbox-row__avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; flex-shrink: 0;
}
.inbox-row__main { flex: 1; min-width: 0; }
.inbox-row__top { display: flex; justify-content: space-between; gap: 0.5rem; }
.inbox-row__nick { color: var(--vbwd-text, #222); }
.inbox-row__time { font-size: 0.7rem; color: var(--vbwd-text-muted, #6b7280); }
.inbox-row__preview {
  color: var(--vbwd-text-muted, #6b7280);
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inbox-row__badge {
  background: var(--vbwd-color-primary, #3b82f6);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  min-width: 1.2rem;
  text-align: center;
}
</style>
