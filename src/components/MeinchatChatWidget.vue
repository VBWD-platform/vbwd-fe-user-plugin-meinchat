<template>
  <!-- Dock collapsed: just a launcher button bottom-right (S86.3 D8). -->
  <button
    v-if="isDockCollapsed"
    type="button"
    class="meinchat-widget-dock-launcher"
    data-testid="meinchat-widget-dock-toggle"
    @click="dockOpen = true"
  >
    {{ resolvedTitle }}
  </button>

  <div
    v-else
    ref="widgetRoot"
    class="meinchat-widget"
    :class="`meinchat-widget--${display}`"
    data-testid="meinchat-chat-widget"
  >
    <header class="meinchat-widget__head">
      <strong>{{ resolvedTitle }}</strong>
      <button
        v-if="display === 'dock'"
        type="button"
        class="meinchat-widget__dock-close"
        data-testid="meinchat-widget-dock-toggle"
        :aria-label="$t('meinchat.cancel')"
        @click="dockOpen = false"
      >
        ✕
      </button>
    </header>

    <!-- Permission gate (D4): logged_in widget + not authenticated. -->
    <div
      v-if="needsLogin"
      class="meinchat-widget__cta"
      data-testid="meinchat-widget-login-cta"
    >
      <p>{{ $t('meinchat.widget.loginRequired') }}</p>
      <a
        class="meinchat-widget__cta-link"
        href="/login"
        data-testid="meinchat-widget-login-link"
      >{{ $t('meinchat.widget.loginCta') }}</a>
    </div>

    <!-- Nickname step (D5): logged-in user without a nickname. -->
    <div
      v-else-if="needsNickname && !started"
      class="meinchat-widget__prompt"
      data-testid="meinchat-widget-nickname-form"
    >
      <label>{{ $t('meinchat.widget.chooseNickname') }}</label>
      <input
        v-model="nicknameDraft"
        type="text"
        data-testid="meinchat-widget-nickname-input"
        :placeholder="$t('meinchat.widget.nicknamePlaceholder')"
        @keyup.enter="onSaveNickname"
      >
      <button
        type="button"
        data-testid="meinchat-widget-nickname-save"
        :disabled="!nicknameDraft.trim() || busy"
        @click="onSaveNickname"
      >
        {{ $t('meinchat.widget.saveNickname') }}
      </button>
    </div>

    <!-- Pre-start step: name prompt (public) + Start button. -->
    <div
      v-else-if="!started"
      class="meinchat-widget__prompt"
      data-testid="meinchat-widget-start-form"
    >
      <template v-if="visibility === 'public'">
        <label>{{ $t('meinchat.widget.enterName') }}</label>
        <input
          v-model="displayNameDraft"
          type="text"
          data-testid="meinchat-widget-name-input"
          :placeholder="$t('meinchat.widget.namePlaceholder')"
          @keyup.enter="onStart"
        >
      </template>
      <button
        type="button"
        class="meinchat-widget__start"
        data-testid="meinchat-widget-start"
        :disabled="!canStart || busy"
        @click="onStart"
      >
        {{ resolvedStartLabel }}
      </button>
    </div>

    <!-- Chat pane (after start). -->
    <div
      v-else
      class="meinchat-widget__room"
      data-testid="meinchat-widget-room"
    >
      <div
        v-if="tokenBalance !== null"
        class="meinchat-widget__balance"
        data-testid="meinchat-widget-balance"
      >
        {{ $t('meinchat.widget.balance') }}: {{ tokenBalance }}
      </div>

      <div
        ref="messagesArea"
        class="meinchat-widget__messages"
        data-testid="meinchat-widget-messages"
      >
        <MessageBubble
          v-if="messages.length === 0 && resolvedWelcome"
          :message="welcomeBubble"
          :mine="false"
        />
        <MessageBubble
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :mine="message.sender_id === 'me'"
        />
      </div>

      <p
        v-if="error"
        class="meinchat-widget__error"
        data-testid="meinchat-widget-error"
      >
        {{ error }}
      </p>

      <!-- Buy-tokens block (D11) — shown when a send returned insufficient_tokens. -->
      <div
        v-if="needsTokens"
        class="meinchat-widget__buy"
        data-testid="meinchat-widget-buy-tokens"
      >
        <p>{{ $t('meinchat.widget.outOfTokens') }}</p>
        <a
          class="meinchat-widget__buy-link"
          :href="buyTokensHref"
        >{{ $t('meinchat.widget.buyTokens') }}</a>
      </div>

      <MessageComposer
        :disabled="sending"
        @send="onSend"
      />
    </div>

    <p
      v-if="error && !started"
      class="meinchat-widget__error"
      data-testid="meinchat-widget-error"
    >
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, nextTick, ref } from 'vue';
import MessageBubble from './MessageBubble.vue';
import MessageComposer from './MessageComposer.vue';
import {
  isAuthenticated,
  getMyNickname,
  setMyNickname,
  startWidgetConversation,
  listRoomMessages,
  sendRoomMessage,
  markRoomRead,
  getWidgetBalance,
  type MessageRow,
} from '../widget/widgetApi';
import { applyBotConversationStyle } from '../composables/useBotConversationStyle';
import { useMessagingStream } from '../composables/useMessagingStream';
import { loadGuestToken, persistGuestToken, clearGuestToken } from '../widget/guestTokenStore';

