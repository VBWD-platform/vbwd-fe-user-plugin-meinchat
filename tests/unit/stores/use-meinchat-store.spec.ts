import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../../../src/api', () => ({
  listConversations: vi.fn(),
  startOrGetConversation: vi.fn(),
  listMessages: vi.fn(),
  sendTextMessage: vi.fn(),
  sendAttachmentMessage: vi.fn(),
  markConversationRead: vi.fn(),
  deleteMessage: vi.fn(),
}));

import * as api from '../../../src/api';
import { useMeinchatStore } from '../../../src/stores/useMeinchatStore';

const conv = (over: Partial<any> = {}) => ({
  id: over.id ?? 'cv1',
  peer_user_id: 'u-bob',
  peer_nickname: 'bob',
  last_message_at: '2026-04-29T00:00:00Z',
  last_message_preview: 'hi',
  unread_count: 0,
  ...over,
});

const msg = (over: Partial<any> = {}) => ({
  id: over.id ?? 'm1',
  conversation_id: over.conversation_id ?? 'cv1',
  sender_id: over.sender_id ?? 'me',
  sender_nickname: over.sender_nickname ?? 'me',
  body: over.body ?? 'hi',
  attachments: [],
  sent_at: over.sent_at ?? '2026-04-29T00:00:00Z',
  read_at: null,
  system_kind: over.system_kind ?? null,
  ...over,
});

