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
import type { MessageRow } from '../../../src/api';
import { useMeinchatStore } from '../../../src/stores/useMeinchatStore';
import type { LocalMessageCache } from '../../../src/composables/useLocalMessageCache';

const msg = (over: Partial<MessageRow> = {}): MessageRow => ({
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
  system_kind: null,
  ...over,
});

/** In-memory cache fake that honours the LocalMessageCache contract. */
function fakeCache(seed: MessageRow[] = []): LocalMessageCache & {
  putManyCalls: MessageRow[][];
} {
  let rows = [...seed];
  const putManyCalls: MessageRow[][] = [];
  return {
    putManyCalls,
    async putMany(incoming) {
      putManyCalls.push(incoming);
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const row of incoming) byId.set(row.id, row);
      rows = [...byId.values()];
    },
    async listByConversation(id) {
      return rows.filter((r) => r.conversation_id === id);
    },
    async removeByConversation(id) {
      rows = rows.filter((r) => r.conversation_id !== id);
    },
    async evictOlderThan() {
      return 0;
    },
  };
}

const CONV = {
  id: 'cv1',
  peer_user_id: 'u-bob',
  peer_nickname: 'bob',
  last_message_at: null,
  last_message_preview: null,
  unread_count: 0,
};

describe('useMeinchatStore with local cache (DI)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('openConversation paints cached rows before the server response', async () => {
    (api.startOrGetConversation as any).mockResolvedValue(CONV);

    let resolveList: (value: { items: MessageRow[] }) => void = () => undefined;
    (api.listMessages as any).mockReturnValue(
      new Promise((res) => {
        resolveList = res;
      }),
    );

    const cache = fakeCache([msg({ id: 'cached-1', body: 'from cache' })]);
    const store = useMeinchatStore();
    store.boot({ cache });

    const pending = store.openConversation('bob');
    // Let the conv-id resolve + cache read + paint settle while the server
    // fetch hangs (several microtask ticks: startOrGetConversation, then
    // listByConversation, then the state write).
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
    expect(store.messages('cv1').map((m) => m.id)).toEqual(['cached-1']);

    resolveList({ items: [msg({ id: 'server-1', body: 'from server' })] });
    await pending;
  });

  it('server rows merge by id; duplicates are not added', async () => {
    (api.startOrGetConversation as any).mockResolvedValue(CONV);
    (api.listMessages as any).mockResolvedValue({
      items: [msg({ id: 'shared', body: 'server' })],
    });

    const cache = fakeCache([msg({ id: 'shared', body: 'cache' })]);
    const store = useMeinchatStore();
    store.boot({ cache });

    await store.openConversation('bob');
    const rows = store.messages('cv1');
    expect(rows.filter((m) => m.id === 'shared')).toHaveLength(1);
  });

  it('putMany is called with the server rows after a fetch', async () => {
    (api.startOrGetConversation as any).mockResolvedValue(CONV);
    const serverRows = [msg({ id: 'srv-a' }), msg({ id: 'srv-b' })];
    (api.listMessages as any).mockResolvedValue({ items: serverRows });

    const cache = fakeCache();
    const store = useMeinchatStore();
    store.boot({ cache });

    await store.openConversation('bob');
    expect(cache.putManyCalls.length).toBe(1);
    expect(cache.putManyCalls[0].map((m) => m.id).sort()).toEqual([
      'srv-a',
      'srv-b',
    ]);
  });

  it('without boot() (no cache injected), openConversation still works', async () => {
    (api.startOrGetConversation as any).mockResolvedValue(CONV);
    (api.listMessages as any).mockResolvedValue({
      items: [msg({ id: 'srv-1' })],
    });
    const store = useMeinchatStore();
    const conv = await store.openConversation('bob');
    expect(conv.id).toBe('cv1');
    expect(store.messages('cv1').map((m) => m.id)).toEqual(['srv-1']);
  });
});
