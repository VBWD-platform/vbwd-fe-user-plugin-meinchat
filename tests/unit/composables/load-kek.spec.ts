import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { loadKek } from '../../../src/composables/loadKek';

describe('loadKek (phase-1 device-bound KEK)', () => {
  beforeEach(() => {
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB =
      new IDBFactory();
    localStorage.clear();
  });

  it('returns a non-extractable AES-GCM CryptoKey', async () => {
    const kek = await loadKek();
    expect(kek).toBeInstanceOf(CryptoKey);
    expect(kek.extractable).toBe(false);
    expect(kek.algorithm.name).toBe('AES-GCM');
  });

  it('is stable across boots — second load returns the same persisted key', async () => {
    const first = await loadKek();
    const second = await loadKek();
    // Same key seals + opens: encrypt under first, decrypt under second.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      first,
      new TextEncoder().encode('roundtrip'),
    );
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      second,
      sealed,
    );
    expect(new TextDecoder().decode(opened)).toBe('roundtrip');
  });

  it('never writes key material to localStorage', async () => {
    await loadKek();
    expect(localStorage.length).toBe(0);
  });
});
