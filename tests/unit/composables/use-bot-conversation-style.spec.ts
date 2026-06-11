import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyBotConversationStyle } from '../../../src/composables/useBotConversationStyle';
import * as api from '../../../src/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyBotConversationStyle (S70.4)', () => {
  it('applies each returned token as a --vbwd-botchat-* custom property', async () => {
    vi.spyOn(api, 'getActiveBotConversationStyle').mockResolvedValue({
      name: 'Walkthrough',
      tokens: {
        card_bg: '#ffffff',
        card_border: '#e6e9ef',
        accent: '#3b6ef0',
        gap: '6px',
      },
    });
    const element = document.createElement('div');

    await applyBotConversationStyle(element);

    expect(element.style.getPropertyValue('--vbwd-botchat-card-bg')).toBe('#ffffff');
    expect(element.style.getPropertyValue('--vbwd-botchat-card-border')).toBe(
      '#e6e9ef',
    );
    expect(element.style.getPropertyValue('--vbwd-botchat-accent')).toBe('#3b6ef0');
    expect(element.style.getPropertyValue('--vbwd-botchat-gap')).toBe('6px');
  });

  it('a failed fetch falls back silently — no vars set, no throw', async () => {
    vi.spyOn(api, 'getActiveBotConversationStyle').mockRejectedValue(
      new Error('network down'),
    );
    const element = document.createElement('div');

    await expect(applyBotConversationStyle(element)).resolves.toBeUndefined();
    expect(element.style.getPropertyValue('--vbwd-botchat-accent')).toBe('');
  });

  it('an empty/inactive style (no tokens) sets nothing and does not throw', async () => {
    vi.spyOn(api, 'getActiveBotConversationStyle').mockResolvedValue({
      name: null,
      tokens: {},
    });
    const element = document.createElement('div');

    await applyBotConversationStyle(element);
    expect(element.style.getPropertyValue('--vbwd-botchat-card-bg')).toBe('');
  });
});
