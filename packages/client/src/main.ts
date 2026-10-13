import './hud/styles.css';
import { Game } from './loop.ts';
import { OfflineSession } from './offline.ts';

/** `?offline` (any value) runs the shared simulation in this tab with bots, no server needed. */
function wantsOffline(search: string): boolean {
  return new URLSearchParams(search).has('offline');
}

function showNotice(message: string): void {
  const el = document.getElementById('notice');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
}

if (wantsOffline(window.location.search)) {
  document.body.classList.add('playing');
  const session = new OfflineSession();
  const game = new Game(session);
  game.start();
  if (import.meta.env.DEV) {
    // Exposed for poking at the running game from the dev console.
    (window as unknown as { __lw: { game: Game; session: OfflineSession } }).__lw = {
      game,
      session,
    };
  }
} else {
  // Networked play arrives with change 04; until then the offline harness is the only mode.
  showNotice('Online play is not available yet. Open this page with ?offline to play locally.');
}
