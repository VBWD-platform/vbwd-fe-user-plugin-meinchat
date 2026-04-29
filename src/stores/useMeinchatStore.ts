import { defineStore } from 'pinia';
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

interface State {
  conversations: ConversationRow[];
  messagesByConv: Record<string, MessageRow[]>;
  loadingConversations: boolean;
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
      const conv = await startOrGetConversation(peerNickname);
      // Insert at the top if it's new; replace otherwise (server is canon).
      const idx = this.conversations.findIndex((c) => c.id === conv.id);
      if (idx >= 0) this.conversations[idx] = conv;
      else this.conversations = [conv, ...this.conversations];
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
        const buf = this.messagesByConv[conversationId] ?? [];
        const idx = buf.findIndex((m) => m.id === optimisticId);
        if (idx >= 0) buf[idx] = row;
        else buf.push(row);
        this.messagesByConv[conversationId] = [...buf];
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
      const list = this.messagesByConv[conversationId] ?? [];
      this.messagesByConv[conversationId] = [...list, row];
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
