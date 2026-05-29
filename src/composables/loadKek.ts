/**
 * Phase-1 device-bound KEK. S28.3b replaces this with the
 * passphrase-derived Argon2id KEK; the cache API is unchanged.
 *
 * Produces a single per-device AES-GCM-256 key used to seal every cached
 * message row (see ``useLocalMessageCache``). The key is generated
 * **non-extractable** — its raw bytes are never exposed to JS nor written
 * as plaintext — and the ``CryptoKey`` object itself is persisted in
 * IndexedDB (CryptoKey is structured-cloneable). A filesystem-only
 * adversary therefore cannot recover the key material; this satisfies the
 * phase-1 at-rest acceptance ("raw IDB read has no plaintext body bytes").
 *
 * There is no passphrase and no Argon2id here. The DI seam is
 * ``useLocalMessageCache(kek)`` — when S28.3b lands, only this loader
 * changes (it returns the passphrase-derived key); callers and the cache
 * are untouched.
 */
import { openDB } from 'idb';

const KEK_DB_NAME = 'meinchat-kek';
const KEK_STORE = 'kek';
const KEK_RECORD_KEY = 'device-kek';

async function openKekDb() {
  return openDB(KEK_DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(KEK_STORE)) {
        database.createObjectStore(KEK_STORE);
      }
    },
  });
}

/**
 * Returns the device-bound cache KEK, generating + persisting it on first
 * boot and reading it back on subsequent boots.
 */
export async function loadKek(): Promise<CryptoKey> {
  const database = await openKekDb();
  try {
    const existing = (await database.get(KEK_STORE, KEK_RECORD_KEY)) as
      | CryptoKey
      | undefined;
    if (existing) return existing;

    const generated = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false /* non-extractable */,
      ['encrypt', 'decrypt'],
    );
    await database.put(KEK_STORE, generated, KEK_RECORD_KEY);
    return generated;
  } finally {
    database.close();
  }
}
