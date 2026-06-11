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
      v-if="plainImageUrl"
      class="bubble__image"
    >
      <img
        :src="plainImageUrl"
        :alt="`Image from @${message.sender_nickname}`"
      >
    </div>
    <!-- S70.4 — bot_choices show the clean prompt (meta.text) instead of the
         numbered fallback body; all other kinds suppress the body entirely. -->
    <div
      v-if="richKind === 'bot_choices'"
      class="bubble__body"
    >
      <SafeLinkify :text="choicesText" />
    </div>
    <div
      v-else-if="showPlainBody"
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

    <!-- S70.4 — bot_menu: a tidy command list; tapping a row sends the command. -->
    <div
      v-if="botMenuCommands.length"
      class="botchat-menu"
      data-testid="bot-menu"
    >
      <button
        v-for="(entry, index) in botMenuCommands"
        :key="`${entry.command}-${index}`"
        type="button"
        class="botchat-menu-row"
        data-testid="bot-menu-row"
        @click="emit('send-command', entry.command)"
      >
        <span
          class="botchat-menu-row__command"
          data-testid="bot-menu-command"
        >{{ entry.command }}</span>
        <span
          class="botchat-menu-row__description"
          data-testid="bot-menu-description"
        >{{ entry.description }}</span>
      </button>
    </div>

    <!-- S70.4 — bot_cart: a cart summary card (server-formatted money strings). -->
    <div
      v-if="botCart"
      class="botchat-cart"
      data-testid="bot-cart"
    >
      <template v-if="botCart.items.length">
        <div
          v-for="(item, index) in botCart.items"
          :key="`${item.name}-${index}`"
          class="botchat-cart__row"
          data-testid="bot-cart-item"
        >
          <span
            class="botchat-cart__name"
            data-testid="bot-cart-item-name"
          >{{ item.name }}</span>
          <span
            class="botchat-cart__qty"
            data-testid="bot-cart-item-qty"
          >×{{ item.quantity }}</span>
          <span
            class="botchat-cart__line-total"
            data-testid="bot-cart-item-total"
          >{{ item.line_total }}</span>
        </div>
        <div class="botchat-cart__divider" />
        <div
          class="botchat-cart__total"
          data-testid="bot-cart-total"
        >
          <span>{{ $t('meinchat.cart.total') }}</span>
          <span>{{ botCart.total }} {{ botCart.currency }}</span>
        </div>
        <button
          type="button"
          class="botchat-cart__checkout"
          data-testid="bot-cart-checkout"
          @click="emit('send-command', CHECKOUT_COMMAND)"
        >
          {{ $t('meinchat.cart.checkout') }}
        </button>
      </template>
      <div
        v-else
        class="botchat-cart__empty"
        data-testid="bot-cart-empty"
      >
        <p>{{ $t('meinchat.cart.empty') }}</p>
        <p class="botchat-cart__empty-hint">
          {{ $t('meinchat.cart.emptyHint') }}
        </p>
      </div>
    </div>

    <div
      v-if="botChoices.length"
      class="botchat-choices"
      data-testid="bot-choices"
    >
      <button
        v-for="(choice, index) in botChoices"
        :key="`${choice.action_data}-${index}`"
        type="button"
        class="botchat-card"
        data-testid="bot-choice-card"
        @click="emit('select-choice', choice)"
      >
        <span
          class="botchat-card__badge"
          data-testid="bot-choice-badge"
        >{{ index + 1 }}</span>
        <span
          class="botchat-card__label"
          data-testid="bot-choice-label"
        >{{ choice.label }}</span>
        <span
          v-if="choice.hint"
          class="botchat-card__hint"
          data-testid="bot-choice-hint"
        >{{ choice.hint }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SafeLinkify from './SafeLinkify.vue';
import type { BotCartItem, BotChoice, BotMenuCommand, MessageRow } from '../api';

const props = defineProps<{
  message: MessageRow;
  mine: boolean;
}>();

const emit = defineEmits<{
  'select-choice': [choice: BotChoice];
  // S70.4 — a tapped menu row / cart checkout sends a command body as a normal
  // message (the bot then runs it). The view forwards this to the store.
  'send-command': [command: string];
}>();

const CHECKOUT_COMMAND = '/checkout';

// S70.4 — the rich kinds this client knows how to render. For these we SUPPRESS
// the plain `body` (it's only the fallback for non-rich clients); an unknown
// kind, or no `meta`, always renders the plain body (regression).
const KNOWN_RICH_KINDS = ['bot_choices', 'bot_menu', 'bot_cart'] as const;

// Only INCOMING (not `mine`) rich prompts render their interactive UI; the
// user's own tap echoes / plain messages render as plain bubbles.
const richKind = computed<string | null>(() => {
  if (props.mine) return null;
  const kind = props.message.meta?.kind;
  if (kind && (KNOWN_RICH_KINDS as readonly string[]).includes(kind)) return kind;
  return null;
});

// S70.4 — `bot_choices` carries an optional clean prompt (`meta.text`) shown
// in place of the body's numbered list; fall back to the body otherwise.
const choicesText = computed<string>(() =>
  props.message.meta?.text ?? props.message.body,
);

// Render the plain body unless a KNOWN rich kind supplies its own rendering.
const showPlainBody = computed<boolean>(
  () => Boolean(props.message.body) && richKind.value === null,
);

// S70.1 — clickable choice cards render only on INCOMING bot prompts
// (`bot_choices`). Outgoing taps / plain messages have no cards.
const botChoices = computed<BotChoice[]>(() => {
  if (richKind.value !== 'bot_choices') return [];
  return props.message.meta?.choices ?? [];
});

const botMenuCommands = computed<BotMenuCommand[]>(() => {
  if (richKind.value !== 'bot_menu') return [];
  return props.message.meta?.commands ?? [];
});

const botCart = computed<{ items: BotCartItem[]; total: string; currency: string } | null>(
  () => {
    if (richKind.value !== 'bot_cart') return null;
    const meta = props.message.meta;
    return {
      items: meta?.items ?? [],
      total: meta?.total ?? '0',
      currency: meta?.currency ?? '',
    };
  },
);

// Renderable fullres image URL. PLAIN → the storage URL directly; e2e_v1 →
// the decrypted `blob:` URL the meinchat-plus provider put in `attachmentUrls`
// during hydration (null until decrypted / if this device can't).
const plainImageUrl = computed(() => {
  const fullres = (props.message.attachments ?? []).find((a) => a.kind === 'fullres');
  if (!fullres) return null;
  if (fullres.protocol === 'e2e_v1') {
    return props.message.attachmentUrls?.[fullres.id] ?? null;
  }
  return fullres.protocol === 'plain' ? fullres.storage_url : null;
});

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

/* S70.1 — bot-choice cards. All visuals are themeable via --vbwd-botchat-*
   custom properties (fed by the portable bot-conversation style in S70.2);
   the fallbacks here match the storefront walkthrough look out of the box. */
.botchat-choices {
  display: flex;
  flex-direction: column;
  gap: var(--vbwd-botchat-gap, 6px);
  margin-top: 8px;
}
.botchat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  background: var(--vbwd-botchat-card-bg, #fff);
  border: 1px solid var(--vbwd-botchat-card-border, #e6e9ef);
  border-radius: var(--vbwd-botchat-card-radius, 12px);
  color: var(--vbwd-botchat-card-fg, #1d2433);
  cursor: pointer;
  font: inherit;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.botchat-card:hover {
  border-color: var(--vbwd-botchat-accent, #3b6ef0);
  box-shadow: 0 1px 4px rgba(59, 110, 240, 0.18);
}
.botchat-card__badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 0.78rem;
  font-weight: 600;
  background: var(--vbwd-botchat-badge-bg, var(--vbwd-botchat-accent, #3b6ef0));
  color: var(--vbwd-botchat-badge-fg, #fff);
}
.botchat-card__label {
  flex: 1 1 auto;
  font-size: 0.92rem;
}
.botchat-card__hint {
  flex: 0 0 auto;
  margin-left: auto;
  font-size: 0.82rem;
  color: var(--vbwd-botchat-hint, #5b6577);
}

/* S70.4 — bot_menu command list. Same --vbwd-botchat-* theme as the cards. */
.botchat-menu {
  display: flex;
  flex-direction: column;
  gap: var(--vbwd-botchat-gap, 6px);
  margin-top: 8px;
}
.botchat-menu-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  background: var(--vbwd-botchat-card-bg, #fff);
  border: 1px solid var(--vbwd-botchat-card-border, #e6e9ef);
  border-radius: var(--vbwd-botchat-card-radius, 12px);
  cursor: pointer;
  font: inherit;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.botchat-menu-row:hover {
  border-color: var(--vbwd-botchat-accent, #3b6ef0);
  box-shadow: 0 1px 4px rgba(59, 110, 240, 0.18);
}
.botchat-menu-row__command {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--vbwd-botchat-accent, #3b6ef0);
}
.botchat-menu-row__description {
  font-size: 0.82rem;
  color: var(--vbwd-botchat-hint, #5b6577);
}

/* S70.4 — bot_cart summary card. */
.botchat-cart {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--vbwd-botchat-card-bg, #fff);
  border: 1px solid var(--vbwd-botchat-card-border, #e6e9ef);
  border-radius: var(--vbwd-botchat-card-radius, 12px);
  color: var(--vbwd-botchat-card-fg, #1d2433);
}
.botchat-cart__row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  padding: 2px 0;
}
.botchat-cart__name { flex: 1 1 auto; }
.botchat-cart__qty {
  flex: 0 0 auto;
  color: var(--vbwd-botchat-hint, #5b6577);
}
.botchat-cart__line-total {
  flex: 0 0 auto;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.botchat-cart__divider {
  height: 1px;
  margin: 6px 0;
  background: var(--vbwd-botchat-card-border, #e6e9ef);
}
.botchat-cart__total {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  font-size: 0.92rem;
}
.botchat-cart__checkout {
  margin-top: 10px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: var(--vbwd-botchat-card-radius, 12px);
  background: var(--vbwd-botchat-accent, #3b6ef0);
  color: var(--vbwd-botchat-badge-fg, #fff);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.botchat-cart__empty { text-align: center; }
.botchat-cart__empty p { margin: 0.2rem 0; }
.botchat-cart__empty-hint {
  font-size: 0.82rem;
  color: var(--vbwd-botchat-hint, #5b6577);
}
</style>
