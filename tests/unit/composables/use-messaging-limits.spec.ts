import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api', () => ({
  getMessagingLimits: vi.fn(),
}));

import * as api from '../../../src/api';
import {
  useMessagingLimits,
  _resetMessagingLimits,
} from '../../../src/composables/useMessagingLimits';

const SAMPLE = {
  messages_retention_days_server: 2,
  messages_retention_days_client_suggested: 10,
  attachments_retention_days_server: 2,
  ciphertext_max_bytes: 16384,
};

describe('useMessagingLimits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    _resetMessagingLimits();
  });

  it('fetches once; subsequent calls within 24h use the cache', async () => {
    (api.getMessagingLimits as any).mockResolvedValue({ ...SAMPLE });

    const first = useMessagingLimits();
    await first.refresh();
    expect(api.getMessagingLimits).toHaveBeenCalledTimes(1);
    expect(first.data.value).toEqual(SAMPLE);

    // A second consumer mounting later must NOT re-fetch — the
    // module-scope cache is still fresh.
    const second = useMessagingLimits();
    await second.refresh();
    expect(api.getMessagingLimits).toHaveBeenCalledTimes(1);
    expect(second.data.value).toEqual(SAMPLE);
  });

  it('refresh() forces a re-fetch when the cache is stale (>24h)', async () => {
    (api.getMessagingLimits as any).mockResolvedValue({ ...SAMPLE });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));

    const limits = useMessagingLimits();
    await limits.refresh();
    expect(api.getMessagingLimits).toHaveBeenCalledTimes(1);

    // Advance past the 24h TTL — the next refresh must hit the network.
    vi.setSystemTime(new Date('2026-05-30T01:00:00Z'));
    await limits.refresh();
    expect(api.getMessagingLimits).toHaveBeenCalledTimes(2);
  });

  it('refresh() always re-fetches on an explicit/forced call even within TTL', async () => {
    (api.getMessagingLimits as any).mockResolvedValue({ ...SAMPLE });

    const limits = useMessagingLimits();
    await limits.refresh();
    expect(api.getMessagingLimits).toHaveBeenCalledTimes(1);

    await limits.refresh(true);
    expect(api.getMessagingLimits).toHaveBeenCalledTimes(2);
  });

  it('on HTTP error exposes error and preserves the previous cached value', async () => {
    (api.getMessagingLimits as any).mockResolvedValueOnce({ ...SAMPLE });

    const limits = useMessagingLimits();
    await limits.refresh();
    expect(limits.data.value).toEqual(SAMPLE);
    expect(limits.error.value).toBeNull();

    (api.getMessagingLimits as any).mockRejectedValueOnce({ error: 'boom' });
    await limits.refresh(true);

    // Good data is kept intact; the error is surfaced separately.
    expect(limits.data.value).toEqual(SAMPLE);
    expect(limits.error.value).toBeTruthy();
    expect(limits.loading.value).toBe(false);
  });
});
