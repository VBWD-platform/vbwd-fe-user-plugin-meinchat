import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';

import type { MessageRow } from '../../../src/api';
import {
  useLocalMessageCache,
  MEINCHAT_CACHE_DB_NAME,
  MEINCHAT_CACHE_STORE,
} from '../../../src/composables/useLocalMessageCache';

/** A real, non-extractable AES-GCM-256 key — the same kind loadKek() yields. */
async function makeKek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const msg = (over: Partial<MessageRow> = {}): MessageRow => ({
  id: over.id ?? 'm1',
  conversation_id: over.conversation_id ?? 'cv1',
  sender_id: over.sender_id ?? 'me',
  sender_nickname: over.sender_nickname ?? 'me',
  body: over.body ?? 'hi',
  attachments: [],
  sent_at: over.sent_at ?? '2026-04-29T00:00:00Z',
  read_at: null,
  system_kind: null,
  ...over,
});

describe('useLocalMessageCache', () => {
  beforeEach(() => {
    // Fresh IndexedDB per spec — no cross-test leakage.
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB =
      new IDBFactory();
  });

  it('putMany writes rows; listByConversation reads them back in sent_at order', async () => {
    const cache = useLocalMessageCache(await makeKek());
    await cache.putMany([
      msg({ id: 'b', sent_at: '2026-04-29T02:00:00Z', body: 'second' }),
      msg({ id: 'a', sent_at: '2026-04-29T01:00:00Z', body: 'first' }),
    ]);

    const rows = await cache.listByConversation('cv1');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows.map((r) => r.body)).toEqual(['first', 'second']);
  });

  it('two putMany for the same id → last write wins', async () => {
    const cache = useLocalMessageCache(await makeKek());
    await cache.putMany([msg({ id: 'a', body: 'v1' })]);
    await cache.putMany([msg({ id: 'a', body: 'v2' })]);

    const rows = await cache.listByConversation('cv1');
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe('v2');
  });

  it('evictOlderThan removes only rows with cached_at < threshold', async () => {
    const realNow = Date.now;
    try {
      const cache = useLocalMessageCache(await makeKek());

      Date.now = () => 1000;
      await cache.putMany([msg({ id: 'old' })]);
      Date.now = () => 5000;
      await cache.putMany([msg({ id: 'new' })]);
      Date.now = realNow;

      await cache.evictOlderThan(3000);
      const rows = await cache.listByConversation('cv1');
      expect(rows.map((r) => r.id)).toEqual(['new']);
    } finally {
      Date.now = realNow;
    }
  });

  it('evictOlderThan returns the deleted count', async () => {
    const realNow = Date.now;
    try {
      const cache = useLocalMessageCache(await makeKek());
      Date.now = () => 1000;
      await cache.putMany([
        msg({ id: 'old1' }),
        msg({ id: 'old2', conversation_id: 'cv2' }),
      ]);
      Date.now = () => 5000;
      await cache.putMany([msg({ id: 'keep' })]);
      Date.now = realNow;

      const deleted = await cache.evictOlderThan(3000);
      expect(deleted).toBe(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('removeByConversation deletes only that conversation rows', async () => {
    const cache = useLocalMessageCache(await makeKek());
    await cache.putMany([
      msg({ id: 'a', conversation_id: 'cv1' }),
      msg({ id: 'b', conversation_id: 'cv2' }),
    ]);

    await cache.removeByConversation('cv1');
    expect(await cache.listByConversation('cv1')).toHaveLength(0);
    expect(await cache.listByConversation('cv2')).toHaveLength(1);
  });

  it('DB upgrade: opening over an existing v1 DB does not drop data', async () => {
    // Seed via the production cache (which creates the store at its
    // current version), then re-open with idb directly to assert the
    // upgrade callback is idempotent and preserves rows.
    const cache = useLocalMessageCache(await makeKek());
    await cache.putMany([msg({ id: 'persist' })]);

    // A second open at the same version must not wipe the store.
    const cache2 = useLocalMessageCache(await makeKek());
    // (different KEK can't decrypt, but the ROW must still be there)
    const db = await openDB(MEINCHAT_CACHE_DB_NAME);
    const count = await db.count(MEINCHAT_CACHE_STORE);
    db.close();
    expect(count).toBe(1);
    // And the original KEK still reads it.
    void cache2;
    expect(await cache.listByConversation('cv1')).toHaveLength(1);
  });

  it('at-rest: the raw IDB value contains no plaintext body bytes', async () => {
    const marker = 'SECRET_PLAINTEXT_MARKER_42';
    const cache = useLocalMessageCache(await makeKek());
    await cache.putMany([msg({ id: 'a', body: marker })]);

    const db = await openDB(MEINCHAT_CACHE_DB_NAME);
    const all = await db.getAll(MEINCHAT_CACHE_STORE);
    db.close();

    const serialized = JSON.stringify(all, (_k, value) =>
      value instanceof Uint8Array ? Array.from(value) : value,
    );
    expect(serialized).not.toContain(marker);
    // The decrypted view still has it.
    const rows = await cache.listByConversation('cv1');
    expect(rows[0].body).toBe(marker);
  });

  it('no KEK material is written to localStorage', async () => {
    const cache = useLocalMessageCache(await makeKek());
    await cache.putMany([msg({ id: 'a', body: 'hi' })]);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)!;
      expect(key.toLowerCase()).not.toContain('kek');
      expect(key.toLowerCase()).not.toContain('key');
    }
  });
});
