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
  attachment_url: null,
  attachment_thumb_url: null,
  attachment_width_px: null,
  attachment_height_px: null,
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
