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
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_nickname: string;
  body: string;
  attachment_url: string | null;
  attachment_thumb_url: string | null;
  attachment_width_px: number | null;
  attachment_height_px: number | null;
  sent_at: string | null;
  read_at: string | null;
  system_kind: string | null;
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


function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}`,
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
): Promise<MessageRow> {
  const res = await fetch(
    `/api/v1/messaging/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ body }),
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

export async function mintStreamToken(): Promise<StreamTokenResponse> {
  const res = await fetch('/api/v1/messaging/stream/token', {
    method: 'POST',
    headers: authHeaders(),
  });
  return jsonOrThrow<StreamTokenResponse>(res);
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
