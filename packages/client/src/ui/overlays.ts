import type { ConnectionStatus, DisconnectReason } from '../net/connection.ts';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el as T;
}

/** What the player is told when a connection ends. */
export function disconnectMessage(reason: DisconnectReason): string {
  switch (reason) {
    case 'version':
      return 'This game has been updated. Reload the page to get the new version.';
    case 'full':
      return 'The server is full. Try again in a moment.';
    case 'malformed':
      return 'The server could not understand the client. Reload the page.';
    case 'timeout':
      return 'The server stopped responding.';
    case 'closed':
      return 'The connection to the server was lost.';
  }
}

/** True when pressing reconnect can help; false when the page itself is out of date. */
export function canReconnect(reason: DisconnectReason): boolean {
  return reason !== 'version' && reason !== 'malformed';
}

export interface JoinScreen {
  /** Called with the entered name when the player presses Play. */
  onPlay(handler: (name: string) => void): void;
  setName(name: string): void;
  /** Shows a message under the form, or clears it with an empty string. */
  setError(message: string): void;
  setBusy(busy: boolean): void;
  hide(): void;
  show(): void;
}

export function bindJoinScreen(): JoinScreen {
  const root = byId('join-screen');
  const form = byId<HTMLFormElement>('join-form');
  const input = byId<HTMLInputElement>('player-name');
  const button = byId<HTMLButtonElement>('play-btn');
  const error = byId('join-error');
  let handler: ((name: string) => void) | null = null;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handler?.(input.value);
  });

  return {
    onPlay: (h) => {
      handler = h;
    },
    setName: (name) => {
      input.value = name;
    },
    setError: (message) => {
      error.textContent = message;
    },
    setBusy: (busy) => {
      button.disabled = busy;
      input.disabled = busy;
      button.textContent = busy ? 'Joining…' : 'Play';
    },
    hide: () => {
      root.style.display = 'none';
    },
    show: () => {
      root.style.display = 'flex';
      input.focus();
    },
  };
}

export interface DisconnectScreen {
  /** Called when the player presses Reconnect. */
  onReconnect(handler: () => void): void;
  /** Reflects a connection status: shown while disconnected (and while reconnecting). */
  update(status: ConnectionStatus, reason: DisconnectReason | null): void;
}

export function bindDisconnectScreen(): DisconnectScreen {
  const root = byId('disconnect-screen');
  const message = byId('disconnect-reason');
  const button = byId<HTMLButtonElement>('reconnect-btn');
  let handler: (() => void) | null = null;
  // The overlay stays up while a reconnect is under way, so it does not flash.
  let shown = false;

  button.addEventListener('click', () => handler?.());

  return {
    onReconnect: (h) => {
      handler = h;
    },
    update: (status, reason) => {
      if (status === 'online') {
        shown = false;
        root.style.display = 'none';
        return;
      }
      if (status === 'disconnected') {
        shown = true;
        message.textContent = disconnectMessage(reason ?? 'closed');
        button.disabled = false;
        button.style.display = canReconnect(reason ?? 'closed') ? '' : 'none';
        root.style.display = 'flex';
        return;
      }
      if (shown) {
        message.textContent = 'Reconnecting…';
        button.disabled = true;
      }
    },
  };
}
