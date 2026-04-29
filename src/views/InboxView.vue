<template>
  <div
    class="meinchat-shell"
    data-testid="meinchat-inbox"
  >
    <nav class="meinchat-tabs">
      <button
        type="button"
        :class="{ active: tab === 'inbox' }"
        @click="tab = 'inbox'"
      >
        {{ $t('meinchat.tabs.inbox') }}
      </button>
      <button
        type="button"
        :class="{ active: tab === 'contacts' }"
        @click="$router.push('/dashboard/messages/contacts')"
      >
        {{ $t('meinchat.tabs.contacts') }}
      </button>
    </nav>

    <div
      v-if="store.loadingConversations"
      class="meinchat-empty"
    >
      …
    </div>
    <div
      v-else-if="store.conversations.length === 0"
      class="meinchat-empty"
      data-testid="meinchat-inbox-empty"
    >
      {{ $t('meinchat.inbox.empty') }}
    </div>
    <div v-else>
      <InboxRow
        v-for="conv in store.conversations"
        :key="conv.id"
        :conversation="conv"
        @click="open(conv)"
      />
    </div>

    <button
      type="button"
      class="meinchat-fab"
      data-testid="meinchat-find-user"
      :title="$t('meinchat.find.title')"
      @click="findOpen = true"
    >
      + {{ $t('meinchat.find.button') }}
    </button>

    <FindUserDialog
      v-if="findOpen"
      @start-chat="onStartChat"
      @save-contact="onSaveContact"
      @cancel="findOpen = false"
    />
    <AddContactDialog
      v-if="addContactOpen"
      @added="onContactAdded"
      @cancel="addContactOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import InboxRow from '../components/InboxRow.vue';
import FindUserDialog from '../components/FindUserDialog.vue';
import AddContactDialog from '../components/AddContactDialog.vue';
import { useMeinchatStore } from '../stores/useMeinchatStore';
import type { ConversationRow } from '../api';

const router = useRouter();
const store = useMeinchatStore();
const tab = ref<'inbox' | 'contacts'>('inbox');
const findOpen = ref(false);
const addContactOpen = ref(false);
const prefillNickname = ref<string | null>(null);

onMounted(() => store.fetchConversations());

function open(conv: ConversationRow) {
  if (!conv.peer_nickname) return;
  router.push(`/dashboard/messages/${conv.peer_nickname}`);
}

async function onStartChat(nickname: string) {
  findOpen.value = false;
  router.push(`/dashboard/messages/${nickname}`);
}

function onSaveContact(nickname: string) {
  findOpen.value = false;
  prefillNickname.value = nickname;
  addContactOpen.value = true;
}

function onContactAdded() {
  addContactOpen.value = false;
  prefillNickname.value = null;
}
</script>

<style scoped>
.meinchat-shell {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  background: var(--vbwd-card-bg, #fff);
  position: relative;
}
.meinchat-tabs {
  display: flex; gap: 0.5rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
}
.meinchat-tabs button {
  border: 0; background: transparent; cursor: pointer;
  padding: 0.4rem 0.8rem; border-radius: 14px;
  color: var(--vbwd-text, #222);
}
.meinchat-tabs button.active {
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
}
.meinchat-empty {
  padding: 2rem; text-align: center;
  color: var(--vbwd-text-muted, #6b7280);
}
.meinchat-fab {
  position: absolute; bottom: 1.2rem; right: 1.2rem;
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
  border: 0; padding: 0.7rem 1rem; border-radius: 999px;
  cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
</style>
