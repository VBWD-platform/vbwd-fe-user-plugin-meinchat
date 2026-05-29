/**
 * Persistent, encrypted-at-rest local message cache (S28.2 §2.1).
 *
 * Each cached row is sealed with AES-GCM-256 under the device KEK
 * (see ``loadKek``): the full ``MessageRow`` JSON (body, sender, sent_at,
 * cached_at) lives inside the ciphertext, so a raw filesystem read of the
 * IndexedDB store exposes no plaintext body bytes. Only ``cached_at`` is
 * stored OUTSIDE the seal, so the eviction sweep can age rows out without
 * decrypting anything.
 *
 * The cache is the conversation's persistent history; the SERVER remains
 * the source of truth (it prunes intentionally — S28.1). Cold-start of a
 * conversation paints from this cache first, then reconciles with the
 * server window.
 *
 * The KEK is injected (DI), never module-global — S28.3b swaps
 * ``loadKek()`` for the passphrase-derived key with zero change here.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MessageRow } from '../api';

export const MEINCHAT_CACHE_DB_NAME = 'meinchat-message-cache';
export const MEINCHAT_CACHE_STORE = 'messages';
const CACHED_AT_INDEX = 'cached_at';
const CACHE_DB_VERSION = 1;
const AES_GCM_IV_BYTES = 12;

/** A sealed row as it lives in IndexedDB. */
interface CachedMessageEnvelope {
  conversation_id: string;
  message_id: string;
  iv: Uint8Array; // 12 bytes
  ciphertext: ArrayBuffer; // AES-GCM-sealed JSON of the full MessageRow
  cached_at: number; // unix ms — outside the seal so eviction needs no decrypt
}

interface MeinchatCacheSchema extends DBSchema {
  [MEINCHAT_CACHE_STORE]: {
    key: [string, string];
    value: CachedMessageEnvelope;
    indexes: { [CACHED_AT_INDEX]: number };
  };
}

export interface LocalMessageCache {
  putMany(rows: MessageRow[]): Promise<void>;
  listByConversation(id: string, limit?: number): Promise<MessageRow[]>;
  removeByConversation(id: string): Promise<void>;
  evictOlderThan(ms: number): Promise<number>;
}

function openCacheDb(): Promise<IDBPDatabase<MeinchatCacheSchema>> {
  return openDB<MeinchatCacheSchema>(MEINCHAT_CACHE_DB_NAME, CACHE_DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(MEINCHAT_CACHE_STORE)) {
        const store = database.createObjectStore(MEINCHAT_CACHE_STORE, {
          keyPath: ['conversation_id', 'message_id'],
        });
        store.createIndex(CACHED_AT_INDEX, 'cached_at');
      }
    },
  });
}

function sentAtMillis(row: MessageRow): number {
  return row.sent_at ? Date.parse(row.sent_at) : 0;
}

export function useLocalMessageCache(
  kek: CryptoKey /* DI'd at boot */,
): LocalMessageCache {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function seal(
    row: MessageRow,
    cachedAt: number,
  ): Promise<CachedMessageEnvelope> {
    const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
    const plaintext = encoder.encode(JSON.stringify({ ...row, cached_at: cachedAt }));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      kek,
      plaintext,
    );
    return {
      conversation_id: row.conversation_id,
      message_id: row.id,
      iv,
      ciphertext,
      cached_at: cachedAt,
    };
  }

  async function open(envelope: CachedMessageEnvelope): Promise<MessageRow> {
    // Copy the IDB-restored bytes into a fresh ArrayBuffer-backed view so
    // the WebCrypto ``BufferSource`` typing is satisfied across TS lib
    // versions (the structured-clone result is otherwise ``ArrayBufferLike``).
    const initialisationVector = new Uint8Array(envelope.iv);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: initialisationVector },
      kek,
      envelope.ciphertext,
    );
    return JSON.parse(decoder.decode(plaintext)) as MessageRow;
  }

  return {
    async putMany(rows: MessageRow[]): Promise<void> {
      if (rows.length === 0) return;
      const cachedAt = Date.now();
      const envelopes = await Promise.all(
        rows.map((row) => seal(row, cachedAt)),
      );
      const database = await openCacheDb();
      try {
        const tx = database.transaction(MEINCHAT_CACHE_STORE, 'readwrite');
        // Last-write-wins per (conversation_id, message_id): put() replaces.
        await Promise.all(envelopes.map((envelope) => tx.store.put(envelope)));
        await tx.done;
      } finally {
        database.close();
      }
    },

    async listByConversation(
      id: string,
      limit?: number,
    ): Promise<MessageRow[]> {
      const database = await openCacheDb();
      try {
        const envelopes = await database.getAll(
          MEINCHAT_CACHE_STORE,
          IDBKeyRange.bound([id], [id, []]),
        );
        const rows = await Promise.all(envelopes.map((env) => open(env)));
        rows.sort((left, right) => sentAtMillis(left) - sentAtMillis(right));
        return typeof limit === 'number' ? rows.slice(-limit) : rows;
      } finally {
        database.close();
      }
    },

    async removeByConversation(id: string): Promise<void> {
      const database = await openCacheDb();
      try {
        await database.delete(
          MEINCHAT_CACHE_STORE,
          IDBKeyRange.bound([id], [id, []]),
        );
      } finally {
        database.close();
      }
    },

    async evictOlderThan(ms: number): Promise<number> {
      const database = await openCacheDb();
      try {
        const tx = database.transaction(MEINCHAT_CACHE_STORE, 'readwrite');
        const index = tx.store.index(CACHED_AT_INDEX);
        // upperBound exclusive: strictly cached_at < ms.
        const range = IDBKeyRange.upperBound(ms, true);
        let deleted = 0;
        let cursor = await index.openCursor(range);
        while (cursor) {
          await cursor.delete();
          deleted += 1;
          cursor = await cursor.continue();
        }
        await tx.done;
        return deleted;
      } finally {
        database.close();
      }
    },
  };
}
