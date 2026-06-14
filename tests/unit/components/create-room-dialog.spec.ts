import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// The dialog uses the nickname-search composable; stub it to a controllable
// results ref so the test drives selection without the network/debounce.
const results = { value: [] as Array<{ nickname: string; user_id: string }> };
vi.mock('../../../src/composables/useNicknameSearch', () => ({
  useNicknameSearch: () => ({
    query: { value: '' },
    results,
    loading: { value: false },
  }),
}));

import CreateRoomDialog from '../../../src/components/CreateRoomDialog.vue';

const i18nStub = { $t: (key: string) => key };

function mountDialog() {
  return mount(CreateRoomDialog, {
    global: { mocks: { $t: i18nStub.$t } },
  });
}

describe('CreateRoomDialog (S86.1 slice 2)', () => {
  beforeEach(() => {
    results.value = [
      { nickname: 'alice', user_id: 'u-a' },
      { nickname: 'bob', user_id: 'u-b' },
    ];
  });

  it('lets the user pick multiple members and emits create with their nicknames', async () => {
    const wrapper = mountDialog();
    const addButtons = wrapper.findAll('[data-testid="create-room-add"]');
    await addButtons[0].trigger('click'); // alice
    await addButtons[1].trigger('click'); // bob

    const chips = wrapper.findAll('[data-testid="create-room-chip"]');
    expect(chips).toHaveLength(2);

    await wrapper.find('[data-testid="create-room-name"]').setValue('Project X');
    await wrapper.find('[data-testid="create-room-submit"]').trigger('click');

    const emitted = wrapper.emitted('create');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual({
      member_nicknames: ['alice', 'bob'],
      name: 'Project X',
    });
  });

  it('disables submit until at least one member is picked', async () => {
    const wrapper = mountDialog();
    const submit = wrapper.find('[data-testid="create-room-submit"]');
    expect((submit.element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.findAll('[data-testid="create-room-add"]')[0].trigger('click');
    expect((submit.element as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits cancel from the cancel button', async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="create-room-cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });
});
