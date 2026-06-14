import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createRoom,
  listRooms,
  getRoom,
  listRoomMembers,
  listRoomMessages,
  sendRoomMessage,
  markRoomRead,
  inviteRoomMember,
  leaveRoom,
  removeRoomMember,
} from '../../src/api';

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('meinchat rooms api (S86.1 slice 2)', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'jwt-room');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('createRoom POSTs member_nicknames + accepted_protocols:[plain]', async () => {
    const fetchMock = stubFetch({ id: 'r1', name: 'Team', protocol: 'plain' }, 201);
    await createRoom({ member_nicknames: ['alice', 'bob'], name: 'Team' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messaging/rooms');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      member_nicknames: ['alice', 'bob'],
      name: 'Team',
      accepted_protocols: ['plain'],
    });
  });

  it('listRooms GETs the rooms list and returns {items}', async () => {
    const fetchMock = stubFetch({ items: [{ id: 'r1' }, { id: 'r2' }] });
    const result = await listRooms();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/messaging/rooms');
    expect(result.items).toHaveLength(2);
  });

  it('getRoom GETs a single room by id', async () => {
    const fetchMock = stubFetch({ id: 'r1' });
    await getRoom('r1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/messaging/rooms/r1');
  });

  it('listRoomMembers GETs members', async () => {
    const fetchMock = stubFetch({ items: [{ user_id: 'u1', role: 'admin', nickname: 'a' }] });
    await listRoomMembers('r1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/messaging/rooms/r1/members');
  });

  it('listRoomMessages GETs the room messages with before/limit', async () => {
    const fetchMock = stubFetch({ items: [] });
    await listRoomMessages('r1', { before: 'm9', limit: 20 });
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/v1/messaging/rooms/r1/messages?before=m9&limit=20',
    );
  });

  it('sendRoomMessage POSTs to the room message path', async () => {
    const fetchMock = stubFetch({ id: 'm1', room_id: 'r1', body: 'hi' });
    await sendRoomMessage('r1', 'hi');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messaging/rooms/r1/messages');
    expect(JSON.parse(init.body as string)).toEqual({ body: 'hi' });
  });

  it('markRoomRead POSTs to the read path', async () => {
    const fetchMock = stubFetch(undefined, 204);
    await markRoomRead('r1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messaging/rooms/r1/read');
    expect(init.method).toBe('POST');
  });

  it('inviteRoomMember POSTs {nickname}', async () => {
    const fetchMock = stubFetch({ ok: true });
    await inviteRoomMember('r1', 'carol');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messaging/rooms/r1/invite');
    expect(JSON.parse(init.body as string)).toEqual({ nickname: 'carol' });
  });

  it('leaveRoom POSTs to the leave path', async () => {
    const fetchMock = stubFetch(undefined, 204);
    await leaveRoom('r1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/messaging/rooms/r1/leave');
  });

  it('removeRoomMember DELETEs a member; a 403 surfaces the error body', async () => {
    stubFetch({ error: 'forbidden' }, 403);
    await expect(removeRoomMember('r1', 'u-bob')).rejects.toEqual({ error: 'forbidden' });
  });

  it('removeRoomMember DELETEs the member path on success', async () => {
    const fetchMock = stubFetch(undefined, 204);
    await removeRoomMember('r1', 'u-bob');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messaging/rooms/r1/members/u-bob');
    expect(init.method).toBe('DELETE');
  });
});
