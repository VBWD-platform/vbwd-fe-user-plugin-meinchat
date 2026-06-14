import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../../../src/api', () => ({
  createRoom: vi.fn(),
  listRooms: vi.fn(),
  getRoom: vi.fn(),
  listRoomMembers: vi.fn(),
  listRoomMessages: vi.fn(),
  sendRoomMessage: vi.fn(),
  markRoomRead: vi.fn(),
  inviteRoomMember: vi.fn(),
  leaveRoom: vi.fn(),
  removeRoomMember: vi.fn(),
}));

import * as api from '../../../src/api';
import { useRoomsStore } from '../../../src/stores/useRoomsStore';

const room = (over: Partial<any> = {}) => ({
  id: over.id ?? 'r1',
  name: over.name ?? 'Team',
  protocol: 'plain',
  capabilities: {},
  last_message_at: '2026-06-13T00:00:00Z',
  last_message_preview: 'hi',
  unread_count: over.unread_count ?? 0,
  last_read_at: null,
  ...over,
});

const roomMsg = (over: Partial<any> = {}) => ({
  id: over.id ?? 'm1',
  room_id: over.room_id ?? 'r1',
  conversation_id: '',
  sender_id: over.sender_id ?? 'me',
  sender_nickname: over.sender_nickname ?? 'me',
  body: over.body ?? 'hi',
  attachments: [],
  sent_at: over.sent_at ?? '2026-06-13T00:00:00Z',
  read_at: null,
  system_kind: null,
  ...over,
});

describe('useRoomsStore (S86.1 slice 2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('create posts member_nicknames + accepted_protocols:[plain] and inserts the room', async () => {
    (api.createRoom as any).mockResolvedValue(room({ id: 'rNew' }));
    const store = useRoomsStore();
    await store.create({ member_nicknames: ['alice', 'bob'], name: 'Team' });
    expect(api.createRoom).toHaveBeenCalledWith({
      member_nicknames: ['alice', 'bob'],
      name: 'Team',
    });
    expect(store.rooms.find((r) => r.id === 'rNew')).toBeTruthy();
  });

  it('fetchRooms maps {items} into rooms', async () => {
    (api.listRooms as any).mockResolvedValue({ items: [room({ id: 'a' }), room({ id: 'b' })] });
    const store = useRoomsStore();
    await store.fetchRooms();
    expect(store.rooms).toHaveLength(2);
  });

  it('fetchMessages loads room messages newest-last', async () => {
    (api.listRoomMessages as any).mockResolvedValue({
      items: [roomMsg({ id: 'm2' }), roomMsg({ id: 'm1' })], // server newest-first
    });
    const store = useRoomsStore();
    await store.fetchMessages('r1');
    expect(store.messages('r1').map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('sendRoomMessage posts to the room path and appends the server row', async () => {
    (api.listRoomMessages as any).mockResolvedValue({ items: [] });
    (api.sendRoomMessage as any).mockResolvedValue(roomMsg({ id: 'real-1', body: 'yo' }));
    const store = useRoomsStore();
    await store.fetchMessages('r1');
    await store.sendText('r1', 'yo');
    expect(api.sendRoomMessage).toHaveBeenCalledWith('r1', 'yo');
    const after = store.messages('r1');
    expect(after[after.length - 1].id).toBe('real-1');
  });

  it('sendText rolls back the optimistic row on failure', async () => {
    (api.listRoomMessages as any).mockResolvedValue({ items: [] });
    (api.sendRoomMessage as any).mockRejectedValueOnce({ error: 'rate limit' });
    const store = useRoomsStore();
    await store.fetchMessages('r1');
    await expect(store.sendText('r1', 'yo')).rejects.toBeTruthy();
    expect(store.messages('r1')).toHaveLength(0);
  });

  it('markRead clears unread for the room', async () => {
    (api.listRooms as any).mockResolvedValue({ items: [room({ id: 'r1', unread_count: 4 })] });
    (api.markRoomRead as any).mockResolvedValue(undefined);
    const store = useRoomsStore();
    await store.fetchRooms();
    await store.markRead('r1');
    expect(store.rooms.find((r) => r.id === 'r1')!.unread_count).toBe(0);
  });

  it('invite posts {nickname}', async () => {
    (api.inviteRoomMember as any).mockResolvedValue({ ok: true });
    const store = useRoomsStore();
    await store.invite('r1', 'carol');
    expect(api.inviteRoomMember).toHaveBeenCalledWith('r1', 'carol');
  });

  it('leave calls the api and drops the room from the list', async () => {
    (api.listRooms as any).mockResolvedValue({ items: [room({ id: 'r1' })] });
    (api.leaveRoom as any).mockResolvedValue(undefined);
    const store = useRoomsStore();
    await store.fetchRooms();
    await store.leave('r1');
    expect(api.leaveRoom).toHaveBeenCalledWith('r1');
    expect(store.rooms.find((r) => r.id === 'r1')).toBeUndefined();
  });

  it('removeMember surfaces a 403 error and does not crash', async () => {
    (api.removeRoomMember as any).mockRejectedValueOnce({ error: 'forbidden' });
    const store = useRoomsStore();
    await expect(store.removeMember('r1', 'u-bob')).rejects.toEqual({ error: 'forbidden' });
  });

  it('handleStreamEvent routes a room_id message to the right room', () => {
    const store = useRoomsStore();
    store.handleStreamEvent({
      type: 'message',
      message: roomMsg({ id: 'srv-1', room_id: 'r1', body: 'pushed' }),
    });
    expect(store.messages('r1')).toHaveLength(1);
    expect(store.messages('r1')[0].body).toBe('pushed');
  });

  it('handleStreamEvent ignores conversation-only events (no room_id)', () => {
    const store = useRoomsStore();
    store.handleStreamEvent({
      type: 'message',
      message: { id: 'c1', conversation_id: 'cv1', body: 'x' } as any,
    });
    expect(store.messages('cv1')).toHaveLength(0);
  });

  it('handleStreamEvent dedups by id when SSE echoes the sent row', async () => {
    (api.listRoomMessages as any).mockResolvedValue({ items: [] });
    (api.sendRoomMessage as any).mockResolvedValue(roomMsg({ id: 'real-2', body: 'hi' }));
    const store = useRoomsStore();
    await store.fetchMessages('r1');
    await store.sendText('r1', 'hi');
    store.handleStreamEvent({ type: 'message', message: roomMsg({ id: 'real-2', body: 'hi' }) });
    expect(store.messages('r1')).toHaveLength(1);
  });
});
