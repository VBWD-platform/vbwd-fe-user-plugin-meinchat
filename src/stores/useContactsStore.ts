import { defineStore } from 'pinia';
import {
  type ContactRow,
  addContact,
  deleteContact,
  listContacts,
  patchContact,
} from '../api';

interface State {
  items: ContactRow[];
  loading: boolean;
}

function displayKey(row: ContactRow): string {
  return (row.alias || row.peer_nickname || '').toLowerCase();
}

export const useContactsStore = defineStore('meinchat-contacts', {
  state: (): State => ({ items: [], loading: false }),

  getters: {
    sorted(state): ContactRow[] {
      return [...state.items].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const ak = displayKey(a);
        const bk = displayKey(b);
        return ak.localeCompare(bk);
      });
    },

    byNickname(state) {
      return (nickname: string) =>
        state.items.find((row) => row.peer_nickname === nickname) ?? null;
    },
  },

  actions: {
    async fetch() {
      this.loading = true;
      try {
        const result = await listContacts();
        this.items = result.items;
      } finally {
        this.loading = false;
      }
    },

    async add(input: {
      nickname: string;
      alias?: string;
      note?: string;
      pinned?: boolean;
    }) {
      const row = await addContact(input);
      this.items = [row, ...this.items];
      return row;
    },

    async update(
      id: string,
      patch: { alias?: string | null; note?: string | null; pinned?: boolean },
    ) {
      const row = await patchContact(id, patch);
      const idx = this.items.findIndex((c) => c.id === id);
      if (idx >= 0) this.items[idx] = row;
    },

    async togglePin(id: string) {
      const target = this.items.find((c) => c.id === id);
      if (!target) return;
      const next = !target.pinned;
      target.pinned = next;  // optimistic
      try {
        const row = await patchContact(id, { pinned: next });
        const idx = this.items.findIndex((c) => c.id === id);
        if (idx >= 0) this.items[idx] = row;
      } catch (err) {
        target.pinned = !next;  // rollback
        throw err;
      }
    },

    async remove(id: string) {
      await deleteContact(id);
      this.items = this.items.filter((c) => c.id !== id);
    },
  },
});
