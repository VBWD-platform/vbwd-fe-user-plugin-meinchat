import { defineStore } from 'pinia';
import {
  type CreateRoomInput,
  type MessageMeta,
  type MessageRow,
  type RoomMemberRow,
  type RoomRow,
  createRoom,
  inviteRoomMember,
  leaveRoom,
  listRoomMembers,
  listRoomMessages,
  listRooms,
  markRoomRead,
  removeRoomMember,
  sendRoomMessage,
} from '../api';

interface State {
  rooms: RoomRow[];
  messagesByRoom: Record<string, MessageRow[]>;
  membersByRoom: Record<string, RoomMemberRow[]>;
  loadingRooms: boolean;
}

// S86.1 — the room-scoped stream event shape. Mirrors the 1:1 stream event but
// keyed by `room_id`; the SSE stream auto-subscribes the connected user to
// every room they belong to, so room + conversation events share one stream.
interface RoomStreamEvent {
  type: 'message' | 'message_deleted' | 'read' | 'token_transfer' | 'heartbeat';
  message?: MessageRow;
  room_id?: string;
  message_id?: string;
  reader_id?: string;
}

/**
 * Rooms store — multi-party (N-party) chat, kept separate from the 1:1
 * `useMeinchatStore` on purpose:
 *  - Rooms key by `room_id` and carry member roles; the 1:1 store keys by
 *    conversation id and carries `peer_*` + the e2e/crypto + local-cache path.
 *  - S86.1 rooms are PLAIN-only; folding them into the e2e-heavy 1:1 store
 *    would couple a plain transport to the crypto provider seam for no gain.
 *  - Single responsibility (SOLID-S): one reason to change each store.
 * The optimistic-send + SSE dedup invariant mirrors the 1:1 store (same
 * contract) without sharing its crypto branches.
 */
export const useRoomsStore = defineStore('meinchat-rooms', {
  state: (): State => ({
    rooms: [],
    messagesByRoom: {},
    membersByRoom: {},
    loadingRooms: false,
  }),

  getters: {
    totalUnread(state): number {
      return state.rooms.reduce((acc, room) => acc + (room.unread_count ?? 0), 0);
    },

    /** Lookup helper used by views — returns [] for an unknown room id. */
    messages: (state) => (roomId: string): MessageRow[] =>
      state.messagesByRoom[roomId] ?? [],

    /** Member list for a room — returns [] until fetched. */
    members: (state) => (roomId: string): RoomMemberRow[] =>
      state.membersByRoom[roomId] ?? [],

    roomById: (state) => (roomId: string): RoomRow | null =>
      state.rooms.find((room) => room.id === roomId) ?? null,
  },

  actions: {
    async create(input: CreateRoomInput): Promise<RoomRow> {
      const room = await createRoom(input);
      const idx = this.rooms.findIndex((existing) => existing.id === room.id);
      if (idx >= 0) this.rooms[idx] = room;
      else this.rooms = [room, ...this.rooms];
      return room;
    },

    async fetchRooms() {
      this.loadingRooms = true;
      try {
        const result = await listRooms();
        this.rooms = result.items;
      } finally {
        this.loadingRooms = false;
      }
    },

    async fetchRoom(roomId: string): Promise<RoomRow | null> {
      const room = this.rooms.find((existing) => existing.id === roomId) ?? null;
      return room;
    },

    async fetchMembers(roomId: string): Promise<RoomMemberRow[]> {
      const result = await listRoomMembers(roomId);
      this.membersByRoom[roomId] = result.items;
      return result.items;
    },

    async fetchMessages(roomId: string, before?: string) {
      const result = await listRoomMessages(roomId, { before });
      // Server returns newest-first; keep newest-last so a simple v-for
      // renders the timeline naturally (same convention as the 1:1 store).
      const ordered = [...result.items].reverse();
      if (before) {
        this.messagesByRoom[roomId] = [
          ...ordered,
          ...(this.messagesByRoom[roomId] ?? []),
        ];
      } else {
        this.messagesByRoom[roomId] = ordered;
      }
    },

    async sendText(roomId: string, body: string, meta?: MessageMeta) {
      const optimisticId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic: MessageRow = {
        id: optimisticId,
        conversation_id: '',
        room_id: roomId,
        sender_id: 'me',
        sender_nickname: '',
        body,
        attachments: [],
        sent_at: new Date().toISOString(),
        read_at: null,
        system_kind: null,
        meta,
      };
      const list = this.messagesByRoom[roomId] ?? [];
      this.messagesByRoom[roomId] = [...list, optimistic];

      try {
        const row = meta
          ? await sendRoomMessage(roomId, body, meta)
          : await sendRoomMessage(roomId, body);
        // SSE echoes the saved row back to the sender too, possibly before or
        // after this POST resolves — drop the optimistic, then append the
        // server row only if it isn't already present (dedup by real id).
        const buf = this.messagesByRoom[roomId] ?? [];
        const withoutOptimistic = buf.filter((message) => message.id !== optimisticId);
        const alreadyPresent = withoutOptimistic.some((message) => message.id === row.id);
        this.messagesByRoom[roomId] = alreadyPresent
          ? withoutOptimistic
          : [...withoutOptimistic, row];
        return row;
      } catch (err) {
        const buf = this.messagesByRoom[roomId] ?? [];
        this.messagesByRoom[roomId] = buf.filter(
          (message) => message.id !== optimisticId,
        );
        throw err;
      }
    },

    async markRead(roomId: string) {
      await markRoomRead(roomId);
      const target = this.rooms.find((room) => room.id === roomId);
      if (target) target.unread_count = 0;
    },

    async invite(roomId: string, nickname: string) {
      await inviteRoomMember(roomId, nickname);
    },

    async leave(roomId: string) {
      await leaveRoom(roomId);
      this.rooms = this.rooms.filter((room) => room.id !== roomId);
    },

    async removeMember(roomId: string, userId: string) {
      await removeRoomMember(roomId, userId);
      const current = this.membersByRoom[roomId];
      if (current) {
        this.membersByRoom[roomId] = current.filter(
          (member) => member.user_id !== userId,
        );
      }
    },

    /**
     * Route a stream event by `room_id`. Conversation-only events (no
     * `room_id`) are ignored here — they belong to `useMeinchatStore`. Both
     * stores receive every event off the single shared stream and each keeps
     * only the events addressed to it (mirror of conversation routing).
     */
    handleStreamEvent(event: RoomStreamEvent) {
      const roomId = event.message?.room_id ?? event.room_id;
      if (!roomId) return;

      if (event.type === 'message' && event.message) {
        const buf = this.messagesByRoom[roomId] ?? [];
        if (!buf.some((message) => message.id === event.message!.id)) {
          this.messagesByRoom[roomId] = [...buf, event.message];
        }
      } else if (event.type === 'message_deleted' && event.message_id) {
        const buf = this.messagesByRoom[roomId];
        if (buf) {
          this.messagesByRoom[roomId] = buf.filter(
            (message) => message.id !== event.message_id,
          );
        }
      } else if (event.type === 'read') {
        const target = this.rooms.find((room) => room.id === roomId);
        if (target) target.unread_count = 0;
      }
    },
  },
});
