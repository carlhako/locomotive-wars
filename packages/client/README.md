# @lw/client

The browser presentation layer for Locomotive Wars: it draws the world, the HUD and the minimap,
turns simulation events into effects and sound, and captures the player's input. It is a
port of the reference game's canvas drawing (`reference/locomotive-wars-v4.html`), restructured
so that nothing reads simulation state directly.

## Running it

From the repository root:

```bash
npm run dev -w @lw/client
```

To play online, run the server too (`npm run dev` from the repository root starts both), open
<http://localhost:5173/>, enter a name, and press Play. The name is remembered in `localStorage`
under `lw.name`. If the connection drops, or no snapshot arrives for 5 seconds, a "Disconnected"
overlay offers a Reconnect button, which joins afresh.

For development without a server, open <http://localhost:5173/?offline>. Offline mode runs the
shared simulation inside the page with six bots.

## Controls

| Input              | Action                                                           |
| ------------------ | ---------------------------------------------------------------- |
| `A` / `D`, `←`/`→` | Turn left / right                                                |
| `Space`            | Boost (drains fuel; the tank refills while you are not boosting) |
| `S` / `↓`          | Brake                                                            |
| Mouse              | Aim, measured from your locomotive's screen position             |
| Hold left click    | Fire every weapon carriage at the cursor                         |
| `H`                | Show or hide the carriage guide (remembered as `lw.legend`)      |

These keys never scroll the page. The mute button at the bottom of the screen silences all
audio; the choice is remembered in `localStorage` under `lw.muted`. If your browser blocks
storage, sound simply starts unmuted on every load.

A destroyed train respawns on the next tick, offline and online, as a fresh locomotive-plus-MG
starter at a safe spot, protected for 3.5 s (drawn with a shield ring). A "Destroyed by X" notice
shows for a couple of seconds and the camera jumps to the new train; there is no game-over screen.
There is no slow motion: other trains keep moving at normal speed while your death effects play.

## How it fits together

```
GameSource ──advance(dt, input)──▶ events ──▶ eventFx ──▶ particles, numbers, shake,
     │                                                    kill feed, banner, sound
     └──view()──▶ WorldView ──▶ renderScene / drawMinimap / Hud
```

The one rule: everything is drawn from a `WorldView` (`@lw/shared`, `view.ts`) plus the
`SimEvent`s of the tick. A `GameSource` produces both. `OfflineSession` does it by stepping a
local `World`; `NetSession` produces the same from network snapshots, and all presentation code is
shared.

```
src/
  main.ts          boot: ?offline starts an OfflineSession, otherwise the join screen and a NetSession
  loop.ts          Game: per-frame input -> source -> effects -> render
  source.ts        GameSource interface (the seam between world and presentation)
  offline.ts       local World + bots, 30 Hz accumulator, respawn on destruction
  net/             the online GameSource (see below)
  ui/              join screen (name field, storage) and disconnect overlay
  interpolate.ts   blends two views a tick apart (wrap-aware)
  input.ts         keyboard/mouse -> TrainInput
  render/          canvas (camera, wrapped projection), stars, train, bridge, enemies,
                   pickups, projectiles, minimap, scene (draw order)
  hud/             hud (stats panel, boss bar, mute), killfeed, banner, styles.css
  fx/              particles, damageNumbers, shake, hitFlash, eventFx (SimEvent -> effects)
  audio/           sound (procedural WebAudio, mute persistence)
```

### Networked play (`src/net/`)

| File            | Role                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------- |
| `connection.ts` | `NetSession`: join handshake, input sending, pings, disconnect detection, builds the view |
| `transport.ts`  | The socket behind a small `Transport` interface (a WebSocket today)                       |
| `clock.ts`      | Server-time estimate from ping/pong (median of the five lowest-RTT samples)               |
| `buffer.ts`     | Recent snapshots; samples a `WorldView` at a render time, wrap-aware                      |
| `view.ts`       | Snapshot message to `WorldView`; derives carriage angles from positions                   |
| `localTrain.ts` | The player's own train: newest state run forward, corrections blended over 100 ms         |

Other entities are drawn 133 ms behind the estimated server time and interpolated between
snapshots. The player's own train is drawn from the newest snapshot instead, extrapolated with the
server's turn and speed rules and the current controls, so steering responds at once. The message
formats and rates are in [`@lw/shared`'s protocol notes](../shared/src/protocol/README.md).

### Seam rendering

The world wraps on both axes. Every entity is projected to its nearest copy to the camera
(`screenX` / `screenY` in `render/canvas.ts`), so a train crossing the seam is drawn whole, and
the camera eases across it the short way.

### Cosmetic randomness

Particles, smoke, sparks and screen shake use `Math.random`. They never feed back into the
simulation, which keeps the shared rules deterministic.

### What the view model does not carry yet

Score, kills, the leaderboard and round state belong to change 06; the leaderboard panel's
markup is in place but empty. High scores arrive with change 07.

## Tests

```bash
npm test
```

runs the whole workspace. The client's tests need no DOM: the effects take narrow sink
interfaces (`FxTargets`) and the HUD's numbers come from the pure `hudModel(view)`.
