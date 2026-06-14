import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  startWidgetConversation,
  listRoomMessages,
  sendRoomMessage,
  markRoomRead,
  mintStreamToken,
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

function authHeaderOf(init: { headers?: Record<string, string> }): string {
  return init.headers?.Authorization ?? '';
}

describe('meinchat widget api (S86.3 slice 3e)', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'app-session-token');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('startWidgetConversation POSTs widget_slug + display_name without auth by default', async () => {
    const fetchMock = stubFetch(
      { room_id: 'r1', self_nickname: 'guest_42', members: [] },
      201,
    );
    await startWidgetConversation({ widget_slug: 'chat-1', display_name: 'Sam' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messaging/widget/start');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      widget_slug: 'chat-1',
      display_name: 'Sam',
    });
  });

  it('startWidgetConversation presents a returning guest token as Authorization (D12)', async () => {
    const fetchMock = stubFetch({ room_id: 'r1', self_nickname: 'g', members: [] });
    await startWidgetConversation(
      { widget_slug: 'chat-1', display_name: 'Sam' },
      'guest-jwt-xyz',
    );
    expect(authHeaderOf(fetchMock.mock.calls[0][1])).toBe('Bearer guest-jwt-xyz');
  });

  it('room calls use an explicit guest token override instead of the app session', async () => {
    const fetchMock = stubFetch({ items: [] });
    await listRoomMessages('r1', {}, 'guest-jwt-xyz');
    expect(authHeaderOf(fetchMock.mock.calls[0][1])).toBe('Bearer guest-jwt-xyz');
  });

  it('sendRoomMessage forwards a guest token and surfaces 402 insufficient_tokens', async () => {
    stubFetch({ code: 'insufficient_tokens' }, 402);
    await expect(
      sendRoomMessage('r1', 'hello', undefined, 'guest-jwt-xyz'),
    ).rejects.toEqual({ code: 'insufficient_tokens' });
  });

  it('markRoomRead forwards a guest token override', async () => {
    const fetchMock = stubFetch(undefined, 204);
    await markRoomRead('r1', 'guest-jwt-xyz');
    expect(authHeaderOf(fetchMock.mock.calls[0][1])).toBe('Bearer guest-jwt-xyz');
  });

  it('mintStreamToken forwards a guest token override', async () => {
    const fetchMock = stubFetch({ stream_token: 's', ttl_seconds: 60 });
    await mintStreamToken('guest-jwt-xyz');
    expect(authHeaderOf(fetchMock.mock.calls[0][1])).toBe('Bearer guest-jwt-xyz');
  });

  it('room calls fall back to the app session token when no override is given', async () => {
    const fetchMock = stubFetch({ items: [] });
    await listRoomMessages('r1');
    expect(authHeaderOf(fetchMock.mock.calls[0][1])).toBe('Bearer app-session-token');
  });
});
