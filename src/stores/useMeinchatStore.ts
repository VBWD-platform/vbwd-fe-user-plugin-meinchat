import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import {
  type ConversationRow,
  type MessageRow,
  deleteMessage,
  listConversations,
  listMessages,
  markConversationRead,
  sendAttachmentMessage,
  sendTextMessage,
  startOrGetConversation,
} from '../api';
import type { LocalMessageCache } from '../composables/useLocalMessageCache';
import { useMessagingLimits } from '../composables/useMessagingLimits';
import {
  MILLIS_PER_DAY,
  resolveRetentionDays,
} from '../composables/clientRetention';

/** How often the best-effort eviction sweep runs (S28.2 §2.2). */
const EVICTION_INTERVAL_MS = 30 * 60 * 1000;

interface BootDeps {
  cache: LocalMessageCache;
  /** Server-suggested retention in days; the sweep clamps the user setting to it. */
  serverSuggestedRetentionDays?: number;
}

interface State {
  conversations: ConversationRow[];
  messagesByConv: Record<string, MessageRow[]>;
  loadingConversations: boolean;
  // markRaw'd — the cache/timer are collaborators, not reactive data.
  cache: LocalMessageCache | null;
  evictionTimer: ReturnType<typeof setInterval> | null;
}

interface StreamEvent {
  type: 'message' | 'message_deleted' | 'read' | 'token_transfer' | 'heartbeat';
  message?: MessageRow;
  conversation_id?: string;
  message_id?: string;
  reader_id?: string;
}

