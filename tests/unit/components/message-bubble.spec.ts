import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageBubble from '../../../src/components/MessageBubble.vue';

const baseMessage = {
  id: 'm1',
  conversation_id: 'cv1',
  sender_id: 'u-me',
  sender_nickname: 'me',
  body: 'hello',
  attachments: [],
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

  it('renders a plain fullres attachment as an <img>', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          ...baseMessage,
          attachments: [
            {
              id: 'a1', kind: 'fullres', protocol: 'plain',
              storage_url: '/uploads/meinchat/x.webp', mime: 'image/webp',
              bytes_count: 0, width_px: 600, height_px: 400,
            },
          ],
        },
        mine: true,
      },
    });
    expect(wrapper.find('.bubble__image img').attributes('src')).toBe(
      '/uploads/meinchat/x.webp',
    );
  });

  it('renders an e2e attachment from its decrypted blob URL', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          ...baseMessage,
          attachments: [
            {
              id: 'att-1', kind: 'fullres', protocol: 'e2e_v1',
              storage_url: '/uploads/meinchat/x.enc', mime: 'image/webp',
              bytes_count: 0, width_px: null, height_px: null,
            },
          ],
          attachmentUrls: { 'att-1': 'blob:decrypted-image' },
        },
        mine: true,
      },
    });
    expect(wrapper.find('.bubble__image img').attributes('src')).toBe(
      'blob:decrypted-image',
    );
  });

  it('does NOT inline an e2e_v1 attachment before it is decrypted', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          ...baseMessage,
          attachments: [
            {
              id: 'a2', kind: 'fullres', protocol: 'e2e_v1',
              storage_url: '/uploads/meinchat/x.enc', mime: 'image/webp',
              bytes_count: 0, width_px: null, height_px: null,
              envelope_header: { per_recipient_key_envelopes: {} },
            },
          ],
        },
        mine: true,
      },
    });
    expect(wrapper.find('.bubble__image').exists()).toBe(false);
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

describe('MessageBubble — S70.1 bot-choice cards', () => {
  const choicesMessage = {
    ...baseMessage,
    sender_id: 'u-bot',
    body: 'Choose a plan',
    meta: {
      kind: 'bot_choices',
      choices: [
        { label: 'Starter', action_data: 'subscription:plan:1', hint: '€9/mo' },
        { label: 'Pro', action_data: 'subscription:plan:2', hint: '€29/mo' },
        { label: 'Business', action_data: 'subscription:plan:3' },
      ],
    },
  };

  it('renders one card per choice (badge number + label + optional hint)', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: choicesMessage, mine: false },
    });
    const cards = wrapper.findAll('[data-testid="bot-choice-card"]');
    expect(cards).toHaveLength(3);

    expect(cards[0].find('[data-testid="bot-choice-badge"]').text()).toBe('1');
    expect(cards[0].find('[data-testid="bot-choice-label"]').text()).toBe('Starter');
    expect(cards[0].find('[data-testid="bot-choice-hint"]').text()).toBe('€9/mo');

    expect(cards[1].find('[data-testid="bot-choice-badge"]').text()).toBe('2');
    expect(cards[1].find('[data-testid="bot-choice-label"]').text()).toBe('Pro');

    // Third choice has no hint → the hint node is absent.
    expect(cards[2].find('[data-testid="bot-choice-badge"]').text()).toBe('3');
    expect(cards[2].find('[data-testid="bot-choice-hint"]').exists()).toBe(false);
  });

  it('tapping a card emits ``select-choice`` with the exact card payload', async () => {
    const wrapper = mount(MessageBubble, {
      props: { message: choicesMessage, mine: false },
    });
    await wrapper.findAll('[data-testid="bot-choice-card"]')[1].trigger('click');

    const emitted = wrapper.emitted('select-choice');
    expect(emitted).toHaveLength(1);
    expect(emitted![0][0]).toEqual({
      label: 'Pro',
      action_data: 'subscription:plan:2',
      hint: '€29/mo',
    });
  });

  it('does NOT render cards for an outgoing (mine) bot_choices message', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: { ...choicesMessage, sender_id: 'u-me' }, mine: true },
    });
    expect(wrapper.findAll('[data-testid="bot-choice-card"]')).toHaveLength(0);
  });

  it('regression — a message without ``meta`` renders no cards and is unchanged', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: baseMessage, mine: false },
    });
    expect(wrapper.findAll('[data-testid="bot-choice-card"]')).toHaveLength(0);
    expect(wrapper.find('.bubble__body').text()).toBe('hello');
  });

  it('regression — a bot_action meta (the tapped reply) renders no cards', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          ...baseMessage,
          sender_id: 'u-me',
          body: 'Pro',
          meta: { kind: 'bot_action', action_data: 'subscription:plan:2' },
        },
        mine: true,
      },
    });
    expect(wrapper.findAll('[data-testid="bot-choice-card"]')).toHaveLength(0);
    expect(wrapper.find('.bubble__body').text()).toBe('Pro');
  });
});
