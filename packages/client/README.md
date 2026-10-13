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

Then open <http://localhost:5173/?offline>. Offline mode runs the shared simulation inside the
page with six bots, so no server is needed. Without `?offline` the page shows a notice, because
networked play arrives with change 04.

## Controls

| Input              | Action                                                           |
| ------------------ | ---------------------------------------------------------------- |
| `A` / `D`, `←`/`→` | Turn left / right                                                |
| `Space`            | Boost (drains fuel; the tank refills while you are not boosting) |
| `S` / `↓`          | Brake                                                            |
| Mouse              | Aim weapons, measured from your locomotive's screen position     |

These keys never scroll the page. The mute button at the bottom of the screen silences all
audio; the choice is remembered in `localStorage` under `lw.muted`. If your browser blocks
storage, sound simply starts unmuted on every load.

Playing offline, a destroyed train restarts the session after a short pause. There is no slow
motion: other trains keep moving at normal speed while your death effects play.

## How it fits together

```
GameSource ──advance(dt, input)──▶ events ──▶ eventFx ──▶ particles, numbers, shake,
     │                                                    kill feed, banner, sound
     └──view()──▶ WorldView ──▶ renderScene / drawMinimap / Hud
```

The one rule: everything is drawn from a `WorldView` (`@lw/shared`, `view.ts`) plus the
`SimEvent`s of the tick. A `GameSource` produces both. `OfflineSession` does it by stepping a
local `World`; the online client (change 04) will produce the same from network snapshots, and
all presentation code is shared.

```
src/
  main.ts          boot: ?offline starts an OfflineSession
  loop.ts          Game: per-frame input -> source -> effects -> render
  source.ts        GameSource interface (the seam between world and presentation)
  offline.ts       local World + bots, 30 Hz accumulator, restart on destruction
  interpolate.ts   blends two views a tick apart (wrap-aware)
  input.ts         keyboard/mouse -> TrainInput
  render/          canvas (camera, wrapped projection), stars, train, bridge, enemies,
                   pickups, projectiles, minimap, scene (draw order)
  hud/             hud (stats panel, boss bar, mute), killfeed, banner, styles.css
  fx/              particles, damageNumbers, shake, hitFlash, eventFx (SimEvent -> effects)
  audio/           sound (procedural WebAudio, mute persistence)
```

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