// CmsWidgetRenderer passes `{ ...widget.config, widget_slug }`.
interface WidgetConfig {
  widget_slug?: string;
  member_nicknames?: string[];
  visibility?: 'public' | 'logged_in';
  title?: string;
  welcome_message?: string;
  composer_placeholder?: string;
  start_button_label?: string;
  display?: 'inline' | 'dock';
  open_by_default?: boolean;
  buy_tokens_href?: string;
}

const props = defineProps<{ config: WidgetConfig }>();

// REVISED D11 — the buy-tokens block links to the future public /tokens page
// (placeholder for now; the block is the stop signal). Overridable per-widget
// via `config.buy_tokens_href`.
const DEFAULT_BUY_TOKENS_HREF = '/tokens';

const widgetSlug = computed(() => props.config.widget_slug ?? '');
const visibility = computed<'public' | 'logged_in'>(
  () => props.config.visibility ?? 'public',
);
const display = computed<'inline' | 'dock'>(() => props.config.display ?? 'inline');
const resolvedTitle = computed(() => props.config.title ?? '');
const resolvedWelcome = computed(() => props.config.welcome_message ?? '');
const resolvedStartLabel = computed(
  () => props.config.start_button_label || 'Start Conversation',
);
// The admin-configured plugin value, returned by widget/start, wins over the
// per-widget config which wins over the built-in default (back-compat).
const startBuyTokensHref = ref<string | null>(null);
const buyTokensHref = computed(
  () =>
    startBuyTokensHref.value ||
    props.config.buy_tokens_href ||
    DEFAULT_BUY_TOKENS_HREF,
);

// ── reactive state ───────────────────────────────────────────────────────────
const authed = ref(false);
const myNickname = ref<string | null>(null);
const nicknameDraft = ref('');
const displayNameDraft = ref('');
const started = ref(false);
const busy = ref(false);
const sending = ref(false);
const error = ref('');
const needsTokens = ref(false);
const tokenBalance = ref<number | null>(null);
const roomId = ref('');
const guestToken = ref<string | undefined>(undefined);
const messages = ref<MessageRow[]>([]);
const dockOpen = ref(props.config.open_by_default ?? true);

const widgetRoot = ref<HTMLElement | null>(null);
const messagesArea = ref<HTMLElement | null>(null);
const stream = useMessagingStream();
let unregisterListener: (() => void) | null = null;

// ── gates ────────────────────────────────────────────────────────────────────
const needsLogin = computed(() => visibility.value === 'logged_in' && !authed.value);
const needsNickname = computed(
  () => visibility.value === 'logged_in' && authed.value && myNickname.value === null,
);
const canStart = computed(() => {
  if (needsLogin.value || needsNickname.value) return false;
  if (visibility.value === 'public') return displayNameDraft.value.trim().length > 0;
  return true;
});

const isDockCollapsed = computed(() => display.value === 'dock' && !dockOpen.value);

// A synthetic opening bubble for the configured welcome message.
const welcomeBubble = computed<MessageRow>(() => ({
  id: 'welcome',
  conversation_id: '',
  room_id: roomId.value,
  sender_id: 'assistant',
  sender_nickname: 'assistant',
  body: resolvedWelcome.value,
  attachments: [],
  sent_at: null,
  read_at: null,
  system_kind: null,
}));

