import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../../../src/api', () => ({
  listConversations: vi.fn().mockResolvedValue({ items: [] }),
  startOrGetConversation: vi.fn(),
  listMessages: vi.fn(),
  sendTextMessage: vi.fn(),
  sendAttachmentMessage: vi.fn(),
  markConversationRead: vi.fn(),
  deleteMessage: vi.fn(),
  createRoom: vi.fn(),
  listRooms: vi.fn(),
  getRoom: vi.fn(),
  listRoomMembers: vi.fn(),
  listRoomMessages: vi.fn(),
  sendRoomMessage: vi.fn(),
  markRoomRead: vi.fn(),
  inviteRoomMember: vi.fn(),
  leaveRoom: vi.fn(),
  removeRoomMember: vi.fn(),
}));

const routerStub = { push: vi.fn() };
vi.mock('vue-router', () => ({
  useRouter: () => routerStub,
}));

import * as api from '../../../src/api';
import InboxView from '../../../src/views/InboxView.vue';

const i18nStub = { $t: (key: string) => key };

const room = (over: Partial<any> = {}) => ({
  id: over.id ?? 'r1',
  name: over.name ?? 'Team',
  protocol: 'plain',
  capabilities: {},
  last_message_at: '2026-06-13T00:00:00Z',
  last_message_preview: 'hi',
  unread_count: over.unread_count ?? 0,
  last_read_at: null,
  ...over,
});

async function flush() {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
}

describe('InboxView rooms (S86.1 slice 2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    routerStub.push.mockClear();
    (api.listConversations as any).mockResolvedValue({ items: [] });
    (api.listRooms as any).mockResolvedValue({ items: [room({ id: 'r1', unread_count: 2 })] });
  });

  it('renders a room row with its unread badge', async () => {
    const wrapper = mount(InboxView, { global: { mocks: { $t: i18nStub.$t } } });
    await flush();
    const rows = wrapper.findAll('[data-testid="room-row"]');
    expect(rows.length).toBe(1);
    expect(wrapper.find('[data-testid="room-row-unread"]').text()).toBe('2');
  });

  it('navigates to the room view when a room row is clicked', async () => {
    const wrapper = mount(InboxView, { global: { mocks: { $t: i18nStub.$t } } });
    await flush();
    await wrapper.find('[data-testid="room-row"]').trigger('click');
    expect(routerStub.push).toHaveBeenCalledWith('/dashboard/messages/rooms/r1');
  });

  it('opens the create-room dialog from the new-room control', async () => {
    const wrapper = mount(InboxView, { global: { mocks: { $t: i18nStub.$t } } });
    await flush();
    expect(wrapper.find('[data-testid="create-room-dialog"]').exists()).toBe(false);
    await wrapper.find('[data-testid="meinchat-new-room"]').trigger('click');
    expect(wrapper.find('[data-testid="create-room-dialog"]').exists()).toBe(true);
  });
});