describe('useMeinchatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('fetchConversations populates inbox', async () => {
    (api.listConversations as any).mockResolvedValue({
      items: [conv({ id: 'a' }), conv({ id: 'b' })],
    });
    const store = useMeinchatStore();
    await store.fetchConversations();
    expect(store.conversations).toHaveLength(2);
  });

  it('totalUnread sums per-conversation unread_count', async () => {
    (api.listConversations as any).mockResolvedValue({
      items: [
        conv({ id: 'a', unread_count: 3 }),
        conv({ id: 'b', unread_count: 5 }),
      ],
    });
    const store = useMeinchatStore();
    await store.fetchConversations();
    expect(store.totalUnread).toBe(8);
  });

  it('sendText optimistically appends, then replaces with server row', async () => {
    (api.listMessages as any).mockResolvedValue({ items: [] });
    (api.sendTextMessage as any).mockResolvedValue(msg({ id: 'real-1', body: 'hi' }));
    const store = useMeinchatStore();
    await store.fetchMessages('cv1');
    const before = store.messages('cv1').length;
    await store.sendText('cv1', 'hi');

    const after = store.messages('cv1');
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].id).toBe('real-1');
  });

  it('sendText rolls back the optimistic row on failure', async () => {
    (api.listMessages as any).mockResolvedValue({ items: [] });
    (api.sendTextMessage as any).mockRejectedValueOnce({ error: 'rate limit' });
    const store = useMeinchatStore();
    await store.fetchMessages('cv1');

    await expect(store.sendText('cv1', 'hi')).rejects.toBeTruthy();
    expect(store.messages('cv1')).toHaveLength(0);
  });

  it('sendText: SSE echo BEFORE POST resolves — exactly one server row in buf', async () => {
    // Regression: the sender used to see their message twice because the
    // SSE stream broadcasts the saved row back, then the POST response
    // tried to replace the optimistic placeholder — producing two server
    // rows when the SSE had already added one.
    (api.listMessages as any).mockResolvedValue({ items: [] });

    let resolveSend: (row: any) => void = () => undefined;
    (api.sendTextMessage as any).mockReturnValue(
      new Promise((res) => {
        resolveSend = res;
      }),
    );

    const store = useMeinchatStore();
    await store.fetchMessages('cv1');

    const pending = store.sendText('cv1', 'hi');
    // POST still in-flight — buf has the optimistic placeholder.
    expect(store.messages('cv1')).toHaveLength(1);

    // SSE arrives first with the real server row.
    store.handleStreamEvent({
      type: 'message',
      message: msg({ id: 'real-1', body: 'hi' }) as any,
    } as any);

    // Now the POST resolves with the same server row.
    resolveSend(msg({ id: 'real-1', body: 'hi' }));
    await pending;

    const after = store.messages('cv1');
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe('real-1');
  });

  it('sendText: POST resolves before SSE — SSE dedup keeps exactly one row', async () => {
    (api.listMessages as any).mockResolvedValue({ items: [] });
    (api.sendTextMessage as any).mockResolvedValue(msg({ id: 'real-2', body: 'hi' }));

    const store = useMeinchatStore();
    await store.fetchMessages('cv1');
    await store.sendText('cv1', 'hi');

    // SSE arrives AFTER the POST — the server row is already in buf.
    store.handleStreamEvent({
      type: 'message',
      message: msg({ id: 'real-2', body: 'hi' }) as any,
    } as any);

    const after = store.messages('cv1');
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe('real-2');
  });

  it('sendAttachment dedups when SSE has already inserted the same row', async () => {
    (api.listMessages as any).mockResolvedValue({ items: [] });
    const serverRow = msg({ id: 'real-3', body: 'pic' });
    (api.sendAttachmentMessage as any).mockResolvedValue(serverRow);

    const store = useMeinchatStore();
    await store.fetchMessages('cv1');

    // Simulate SSE arriving first (no optimistic was inserted for attachments).
    store.handleStreamEvent({
      type: 'message',
      message: serverRow as any,
    } as any);
    expect(store.messages('cv1')).toHaveLength(1);

    // sendAttachment resolves with the same row — must not duplicate.
    await store.sendAttachment('cv1', new File(['x'], 'x.jpg'));
    expect(store.messages('cv1')).toHaveLength(1);
  });

  it('handleStreamEvent[type=message] inserts new message into the cache', () => {
    const store = useMeinchatStore();
    store.handleStreamEvent({
      type: 'message',
      message: msg({ id: 'srv-1', conversation_id: 'cv1', body: 'pushed' }),
    });
    expect(store.messages('cv1')).toHaveLength(1);
    expect(store.messages('cv1')[0].body).toBe('pushed');
  });

  it('handleStreamEvent[type=message_deleted] removes the message', () => {
    const store = useMeinchatStore();
    store.handleStreamEvent({
      type: 'message',
      message: msg({ id: 'gone', conversation_id: 'cv1' }),
    });
    store.handleStreamEvent({
      type: 'message_deleted',
      conversation_id: 'cv1',
      message_id: 'gone',
    });
    expect(store.messages('cv1')).toHaveLength(0);
  });

  it('sendAction sends the label as body + a bot_action meta through the send path', async () => {
    // S70.1 — tapping a bot-choice card reuses the existing text-send path
    // (DRY: no parallel transport) with the action_data in `meta`.
    (api.listMessages as any).mockResolvedValue({ items: [] });
    (api.sendTextMessage as any).mockResolvedValue(
      msg({ id: 'act-1', body: 'Pro' }),
    );
    const store = useMeinchatStore();
    await store.fetchMessages('cv1');

    await store.sendAction('cv1', {
      label: 'Pro',
      action_data: 'subscription:plan:2',
      hint: '€29/mo',
    });

    expect(api.sendTextMessage).toHaveBeenCalledWith('cv1', 'Pro', {
      kind: 'bot_action',
      action_data: 'subscription:plan:2',
    });
    const after = store.messages('cv1');
    expect(after[after.length - 1].id).toBe('act-1');
  });

  it('markRead clears unread_count for the conversation', async () => {
    (api.listConversations as any).mockResolvedValue({
      items: [conv({ id: 'cv1', unread_count: 4 })],
    });
    (api.markConversationRead as any).mockResolvedValue(undefined);
    const store = useMeinchatStore();
    await store.fetchConversations();
    await store.markRead('cv1');
    expect(store.conversations.find((c) => c.id === 'cv1')!.unread_count).toBe(0);
  });
});
