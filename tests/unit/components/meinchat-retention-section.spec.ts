import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../../src/api', () => ({
  getMessagingLimits: vi.fn(),
}));

import * as api from '../../../src/api';
import { _resetMessagingLimits } from '../../../src/composables/useMessagingLimits';
import MeinchatRetentionSection from '../../../src/components/MeinchatRetentionSection.vue';

describe('MeinchatRetentionSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetMessagingLimits();
  });

  function mountSection() {
    return mount(MeinchatRetentionSection, {
      global: {
        // Echo the i18n key + interpolation params so the spec can assert
        // the live numbers flow through without coupling to copy.
        mocks: {
          $t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
        },
      },
    });
  }

  it('renders the device + server retention numbers from the composable', async () => {
    (api.getMessagingLimits as any).mockResolvedValue({
      messages_retention_days_server: 7,
      messages_retention_days_client_suggested: 14,
      attachments_retention_days_server: 7,
      ciphertext_max_bytes: 16384,
    });

    const wrapper = mountSection();
    await flushPromises();

    const text = wrapper.text();
    // client_suggested (device, N) = 14, server (M) = 7
    expect(text).toContain('"deviceDays":14');
    expect(text).toContain('"serverDays":7');
  });

  it('binds the numeric input max to the server-suggested value', async () => {
    localStorage.clear();
    (api.getMessagingLimits as any).mockResolvedValue({
      messages_retention_days_server: 2,
      messages_retention_days_client_suggested: 10,
      attachments_retention_days_server: 2,
      ciphertext_max_bytes: 16384,
    });

    const wrapper = mountSection();
    await flushPromises();

    const input = wrapper.get(
      '[data-testid="meinchat-client-retention-input"]',
    );
    expect(input.attributes('max')).toBe('10');
    expect(input.attributes('min')).toBe('0');
  });

  it('clamps a value above the server-suggested max', async () => {
    localStorage.clear();
    (api.getMessagingLimits as any).mockResolvedValue({
      messages_retention_days_server: 2,
      messages_retention_days_client_suggested: 10,
      attachments_retention_days_server: 2,
      ciphertext_max_bytes: 16384,
    });

    const wrapper = mountSection();
    await flushPromises();

    const input = wrapper.get(
      '[data-testid="meinchat-client-retention-input"]',
    );
    await input.setValue('999');
    await flushPromises();

    // v-model is clamped to the server-suggested max and persisted.
    expect((input.element as HTMLInputElement).value).toBe('10');
    expect(localStorage.getItem('meinchat.client_retention_days')).toBe('10');
  });
});
