import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// ── Mocks ────────────────────────────────────────────────────────────────────
// The widget talks to the backend ONLY through ../../src/api and persists the
// guest token through ../../src/widget/guestTokenStore. Both are mocked so the
// component tests assert behaviour, not the network.

const api = vi.hoisted(() => ({
  isAuthenticated: vi.fn<[], boolean>(() => false),
  getMyNickname: vi.fn(),
  setMyNickname: vi.fn(),
  startWidgetConversation: vi.fn(),
  listRoomMessages: vi.fn(),
  sendRoomMessage: vi.fn(),
  markRoomRead: vi.fn(),
  getWidgetBalance: vi.fn(),
}));

vi.mock('../../../src/widget/widgetApi', () => api);

const guestStore = vi.hoisted(() => ({
  loadGuestToken: vi.fn<[string], string | null>(() => null),
  persistGuestToken: vi.fn(),
  clearGuestToken: vi.fn(),
}));
vi.mock('../../../src/widget/guestTokenStore', () => guestStore);

// Bot styling is best-effort + does network; stub it to a no-op.
vi.mock('../../../src/composables/useBotConversationStyle', () => ({
  applyBotConversationStyle: () => Promise.resolve(),
}));

// SSE is best-effort; stub it so mounting never opens a real EventSource, but
// capture the registered handler so tests can simulate a streamed bot answer.
let streamHandler: ((event: Record<string, unknown>) => void) | null = null;
vi.mock('../../../src/composables/useMessagingStream', () => ({
  useMessagingStream: () => ({
    onEvent: (handler: (event: Record<string, unknown>) => void) => {
      streamHandler = handler;
      return () => {
        streamHandler = null;
      };
    },
    connect: () => Promise.resolve(),
    disconnect: () => {},
  }),
}));

import MeinchatChatWidget from '../../../src/components/MeinchatChatWidget.vue';

const i18nStub = (key: string) => key;

function mountWidget(config: Record<string, unknown>) {
  return mount(MeinchatChatWidget, {
    props: { config },
    global: { mocks: { $t: i18nStub } },
  });
}

const PUBLIC_CONFIG = {
  widget_slug: 'chat-1',
  member_nicknames: ['assistant'],
  visibility: 'public',
  title: 'Ask us',
  welcome_message: 'Hello there',
  start_button_label: 'Start Conversation',
  display: 'inline',
  open_by_default: true,
};