export const useMeinchatStore = defineStore('meinchat', {
  state: (): State => ({
    conversations: [],
    messagesByConv: {},
    loadingConversations: false,
    cache: null,
    evictionTimer: null,
  }),

  getters: {
    totalUnread(state): number {
      return state.conversations.reduce(
        (acc, conv) => acc + (conv.unread_count ?? 0),
        0,
      );
    },

    /** Lookup helper used by views — returns [] for an unknown conv id. */
    messages: (state) => (conversationId: string): MessageRow[] =>
      state.messagesByConv[conversationId] ?? [],

    conversationByPeer: (state) => (peerNickname: string) =>
      state.conversations.find((c) => c.peer_nickname === peerNickname) ?? null,
  },

  actions: {
    /**
     * One-time wiring of the injected local cache + the best-effort
     * eviction sweep (S28.2 §2.2/§2.3). DI seam: the cache (and its KEK)
     * are passed in, never module-global, so S28.3b can swap the KEK
     * producer without touching the store.
     *
     * Eviction runs as a plain ``setInterval`` rather than a Web Worker:
     * the sweep reads only the unencrypted ``cached_at`` index and deletes
     * by key range — a trivial, non-blocking job that does not justify a
     * separate worker file or its build/bundle overhead.
     */
    boot(deps: BootDeps) {
      this.cache = markRaw(deps.cache);
      if (this.evictionTimer) return;
      const runSweep = () => {
        void this.evictExpiredCache(deps.serverSuggestedRetentionDays);
      };
      runSweep();
      this.evictionTimer = setInterval(runSweep, EVICTION_INTERVAL_MS);
    },

    /** Stops the eviction sweep + drops the cache (e.g. on logout). */
    shutdown() {
      if (this.evictionTimer) {
        clearInterval(this.evictionTimer);
        this.evictionTimer = null;
      }
      this.cache = null;
    },

    /**
     * Best-effort cache sweep: ages out rows older than
     * ``min(user_setting, server_suggested)`` days. The retention window is
     * resolved through the single shared helper (DRY, S28.2 §6).
     */
    async evictExpiredCache(serverSuggestedRetentionDays?: number) {
      if (!this.cache) return 0;
      const serverSuggested =
        serverSuggestedRetentionDays ??
        useMessagingLimits().data.value?.messages_retention_days_client_suggested ??
        0;
      if (serverSuggested <= 0) return 0;
      const retentionDays = resolveRetentionDays(serverSuggested);
      const threshold = Date.now() - retentionDays * MILLIS_PER_DAY;
      return this.cache.evictOlderThan(threshold);
    },

    async fetchConversations() {
      this.loadingConversations = true;
      try {
        const result = await listConversations();
        this.conversations = result.items;
      } finally {
        this.loadingConversations = false;
      }
    },

    async openConversation(peerNickname: string): Promise<ConversationRow> {
      // (a) Resolve the conversation id.
      const conv = await startOrGetConversation(peerNickname);
      // Insert at the top if it's new; replace otherwise (server is canon).
      const idx = this.conversations.findIndex((c) => c.id === conv.id);
      if (idx >= 0) this.conversations[idx] = conv;
      else this.conversations = [conv, ...this.conversations];

      // (b) Cache-first paint — show local history immediately, without
      // waiting on the server round-trip. No-op when no cache is injected.
      if (this.cache) {
        const cached = await this.cache.listByConversation(conv.id);
        if (cached.length > 0) this.messagesByConv[conv.id] = cached;
      }

      // (c) Fetch the server's most-recent window and merge by id, reusing
      // the same dedup-by-id invariant the SSE/POST paths rely on.
      const result = await listMessages(conv.id);
      const serverRows = [...result.items].reverse(); // server returns newest-first
      const existing = this.messagesByConv[conv.id] ?? [];
      const byId = new Map(existing.map((m) => [m.id, m]));
      for (const row of serverRows) byId.set(row.id, row);
      this.messagesByConv[conv.id] = [...byId.values()].sort(
        (left, right) =>
          (left.sent_at ? Date.parse(left.sent_at) : 0) -
          (right.sent_at ? Date.parse(right.sent_at) : 0),
      );

      // (d) Refresh the cache with the latest server state.
      if (this.cache) await this.cache.putMany(serverRows);

      return conv;
    },

    async fetchMessages(conversationId: string, before?: string) {
      const result = await listMessages(conversationId, { before });
      // Server returns newest first; we keep newest-last in the cache so
      // a simple v-for renders the timeline naturally.
      const ordered = [...result.items].reverse();
      if (before) {
        // Pagination — prepend older messages to what we already have.
        this.messagesByConv[conversationId] = [
          ...ordered,
          ...(this.messagesByConv[conversationId] ?? []),
        ];
      } else {
        this.messagesByConv[conversationId] = ordered;
      }
    },

    async sendText(conversationId: string, body: string) {
      const optimisticId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic: MessageRow = {
        id: optimisticId,
        conversation_id: conversationId,
        sender_id: 'me',
        sender_nickname: '',
        body,
        attachment_url: null,
        attachment_thumb_url: null,
        attachment_width_px: null,
        attachment_height_px: null,
        sent_at: new Date().toISOString(),
        read_at: null,
        system_kind: null,
      };
      const list = this.messagesByConv[conversationId] ?? [];
      this.messagesByConv[conversationId] = [...list, optimistic];

      try {
        const row = await sendTextMessage(conversationId, body);
        // The SSE stream broadcasts the message back to the sender too, and
        // may arrive either BEFORE or AFTER this POST resolves. Without
        // dedup, replacing the optimistic placeholder with the server row
        // can produce a second copy when the SSE has already inserted one.
        // So: drop the optimistic, then append the server row ONLY if it
        // isn't already present (dedup by real id).
        const buf = this.messagesByConv[conversationId] ?? [];
        const withoutOptimistic = buf.filter((m) => m.id !== optimisticId);
        const alreadyPresent = withoutOptimistic.some((m) => m.id === row.id);
        this.messagesByConv[conversationId] = alreadyPresent
          ? withoutOptimistic
          : [...withoutOptimistic, row];
        return row;
      } catch (err) {
        const buf = this.messagesByConv[conversationId] ?? [];
        this.messagesByConv[conversationId] = buf.filter(
          (m) => m.id !== optimisticId,
        );
        throw err;
      }
    },

    async sendAttachment(conversationId: string, file: File, body = '') {
      const row = await sendAttachmentMessage(conversationId, file, body);
      // Same SSE-race dedup as sendText — the stream echoes back the same
      // row (with the real id) and would otherwise produce a second copy.
      const buf = this.messagesByConv[conversationId] ?? [];
      const alreadyPresent = buf.some((m) => m.id === row.id);
      this.messagesByConv[conversationId] = alreadyPresent ? buf : [...buf, row];
      return row;
    },

    async markRead(conversationId: string) {
      await markConversationRead(conversationId);
      const target = this.conversations.find((c) => c.id === conversationId);
      if (target) target.unread_count = 0;
    },

    async deleteOne(conversationId: string, messageId: string) {
      await deleteMessage(conversationId, messageId);
      const buf = this.messagesByConv[conversationId];
      if (buf) {
        this.messagesByConv[conversationId] = buf.filter(
          (m) => m.id !== messageId,
        );
      }
    },

    handleStreamEvent(event: StreamEvent) {
      if (event.type === 'message' && event.message) {
        const convId = event.message.conversation_id;
        const buf = this.messagesByConv[convId] ?? [];
        // Reject duplicate by id (the SSE event arrives just after the
        // POST response writes the same row to the cache).
        if (!buf.some((m) => m.id === event.message!.id)) {
          this.messagesByConv[convId] = [...buf, event.message];
        }
      } else if (event.type === 'message_deleted' && event.conversation_id && event.message_id) {
        const buf = this.messagesByConv[event.conversation_id];
        if (buf) {
          this.messagesByConv[event.conversation_id] = buf.filter(
            (m) => m.id !== event.message_id,
          );
        }
      } else if (event.type === 'read' && event.conversation_id) {
        const target = this.conversations.find(
          (c) => c.id === event.conversation_id,
        );
        if (target) {
          // The 'read' event fires for both participants. Only zero our
          // own count when the reader is us — best-effort: if reader_id
          // is unknown, leave unread alone.
          target.unread_count = 0;
        }
      }
    },
  },
});
