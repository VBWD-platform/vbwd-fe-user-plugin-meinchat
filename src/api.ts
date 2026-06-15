/**
 * Thin fetch wrappers for the meinchat backend API.
 *
 * Each function reads the JWT from localStorage, hits the corresponding
 * `/api/v1/...` endpoint, and either returns typed JSON or throws the
 * parsed error body. Lives in this plugin (not vbwd-fe-core) because
 * messaging endpoints are plugin-specific.
 */

export interface MyNickname {
  nickname: string | null;
}

export interface NicknameRow {
  id: string;
  user_id: string;
  nickname: string;
  banned: boolean;
  search_hidden: boolean;
  set_at: string | null;
  banned_at: string | null;
}

export interface NicknameSearchHit {
  nickname: string;
  user_id: string;
}

export interface NicknameCard {
  user_id: string;
  nickname: string;
  joined_at: string | null;
}

export interface ContactRow {
  id: string;
  owner_user_id: string;
  contact_user_id: string;
  alias: string | null;
  note: string | null;
  pinned: boolean;
  added_at: string | null;
  peer_nickname: string | null;
}

export interface ConversationRow {
  id: string;
  peer_user_id: string;
  peer_nickname: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  // S28.3b — pinned protocol ('plain' | 'e2e_v1'); routes e2e sends/reads
  // through the meinchat-plus crypto provider when one is registered.
  protocol?: string;
}

// S28.4 — one stored blob (fullres/thumb). For `plain` attachments
// `storage_url` is a directly-renderable image URL; for `e2e_v1` it is opaque
// ciphertext (the meinchat-plus client fetches + decrypts via `id`).
export interface MessageAttachment {
  id: string;
  kind: 'fullres' | 'thumb';
  storage_url: string;
  protocol: string;
  mime: string;
  bytes_count: number;
  width_px: number | null;
  height_px: number | null;
  envelope_header?: Record<string, unknown>;
}

// S70.1 — a single bot-choice card: a human label, an opaque + namespaced
// `action_data` the bridge routes by namespace, and an optional display hint
// (e.g. a price) shown right-aligned.
export interface BotChoice {
  label: string;
  action_data: string;
  hint?: string;
}

// S70.4 — a command-menu row (from /help): the command body to resend and a
// human description. Tapping the row sends `command` as a normal message.
export interface BotMenuCommand {
  command: string;
  description: string;
}

