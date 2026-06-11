/**
 * S70.1 e2e — bot-choice cards in the real meinchat conversation UI.
 *
 * Drives the running fe-user (http://localhost:8080) with the backend
 * messaging endpoints mocked so the test is self-contained (no seeded bot
 * conversation required): a `bot_choices` message renders as clickable cards,
 * and tapping a card POSTs the exact `{ body, meta: { kind:'bot_action',
 * action_data } }` payload through the existing send path.
 *
 * Runs on the platform CI (Playwright). The local quality gate is
 * lint + vue-tsc + vitest.
 *
 * Run:
 *   E2E_BASE_URL=http://localhost:8080 npx playwright test \
 *     plugins/meinchat/tests/e2e/bot-choice-cards.spec.ts --project=chromium
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const BOB = { email: 'test@example.com', password: 'TestPass123@' };
const CONVERSATION_ID = 'conv-bot-1';
const BOT_NICK = 'assistant';

const choicesMessage = {
  id: 'msg-choices-1',
  conversation_id: CONVERSATION_ID,
  sender_id: 'u-bot',
  sender_nickname: BOT_NICK,
  body: 'Choose a tarif plan:',
  attachments: [],
  sent_at: '2026-06-11T10:00:00Z',
  read_at: null,
  system_kind: null,
  meta: {
    kind: 'bot_choices',
    choices: [
      { label: 'Starter', action_data: 'subscription:plan:1', hint: '€9/mo' },
      { label: 'Pro', action_data: 'subscription:plan:2', hint: '€29/mo' },
      { label: 'Business', action_data: 'subscription:plan:3', hint: '€99/mo' },
    ],
  },
};

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', BOB.email);
  await page.fill('[data-testid="password"]', BOB.password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('**/dashboard');
}

test.describe('meinchat — bot-choice cards (S70.1)', () => {
  test.skip(!process.env.E2E_BASE_URL, 'set E2E_BASE_URL to the running instance');
  test.use({ viewport: { width: 1180, height: 900 } });

  test('renders choice cards and a tap posts the bot_action payload', async ({ page }) => {
    await login(page);

    // Capture the POST the tapped card makes.
    let postedBody: Record<string, unknown> | null = null;

    await page.route('**/api/v1/messaging/conversations', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: CONVERSATION_ID,
          peer_user_id: 'u-bot',
          peer_nickname: BOT_NICK,
          last_message_at: choicesMessage.sent_at,
          last_message_preview: choicesMessage.body,
          unread_count: 0,
          protocol: 'plain',
        }),
      }),
    );

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
              id: 'msg-action-1',
              conversation_id: CONVERSATION_ID,
              sender_id: 'me',
              sender_nickname: 'bob',
              body: (postedBody as { body: string }).body,
              attachments: [],
              sent_at: '2026-06-11T10:01:00Z',
              read_at: null,
              system_kind: null,
              meta: (postedBody as { meta?: unknown }).meta,
            }),
          });
          return;
        }
        // GET list → the bot's choices message.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [choicesMessage] }),
        });
      },
    );

    await page.route(
      `**/api/v1/messaging/conversations/${CONVERSATION_ID}/read`,
      (route: Route) => route.fulfill({ status: 204, body: '' }),
    );

    await page.goto(`/dashboard/messages/${BOT_NICK}`);
    await expect(
      page.locator('[data-testid="meinchat-conversation"]'),
    ).toBeVisible({ timeout: 15_000 });

    const cards = page.locator('[data-testid="bot-choice-card"]');
    await expect(cards).toHaveCount(3);
    await expect(
      cards.nth(1).locator('[data-testid="bot-choice-label"]'),
    ).toHaveText('Pro');

    await cards.nth(1).click();

    await expect.poll(() => postedBody).not.toBeNull();
    expect(postedBody).toEqual({
      body: 'Pro',
      meta: { kind: 'bot_action', action_data: 'subscription:plan:2' },
    });
  });
});
