import './hud/styles.css';
import { startAttract } from './attract/scene.ts';
import { Game } from './loop.ts';
import { NetSession } from './net/connection.ts';
import { defaultServerUrl } from './net/transport.ts';
import { OfflineSession } from './offline.ts';
import { loadName, saveName } from './ui/join.ts';
import { bindFooter } from './ui/footer.ts';
import { bindDisconnectScreen, bindJoinScreen, disconnectMessage } from './ui/overlays.ts';

/** `?offline` (any value) runs the shared simulation in this tab with bots, no server needed. */
function wantsOffline(search: string): boolean {
  return new URLSearchParams(search).has('offline');
}

/** Exposed for poking at the running game from the dev console. */
function exposeForDebugging(handles: Record<string, unknown>): void {
  if (import.meta.env.DEV) (window as unknown as { __lw: unknown }).__lw = handles;
}

function startOffline(): void {
  document.getElementById('join-screen')?.remove();
  document.body.classList.add('playing');
  const session = new OfflineSession();
  const game = new Game(session);
  game.start();
  exposeForDebugging({ game, session });
}

function startOnline(): void {
  // Bots play behind the join screen until the server accepts the join.
  const attract = startAttract({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  exposeForDebugging({ attract: attract.world });
  const join = bindJoinScreen();
  const disconnected = bindDisconnectScreen();
  bindFooter();
  join.setName(loadName());
  join.show();

  let joining = false;
  const attempt = (name: string): void => {
    if (joining) return;
    joining = true;
    join.setError('');
    join.setBusy(true);
    const trimmed = name.trim();
    saveName(trimmed);

    const session = new NetSession({
      url: defaultServerUrl(window.location),
      name: trimmed,
      onStatus: (status, reason) => {
        // Before the first snapshot the join screen reports problems; after, the overlay does.
        if (document.body.classList.contains('playing'))
          disconnected.update(status, reason ?? null, session.fullInfo);
      },
    });
    disconnected.onReconnect(() => session.reconnect());

    session.ready.then(
      () => {
        attract.stop();
        join.hide();
        document.body.classList.add('playing');
        const game = new Game(session);
        game.start();
        exposeForDebugging({ game, session });
      },
      () => {
        joining = false;
        join.setBusy(false);
        const why = session.reason ?? 'closed';
        if (why === 'full') {
          // A full server gets its own screen with a Retry button that joins afresh.
          join.hide();
          disconnected.onReconnect(() => {
            disconnected.hide();
            join.show();
            attempt(trimmed);
          });
          disconnected.update('disconnected', why, session.fullInfo);
          return;
        }
        join.setError(disconnectMessage(why));
      },
    );
  };
  join.onPlay(attempt);
}

if (wantsOffline(window.location.search)) startOffline();
else startOnline();
