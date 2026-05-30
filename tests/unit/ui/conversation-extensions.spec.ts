import { describe, it, expect, afterEach, vi } from 'vitest';
import { defineComponent } from 'vue';
import {
  getComposerPrecheck,
  getConversationOverlay,
  registerComposerPrecheck,
  registerConversationOverlay,
  resetConversationExtensions,
} from '../../../src/ui/conversationExtensions';

describe('conversation UI extension seams (S28.3b)', () => {
  afterEach(() => resetConversationExtensions());

  it('defaults to no overlay and no precheck (meinchat-alone)', () => {
    expect(getConversationOverlay()).toBeNull();
    expect(getComposerPrecheck()).toBeNull();
  });

  it('a plugin can register an overlay component', () => {
    const Comp = defineComponent({ template: '<div/>' });
    registerConversationOverlay(Comp);
    expect(getConversationOverlay()).toBe(Comp);
  });

  it('a plugin can register a composer precheck', async () => {
    const fn = vi.fn(async () => ({ canSend: false, hint: 'no device' }));
    registerComposerPrecheck(fn);
    const result = await getComposerPrecheck()!({ protocol: 'e2e_v1' } as any);
    expect(result.canSend).toBe(false);
    expect(result.hint).toBe('no device');
  });
});