describe('MeinchatChatWidget (S86.3 slice 3e)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamHandler = null;
    api.isAuthenticated.mockReturnValue(false);
    guestStore.loadGuestToken.mockReturnValue(null);
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('logged_in + unauthenticated → log-in CTA, no Start button', async () => {
    api.isAuthenticated.mockReturnValue(false);
    const wrapper = mountWidget({ ...PUBLIC_CONFIG, visibility: 'logged_in' });
    await flushPromises();
    expect(wrapper.find('[data-testid="meinchat-widget-login-cta"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="meinchat-widget-start"]').exists()).toBe(false);
  });

  it('logged_in + no nickname → nickname step → PUT nickname → Start enabled', async () => {
    api.isAuthenticated.mockReturnValue(true);
    api.getMyNickname.mockResolvedValue({ nickname: null });
    api.setMyNickname.mockResolvedValue({ nickname: 'sammy' });
    const wrapper = mountWidget({ ...PUBLIC_CONFIG, visibility: 'logged_in' });
    await flushPromises();

    const input = wrapper.find('[data-testid="meinchat-widget-nickname-input"]');
    expect(input.exists()).toBe(true);
    await input.setValue('sammy');
    await wrapper.find('[data-testid="meinchat-widget-nickname-save"]').trigger('click');
    await flushPromises();

    expect(api.setMyNickname).toHaveBeenCalledWith('sammy');
    expect(wrapper.find('[data-testid="meinchat-widget-start"]').exists()).toBe(true);
  });

  it('logged_in nickname 409 taken surfaces inline', async () => {
    api.isAuthenticated.mockReturnValue(true);
    api.getMyNickname.mockResolvedValue({ nickname: null });
    api.setMyNickname.mockRejectedValue({ code: 'nickname_taken' });
    const wrapper = mountWidget({ ...PUBLIC_CONFIG, visibility: 'logged_in' });
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-nickname-input"]').setValue('taken');
    await wrapper.find('[data-testid="meinchat-widget-nickname-save"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="meinchat-widget-error"]').text()).toContain(
      'nickname_taken',
    );
  });

  it('public → name step → Start persists + uses the returned access_token', async () => {
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-9',
      self_nickname: 'guest_7',
      members: [{ nickname: 'assistant', role: 'member' }],
      access_token: 'guest-jwt-xyz',
      token_balance: 30,
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);

    const wrapper = mountWidget(PUBLIC_CONFIG);
    await flushPromises();

    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();

    expect(api.startWidgetConversation).toHaveBeenCalledWith(
      { widget_slug: 'chat-1', display_name: 'Sam' },
      undefined,
    );
    expect(guestStore.persistGuestToken).toHaveBeenCalledWith('chat-1', 'guest-jwt-xyz');
    // Subsequent room calls carry the returned guest token.
    expect(api.listRoomMessages).toHaveBeenCalledWith('room-9', {}, 'guest-jwt-xyz');
    // The room pane is shown.
    expect(wrapper.find('[data-testid="meinchat-widget-room"]').exists()).toBe(true);
  });

  it('return mount presents the stored guest token to widget/start (D12)', async () => {
    guestStore.loadGuestToken.mockReturnValue('stored-guest-jwt');
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-9',
      self_nickname: 'guest_7',
      members: [],
      access_token: 'stored-guest-jwt',
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);

    const wrapper = mountWidget(PUBLIC_CONFIG);
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();

    expect(api.startWidgetConversation).toHaveBeenCalledWith(
      { widget_slug: 'chat-1', display_name: 'Sam' },
      'stored-guest-jwt',
    );
  });

  it('reuse with NO returned access_token falls back to the PRESENTED token (bug fix)', async () => {
    // D12 reuse: the backend returns the existing room but historically no fresh
    // access_token. A stored guest token was presented, so room calls MUST use
    // that presented token — never undefined (which leaks the app session).
    guestStore.loadGuestToken.mockReturnValue('presented-guest-jwt');
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-reuse',
      self_nickname: 'returning-guest',
      members: [],
      // no access_token
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);
    api.sendRoomMessage.mockResolvedValue({
      id: 'm-1',
      room_id: 'room-reuse',
      sender_id: 'me',
      sender_nickname: 'returning-guest',
      body: 'hi',
      attachments: [],
      sent_at: null,
      read_at: null,
      system_kind: null,
    });

    const wrapper = mountWidget(PUBLIC_CONFIG);
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();

    // Room load uses the PRESENTED guest token, NOT undefined / app session.
    expect(api.listRoomMessages).toHaveBeenCalledWith('room-reuse', {}, 'presented-guest-jwt');
    expect(api.markRoomRead).toHaveBeenCalledWith('room-reuse', 'presented-guest-jwt');

    await wrapper.find('[data-testid="composer-input"]').setValue('hi');
    await wrapper.find('[data-testid="message-composer"]').trigger('submit');
    await flushPromises();

    expect(api.sendRoomMessage).toHaveBeenCalledWith(
      'room-reuse',
      'hi',
      undefined,
      'presented-guest-jwt',
    );
  });

  it('public start with NO token at all self-heals with a FRESH start, never app-session calls', async () => {
    // No stored token AND the first start returned no access_token (stale/expired
    // stored token whose room the visitor cannot access). The widget must clear
    // any stale token and re-run start FRESH (no presented token) so the backend
    // provisions a new guest + token — never issuing app-session room calls.
    guestStore.loadGuestToken.mockReturnValue(null);
    api.startWidgetConversation
      .mockResolvedValueOnce({
        room_id: 'room-stale',
        self_nickname: 'g',
        members: [],
        // no access_token on the first (reuse) response
      })
      .mockResolvedValueOnce({
        room_id: 'room-fresh',
        self_nickname: 'g',
        members: [],
        access_token: 'fresh-guest-jwt',
      });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);

    const wrapper = mountWidget(PUBLIC_CONFIG);
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();

    // It re-ran start FRESH (presented token = undefined) and cleared the stale one.
    expect(api.startWidgetConversation).toHaveBeenCalledTimes(2);
    expect(api.startWidgetConversation).toHaveBeenLastCalledWith(
      { widget_slug: 'chat-1', display_name: 'Sam' },
      undefined,
    );
    expect(guestStore.clearGuestToken).toHaveBeenCalledWith('chat-1');
    // No room call ever went out with an undefined token (app-session leak).
    for (const call of api.listRoomMessages.mock.calls) {
      expect(call[2]).toBe('fresh-guest-jwt');
    }
  });

  it('welcome_message renders as the opening bubble when history is empty', async () => {
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-9',
      self_nickname: 'guest_7',
      members: [],
      access_token: 'guest-jwt',
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);

    const wrapper = mountWidget(PUBLIC_CONFIG);
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();

    expect(wrapper.html()).toContain('Hello there');
  });

  it('shows token_balance and renders the buy-tokens block on 402 insufficient_tokens', async () => {
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-9',
      self_nickname: 'guest_7',
      members: [],
      access_token: 'guest-jwt',
      token_balance: 0,
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);
    api.sendRoomMessage.mockRejectedValue({ code: 'insufficient_tokens' });

    const wrapper = mountWidget(PUBLIC_CONFIG);
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="meinchat-widget-balance"]').exists()).toBe(true);

    await wrapper.find('[data-testid="composer-input"]').setValue('hi');
    await wrapper.find('[data-testid="message-composer"]').trigger('submit');
    await flushPromises();

    const buy = wrapper.find('[data-testid="meinchat-widget-buy-tokens"]');
    expect(buy.exists()).toBe(true);
    const link = buy.find('a');
    // REVISED D11 — the buy-tokens link defaults to the future public /tokens page.
    expect(link.attributes('href')).toBe('/tokens');
  });

  it('buy-tokens link honours config.buy_tokens_href override', async () => {
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-9',
      self_nickname: 'guest_7',
      members: [],
      access_token: 'guest-jwt',
      token_balance: 0,
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);
    api.sendRoomMessage.mockRejectedValue({ code: 'insufficient_tokens' });

    const wrapper = mountWidget({ ...PUBLIC_CONFIG, buy_tokens_href: '/custom-buy' });
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="composer-input"]').setValue('hi');
    await wrapper.find('[data-testid="message-composer"]').trigger('submit');
    await flushPromises();

    const link = wrapper.find('[data-testid="meinchat-widget-buy-tokens"] a');
    expect(link.attributes('href')).toBe('/custom-buy');
  });

  it('buy-tokens link prefers the buy_tokens_href returned by widget/start', async () => {
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-9',
      self_nickname: 'guest_7',
      members: [],
      access_token: 'guest-jwt',
      token_balance: 0,
      buy_tokens_href: '/pricing',
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);
    api.sendRoomMessage.mockRejectedValue({ code: 'insufficient_tokens' });

    // The per-widget config sets a DIFFERENT href; the start-response value wins.
    const wrapper = mountWidget({ ...PUBLIC_CONFIG, buy_tokens_href: '/custom-buy' });
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="composer-input"]').setValue('hi');
    await wrapper.find('[data-testid="message-composer"]').trigger('submit');
    await flushPromises();

    const link = wrapper.find('[data-testid="meinchat-widget-buy-tokens"] a');
    expect(link.attributes('href')).toBe('/pricing');
  });

  it('buy-tokens link falls back to config then /tokens when start omits buy_tokens_href', async () => {
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-9',
      self_nickname: 'guest_7',
      members: [],
      access_token: 'guest-jwt',
      token_balance: 0,
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);
    api.sendRoomMessage.mockRejectedValue({ code: 'insufficient_tokens' });

    // Response omits buy_tokens_href → the per-widget config value is used.
    const wrapper = mountWidget({ ...PUBLIC_CONFIG, buy_tokens_href: '/custom-buy' });
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="composer-input"]').setValue('hi');
    await wrapper.find('[data-testid="message-composer"]').trigger('submit');
    await flushPromises();

    const link = wrapper.find('[data-testid="meinchat-widget-buy-tokens"] a');
    expect(link.attributes('href')).toBe('/custom-buy');
  });

  it('updates the displayed balance from the send response token_balance', async () => {
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-9',
      self_nickname: 'guest_7',
      members: [],
      access_token: 'guest-jwt',
      token_balance: 10,
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);
    // A 3-word question → backend charged 3 → returns the authoritative balance.
    api.sendRoomMessage.mockResolvedValue({
      id: 'm-1',
      room_id: 'room-9',
      sender_id: 'me',
      sender_nickname: 'guest_7',
      body: 'how much shipping',
      attachments: [],
      sent_at: null,
      read_at: null,
      system_kind: null,
      token_balance: 7,
    });

    const wrapper = mountWidget(PUBLIC_CONFIG);
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="meinchat-widget-balance"]').text()).toContain('10');

    await wrapper.find('[data-testid="composer-input"]').setValue('how much shipping');
    await wrapper.find('[data-testid="message-composer"]').trigger('submit');
    await flushPromises();

    // The balance reflects the backend's authoritative post-charge value (7),
    // not a client-side guess.
    expect(wrapper.find('[data-testid="meinchat-widget-balance"]').text()).toContain('7');
  });

  it('refreshes the balance from the balance endpoint after a bot answer arrives', async () => {
    api.startWidgetConversation.mockResolvedValue({
      room_id: 'room-9',
      self_nickname: 'guest_7',
      members: [],
      access_token: 'guest-jwt',
      token_balance: 10,
    });
    api.listRoomMessages.mockResolvedValue({ items: [] });
    api.markRoomRead.mockResolvedValue(undefined);
    api.getWidgetBalance.mockResolvedValue({ token_balance: 4 });

    const wrapper = mountWidget(PUBLIC_CONFIG);
    await flushPromises();
    await wrapper.find('[data-testid="meinchat-widget-name-input"]').setValue('Sam');
    await wrapper.find('[data-testid="meinchat-widget-start"]').trigger('click');
    await flushPromises();

    // Simulate a bot answer arriving over the stream → balance is refreshed.
    streamHandler?.({
      type: 'message',
      message: {
        id: 'bot-1',
        room_id: 'room-9',
        sender_id: 'assistant',
        sender_nickname: 'assistant',
        body: 'shipping is five euros',
        attachments: [],
        sent_at: null,
        read_at: null,
        system_kind: null,
      },
    });
    await flushPromises();

    expect(api.getWidgetBalance).toHaveBeenCalledWith('guest-jwt');
    expect(wrapper.find('[data-testid="meinchat-widget-balance"]').text()).toContain('4');
  });

  it('display:dock + open_by_default:false renders collapsed (no room/prompt visible)', async () => {
    const wrapper = mountWidget({
      ...PUBLIC_CONFIG,
      display: 'dock',
      open_by_default: false,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="meinchat-widget-dock-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="meinchat-widget-name-input"]').exists()).toBe(false);
    // Expanding the dock reveals the name prompt.
    await wrapper.find('[data-testid="meinchat-widget-dock-toggle"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="meinchat-widget-name-input"]').exists()).toBe(true);
  });
});
