import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageBubble from '../../../src/components/MessageBubble.vue';

const baseMessage = {
  id: 'm1',
  conversation_id: 'cv1',
  sender_id: 'u-me',
  sender_nickname: 'me',
  body: 'hello',
  attachment_url: null,
  attachment_thumb_url: null,
  attachment_width_px: null,
  attachment_height_px: null,
  sent_at: '2026-04-29T12:00:00Z',
  read_at: null,
  system_kind: null,
};

describe('MessageBubble — WhatsApp-style alignment', () => {
  it('rows authored by me get the ``bubble--mine`` class (rendered right)', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: baseMessage, mine: true },
    });
    const bubble = wrapper.find('[data-testid="message-bubble"]');
    expect(bubble.classes()).toContain('bubble--mine');
    expect(bubble.classes()).not.toContain('bubble--theirs');
  });

  it('rows authored by the counterpart get ``bubble--theirs`` (rendered left)', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: { ...baseMessage, sender_id: 'u-bob' }, mine: false },
    });
    const bubble = wrapper.find('[data-testid="message-bubble"]');
    expect(bubble.classes()).toContain('bubble--theirs');
    expect(bubble.classes()).not.toContain('bubble--mine');
  });

  it('system rows (token transfer) center regardless of ``mine``', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          ...baseMessage,
          system_kind: 'token_transfer',
          body: JSON.stringify({
            amount: 200,
            from_nickname: 'alice',
            to_nickname: 'bob',
          }),
        },
        mine: true,
      },
    });
    const bubble = wrapper.find('[data-testid="message-bubble"]');
    expect(bubble.classes()).toContain('bubble--system');
    expect(bubble.classes()).not.toContain('bubble--mine');
    expect(bubble.classes()).not.toContain('bubble--theirs');
  });
});
