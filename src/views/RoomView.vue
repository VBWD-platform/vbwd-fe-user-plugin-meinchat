<template>
  <div
    class="meinchat-shell"
    data-testid="meinchat-room"
  >
    <header class="room-header">
      <button
        class="room-header__back"
        type="button"
        data-testid="room-back"
        @click="router.push('/dashboard/messages')"
      >
        ←
      </button>
      <div class="room-header__title">
        <strong>{{ room?.name || $t('meinchat.rooms.untitled') }}</strong>
        <span class="room-header__count">{{ members.length }}</span>
      </div>
      <div class="room-header__actions">
        <button
          type="button"
          class="room-header__btn"
          data-testid="room-invite"
          @click="inviteOpen = true"
        >
          {{ $t('meinchat.rooms.invite') }}
        </button>
        <button
          type="button"
          class="room-header__btn room-header__btn--leave"
          data-testid="room-leave"
          @click="onLeave"
        >
          {{ $t('meinchat.rooms.leave') }}
        </button>
      </div>
    </header>

    <div
      v-if="isAdmin && otherMembers.length > 0"
      class="room-members"
      data-testid="room-members"
    >
      <span
        v-for="member in otherMembers"
        :key="member.user_id"
        class="room-members__chip"
      >
        @{{ member.nickname || member.user_id }}
        <button
          type="button"
          class="room-members__remove"
          data-testid="room-remove-member"
          :title="$t('meinchat.rooms.removeMember')"
          @click="onRemoveMember(member.user_id)"
        >
          ✕
        </button>
      </span>
    </div>

    <div
      ref="messagesArea"
      class="meinchat-messages"
      data-testid="room-messages"
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

    <div
      v-if="inviteOpen"
      class="dialog-backdrop"
      data-testid="room-invite-dialog"
      @click.self="inviteOpen = false"
    >
      <div class="dialog">
        <h2>{{ $t('meinchat.rooms.invite') }}</h2>
        <input
          v-model="search.query.value"
          type="text"
          :placeholder="$t('meinchat.find.placeholder')"
          data-testid="room-invite-input"
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
            <button
              type="button"
              data-testid="room-invite-confirm"
              @click="onInvite(hit.nickname)"
            >
              {{ $t('meinchat.rooms.add') }}
            </button>
          </li>
        </ul>
        <div class="dialog__actions">
          <button
            type="button"
            @click="inviteOpen = false"
          >
            {{ $t('meinchat.cancel') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import MessageBubble from '../components/MessageBubble.vue';
import MessageComposer from '../components/MessageComposer.vue';
import { useRoomsStore } from '../stores/useRoomsStore';
import { useMessagingStream } from '../composables/useMessagingStream';
import { useNicknameSearch } from '../composables/useNicknameSearch';

const props = defineProps<{ roomId: string }>();
const router = useRouter();
const store = useRoomsStore();
const search = useNicknameSearch();

const sending = ref(false);
const error = ref('');
const inviteOpen = ref(false);
const messagesArea = ref<HTMLElement | null>(null);
const stream = useMessagingStream();
let unregisterListener: (() => void) | null = null;

const messages = computed(() => store.messages(props.roomId));
const members = computed(() => store.members(props.roomId));
const room = computed(() => store.roomById(props.roomId));

const currentUserId = computed(() => localStorage.getItem('user_id') ?? '');

const isAdmin = computed(() =>
  members.value.some(
    (member) => member.user_id === currentUserId.value && member.role === 'admin',
  ),
);

const otherMembers = computed(() =>
  members.value.filter((member) => member.user_id !== currentUserId.value),
);

onMounted(async () => {
  await store.fetchRoom(props.roomId);
  await store.fetchMembers(props.roomId);
  await store.fetchMessages(props.roomId);
  await store.markRead(props.roomId);

  // Both stores read off the single shared stream; each keeps only the events
  // addressed to it (rooms route by `room_id`, 1:1 by `conversation_id`).
  unregisterListener = stream.onEvent((event) => {
    store.handleStreamEvent(event as never);
    scrollToBottom();
  });
  await stream.connect().catch(() => {
    /* SSE is best-effort — REST polling/refresh always available */
  });

  scrollToBottom();
});

onUnmounted(() => {
  if (unregisterListener) unregisterListener();
  stream.disconnect();
});

watch(messages, () => scrollToBottom());

async function onSend(payload: { body: string; file: File | null }) {
  // Rooms are plain-only in S86.1 (no E2E, no attachment-encryption path);
  // attachments are out of scope here, so a plain text body is sent.
  if (!payload.body) return;
  sending.value = true;
  error.value = '';
  try {
    await store.sendText(props.roomId, payload.body);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    sending.value = false;
  }
}

async function onInvite(nickname: string) {
  error.value = '';
  try {
    await store.invite(props.roomId, nickname);
    await store.fetchMembers(props.roomId);
    inviteOpen.value = false;
    search.query.value = '';
  } catch (err) {
    error.value = errorMessage(err);
  }
}

async function onRemoveMember(userId: string) {
  error.value = '';
  try {
    await store.removeMember(props.roomId, userId);
  } catch (err) {
    error.value = errorMessage(err);
  }
}

async function onLeave() {
  error.value = '';
  try {
    await store.leave(props.roomId);
    router.push('/dashboard/messages');
  } catch (err) {
    error.value = errorMessage(err);
  }
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'error' in err) {
    return String((err as { error: unknown }).error);
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
.meinchat-shell {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  background: var(--vbwd-card-bg, #fff);
}
.room-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
}
.room-header__back {
  border: 0; background: transparent; font-size: 1.2rem;
  cursor: pointer; color: var(--vbwd-text, #222);
}
.room-header__title { flex: 1; display: flex; align-items: center; gap: 0.4rem; }
.room-header__count {
  font-size: 0.7rem; color: var(--vbwd-text-muted, #6b7280);
  background: var(--vbwd-card-bg-soft, #f3f4f6);
  border-radius: 999px; padding: 0.05rem 0.45rem;
}
.room-header__actions { display: flex; gap: 0.4rem; }
.room-header__btn {
  background: var(--vbwd-card-bg-soft, #f3f4f6); color: var(--vbwd-text, #222);
  border: 0; padding: 0.35rem 0.7rem; border-radius: 12px;
  cursor: pointer; font-size: 0.8rem;
}
.room-header__btn--leave { color: var(--vbwd-color-danger, #e74c3c); }
.room-members {
  display: flex; flex-wrap: wrap; gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
}
.room-members__chip {
  display: inline-flex; align-items: center; gap: 0.25rem;
  background: var(--vbwd-card-bg-soft, #f3f4f6);
  border-radius: 999px; padding: 0.15rem 0.5rem; font-size: 0.78rem;
}
.room-members__remove {
  border: 0; background: transparent; cursor: pointer;
  color: var(--vbwd-color-danger, #e74c3c); font-size: 0.7rem;
}
.meinchat-messages {
  flex: 1; overflow-y: auto; padding: 0.8rem;
  display: flex; flex-direction: column;
}
.meinchat-empty { color: var(--vbwd-text-muted, #6b7280); align-self: center; }
.meinchat-error {
  color: var(--vbwd-color-danger, #e74c3c);
  background: rgba(231, 76, 60, 0.06);
  margin: 0; padding: 0.4rem 0.8rem;
  border-top: 1px solid rgba(231, 76, 60, 0.2);
  font-size: 0.85rem;
}
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
.dialog__suggestions { list-style: none; margin: 0; padding: 0; }
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
</style>
