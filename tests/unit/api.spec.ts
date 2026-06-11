import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getActiveBotConversationStyle, sendTextMessage } from '../../src/api';

describe('meinchat api — sendTextMessage meta (S70.1)', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'jwt-xyz');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'm1', body: 'Pro' }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('omits `meta` from the body when no meta is provided (regression)', async () => {
    await sendTextMessage('cv1', 'hello');
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ body: 'hello' });
  });

  it('includes `meta` in the body when a bot_action meta is provided', async () => {
    await sendTextMessage('cv1', 'Pro', {
      kind: 'bot_action',
      action_data: 'subscription:plan:2',
    });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/messaging/conversations/cv1/messages');
    expect(JSON.parse(init.body as string)).toEqual({
      body: 'Pro',
      meta: { kind: 'bot_action', action_data: 'subscription:plan:2' },
    });
  });
});

describe('meinchat api — getActiveBotConversationStyle (S70.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the public active-style route and returns {name, tokens}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ name: 'Walkthrough', tokens: { accent: '#3b6ef0' } }),
      }),
    );
    const style = await getActiveBotConversationStyle();
    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/bot-conversation-style/active');
    expect(style).toEqual({ name: 'Walkthrough', tokens: { accent: '#3b6ef0' } });
  });
});
