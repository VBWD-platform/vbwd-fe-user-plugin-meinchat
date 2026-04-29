import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../../../src/api', () => ({
  listContacts: vi.fn(),
  addContact: vi.fn(),
  patchContact: vi.fn(),
  deleteContact: vi.fn(),
}));

import * as api from '../../../src/api';
import { useContactsStore } from '../../../src/stores/useContactsStore';

const sample = (over: Partial<any> = {}) => ({
  id: over.id ?? 'c1',
  owner_user_id: 'me',
  contact_user_id: 'u-' + (over.id ?? 'c1'),
  alias: over.alias ?? null,
  note: null,
  pinned: over.pinned ?? false,
  added_at: '2026-04-29T00:00:00Z',
  peer_nickname: over.peer_nickname ?? 'peer',
  ...over,
});

describe('useContactsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('fetch populates items', async () => {
    (api.listContacts as any).mockResolvedValue({
      items: [sample({ id: 'a' }), sample({ id: 'b' })],
    });
    const store = useContactsStore();
    await store.fetch();
    expect(store.items).toHaveLength(2);
  });

  it('sorted getter pins first then alphabetical by alias-or-nickname', async () => {
    (api.listContacts as any).mockResolvedValue({
      items: [
        sample({ id: 'a', peer_nickname: 'charlie', pinned: false }),
        sample({ id: 'b', peer_nickname: 'alice', pinned: false }),
        sample({ id: 'c', peer_nickname: 'bob', pinned: true }),
        sample({ id: 'd', alias: 'Aaron', peer_nickname: 'zach', pinned: false }),
      ],
    });
    const store = useContactsStore();
    await store.fetch();

    expect(store.sorted.map((row) => row.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('add prepends the new contact to items', async () => {
    (api.listContacts as any).mockResolvedValue({ items: [] });
    (api.addContact as any).mockResolvedValue(
      sample({ id: 'new', peer_nickname: 'newpeer' }),
    );
    const store = useContactsStore();
    await store.fetch();
    await store.add({ nickname: 'newpeer' });

    expect(store.items[0].id).toBe('new');
  });

  it('togglePin flips the local pinned flag and calls patchContact', async () => {
    (api.listContacts as any).mockResolvedValue({
      items: [sample({ id: 'x', pinned: false })],
    });
    (api.patchContact as any).mockResolvedValue(
      sample({ id: 'x', pinned: true }),
    );
    const store = useContactsStore();
    await store.fetch();
    await store.togglePin('x');

    expect(store.items.find((c) => c.id === 'x')!.pinned).toBe(true);
    expect(api.patchContact).toHaveBeenCalledWith('x', { pinned: true });
  });

  it('remove deletes the contact locally + via api', async () => {
    (api.listContacts as any).mockResolvedValue({
      items: [sample({ id: 'x' }), sample({ id: 'y' })],
    });
    (api.deleteContact as any).mockResolvedValue(undefined);
    const store = useContactsStore();
    await store.fetch();
    await store.remove('x');

    expect(store.items.map((c) => c.id)).toEqual(['y']);
    expect(api.deleteContact).toHaveBeenCalledWith('x');
  });
});