// S70.4 — one line of a bot cart. All money is a SERVER-formatted string —
// the fe does no price math (S53 §Security): it renders the strings as given.
export interface BotCartItem {
  name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

// S70.1/70.4 — structured/interactive content riding alongside the plain
// `body`. Optional, back-compatible, and a discriminated union over `kind`:
//   - `bot_choices` (bot → user): clickable cards (+ optional clean `text`
//     prompt that replaces the numbered `body` on rich clients).
//   - `bot_menu` (bot → user): a tidy command list (/help).
//   - `bot_cart` (bot → user): a cart summary card.
//   - `bot_action` (user → bot): the tapped card's opaque `action_data`.
// Absent on plain messages → they render exactly as before (Liskov: non-`meta`
// clients are unaffected). Unknown `kind`s fall back to the plain `body`.
export interface MessageMeta {
  kind: string;
  // bot_choices
  text?: string;
  choices?: BotChoice[];
  // bot_menu
  commands?: BotMenuCommand[];
  // bot_cart
  items?: BotCartItem[];
  total?: string;
  currency?: string;
  // bot_action
  action_data?: string;
}

// S70.4 — the portable bot-conversation style the fe-user themes the bot chat
// with. `tokens` is a (server-whitelisted) subset of the `--vbwd-botchat-*`
// vars; missing keys fall back to the component CSS defaults.
export interface BotConversationStyle {
  name: string | null;
  tokens: Record<string, string>;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  // S86.1 — set on room messages (exactly one of conversation_id / room_id is
  // populated per the backend CHECK). Absent/empty for 1:1 messages.
  room_id?: string;
  sender_id: string;
  sender_nickname: string;
  body: string;
  attachments: MessageAttachment[];
  sent_at: string | null;
  read_at: string | null;
  system_kind: string | null;
  // S70.1 — structured/interactive content (bot choices / a tapped action).
  // Undefined for plain messages.
  meta?: MessageMeta;
  // S28.3b — pinned protocol + opaque ciphertext for e2e_v1 rows. The
  // meinchat-plus provider decrypts `envelope` into a display `body`.
  protocol?: string;
  envelope?: string;
  // S28.4 — local attachment-id → `blob:` URL map set by the e2e provider on
  // hydration (decrypted image previews). Absent for plain rows.
  attachmentUrls?: Record<string, string>;
}

// S86.1 — a multi-party room (N-party conversation with membership + roles).
// Mirrors the 1:1 `ConversationRow` preview fields, plus room-specific
// metadata. The CALLER's per-membership `unread_count`/`last_read_at` are
// folded in by the backend serializer.
export interface RoomRow {
  id: string;
  name: string | null;
  protocol: string;
  capabilities: Record<string, unknown>;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  last_read_at: string | null;
  // Some serializers include an inline member summary; never relied upon for
  // role gating (the view fetches `listRoomMembers` for the authoritative list).
  members?: RoomMemberRow[];
  member_count?: number;
}

export interface RoomMemberRow {
  user_id: string;
  role: 'admin' | 'member';
  nickname: string | null;
}

export interface CreateRoomInput {
  member_nicknames: string[];
  name?: string;
}

// S86.3 — the bot-widget "Start Conversation" contract. The member list +
// visibility are SERVER-TRUSTED from the stored widget; the client only sends
// the slug (+ a `display_name` for public widgets). `access_token` is returned
// for `public` widgets only (the GUEST JWT scoped to its room); `token_balance`
// is present when the guest token-economy is on (D11).
export interface WidgetStartInput {
  widget_slug: string;
  display_name?: string;
}

export interface WidgetStartResult {
  room_id: string;
  self_nickname: string;
  members: RoomMemberRow[];
  access_token?: string;
  token_balance?: number;
  // Admin-configured token-bundles page link, surfaced by widget/start so the
  // out-of-tokens "Buy tokens" button can target the configured page.
  buy_tokens_href?: string;
}

export interface TokenTransferResult {
  transfer_id: string;
  amount: number;
  recipient_nickname: string;
  new_balance: number | null;
}

export interface TokenTransferHistoryRow {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  amount: number;
  note: string | null;
  executed_at: string | null;
}

export interface StreamTokenResponse {
  stream_token: string;
  ttl_seconds: number;
}

export interface MessagingLimits {
  messages_retention_days_server: number;
  messages_retention_days_client_suggested: number;
  attachments_retention_days_server: number;
  ciphertext_max_bytes: number;
}


/**
 * Build the JSON request headers.
 *
 * `authToken` (S86.3) lets a caller override the bearer with an explicitly
 * scoped token — e.g. a public widget's GUEST JWT (`access_token`) so its room
 * calls authenticate as the guest, NOT the app's global session. When omitted
 * the app session token from localStorage is used (the original behaviour).
 */
function authHeaders(
  extra: Record<string, string> = {},
  authToken?: string,
): Record<string, string> {
  const bearer = authToken ?? localStorage.getItem('auth_token') ?? '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`,
    ...extra,
  };
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw body;
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ── nicknames ───────────────────────────────────────────────────────────────

export async function getMyNickname(): Promise<MyNickname> {
  const res = await fetch('/api/v1/nickname/me', { headers: authHeaders() });
  return jsonOrThrow<MyNickname>(res);
}

export async function setMyNickname(nickname: string): Promise<NicknameRow> {
  const res = await fetch('/api/v1/nickname/me', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ nickname }),
  });
  return jsonOrThrow<NicknameRow>(res);
}

export async function searchNicknames(prefix: string): Promise<{ items: NicknameSearchHit[] }> {
  const res = await fetch(
    `/api/v1/nickname/search?q=${encodeURIComponent(prefix)}`,
    { headers: authHeaders() },
  );
  return jsonOrThrow<{ items: NicknameSearchHit[] }>(res);
}

export async function getNicknameCard(nickname: string): Promise<NicknameCard> {
  const res = await fetch(
    `/api/v1/nickname/${encodeURIComponent(nickname)}/card`,
    { headers: authHeaders() },
  );
  return jsonOrThrow<NicknameCard>(res);
}

// ── contacts ────────────────────────────────────────────────────────────────

export async function listContacts(): Promise<{ items: ContactRow[] }> {
  const res = await fetch('/api/v1/contacts', { headers: authHeaders() });
  return jsonOrThrow<{ items: ContactRow[] }>(res);
}

