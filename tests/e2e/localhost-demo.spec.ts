/**
 * Localhost meinchat demo — drives a real Bob→Alice chat in the browser on the
 * running fe-user (http://localhost:8080) and captures a screenshot of each of
 * the three flows the user asked to see:
 *   1. conversation (open + send a text message)
 *   2. token sending (Send Tokens dialog + a real transfer)
 *   3. image sending (attach + upload + render)
 *
 * Bob (test@example.com, 2000 tokens) is the driver so the token transfer
 * actually succeeds (admin/Alice has a 0 balance). This is the running PLAIN
 * meinchat (the meinchat-plus E2E plugin is not bundled in the live fe-user);
 * the E2E layer is covered by the unit suite + the API-level prod-e2e smoke.
 *
 * Run:
 *   E2E_BASE_URL=http://localhost:8080 npx playwright test \
 *     plugins/meinchat/tests/e2e/localhost-demo.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const BOB = { email: 'test@example.com', password: 'TestPass123@' };
const ALICE_NICK = 'alice';
const SHOTS =
  '/Users/dantweb/dantweb/vbwd-sdk-2/docs/dev_log/20260528/reports/screenshots';
const IMAGE = path.join(SHOTS, '_demo-image.png');
const stamp = `${Date.now()}`;

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', BOB.email);
  await page.fill('[data-testid="password"]', BOB.password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('**/dashboard');
}

async function openAliceConversation(page: Page): Promise<void> {
  await page.goto('/dashboard/messages');
  await expect(page.locator('[data-testid="meinchat-inbox"]')).toBeVisible({ timeout: 15_000 });
  const row = page
    .locator('[data-testid="inbox-row"]')
    .filter({ hasText: `@${ALICE_NICK}` })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.locator('[data-testid="meinchat-conversation"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="meinchat-messages"]')).toBeVisible();
}

test.describe('meinchat localhost demo — Bob ↔ Alice', () => {
  // Needs the live localhost stack + seeded users; opt-in via E2E_BASE_URL.
  test.skip(!process.env.E2E_BASE_URL, 'set E2E_BASE_URL to the running instance');
  test.use({ viewport: { width: 1180, height: 900 } });

  test('1 — conversation: open + send a text message', async ({ page }) => {
    await login(page);
    await openAliceConversation(page);

    const text = `Hi Alice — demo ${stamp} 👋`;
    await page.fill('[data-testid="composer-input"]', text);
    await page.click('[data-testid="composer-send"]');
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: path.join(SHOTS, '01-conversation.png'), fullPage: false });
  });

  test('2 — token sending: Send Tokens dialog + a real transfer', async ({ page }) => {
    await login(page);
    await openAliceConversation(page);

    await page.click('[data-testid="conversation-send-tokens"]');
    const dialog = page.locator('[data-testid="token-transfer-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.fill('[data-testid="token-transfer-amount"]', '5');
    await page.fill('[data-testid="token-transfer-note"]', `demo ${stamp}`);
    await page.screenshot({ path: path.join(SHOTS, '02a-token-dialog.png') });

    await page.click('[data-testid="token-transfer-submit"]');
    // The backend drops a system message into the shared conversation.
    await expect(page.getByText(/sent\s+5\s+tokens/i).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(SHOTS, '02b-token-sent.png') });
  });

  test('3 — image sending: attach + upload + render', async ({ page }) => {
    await login(page);
    await openAliceConversation(page);

    await page.setInputFiles('[data-testid="composer-file-input"]', IMAGE);
    await expect(page.locator('[data-testid="composer-preview"]')).toBeVisible({ timeout: 10_000 });
    await page.click('[data-testid="composer-send"]');

    // The newest message bubble should now contain a rendered <img>.
    const lastImage = page.locator('[data-testid="message-bubble"] img').last();
    await expect(lastImage).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(SHOTS, '03-image-sent.png') });
  });
});
