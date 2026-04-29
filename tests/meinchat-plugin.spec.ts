import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry, PlatformSDK } from 'vbwd-view-component';
import { meinchatPlugin } from '../index';

describe('Meinchat Plugin', () => {
  let registry: PluginRegistry;
  let sdk: PlatformSDK;

  beforeEach(() => {
    registry = new PluginRegistry();
    sdk = new PlatformSDK();
  });

  it('declares correct metadata', () => {
    expect(meinchatPlugin.name).toBe('meinchat');
    expect(meinchatPlugin.version).toBe('1.0.0');
  });

  it('registers four routes on install', async () => {
    registry.register(meinchatPlugin);
    await registry.installAll(sdk);

    const paths = sdk.getRoutes().map((r) => r.path);
    expect(paths).toContain('/dashboard/messages');
    expect(paths).toContain('/dashboard/messages/contacts');
    expect(paths).toContain('/dashboard/messages/:nickname');
    expect(paths).toContain('/dashboard/profile/nickname');
  });

  it('all routes require auth', async () => {
    registry.register(meinchatPlugin);
    await registry.installAll(sdk);
    for (const route of sdk.getRoutes()) {
      expect(route.meta?.requiresAuth).toBe(true);
    }
  });

  it('loads all 8 locales', async () => {
    registry.register(meinchatPlugin);
    await registry.installAll(sdk);

    const translations = sdk.getTranslations() as Record<string, any>;
    for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ru', 'th', 'zh']) {
      expect(translations[locale]?.meinchat?.nav?.messages).toBeDefined();
    }
  });
});
