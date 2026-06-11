/**
 * S70.4 e2e — rich bot message kinds in the real meinchat conversation UI.
 *
 * Drives the running fe-user (http://localhost:8080) with the messaging
 * endpoints mocked so the test is self-contained (no seeded bot conversation):
 *   - `/tarifs` → priced choice cards (with hints).
 *   - `/help`   → a tappable command menu; tapping a row resends the command.
 *   - `/cart`   → a cart card with a "Proceed to checkout" affordance that
 *                 sends `/checkout`.
 *
 * Runs on the platform CI (Playwright). The local quality gate is
 * lint + vue-tsc + vitest.
 *
 * Run:
 *   E2E_BASE_URL=http://localhost:8080 npx playwright test \
 *     plugins/meinchat/tests/e2e/bot-rich-kinds.spec.ts --project=chromium
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const BOB = { email: 'test@example.com', password: 'TestPass123@' };
const CONVERSATION_ID = 'conv-bot-rich';
const BOT_NICK = 'assistant';

const baseRow = {
  conversation_id: CONVERSATION_ID,
  sender_id: 'u-bot',
  sender_nickname: BOT_NICK,
  attachments: [],
  sent_at: '2026-06-11T10:00:00Z',
  read_at: null,
  system_kind: null,
};

const choicesMessage = {
  ...baseRow,
  id: 'msg-choices',
  body: '1. Starter 2. Pro 3. Business — reply with the number',
  meta: {
    kind: 'bot_choices',
    text: 'Choose a tarif plan:',
    choices: [
      { label: 'Starter', action_data: 'subscription:plan:1', hint: '€9/mo' },
      { label: 'Pro', action_data: 'subscription:plan:2', hint: '€29/mo' },
      { label: 'Business', action_data: 'subscription:plan:3', hint: '€99/mo' },
    ],
  },
};

const menuMessage = {
  ...baseRow,
  id: 'msg-menu',
  body: '/tarifs - Browse tarif plans /cart - View your cart',
  meta: {
    kind: 'bot_menu',
    commands: [
      { command: '/tarifs', description: 'Browse tarif plans' },
      { command: '/cart', description: 'View your cart' },
    ],
  },
};

const cartMessage = {
  ...baseRow,
  id: 'msg-cart',
  body: 'Your cart: Pro x1 = 29.00. Total 29.00 EUR',
  meta: {
    kind: 'bot_cart',
    items: [{ name: 'Pro', quantity: 1, unit_price: '29.00', line_total: '29.00' }],
    total: '29.00',
    currency: 'EUR',
  },
};

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', BOB.email);
  await page.fill('[data-testid="password"]', BOB.password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('**/dashboard');
}

async function routeConversation(page: Page): Promise<void> {
  await page.route('**/api/v1/messaging/conversations', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: CONVERSATION_ID,
        peer_user_id: 'u-bot',
        peer_nickname: BOT_NICK,
        last_message_at: baseRow.sent_at,
        last_message_preview: 'menu',
        unread_count: 0,
        protocol: 'plain',
      }),
    }),
  );
  await page.route(
    `**/api/v1/messaging/conversations/${CONVERSATION_ID}/read`,
    (route: Route) => route.fulfill({ status: 204, body: '' }),
  );
  // The portable style is best-effort; serve an empty active style.
  await page.route('**/api/v1/bot-conversation-style/active', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: null, tokens: {} }),
    }),
  );
}

test.describe('meinchat — rich bot kinds (S70.4)', () => {
  test.skip(!process.env.E2E_BASE_URL, 'set E2E_BASE_URL to the running instance');
  test.use({ viewport: { width: 1180, height: 900 } });

  test('/tarifs renders priced choice cards with hints + clean prompt', async ({ page }) => {
    await login(page);
    await routeConversation(page);
    await page.route(
      `**/api/v1/messaging/conversations/${CONVERSATION_ID}/messages*`,
      (route: Route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [choicesMessage] }),
        }),
    );

    await page.goto(`/dashboard/messages/${BOT_NICK}`);
    await expect(
      page.locator('[data-testid="meinchat-conversation"]'),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('[data-testid="bot-choice-card"]')).toHaveCount(3);
    await expect(
      page.locator('[data-testid="bot-choice-hint"]').first(),
    ).toHaveText('€9/mo');
    // The clean prompt replaces the numbered fallback body.
    await expect(page.locator('.bubble__body')).toContainText('Choose a tarif plan:');
    await expect(page.locator('.bubble__body')).not.toContainText('reply with the number');
  });

  test('/help renders a tappable menu; tapping a row resends the command', async ({ page }) => {
    await login(page);
    await routeConversation(page);

    let postedBody: Record<string, unknown> | null = null;
    await page.route(
      `**/api/v1/messaging/conversations/${CONVERSATION_ID}/messages*`,
      async (route: Route) => {
        const request = route.request();
        if (request.method() === 'POST') {
          postedBody = JSON.parse(request.postData() ?? '{}');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...baseRow,
              id: 'sent-1',
              sender_id: 'me',
              body: (postedBody as { body: string }).body,
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [menuMessage] }),
        });
      },
    );

    await page.goto(`/dashboard/messages/${BOT_NICK}`);
    await expect(
      page.locator('[data-testid="meinchat-conversation"]'),
    ).toBeVisible({ timeout: 15_000 });

    const rows = page.locator('[data-testid="bot-menu-row"]');
    await expect(rows).toHaveCount(2);
    await rows.nth(0).click();

    await expect.poll(() => postedBody).not.toBeNull();
    expect(postedBody).toEqual({ body: '/tarifs' });
  });

  test('/cart renders the cart card; checkout sends /checkout', async ({ page }) => {
    await login(page);
    await routeConversation(page);

    let postedBody: Record<string, unknown> | null = null;
    await page.route(
      `**/api/v1/messaging/conversations/${CONVERSATION_ID}/messages*`,
      async (route: Route) => {
        const request = route.request();
        if (request.method() === 'POST') {
          postedBody = JSON.parse(request.postData() ?? '{}');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...baseRow,
              id: 'sent-2',
              sender_id: 'me',
              body: (postedBody as { body: string }).body,
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [cartMessage] }),
        });
      },
    );

    await page.goto(`/dashboard/messages/${BOT_NICK}`);
    await expect(
      page.locator('[data-testid="meinchat-conversation"]'),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('[data-testid="bot-cart-item"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="bot-cart-total"]')).toContainText('29.00');
    await expect(page.locator('[data-testid="bot-cart-total"]')).toContainText('EUR');

    await page.locator('[data-testid="bot-cart-checkout"]').click();
    await expect.poll(() => postedBody).not.toBeNull();
    expect(postedBody).toEqual({ body: '/checkout' });
  });
});
