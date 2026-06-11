import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageBubble from '../../../src/components/MessageBubble.vue';

// Echo the i18n key so cart copy renders without coupling specs to translations.
const i18nMock = { $t: (key: string) => key };

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

describe('MessageBubble — S70.4 bot_choices meta.text + body suppression', () => {
  const choicesWithText = {
    ...baseMessage,
    sender_id: 'u-bot',
    body: '1. Starter\n2. Pro\nReply with the number',
    meta: {
      kind: 'bot_choices',
      text: 'Choose a tarif plan:',
      choices: [
        { label: 'Starter', action_data: 'subscription:plan:1', hint: '€9/mo' },
        { label: 'Pro', action_data: 'subscription:plan:2', hint: '€29/mo' },
      ],
    },
  };

  it('shows meta.text as the bubble text instead of the raw numbered body', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: choicesWithText, mine: false },
    });
    const body = wrapper.find('.bubble__body');
    expect(body.text()).toBe('Choose a tarif plan:');
    expect(body.text()).not.toContain('Reply with the number');
  });

  it('still renders the priced cards with hints', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: choicesWithText, mine: false },
    });
    const cards = wrapper.findAll('[data-testid="bot-choice-card"]');
    expect(cards).toHaveLength(2);
    expect(cards[0].find('[data-testid="bot-choice-hint"]').text()).toBe('€9/mo');
    expect(cards[1].find('[data-testid="bot-choice-hint"]').text()).toBe('€29/mo');
  });
});

describe('MessageBubble — S70.4 bot_menu', () => {
  const menuMessage = {
    ...baseMessage,
    sender_id: 'u-bot',
    body: '/tarifs - Browse tarif plans\n/help - Show help',
    meta: {
      kind: 'bot_menu',
      commands: [
        { command: '/tarifs', description: 'Browse tarif plans' },
        { command: '/help', description: 'Show help' },
      ],
    },
  };

  it('renders one row per command (command + description), suppressing the body', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: menuMessage, mine: false },
    });
    const rows = wrapper.findAll('[data-testid="bot-menu-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].find('[data-testid="bot-menu-command"]').text()).toBe('/tarifs');
    expect(rows[0].find('[data-testid="bot-menu-description"]').text()).toBe(
      'Browse tarif plans',
    );
    // The run-on plain body is suppressed for the known rich kind.
    expect(wrapper.find('.bubble__body').exists()).toBe(false);
  });

  it('tapping a command row emits ``send-command`` with that command', async () => {
    const wrapper = mount(MessageBubble, {
      props: { message: menuMessage, mine: false },
    });
    await wrapper.findAll('[data-testid="bot-menu-row"]')[1].trigger('click');
    const emitted = wrapper.emitted('send-command');
    expect(emitted).toHaveLength(1);
    expect(emitted![0][0]).toBe('/help');
  });
});

describe('MessageBubble — S70.4 bot_cart', () => {
  const cartMessage = {
    ...baseMessage,
    sender_id: 'u-bot',
    body: 'Your cart: Pro x1 = 29.00. Total 38.00 EUR',
    meta: {
      kind: 'bot_cart',
      items: [
        { name: 'Pro', quantity: 1, unit_price: '29.00', line_total: '29.00' },
        {
          name: 'Priority Support',
          quantity: 1,
          unit_price: '9.00',
          line_total: '9.00',
        },
      ],
      total: '38.00',
      currency: 'EUR',
    },
  };

  it('renders item rows with name, quantity and server-formatted line total', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: cartMessage, mine: false },
      global: { mocks: i18nMock },
    });
    const rows = wrapper.findAll('[data-testid="bot-cart-item"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].find('[data-testid="bot-cart-item-name"]').text()).toBe('Pro');
    expect(rows[0].find('[data-testid="bot-cart-item-qty"]').text()).toContain('1');
    expect(rows[0].find('[data-testid="bot-cart-item-total"]').text()).toBe('29.00');
    // The plain fallback body is suppressed for the known rich kind.
    expect(wrapper.find('.bubble__body').exists()).toBe(false);
  });

  it('renders the total + currency from the server strings (no client math)', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: cartMessage, mine: false },
      global: { mocks: i18nMock },
    });
    const total = wrapper.find('[data-testid="bot-cart-total"]');
    expect(total.text()).toContain('38.00');
    expect(total.text()).toContain('EUR');
  });

  it('the "Proceed to checkout" action emits ``send-command`` with /checkout', async () => {
    const wrapper = mount(MessageBubble, {
      props: { message: cartMessage, mine: false },
      global: { mocks: i18nMock },
    });
    await wrapper.find('[data-testid="bot-cart-checkout"]').trigger('click');
    const emitted = wrapper.emitted('send-command');
    expect(emitted).toHaveLength(1);
    expect(emitted![0][0]).toBe('/checkout');
  });

  it('an empty cart shows the empty state and no checkout button', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          ...cartMessage,
          meta: { kind: 'bot_cart', items: [], total: '0', currency: 'EUR' },
        },
        mine: false,
      },
      global: { mocks: i18nMock },
    });
    expect(wrapper.find('[data-testid="bot-cart-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bot-cart-checkout"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="bot-cart-item"]')).toHaveLength(0);
  });
});

describe('MessageBubble — S70.4 unknown-kind regression', () => {
  it('an unknown meta.kind renders the plain body unchanged (no suppression)', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          ...baseMessage,
          sender_id: 'u-bot',
          body: 'a plain reply',
          meta: { kind: 'something_new' },
        },
        mine: false,
      },
    });
    expect(wrapper.find('.bubble__body').text()).toBe('a plain reply');
    expect(wrapper.findAll('[data-testid="bot-choice-card"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="bot-menu-row"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="bot-cart-item"]')).toHaveLength(0);
  });
});
