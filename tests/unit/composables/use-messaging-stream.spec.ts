import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/api', () => ({
  mintStreamToken: vi.fn(),
}));

import * as api from '../../../src/api';
import { useMessagingStream } from '../../../src/composables/useMessagingStream';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emit(payload: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }

  fail() {
    if (this.onerror) this.onerror({} as Event);
  }

  close() {
    this.closed = true;
  }
}

describe('useMessagingStream', () => {
  let origEventSource: any;

  beforeEach(() => {
    FakeEventSource.instances = [];
    origEventSource = (globalThis as any).EventSource;
    (globalThis as any).EventSource = FakeEventSource;
    vi.clearAllMocks();
  });

  afterEach(() => {
    (globalThis as any).EventSource = origEventSource;
  });

  it('mints a stream token then opens an EventSource with it as a query param', async () => {
    (api.mintStreamToken as any).mockResolvedValue({
      stream_token: 'tok-abc',
      ttl_seconds: 60,
    });

    const stream = useMessagingStream();
    await stream.connect();

    const opened = FakeEventSource.instances[0];
    expect(opened.url).toContain('/api/v1/messaging/stream');
    expect(opened.url).toContain('stream_token=tok-abc');
  });

  it('routes incoming SSE messages to subscribers', async () => {
    (api.mintStreamToken as any).mockResolvedValue({
      stream_token: 't',
      ttl_seconds: 60,
    });
    const seen: any[] = [];
    const stream = useMessagingStream();
    stream.onEvent((event) => seen.push(event));
    await stream.connect();

    FakeEventSource.instances[0].emit({ type: 'heartbeat' });
    FakeEventSource.instances[0].emit({
      type: 'message',
      message: { id: 'm', body: 'hi' },
    });

    expect(seen.map((e) => e.type)).toEqual(['heartbeat', 'message']);
  });

  it('disconnect closes the underlying EventSource', async () => {
    (api.mintStreamToken as any).mockResolvedValue({
      stream_token: 't',
      ttl_seconds: 60,
    });
    const stream = useMessagingStream();
    await stream.connect();
    stream.disconnect();

    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
