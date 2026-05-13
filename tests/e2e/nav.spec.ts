/**
 * meinchat — user dashboard navigation entry
 *
 * The fe-user `meinchat` plugin must register a top-level sidebar nav item
 * (same pattern as `taro` and `chat`) via userNavRegistry.register({...,
 * testId: 'nav-messages' }) in its activate() hook. This test verifies that
 * a logged-in user sees the entry in the dashboard sidebar and can navigate
 * into the inbox view.
 */
import { test, expect, type Page } from '@playwright/test';

// Plugin tests must not depend on host-app test infrastructure (SOLID:
// the plugin owns its own coverage and its own helpers). The login flow
// is inlined here.
const TEST_USER = { email: 'test@example.com', password: 'TestPass123@' };

async function loginAsTestUser(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="email"]',    TEST_USER.email);
  await page.fill('[data-testid="password"]', TEST_USER.password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard');
}

test.describe('meinchat — user dashboard nav', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('top-level "Messages" nav item is rendered in the sidebar', async ({ page }) => {
    const messagesLink = page.locator('[data-testid="nav-messages"]');
    await expect(messagesLink).toBeVisible({ timeout: 10000 });

    // Must point at the inbox route, same as taro/chat top-level entries
    await expect(messagesLink).toHaveAttribute('href', '/dashboard/messages');

    // Standard nav-item class — confirms it's rendered as a top-level entry,
    // not nested in a subgroup like the Store collapsibles
    await expect(messagesLink).toHaveClass(/nav-item/);
  });

  test('clicking the nav entry opens the meinchat inbox view', async ({ page }) => {
    await page.locator('[data-testid="nav-messages"]').click();
    await page.waitForURL('**/dashboard/messages', { timeout: 10000 });
    expect(page.url()).toContain('/dashboard/messages');
  });

  test('coexists with the taro and chat top-level entries', async ({ page }) => {
    // All three sibling plugins should register sidebar items
    await expect(page.locator('[data-testid="nav-messages"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-taro"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-chat"]')).toBeVisible();
  });
});
