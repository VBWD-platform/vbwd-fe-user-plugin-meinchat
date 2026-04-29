import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../../../src/api', () => ({
  getMyNickname: vi.fn(),
  setMyNickname: vi.fn(),
}));

import * as api from '../../../src/api';
import { useNicknameStore } from '../../../src/stores/useNicknameStore';

describe('useNicknameStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('starts with nickname=null and loading=false', () => {
    const store = useNicknameStore();
    expect(store.nickname).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('loads nickname from API and stores it', async () => {
    (api.getMyNickname as any).mockResolvedValue({ nickname: 'alice' });
    const store = useNicknameStore();
    await store.fetchMine();
    expect(store.nickname).toBe('alice');
    expect(store.loading).toBe(false);
  });

  it('updates nickname optimistically and rolls back on failure', async () => {
    (api.setMyNickname as any).mockRejectedValueOnce({ error: 'taken' });
    const store = useNicknameStore();
    store.$patch({ nickname: 'oldnick' });

    await expect(store.update('newnick')).rejects.toBeTruthy();
    expect(store.nickname).toBe('oldnick');  // rolled back
  });

  it('persists new nickname on success', async () => {
    (api.setMyNickname as any).mockResolvedValue({
      id: 'x',
      nickname: 'newnick',
      banned: false,
      banned_at: null,
      search_hidden: false,
      set_at: null,
      user_id: 'u',
    });
    const store = useNicknameStore();
    await store.update('newnick');
    expect(store.nickname).toBe('newnick');
  });
});
