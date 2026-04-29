<template>
  <div
    v-if="message.system_kind === 'token_transfer'"
    class="bubble bubble--system"
    data-testid="message-bubble"
  >
    <span class="bubble__icon">💰</span>
    {{ systemTokenTransferText }}
    <span
      v-if="message.sent_at"
      class="bubble__time"
    >{{ formattedTime }}</span>
  </div>
  <div
    v-else
    :class="['bubble', mine ? 'bubble--mine' : 'bubble--theirs']"
    data-testid="message-bubble"
  >
    <div
      v-if="message.attachment_url"
      class="bubble__image"
    >
      <img
        :src="message.attachment_url"
        :alt="`Image from @${message.sender_nickname}`"
      >
    </div>
    <div
      v-if="message.body"
      class="bubble__body"
    >
      <SafeLinkify :text="message.body" />
    </div>
    <div class="bubble__meta">
      <span
        v-if="message.sent_at"
        class="bubble__time"
      >{{ formattedTime }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SafeLinkify from './SafeLinkify.vue';
import type { MessageRow } from '../api';

const props = defineProps<{
  message: MessageRow;
  mine: boolean;
}>();

const formattedTime = computed(() => {
  if (!props.message.sent_at) return '';
  return new Date(props.message.sent_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
});

const systemTokenTransferText = computed(() => {
  if (props.message.system_kind !== 'token_transfer') return '';
  try {
    const payload = JSON.parse(props.message.body) as {
      amount: number;
      from_nickname: string;
      to_nickname: string;
      note?: string | null;
    };
    const note = payload.note ? ` — ${payload.note}` : '';
    return `@${payload.from_nickname} sent ${payload.amount} tokens to @${payload.to_nickname}${note}`;
  } catch {
    return props.message.body;
  }
});
</script>

<style scoped>
.bubble {
  max-width: 70%;
  padding: 0.55rem 0.85rem;
  margin-bottom: 0.5rem;
  border-radius: 14px;
  background: var(--vbwd-card-bg, #fff);
  color: var(--vbwd-text, #222);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
  word-wrap: break-word;
}
.bubble--mine {
  align-self: flex-end;
  background: var(--vbwd-color-primary, #3b82f6);
  color: #fff;
}
.bubble--theirs {
  align-self: flex-start;
}
.bubble--system {
  align-self: center;
  background: var(--vbwd-card-bg-soft, #f3f4f6);
  color: var(--vbwd-text-muted, #555);
  font-size: 0.85rem;
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
}
.bubble__icon { margin-right: 0.4rem; }
.bubble__image img {
  display: block;
  max-width: 100%;
  border-radius: 8px;
  margin-bottom: 0.4rem;
}
.bubble__meta {
  display: flex;
  justify-content: flex-end;
  font-size: 0.7rem;
  opacity: 0.65;
  margin-top: 0.2rem;
}
.bubble__time { white-space: nowrap; }
</style>
