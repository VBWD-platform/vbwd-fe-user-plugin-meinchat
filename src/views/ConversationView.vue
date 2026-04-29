<template>
  <div
    class="meinchat-shell"
    data-testid="meinchat-conversation"
  >
    <ConversationHeader
      :peer-nickname="nickname"
      @back="$router.push('/dashboard/messages')"
      @send-tokens="transferOpen = true"
    />
    <div
      ref="messagesArea"
      class="meinchat-messages"
      data-testid="meinchat-messages"
    >
      <p
        v-if="messages.length === 0"
        class="meinchat-empty"
      >
        {{ $t('meinchat.conversation.empty') }}
      </p>
      <MessageBubble
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :mine="message.sender_id === currentUserId"
      />
    </div>

    <p
      v-if="error"
      class="meinchat-error"
    >
      {{ error }}
    </p>

    <MessageComposer
      :disabled="sending"
      @send="onSend"
    />

    <TokenTransferDialog
      v-if="transferOpen"
      :peer-nickname="nickname"
      @sent="onTransferSent"
      @cancel="transferOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, nextTick, ref, watch } from 'vue';
import ConversationHeader from '../components/ConversationHeader.vue';
import MessageBubble from '../components/MessageBubble.vue';
import MessageComposer from '../components/MessageComposer.vue';
import TokenTransferDialog from '../components/TokenTransferDialog.vue';
import { useMeinchatStore } from '../stores/useMeinchatStore';
import { useMessagingStream } from '../composables/useMessagingStream';

const props = defineProps<{ nickname: string }>();
const store = useMeinchatStore();

const conversationId = ref<string | null>(null);
const sending = ref(false);
const transferOpen = ref(false);
const error = ref('');
const messagesArea = ref<HTMLElement | null>(null);
const stream = useMessagingStream();
let unregisterListener: (() => void) | null = null;

const messages = computed(() =>
  conversationId.value ? store.messages(conversationId.value) : [],
);

const currentUserId = computed(() => {
  // Stored at login; consumed here without leaking the auth-store dep
  // back into this plugin's surface.
  return localStorage.getItem('auth_user_id') ?? '';
});

onMounted(async () => {
  const conv = await store.openConversation(props.nickname);
  conversationId.value = conv.id;
  await store.fetchMessages(conv.id);
  await store.markRead(conv.id);

  unregisterListener = stream.onEvent((event) => {
    store.handleStreamEvent(event as any);
    scrollToBottom();
  });
  await stream.connect().catch(() => {
    /* fall through — REST polling is always available; SSE is best-effort */
  });

  scrollToBottom();
});

onUnmounted(() => {
  if (unregisterListener) unregisterListener();
  stream.disconnect();
});

watch(messages, () => scrollToBottom());

async function onSend(payload: { body: string; file: File | null }) {
  if (!conversationId.value) return;
  sending.value = true;
  error.value = '';
  try {
    if (payload.file) {
      await store.sendAttachment(conversationId.value, payload.file, payload.body);
    } else {
      await store.sendText(conversationId.value, payload.body);
    }
  } catch (err: any) {
    error.value = err?.error || 'Failed to send';
  } finally {
    sending.value = false;
  }
}

function onTransferSent() {
  transferOpen.value = false;
  // The system message lands via SSE; no explicit refresh needed.
}

async function scrollToBottom() {
  await nextTick();
  if (messagesArea.value) {
    messagesArea.value.scrollTop = messagesArea.value.scrollHeight;
  }
}
</script>

<style scoped>
.meinchat-shell {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  background: var(--vbwd-card-bg, #fff);
}
.meinchat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
}
.meinchat-empty { color: var(--vbwd-text-muted, #6b7280); align-self: center; }
.meinchat-error {
  color: var(--vbwd-color-danger, #e74c3c);
  background: rgba(231, 76, 60, 0.06);
  margin: 0; padding: 0.4rem 0.8rem;
  border-top: 1px solid rgba(231, 76, 60, 0.2);
  font-size: 0.85rem;
}
</style>