onMounted(async () => {
  authed.value = isAuthenticated();
  if (needsLogin.value) return;
  if (visibility.value === 'logged_in') {
    await refreshMyNickname();
  }
  // Theme the widget root with the portable bot-conversation style (best effort).
  await nextTick();
  if (widgetRoot.value) await applyBotConversationStyle(widgetRoot.value);
});

onUnmounted(() => {
  if (unregisterListener) unregisterListener();
  stream.disconnect();
});

async function refreshMyNickname() {
  try {
    const result = await getMyNickname();
    myNickname.value = result.nickname;
  } catch {
    myNickname.value = null;
  }
}

async function onSaveNickname() {
  const candidate = nicknameDraft.value.trim();
  if (!candidate) return;
  busy.value = true;
  error.value = '';
  try {
    const saved = await setMyNickname(candidate);
    myNickname.value = saved.nickname;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function onStart() {
  if (!canStart.value) return;
  busy.value = true;
  error.value = '';
  try {
    // D12 — present a stored guest token (public widgets only) so the backend
    // reuses the same GUEST + balance instead of re-provisioning.
    const presentedToken =
      visibility.value === 'public' ? loadGuestToken(widgetSlug.value) ?? undefined : undefined;
    const result = await startWidgetConversation(
      buildStartPayload(),
      presentedToken,
    );
    if (
      visibility.value === 'public' &&
      !result.access_token &&
      !presentedToken
    ) {
      // No usable guest token at all (a stale/expired stored token whose room
      // the visitor cannot access). A public-widget room call must NEVER fall
      // back to the app session, so self-heal: drop the stale token and re-run
      // start FRESH (no presented token) → backend provisions a new guest + a
      // fresh access_token. (Cannot happen on a truly fresh start; this guards
      // the reuse-of-stale-credential case.)
      clearGuestToken(widgetSlug.value);
      await startFresh();
      return;
    }
    applyStartResult(result, presentedToken);
    started.value = true;
    await loadRoom();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

function buildStartPayload(): { widget_slug: string; display_name?: string } {
  return {
    widget_slug: widgetSlug.value,
    ...(visibility.value === 'public'
      ? { display_name: displayNameDraft.value.trim() }
      : {}),
  };
}

// Re-run start with NO presented token so the backend always provisions a fresh
// guest + access_token. Used to self-heal a stale/expired stored guest token.
async function startFresh() {
  const result = await startWidgetConversation(buildStartPayload(), undefined);
  applyStartResult(result, undefined);
  started.value = true;
  await loadRoom();
}

function applyStartResult(
  result: {
    room_id: string;
    access_token?: string;
    token_balance?: number;
    buy_tokens_href?: string;
  },
  presentedToken: string | undefined,
) {
  roomId.value = result.room_id;
  // The effective guest token is the freshly minted one, or — on a D12 reuse
  // that returns no new token — the token we PRESENTED. A public widget must
  // always drive its room with a guest token, never the app session.
  const effectiveToken = result.access_token ?? presentedToken;
  if (effectiveToken) {
    guestToken.value = effectiveToken;
    persistGuestToken(widgetSlug.value, effectiveToken);
  }
  if (typeof result.token_balance === 'number') {
    tokenBalance.value = result.token_balance;
  }
  if (result.buy_tokens_href) {
    startBuyTokensHref.value = result.buy_tokens_href;
  }
}

async function loadRoom() {
  const result = await listRoomMessages(roomId.value, {}, guestToken.value);
  messages.value = [...result.items].reverse();
  await markRoomRead(roomId.value, guestToken.value).catch(() => {
    /* read receipts are best-effort */
  });

  unregisterListener = stream.onEvent((event) => {
    appendStreamMessage(event as Record<string, unknown>);
  });
  await stream.connect(guestToken.value).catch(() => {
    /* SSE is best-effort — the POST response already shows the bot reply */
  });
  scrollToBottom();
}

function appendStreamMessage(event: Record<string, unknown>) {
  if (event.type !== 'message') return;
  const message = event.message as MessageRow | undefined;
  if (!message || message.room_id !== roomId.value) return;
  if (messages.value.some((existing) => existing.id === message.id)) return;
  messages.value = [...messages.value, message];
  // D11 (word-based) — a bot answer (a message NOT sent by me) is charged to the
  // guest server-side by its word count; refresh the displayed balance so it
  // reflects that charge. Best-effort — the 402 gate is the authoritative stop.
  if (message.sender_id !== 'me' && tokenBalance.value !== null) {
    void refreshBalance();
  }
  scrollToBottom();
}

async function refreshBalance() {
  try {
    const result = await getWidgetBalance(guestToken.value);
    tokenBalance.value = result.token_balance;
  } catch {
    /* balance refresh is best-effort — the 402 gate stops the dialogue */
  }
}

async function onSend(payload: { body: string; file: File | null }) {
  if (!payload.body) return;
  sending.value = true;
  error.value = '';
  try {
    const row = await sendRoomMessage(roomId.value, payload.body, undefined, guestToken.value);
    if (!messages.value.some((existing) => existing.id === row.id)) {
      messages.value = [...messages.value, row];
    }
    needsTokens.value = false;
    // D11 (word-based) — trust the backend's authoritative post-charge balance
    // (the question's word count is debited server-side). The bot answer's words
    // are charged separately, refreshed when the answer arrives over the stream.
    if (typeof row.token_balance === 'number') {
      tokenBalance.value = row.token_balance;
    }
    scrollToBottom();
  } catch (err) {
    if (isInsufficientTokens(err)) {
      needsTokens.value = true;
      tokenBalance.value = 0;
    } else {
      error.value = errorMessage(err);
    }
  } finally {
    sending.value = false;
  }
}

function isInsufficientTokens(err: unknown): boolean {
  return Boolean(
    err && typeof err === 'object' && (err as { code?: string }).code === 'insufficient_tokens',
  );
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const body = err as { code?: string; error?: string };
    return body.code ?? body.error ?? 'Failed';
  }
  return 'Failed';
}

async function scrollToBottom() {
  await nextTick();
  if (messagesArea.value) {
    messagesArea.value.scrollTop = messagesArea.value.scrollHeight;
  }
}
</script>

<style scoped>
.meinchat-widget {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vbwd-border, #e5e7eb);
  border-radius: 12px;
  background: var(--vbwd-card-bg, #fff);
  color: var(--vbwd-text, #222);
  overflow: hidden;
}
.meinchat-widget--inline {
  width: 100%;
  max-width: 520px;
  min-height: 360px;
  /* Bound the inline block so the message list scrolls inside it instead of the
   * whole widget stretching down the page as messages arrive. vh-based so it
   * adapts to the viewport. */
  max-height: 70vh;
}
.meinchat-widget--dock {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  width: min(360px, 92vw);
  height: 520px;
  max-height: 80vh;
  z-index: 900;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}
.meinchat-widget__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
}
.meinchat-widget__dock-close {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  color: var(--vbwd-text-muted, #6b7280);
}
.meinchat-widget__cta,
.meinchat-widget__prompt {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem;
}
.meinchat-widget__prompt label {
  font-size: 0.85rem;
  color: var(--vbwd-text-muted, #6b7280);
}
.meinchat-widget__prompt input {
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--vbwd-border, #d1d5db);
  border-radius: 8px;
  font: inherit;
  background: var(--vbwd-card-bg, #fff);
  color: var(--vbwd-text, #222);
}
.meinchat-widget__prompt button,
.meinchat-widget__cta-link {
  align-self: flex-start;
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  background: var(--vbwd-color-primary, #3b82f6);
  color: #fff;
  text-decoration: none;
  font: inherit;
}
.meinchat-widget__prompt button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.meinchat-widget__room {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.meinchat-widget__balance {
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
  color: var(--vbwd-text-muted, #6b7280);
  border-bottom: 1px solid var(--vbwd-border, #f3f4f6);
}
.meinchat-widget__messages {
  flex: 1;
  /* A flex child needs min-height:0 to actually scroll inside a bounded flex
   * column instead of expanding to its content height. */
  min-height: 0;
  overflow-y: auto;
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
}
.meinchat-widget__error {
  color: var(--vbwd-color-danger, #e74c3c);
  background: rgba(231, 76, 60, 0.06);
  margin: 0;
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}
.meinchat-widget__buy {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.7rem 0.9rem;
  background: var(--vbwd-card-bg-soft, #f3f4f6);
  border-top: 1px solid var(--vbwd-border, #e5e7eb);
}
.meinchat-widget__buy-link {
  align-self: flex-start;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  background: var(--vbwd-color-primary, #3b82f6);
  color: #fff;
  text-decoration: none;
  font-size: 0.85rem;
}
.meinchat-widget-dock-launcher {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 900;
  padding: 0.7rem 1.1rem;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  background: var(--vbwd-color-primary, #3b82f6);
  color: #fff;
  font: inherit;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
</style>
