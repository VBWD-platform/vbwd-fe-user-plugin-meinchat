// S28.3b — crypto-provider seam for the meinchat store.
//
// meinchat (the base messaging plugin) owns the store + UI but knows NOTHING
// about encryption. meinchat-plus registers a provider here; the store routes
// `e2e_v1` conversations through it and falls back to plaintext otherwise.
// Mirrors the backend's registry seam (core agnostic; gnostic in the plugin).

import type { MessageRow } from '../api';

export interface MessageCryptoProvider {
  /** Encrypt `plaintext` for an e2e conversation + post it. Returns the stored
   *  server row (opaque envelope; `body` is null server-side). */
  sendEncryptedText(
    conversationId: string,
    peerUserId: string,
    plaintext: string,
  ): Promise<MessageRow>;

  /** Decrypt a stored e2e row to plaintext for display, or null if this client
   *  cannot (no slot / no session). Never throws — returns null on failure. */
  decryptRow(row: MessageRow): Promise<string | null>;

  /** S28.4 — send an image into an e2e conversation: client-resize + encrypt +
   *  upload the fullres blob. Returns the stored message row (with a local
   *  preview URL for the sender). Optional — absent on a text-only provider. */
  sendEncryptedImage?(
    conversationId: string,
    peerUserId: string,
    file: Blob,
    caption: string,
  ): Promise<MessageRow>;

  /** S28.4 — decrypt a whole e2e row IN ORDER (text envelope, then each
   *  attachment) so the ratchet stays in sync, returning the display body + a
   *  map of attachment id → `blob:` URL. The store uses this on read instead of
   *  `decryptRow` when the provider supports it. Never throws. */
  hydrateRow?(
    row: MessageRow,
  ): Promise<{ body: string | null; attachmentUrls: Record<string, string> }>;
}

let provider: MessageCryptoProvider | null = null;

export function registerMessageCrypto(p: MessageCryptoProvider): void {
  provider = p;
}

export function unregisterMessageCrypto(): void {
  provider = null;
}

export function getMessageCrypto(): MessageCryptoProvider | null {
  return provider;
}
