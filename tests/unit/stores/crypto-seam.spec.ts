import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../../../src/api', () => ({
  listConversations: vi.fn(),
  startOrGetConversation: vi.fn(),
  listMessages: vi.fn(),
  sendTextMessage: vi.fn(),
  sendAttachmentMessage: vi.fn(),
  markConversationRead: vi.fn(),
  deleteMessage: vi.fn(),
}));

import * as api from '../../../src/api';
import { useMeinchatStore } from '../../../src/stores/useMeinchatStore';
import {
  registerMessageCrypto,
  unregisterMessageCrypto,
} from '../../../src/crypto/messageCryptoRegistry';

const e2eConv = {
  id: 'cv-e2e',
  peer_user_id: 'u-bob',
  peer_nickname: 'bob',
  last_message_at: null,
  last_message_preview: null,
  unread_count: 0,
  protocol: 'e2e_v1',
};

const plainConv = { ...e2eConv, id: 'cv-plain', protocol: 'plain' };

describe('meinchat store — crypto-provider seam (S28.3b)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });
  afterEach(() => unregisterMessageCrypto());

  it('routes an e2e_v1 send through the provider (not the plaintext API)', async () => {
    const provider = {
      sendEncryptedText: vi.fn().mockResolvedValue({
        id: 'srv-1', conversation_id: 'cv-e2e', sender_id: 'me',
        sender_nickname: '', body: '', attachments: [], sent_at: 'now',
        read_at: null, system_kind: null, protocol: 'e2e_v1', envelope: 'AAA=',
      }),
      decryptRow: vi.fn(),
    };
    registerMessageCrypto(provider);
    const store = useMeinchatStore();
    store.conversations = [e2eConv as any];

    const row = await store.sendText('cv-e2e', 'top secret');

    expect(provider.sendEncryptedText).toHaveBeenCalledWith(
      'cv-e2e', 'u-bob', 'top secret',
    );
    expect(api.sendTextMessage).not.toHaveBeenCalled();
    // The sent bubble shows our plaintext (re-attached over the opaque row).
    expect(row.body).toBe('top secret');
  });

  it('plaintext conversations still use the plaintext API', async () => {
    (api.sendTextMessage as any).mockResolvedValue({
      id: 'srv-2', conversation_id: 'cv-plain', sender_id: 'me',
      sender_nickname: '', body: 'hello', attachments: [], sent_at: 'now',
      read_at: null, system_kind: null,
    });
    const provider = { sendEncryptedText: vi.fn(), decryptRow: vi.fn() };
    registerMessageCrypto(provider);
    const store = useMeinchatStore();
    store.conversations = [plainConv as any];

    await store.sendText('cv-plain', 'hello');

    expect(api.sendTextMessage).toHaveBeenCalledWith('cv-plain', 'hello');
    expect(provider.sendEncryptedText).not.toHaveBeenCalled();
  });

  it('refuses to send e2e when no provider is available (fail-closed)', async () => {
    const store = useMeinchatStore();
    store.conversations = [e2eConv as any];
    await expect(store.sendText('cv-e2e', 'secret')).rejects.toThrow(
      /secure chat is not available/,
    );
    expect(api.sendTextMessage).not.toHaveBeenCalled();
  });

  it('decrypts e2e rows into a display body on read', async () => {
    const provider = {
      sendEncryptedText: vi.fn(),
      decryptRow: vi.fn().mockResolvedValue('decrypted!'),
    };
    registerMessageCrypto(provider);
    const store = useMeinchatStore();
    const rows = await store._hydrateE2eRows([
      {
        id: 'm1', conversation_id: 'cv-e2e', sender_id: 'u-bob',
        sender_nickname: 'bob', body: '', attachments: [], sent_at: 'now',
        read_at: null, system_kind: null, protocol: 'e2e_v1', envelope: 'AAA=',
      } as any,
    ]);
    expect(provider.decryptRow).toHaveBeenCalled();
    expect(rows[0].body).toBe('decrypted!');
  });

  it('leaves plaintext rows untouched on read', async () => {
    const provider = { sendEncryptedText: vi.fn(), decryptRow: vi.fn() };
    registerMessageCrypto(provider);
    const store = useMeinchatStore();
    const rows = await store._hydrateE2eRows([
      {
        id: 'm2', conversation_id: 'cv-plain', sender_id: 'u-bob',
        sender_nickname: 'bob', body: 'plain text', attachments: [],
        sent_at: 'now', read_at: null, system_kind: null, protocol: 'plain',
      } as any,
    ]);
    expect(provider.decryptRow).not.toHaveBeenCalled();
    expect(rows[0].body).toBe('plain text');
  });

  it('hydrateRow decrypts text + attachment URLs on read when supported', async () => {
    const provider = {
      sendEncryptedText: vi.fn(),
      decryptRow: vi.fn(),
      hydrateRow: vi.fn().mockResolvedValue({
        body: 'caption', attachmentUrls: { 'att-1': 'blob:xyz' },
      }),
    };
    registerMessageCrypto(provider);
    const store = useMeinchatStore();
    const rows = await store._hydrateE2eRows([
      {
        id: 'mi', conversation_id: 'cv-e2e', sender_id: 'u-bob', sender_nickname: 'bob',
        body: '', attachments: [{ id: 'att-1', kind: 'fullres', protocol: 'e2e_v1' }],
        sent_at: 'now', read_at: null, system_kind: null, protocol: 'e2e_v1', envelope: 'AAA=',
      } as any,
    ]);
    expect(provider.hydrateRow).toHaveBeenCalled();
    expect(provider.decryptRow).not.toHaveBeenCalled();
    expect(rows[0].body).toBe('caption');
    expect(rows[0].attachmentUrls?.['att-1']).toBe('blob:xyz');
  });

  it('routes an e2e image send through sendEncryptedImage; plain via the api', async () => {
    const provider = {
      sendEncryptedText: vi.fn(),
      decryptRow: vi.fn(),
      sendEncryptedImage: vi.fn().mockResolvedValue({
        id: 'img-1', conversation_id: 'cv-e2e', sender_id: 'me', body: 'cap',
        attachments: [{ id: 'a', kind: 'fullres', protocol: 'e2e_v1' }], sent_at: 'now',
        read_at: null, system_kind: null, protocol: 'e2e_v1', envelope: 'AAA=',
      }),
    };
    registerMessageCrypto(provider);
    const store = useMeinchatStore();
    store.conversations = [e2eConv as any];
    const file = new Blob(['x']) as File;
    await store.sendAttachment('cv-e2e', file, 'cap');
    expect(provider.sendEncryptedImage).toHaveBeenCalledWith('cv-e2e', 'u-bob', file, 'cap');
    expect(api.sendAttachmentMessage).not.toHaveBeenCalled();
  });

  it('refuses an e2e image send when no provider supports it', async () => {
    registerMessageCrypto({ sendEncryptedText: vi.fn(), decryptRow: vi.fn() });
    const store = useMeinchatStore();
    store.conversations = [e2eConv as any];
    await expect(
      store.sendAttachment('cv-e2e', new Blob(['x']) as File, ''),
    ).rejects.toThrow(/secure chat is not available/);
    expect(api.sendAttachmentMessage).not.toHaveBeenCalled();
  });
});
