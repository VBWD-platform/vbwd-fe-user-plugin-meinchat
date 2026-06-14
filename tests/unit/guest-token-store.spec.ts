import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadGuestToken,
  persistGuestToken,
  clearGuestToken,
} from '../../src/widget/guestTokenStore';

describe('meinchat guest token store (S86.3 D12)', () => {
  beforeEach(() => {
    localStorage.clear();
    // happy-dom supports document.cookie
    document.cookie
      .split(';')
      .forEach((c) => {
        const name = c.split('=')[0].trim();
        if (name) document.cookie = `${name}=;max-age=0;path=/`;
      });
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns null when nothing is stored for the slug', () => {
    expect(loadGuestToken('chat-1')).toBeNull();
  });

  it('persists the token in long-lived localStorage keyed by widget slug', () => {
    persistGuestToken('chat-1', 'guest-jwt');
    expect(localStorage.getItem('meinchat_guest_token__chat-1')).toBe('guest-jwt');
    expect(loadGuestToken('chat-1')).toBe('guest-jwt');
  });

  it('persists the token in a cookie as well as localStorage (D12)', () => {
    persistGuestToken('chat-1', 'guest-jwt');
    expect(document.cookie).toContain('meinchat_guest_token__chat-1=guest-jwt');
  });

  it('falls back to the cookie when localStorage was cleared', () => {
    persistGuestToken('chat-1', 'guest-jwt');
    localStorage.clear();
    expect(loadGuestToken('chat-1')).toBe('guest-jwt');
  });

  it('keeps tokens for different slugs independent', () => {
    persistGuestToken('chat-1', 'token-1');
    persistGuestToken('chat-2', 'token-2');
    expect(loadGuestToken('chat-1')).toBe('token-1');
    expect(loadGuestToken('chat-2')).toBe('token-2');
  });

  it('clearGuestToken removes both the localStorage entry and the cookie', () => {
    persistGuestToken('chat-1', 'guest-jwt');
    clearGuestToken('chat-1');
    expect(loadGuestToken('chat-1')).toBeNull();
    expect(localStorage.getItem('meinchat_guest_token__chat-1')).toBeNull();
  });
});
