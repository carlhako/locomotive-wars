/**
 * The byte pipe under the protocol. Only what the session needs: send text, close, and callbacks
 * for open, message, and close. A WebSocket today; the same shape would fit WebTransport.
 */
export interface Transport {
  send(text: string): void;
  close(): void;
}

export interface TransportHandlers {
  onOpen(): void;
  onMessage(text: string): void;
  /** The connection ended, cleanly or not. Called once. */
  onClose(): void;
}

/** Opens a transport to `url`. Injected so tests can drive a session without a network. */
export type Connect = (url: string, handlers: TransportHandlers) => Transport;

export const connectWebSocket: Connect = (url, handlers) => {
  const ws = new WebSocket(url);
  let closed = false;
  const closeOnce = (): void => {
    if (closed) return;
    closed = true;
    handlers.onClose();
  };
  ws.addEventListener('open', () => handlers.onOpen());
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string') handlers.onMessage(e.data);
  });
  ws.addEventListener('close', closeOnce);
  ws.addEventListener('error', closeOnce);
  return {
    send: (text) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    },
    close: () => {
      // Detach first so a deliberate close does not look like a lost connection.
      closed = true;
      ws.close();
    },
  };
};

/** The game server's WebSocket address on the same host that served the page. */
export function defaultServerUrl(loc: { protocol: string; host: string }): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws`;
}