export async function addContact(input: {
  nickname: string;
  alias?: string;
  note?: string;
  pinned?: boolean;
}): Promise<ContactRow> {
  const res = await fetch('/api/v1/contacts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return jsonOrThrow<ContactRow>(res);
}

export async function patchContact(
  id: string,
  patch: { alias?: string | null; note?: string | null; pinned?: boolean },
): Promise<ContactRow> {
  const res = await fetch(`/api/v1/contacts/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<ContactRow>(res);
}

export async function deleteContact(id: string): Promise<void> {
  const res = await fetch(`/api/v1/contacts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return jsonOrThrow<void>(res);
}

// ── messaging ───────────────────────────────────────────────────────────────

export async function listConversations(): Promise<{ items: ConversationRow[] }> {
  const res = await fetch('/api/v1/messaging/conversations', { headers: authHeaders() });
  return jsonOrThrow<{ items: ConversationRow[] }>(res);
}

export async function startOrGetConversation(peerNickname: string): Promise<ConversationRow> {
  const res = await fetch('/api/v1/messaging/conversations', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ peer_nickname: peerNickname }),
  });
  return jsonOrThrow<ConversationRow>(res);
}

export async function listMessages(
  conversationId: string,
  options: { before?: string; limit?: number } = {},
): Promise<{ items: MessageRow[] }> {
  const params = new URLSearchParams();
  if (options.before) params.set('before', options.before);
  if (options.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const url = `/api/v1/messaging/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: authHeaders() });
  return jsonOrThrow<{ items: MessageRow[] }>(res);
}

export async function sendTextMessage(
  conversationId: string,
  body: string,
  meta?: MessageMeta,
): Promise<MessageRow> {
  // `meta` is omitted from the payload unless provided, so a plain text send
  // is byte-for-byte identical to before (S70.1 regression guarantee).
  const payload: { body: string; meta?: MessageMeta } = { body };
  if (meta) payload.meta = meta;
  const res = await fetch(
    `/api/v1/messaging/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    },
  );
  return jsonOrThrow<MessageRow>(res);
}

export async function sendAttachmentMessage(
  conversationId: string,
  file: File,
  body = '',
): Promise<MessageRow> {
  // multipart/form-data — the browser sets the boundary; do NOT include
  // a Content-Type header here.
  const form = new FormData();
  form.append('file', file);
  if (body) form.append('body', body);
  const res = await fetch(
    `/api/v1/messaging/conversations/${conversationId}/messages/attachment`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}` },
      body: form,
    },
  );
  return jsonOrThrow<MessageRow>(res);
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const res = await fetch(
    `/api/v1/messaging/conversations/${conversationId}/read`,
    { method: 'POST', headers: authHeaders() },
  );
  return jsonOrThrow<void>(res);
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  const res = await fetch(
    `/api/v1/messaging/conversations/${conversationId}/messages/${messageId}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  return jsonOrThrow<void>(res);
}

export async function mintStreamToken(authToken?: string): Promise<StreamTokenResponse> {
  const res = await fetch('/api/v1/messaging/stream/token', {
    method: 'POST',
    headers: authHeaders({}, authToken),
  });
  return jsonOrThrow<StreamTokenResponse>(res);
}

export async function getMessagingLimits(): Promise<MessagingLimits> {
  const res = await fetch('/api/v1/messaging/limits', { headers: authHeaders() });
  return jsonOrThrow<MessagingLimits>(res);
}

// ── rooms (S86.1) ─────────────────────────────────────────────────────────
// Multi-party rooms reuse the same message shape + SSE stream as 1:1 chats;
// the only difference is the parent FK (`room_id` instead of `conversation_id`)
// and membership/role metadata. Rooms run the `plain` protocol in S86.1
// (E2E is layered on in S86.2), so create always pins `accepted_protocols`.

const ROOM_PROTOCOLS_PLAIN = ['plain'];

export async function createRoom(input: CreateRoomInput): Promise<RoomRow> {
  const res = await fetch('/api/v1/messaging/rooms', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ...input, accepted_protocols: ROOM_PROTOCOLS_PLAIN }),
  });
  return jsonOrThrow<RoomRow>(res);
}

export async function listRooms(): Promise<{ items: RoomRow[] }> {
  const res = await fetch('/api/v1/messaging/rooms', { headers: authHeaders() });
  return jsonOrThrow<{ items: RoomRow[] }>(res);
}

export async function getRoom(roomId: string): Promise<RoomRow> {
  const res = await fetch(`/api/v1/messaging/rooms/${roomId}`, { headers: authHeaders() });
  return jsonOrThrow<RoomRow>(res);
}

export async function listRoomMembers(roomId: string): Promise<{ items: RoomMemberRow[] }> {
  const res = await fetch(`/api/v1/messaging/rooms/${roomId}/members`, {
    headers: authHeaders(),
  });
  return jsonOrThrow<{ items: RoomMemberRow[] }>(res);
}

