<template>
  <div
    ref="shellEl"
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
        @select-choice="onSelectChoice"
        @send-command="onSendCommand"
      />
    </div>

    <p
      v-if="error"
      class="meinchat-error"
    >
      {{ error }}
    </p>

    <!-- S28.3b — plugin overlay (e.g. meinchat-plus secure-chat pairing gate). -->
    <component
      :is="overlayComponent"
      v-if="overlayComponent && conversation"
      :conversation="conversation"
    />

    <p
      v-if="composerHint"
      class="meinchat-secure-hint"
      data-testid="composer-hint"
    >
      {{ composerHint }}
    </p>

    <MessageComposer
      :disabled="sending || composerBlocked"
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
import { applyBotConversationStyle } from '../composables/useBotConversationStyle';
import type { BotChoice, ConversationRow } from '../api';
import {
  getComposerPrecheck,
  getConversationOverlay,
} from '../ui/conversationExtensions';

const props = defineProps<{ nickname: string }>();
const store = useMeinchatStore();

const conversationId = ref<string | null>(null);
const conversation = ref<ConversationRow | null>(null);
const sending = ref(false);
const transferOpen = ref(false);
const error = ref('');

// S28.3b — optional plugin overlay (e.g. meinchat-plus secure-chat gate) +
// composer precheck. Both null when no plugin registered (meinchat-alone).
const overlayComponent = getConversationOverlay();
const composerBlocked = ref(false);
const composerHint = ref('');
const messagesArea = ref<HTMLElement | null>(null);
const shellEl = ref<HTMLElement | null>(null);
const stream = useMessagingStream();
let unregisterListener: (() => void) | null = null;

const messages = computed(() =>
  conversationId.value ? store.messages(conversationId.value) : [],
);

const currentUserId = computed(() => {
  // Stored at login (Login.vue / EmailBlock.vue both call
  // ``localStorage.setItem('user_id', response.user_id)``); consumed
  // here without leaking the auth-store dep back into this plugin's
  // surface.
  //
  // Was previously reading ``auth_user_id`` (a key that's never set) →
  // every bubble fell into the ``mine === false`` branch and every
  // message rendered on the left. Use the canonical ``user_id`` key.
  return localStorage.getItem('user_id') ?? '';
});

onMounted(async () => {
  // S70.4 — theme the bot chat from the active portable style, applying its
  // tokens as `--vbwd-botchat-*` vars on this conversation root. Best-effort:
  // a missing/failed fetch leaves the bubble CSS fallbacks in place.
  if (shellEl.value) {
    void applyBotConversationStyle(shellEl.value);
  }

  // openConversation now owns the message load: cache-first paint, then a
  // server-window fetch merged by id (S28.2 §2.3). No separate
  // fetchMessages call here — that would replace the merged view with a
  // server-only window and drop the cached rows.
  const conv = await store.openConversation(props.nickname);
  conversationId.value = conv.id;
  conversation.value = conv;
  await store.markRead(conv.id);

  // Plugin composer precheck (e.g. peer has no secure-chat device) — disables
  // Send + surfaces a hint. No-op when no plugin registered.
  const precheck = getComposerPrecheck();
  if (precheck) {
    try {
      const result = await precheck(conv);
      composerBlocked.value = !result.canSend;
      composerHint.value = result.hint ?? '';
    } catch {
      /* precheck is best-effort — never block on its failure */
    }
  }

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

// S70.1 — tapping a bot-choice card sends the action through the normal send
// path (no typing required); the bot replies in the same conversation.
async function onSelectChoice(choice: BotChoice) {
  if (!conversationId.value || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    await store.sendAction(conversationId.value, choice);
  } catch (err: any) {
    error.value = err?.error || 'Failed to send';
  } finally {
    sending.value = false;
  }
}

// S70.4 — tapping a bot_menu row or the cart's checkout affordance sends the
// command as a normal message body (the bot then runs it), reusing the same
// send path as typed input (DRY — no parallel transport).
async function onSendCommand(command: string) {
  if (!conversationId.value || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    await store.sendText(conversationId.value, command);
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
