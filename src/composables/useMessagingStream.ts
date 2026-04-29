/**
 * Wrapper around EventSource for the meinchat SSE stream.
 *
 * Mints a short-lived JWT via `POST /messaging/stream/token`, opens the
 * connection with it as a query parameter (EventSource can't set
 * headers), and re-mints + reconnects on auth-driven errors.
 *
 * Usage:
 *   const stream = useMessagingStream();
 *   stream.onEvent(payload => store.handleStreamEvent(payload));
 *   await stream.connect();
 *   onUnmounted(stream.disconnect);
 */
import { mintStreamToken } from '../api';

type StreamPayload = Record<string, unknown> & { type: string };
type Listener = (event: StreamPayload) => void;

const RECONNECT_DELAY_MS = 1500;

export function useMessagingStream() {
  let source: EventSource | null = null;
  let listeners: Listener[] = [];
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let manuallyClosed = false;

  async function _open() {
    const { stream_token } = await mintStreamToken();
    const url = `/api/v1/messaging/stream?stream_token=${encodeURIComponent(stream_token)}`;
    source = new EventSource(url);

    source.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as StreamPayload;
        listeners.forEach((listener) => listener(parsed));
      } catch {
        // Ignore malformed payloads; stream stays open.
      }
    };

    source.onerror = () => {
      // EventSource auto-reconnects on its own for transient drops; we
      // only intervene when we've been disconnected clean (token
      // invalid, manual close, etc.) so we re-mint a fresh token rather
      // than reusing a possibly-expired one.
      if (manuallyClosed) return;
      if (source) {
        source.close();
        source = null;
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        _open().catch(() => {
          /* swallow — next reconnect will retry */
        });
      }, RECONNECT_DELAY_MS);
    };
  }

  return {
    onEvent(listener: Listener) {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((registered) => registered !== listener);
      };
    },

    async connect() {
      manuallyClosed = false;
      await _open();
    },

    disconnect() {
      manuallyClosed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (source) {
        source.close();
        source = null;
      }
    },
  };
}