// The room read/send/mark functions accept an optional `authToken` (S86.3) so a
// public-widget GUEST can drive its own room with the minted `access_token`
// instead of the app session — every other caller passes nothing and keeps the
// app-session behaviour (one home for each call shape; DRY).
export async function listRoomMessages(
  roomId: string,
  options: { before?: string; limit?: number } = {},
  authToken?: string,
): Promise<{ items: MessageRow[] }> {
  const params = new URLSearchParams();
  if (options.before) params.set('before', options.before);
  if (options.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const url = `/api/v1/messaging/rooms/${roomId}/messages${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: authHeaders({}, authToken) });
  return jsonOrThrow<{ items: MessageRow[] }>(res);
}

// S86.3 D11 — a metered guest's room send response carries the guest's balance
// AFTER the per-word question charge, so the widget can update without a second
// round-trip. Absent for non-guest / non-widget / economy-off sends.
export type RoomSendResult = MessageRow & { token_balance?: number };

export async function sendRoomMessage(
  roomId: string,
  body: string,
  meta?: MessageMeta,
  authToken?: string,
): Promise<RoomSendResult> {
  // Mirrors `sendTextMessage` — `meta` is omitted unless provided so a plain
  // room send is byte-for-byte identical to the 1:1 plain send. A 402
  // `insufficient_tokens` body is thrown like any other error (S86.3 D11).
  const payload: { body: string; meta?: MessageMeta } = { body };
  if (meta) payload.meta = meta;
  const res = await fetch(`/api/v1/messaging/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: authHeaders({}, authToken),
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<RoomSendResult>(res);
}

export async function markRoomRead(roomId: string, authToken?: string): Promise<void> {
  const res = await fetch(`/api/v1/messaging/rooms/${roomId}/read`, {
    method: 'POST',
    headers: authHeaders({}, authToken),
  });
  return jsonOrThrow<void>(res);
}

// S86.3 D11 (word-based) — the caller's live token balance. The guest JWT
// authorises this, so the widget refreshes its remaining-tokens count after a
// bot answer arrives (the answer's words are charged server-side too).
export async function getWidgetBalance(authToken?: string): Promise<{ token_balance: number }> {
  const res = await fetch('/api/v1/messaging/widget/balance', {
    headers: authHeaders({}, authToken),
  });
  return jsonOrThrow<{ token_balance: number }>(res);
}

export async function inviteRoomMember(roomId: string, nickname: string): Promise<void> {
  const res = await fetch(`/api/v1/messaging/rooms/${roomId}/invite`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ nickname }),
  });
  return jsonOrThrow<void>(res);
}

export async function leaveRoom(roomId: string): Promise<void> {
  const res = await fetch(`/api/v1/messaging/rooms/${roomId}/leave`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return jsonOrThrow<void>(res);
}

export async function removeRoomMember(roomId: string, userId: string): Promise<void> {
  const res = await fetch(`/api/v1/messaging/rooms/${roomId}/members/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return jsonOrThrow<void>(res);
}

// S86.3 — start (or, for a returning guest, reuse) a bot-widget conversation.
// No auth is required for a `public` widget's first visit; a returning guest
// presents its stored `access_token` so the backend reuses the same GUEST +
// token balance (D12), and a `logged_in` widget rides the app session. The
// member list + visibility come from the STORED widget, never the request.
export async function startWidgetConversation(
  input: WidgetStartInput,
  authToken?: string,
): Promise<WidgetStartResult> {
  // Only attach Authorization when a token is genuinely present — a first
  // public visit must reach the backend as anonymous (an empty `Bearer `
  // would look like a malformed logged-in attempt).
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch('/api/v1/messaging/widget/start', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  return jsonOrThrow<WidgetStartResult>(res);
}

// S70.4 — the active portable bot-conversation style (public, no auth needed —
// it themes a public chat surface). The fe applies `tokens` as
// `--vbwd-botchat-*` custom properties; a failed fetch falls back to the CSS
// defaults baked into the bubble component.
export async function getActiveBotConversationStyle(): Promise<BotConversationStyle> {
  const res = await fetch('/api/v1/bot-conversation-style/active');
  return jsonOrThrow<BotConversationStyle>(res);
}

// ── token transfer ──────────────────────────────────────────────────────────

export async function sendTokens(input: {
  to_nickname: string;
  amount: number;
  note?: string;
}): Promise<TokenTransferResult> {
  const res = await fetch('/api/v1/token-transfer', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return jsonOrThrow<TokenTransferResult>(res);
}

export async function listTokenTransfers(
  direction: 'in' | 'out' | 'all' = 'all',
): Promise<{ items: TokenTransferHistoryRow[] }> {
  const res = await fetch(
    `/api/v1/token-transfer/history?direction=${direction}`,
    { headers: authHeaders() },
  );
  return jsonOrThrow<{ items: TokenTransferHistoryRow[] }>(res);
}
