/**
 * Production meinchat smoke — drives a real 2-user chat on the target host
 * and asserts the surface works end-to-end (manifest → API → SPA → UI dialog).
 *
 * Env (credentials NEVER hardcoded — this spec is in a public repo):
 *   VBWD_HOST              target host                  default: vbwd.cc
 *   VBWD_ADMIN_EMAIL       user 1 — sender              required
 *   VBWD_ADMIN_PASSWORD                                  required
 *   VBWD_ADMIN_NICKNAME    meinchat handle for sender   default: chatuser-a
 *   VBWD_PEER_EMAIL        user 2 — receiver            required
 *   VBWD_PEER_PASSWORD                                   required
 *   VBWD_PEER_NICKNAME     meinchat handle for receiver default: chatuser-b
 *
 * Run:
 *   VBWD_ADMIN_EMAIL=… VBWD_ADMIN_PASSWORD=… \
 *   VBWD_PEER_EMAIL=…  VBWD_PEER_PASSWORD=…  \
 *   npx playwright test prod-meinchat-chat
 *
 * Notes:
 *   * Both users must exist on the target instance.
 *   * 'admin' is a reserved nickname in meinchat; the default sender handle
 *     is 'chatuser-a'. Pick handles that aren't already taken on the host.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

const HOST  = process.env.VBWD_HOST || 'vbwd.cc';
const BASE  = `https://${HOST}`;
const ADMIN = {
  email:    process.env.VBWD_ADMIN_EMAIL    ?? '',
  password: process.env.VBWD_ADMIN_PASSWORD ?? '',
  nickname: process.env.VBWD_ADMIN_NICKNAME || 'chatuser-a',
};
const PEER = {
  email:    process.env.VBWD_PEER_EMAIL    ?? '',
  password: process.env.VBWD_PEER_PASSWORD ?? '',
  nickname: process.env.VBWD_PEER_NICKNAME || 'chatuser-b',
};

const SUFFICIENT =
  ADMIN.email && ADMIN.password && PEER.email && PEER.password;

async function login(req: APIRequestContext, email: string, password: string): Promise<string> {
  const r = await req.post(`${BASE}/api/v1/auth/login`, { data: { email, password } });
  expect(r.status(), `login ${email}`).toBe(200);
  const body = await r.json();
  expect(body.token).toBeTruthy();
  return body.token;
}

async function ensureNickname(req: APIRequestContext, token: string, nickname: string) {
  const cur = await req.get(`${BASE}/api/v1/nickname/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (cur.status() === 200) {
    const j = await cur.json();
    if (j.nickname === nickname) return;
  }
  const set = await req.put(`${BASE}/api/v1/nickname/me`, {
    headers: { authorization: `Bearer ${token}` },
    data: { nickname },
  });
  // 200 → set; 409 → already owned by us with different casing (acceptable);
  // 409 from a different user owning the handle → test config problem.
  if (![200, 409].includes(set.status())) {
    const body = await set.text();
    throw new Error(`set nickname ${nickname}: ${set.status()} ${body}`);
  }
}

async function startConversation(
  req: APIRequestContext, token: string, peerNickname: string,
): Promise<{ id: string; peer_user_id: string }> {
  const r = await req.post(`${BASE}/api/v1/messaging/conversations`, {
    headers: { authorization: `Bearer ${token}` },
    data: { peer_nickname: peerNickname },
  });
  expect([200, 201]).toContain(r.status());
  return r.json();
}

async function sendMessage(
  req: APIRequestContext, token: string, convId: string, body: string,
) {
  const r = await req.post(
    `${BASE}/api/v1/messaging/conversations/${convId}/messages`,
    { headers: { authorization: `Bearer ${token}` }, data: { body } },
  );
  expect([200, 201]).toContain(r.status());
}

test.describe(`${HOST} meinchat — live chat flow`, () => {
  test.skip(!SUFFICIENT, 'VBWD_ADMIN_* and VBWD_PEER_* env vars must be set');

  test('plugin is enabled in the runtime manifest', async ({ request }) => {
    const r = await request.get(`${BASE}/plugins.json`);
    expect(r.status()).toBe(200);
    const { plugins } = await r.json();
    expect(plugins.meinchat, 'meinchat manifest entry').toBeTruthy();
    expect(plugins.meinchat.enabled, 'meinchat enabled flag').toBe(true);
  });

  test('backend meinchat routes respond under auth', async ({ request }) => {
    const adminToken = await login(request, ADMIN.email, ADMIN.password);
    const r = await request.get(`${BASE}/api/v1/admin/meinchat/nicknames?per_page=1`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(r.status(), 'admin meinchat list').toBe(200);
    const body = await r.json();
    // Shape contract: an items[] (possibly empty) is expected.
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('end-to-end: two users chat + Send Tokens dialog opens', async ({ browser, request }) => {
    // 1. Both users log in, set nicknames, register the conversation.
    const adminToken = await login(request, ADMIN.email, ADMIN.password);
    const peerToken  = await login(request, PEER.email,  PEER.password);
    await ensureNickname(request, adminToken, ADMIN.nickname);
    await ensureNickname(request, peerToken,  PEER.nickname);

    const convA = await startConversation(request, adminToken, PEER.nickname);
    const convB = await startConversation(request, peerToken,  ADMIN.nickname);
    expect(convA.id, 'admin and peer must share the same conversation id').toBe(convB.id);

    // 2. Exchange 4 messages so the conversation is non-empty.
    const stamp = Date.now();
    await sendMessage(request, adminToken, convA.id, `live-prod test ${stamp} — ping from sender`);
    await sendMessage(request, peerToken,  convA.id, `live-prod test ${stamp} — pong from receiver`);
    await sendMessage(request, adminToken, convA.id, `live-prod test ${stamp} — second message`);
    await sendMessage(request, peerToken,  convA.id, `live-prod test ${stamp} — second reply`);

    // 3. Browser: log in as admin via the same token (seed localStorage),
    //    navigate to /dashboard/messages, assert the inbox row is there,
    //    open it, see the 4 messages, open Send Tokens dialog.
    const ctx  = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript((t) => localStorage.setItem('auth_token', t), adminToken);
    const page = await ctx.newPage();

    await page.goto(`${BASE}/dashboard/messages`, { waitUntil: 'networkidle' });
    // The sidebar nav item is registered by the fe-user meinchat plugin.
    await expect(page.locator('[data-testid="nav-messages"]')).toBeVisible({ timeout: 10_000 });
    // Inbox has at least one row, and one of them is to the peer.
    const peerRow = page
      .locator('[data-testid="inbox-row"]')
      .filter({ hasText: `@${PEER.nickname}` })
      .first();
    await expect(peerRow).toBeVisible({ timeout: 10_000 });

    // 4. Click in → conversation view + Send Tokens button.
    await peerRow.click();
    await expect(page.locator('[data-testid="meinchat-conversation"]'))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="meinchat-messages"]'))
      .toBeVisible({ timeout: 10_000 });
    // At least one of the messages we just sent must be present.
    await expect(page.getByText(`live-prod test ${stamp}`, { exact: false }).first())
      .toBeVisible({ timeout: 10_000 });

    // 5. Open the Send Tokens dialog and fill it (do NOT submit — non-destructive).
    await page.locator('[data-testid="conversation-send-tokens"]').click();
    const dialog = page.locator('[data-testid="token-transfer-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-testid="token-transfer-amount"]').fill('1');
    await page.locator('[data-testid="token-transfer-note"]').fill(`smoke ${stamp}`);
    await expect(page.locator('[data-testid="token-transfer-submit"]')).toBeEnabled();

    await ctx.close();
  });
});
