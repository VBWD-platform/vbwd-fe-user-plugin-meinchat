import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../../src/api', () => ({
  searchNicknames: vi.fn(),
}));

import * as api from '../../../src/api';
import NicknameAvailabilityIndicator from '../../../src/components/NicknameAvailabilityIndicator.vue';

describe('NicknameAvailabilityIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty when nickname is too short', () => {
    const wrapper = mount(NicknameAvailabilityIndicator, {
      props: { nickname: 'ab', currentNickname: '' },
    });
    expect(wrapper.text()).toBe('');
  });

  it('shows "available" when no exact match comes back', async () => {
    (api.searchNicknames as any).mockResolvedValue({ items: [] });
    const wrapper = mount(NicknameAvailabilityIndicator, {
      props: { nickname: 'newone', currentNickname: '' },
    });
    // Allow the debounced + awaited call to resolve.
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(wrapper.text().toLowerCase()).toContain('available');
  });

  it('shows "taken" when an exact match comes back from another user', async () => {
    (api.searchNicknames as any).mockResolvedValue({
      items: [{ nickname: 'newone', user_id: 'someone-else' }],
    });
    const wrapper = mount(NicknameAvailabilityIndicator, {
      props: { nickname: 'newone', currentNickname: '' },
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(wrapper.text().toLowerCase()).toContain('taken');
  });

  it('treats the user\'s own current nickname as a no-op (no warning)', async () => {
    const wrapper = mount(NicknameAvailabilityIndicator, {
      props: { nickname: 'mine', currentNickname: 'mine' },
    });
    await flushPromises();
    expect(wrapper.text()).toBe('');
    expect(api.searchNicknames).not.toHaveBeenCalled();
  });
});
