<template>
  <div
    class="meinchat-shell"
    data-testid="meinchat-contacts"
  >
    <nav class="meinchat-tabs">
      <button
        type="button"
        @click="$router.push('/dashboard/messages')"
      >
        {{ $t('meinchat.tabs.inbox') }}
      </button>
      <button
        type="button"
        class="active"
      >
        {{ $t('meinchat.tabs.contacts') }}
      </button>
    </nav>

    <div class="meinchat-toolbar">
      <button
        type="button"
        data-testid="contacts-add-button"
        @click="addOpen = true"
      >
        + {{ $t('meinchat.contacts.add') }}
      </button>
    </div>

    <div
      v-if="store.loading"
      class="meinchat-empty"
    >
      …
    </div>
    <div
      v-else-if="store.items.length === 0"
      class="meinchat-empty"
      data-testid="meinchat-contacts-empty"
    >
      {{ $t('meinchat.contacts.empty') }}
    </div>
    <div v-else>
      <template
        v-for="(group, groupIndex) in groups"
        :key="group.label"
      >
        <h3
          v-if="group.items.length > 0"
          class="meinchat-section"
        >
          {{ group.label }}
        </h3>
        <ContactRow
          v-for="contact in group.items"
          :key="contact.id"
          :contact="contact"
          @open="$router.push(`/dashboard/messages/${contact.peer_nickname}`)"
          @toggle-pin="store.togglePin(contact.id)"
          @remove="onRemove(contact.id)"
        />
        <hr
          v-if="group.items.length > 0 && groupIndex === 0 && groups[1]?.items.length"
          class="meinchat-divider"
        >
      </template>
    </div>

    <AddContactDialog
      v-if="addOpen"
      @added="onAdded"
      @cancel="addOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ContactRow from '../components/ContactRow.vue';
import AddContactDialog from '../components/AddContactDialog.vue';
import { useContactsStore } from '../stores/useContactsStore';

const { t } = useI18n();
const store = useContactsStore();
const addOpen = ref(false);

onMounted(() => store.fetch());

const groups = computed(() => {
  const sorted = store.sorted;
  return [
    {
      label: t('meinchat.contacts.pinned'),
      items: sorted.filter((row) => row.pinned),
    },
    {
      label: t('meinchat.contacts.all'),
      items: sorted.filter((row) => !row.pinned),
    },
  ];
});

function onAdded() {
  addOpen.value = false;
}

async function onRemove(id: string) {
  await store.remove(id);
}
</script>

<style scoped>
.meinchat-shell {
  display: flex; flex-direction: column;
  height: calc(100vh - 60px);
  background: var(--vbwd-card-bg, #fff);
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
.meinchat-toolbar {
  padding: 0.5rem 0.9rem; border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
}
.meinchat-toolbar button {
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
  border: 0; padding: 0.4rem 0.8rem; border-radius: 14px; cursor: pointer;
}
.meinchat-section {
  padding: 0.5rem 0.9rem; margin: 0;
  background: var(--vbwd-card-bg-soft, #f9fafb);
  font-size: 0.8rem; color: var(--vbwd-text-muted, #6b7280);
}
.meinchat-empty {
  padding: 2rem; text-align: center;
  color: var(--vbwd-text-muted, #6b7280);
}
.meinchat-divider { border: 0; }
</style>
