import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../../../src/api', () => ({
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

// The room view opens the SSE stream; stub it so no EventSource is created.
vi.mock('../../../src/composables/useMessagingStream', () => ({
  useMessagingStream: () => ({
    onEvent: () => () => undefined,
    connect: () => Promise.resolve(),
    disconnect: () => undefined,
  }),
}));

const routerStub = { push: vi.fn() };
vi.mock('vue-router', () => ({
  useRouter: () => routerStub,
}));

import * as api from '../../../src/api';
import { useRoomsStore } from '../../../src/stores/useRoomsStore';
import RoomView from '../../../src/views/RoomView.vue';

const i18nStub = { $t: (key: string) => key };

const room = (over: Partial<any> = {}) => ({
  id: 'r1',
  name: 'Team',
  protocol: 'plain',
  capabilities: {},
  last_message_at: null,
  last_message_preview: null,
  unread_count: 0,
  last_read_at: null,
  ...over,
});

const member = (over: Partial<any> = {}) => ({
  user_id: over.user_id ?? 'u-other',
  role: over.role ?? 'member',
  nickname: over.nickname ?? 'someone',
  ...over,
});

const roomMsg = (over: Partial<any> = {}) => ({
  id: over.id ?? 'm1',
  room_id: 'r1',
  conversation_id: '',
  sender_id: over.sender_id ?? 'u-other',
  sender_nickname: 'someone',
  body: over.body ?? 'hello room',
  attachments: [],
  sent_at: '2026-06-13T00:00:00Z',
  read_at: null,
  system_kind: null,
  ...over,
});

async function mountView() {
  const wrapper = mount(RoomView, {
    props: { roomId: 'r1' },
    global: {
      mocks: { $t: i18nStub.$t },
      stubs: { 'router-link': true },
      provide: {},
      plugins: [],
    },
  });
  await flush();
  return wrapper;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
}

describe('RoomView (S86.1 slice 2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.setItem('user_id', 'me');
    routerStub.push.mockClear();
    (api.getRoom as any).mockResolvedValue(room());
    (api.listRoomMembers as any).mockResolvedValue({ items: [member({ user_id: 'me', role: 'member' })] });
    (api.listRoomMessages as any).mockResolvedValue({ items: [roomMsg()] });
    (api.markRoomRead as any).mockResolvedValue(undefined);
  });

  it('renders room messages via MessageBubble', async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll('[data-testid="message-bubble"]').length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain('hello room');
  });

  it('sends a message via the composer through the rooms store', async () => {
    (api.sendRoomMessage as any).mockResolvedValue(roomMsg({ id: 'real-1', body: 'typed', sender_id: 'me' }));
    const wrapper = await mountView();
    const store = useRoomsStore();
    const spy = vi.spyOn(store, 'sendText');
    await wrapper.find('[data-testid="composer-input"]').setValue('typed');
    await wrapper.find('[data-testid="message-composer"]').trigger('submit');
    await flush();
    expect(spy).toHaveBeenCalledWith('r1', 'typed');
  });

  it('shows the invite control to a plain member', async () => {
    (api.listRoomMembers as any).mockResolvedValue({ items: [member({ user_id: 'me', role: 'member' })] });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="room-invite"]').exists()).toBe(true);
  });

  it('hides the remove-member admin control from a non-admin member', async () => {
    (api.listRoomMembers as any).mockResolvedValue({ items: [member({ user_id: 'me', role: 'member' })] });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="room-remove-member"]').exists()).toBe(false);
  });

  it('shows the remove-member admin control when the caller is admin', async () => {
    (api.listRoomMembers as any).mockResolvedValue({
      items: [member({ user_id: 'me', role: 'admin' }), member({ user_id: 'u2', role: 'member', nickname: 'bob' })],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="room-remove-member"]').exists()).toBe(true);
  });

  it('appends a room_id stream event to the room', async () => {
    const wrapper = await mountView();
    const store = useRoomsStore();
    store.handleStreamEvent({
      type: 'message',
      message: roomMsg({ id: 'streamed', body: 'via sse' }),
    });
    await flush();
    expect(wrapper.text()).toContain('via sse');
  });
});
