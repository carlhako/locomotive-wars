# Design

## Context

The reference's `render()`, `drawTrain()`, `drawBridge()`, `updateHUD()`, `updateMinimap()`, and `updateLeaderboard()` (reference roughly lines 1648 to 2534) read `game.*` globals directly and run particle physics inside `update()`. After change 02 the rules live in `@lw/shared` and emit `SimEvent[]` per tick. This change gives the client its own presentation loop that change 04 can feed from the network.

## Goals / Non-Goals

**Goals:**
- Renderer depends only on `WorldView` plus events, so offline and online share 100% of presentation code.
- Keep the reference look: port the canvas drawing code and CSS rather than redesigning.

**Non-Goals:**
- Networking, interpolation buffers, and the join screen (change 04).
- Score, leaderboard ranking, round timer, and end-of-round screens (change 06), and high scores (change 07). The leaderboard panel's markup is ported but left empty here.
- New art or a framework UI: the HUD remains plain DOM plus CSS.

## Decisions

### `WorldView` lives in `@lw/shared`

```
WorldView {
  tick, time, localId,
  trains:     [{id, name, color, controller, alive, x, y, angle, hp, maxHp,
                fuel, fuelMax, bridge, carriages: [{kind, x, y, angle}]}]
  enemies:    [{id, kind, x, y, angle, hp, maxHp, name?}]
  trailers:   [{id, kind, x, y}]
  drops:      [{id, kind, x, y, age}]
  projectiles:[{id, kind, x, y, vx, vy}]
  minimap:    [{id, x, y, color, isLocal}]
}
```

Offline mode builds it with `viewFromWorld(world, localId)` (in shared, so the server can reuse it to build snapshots in change 04). Online mode builds it from interpolated snapshots. Being in `shared` makes it the contract between 03 and 04.

### Client module layout (`packages/client/src/`)

```
main.ts          boot: offline or online (online stub until change 04)
loop.ts          rAF loop: produce input -> get view -> render -> fx
input.ts         keyboard/mouse -> TrainInput
render/          canvas.ts, stars.ts, train.ts, bridge.ts, enemies.ts, pickups.ts, projectiles.ts, minimap.ts
hud/             hud.ts (DOM panels), killfeed.ts, banner.ts, styles.css (ported CSS)
fx/              particles.ts, damageNumbers.ts, shake.ts, eventFx.ts (SimEvent -> effects)
audio/           sound.ts (ported SoundFX)
offline.ts       local World + bots, fixed-step accumulator, restart on death
```

### Particles and cosmetic randomness are client-only

Smoke, sparks, heat shimmer, and boost trails come from `WorldView` (for example, a train whose speed implies boost emits boost smoke) and from events. They use `Math.random`, since they never affect gameplay. This removes the largest share of the reference's random calls from the simulation.

### Effects are keyed off events, with "local" awareness

`eventFx.ts` maps each `SimEvent` to effects. Whether an event involves `view.localId` decides the extras:
- damage flash when the local train is hit
- heavy shake when the local train is destroyed
- banner when the local player gets a kill

The reference showed these only for "the player"; here "the player" is `localId`.

### Slow motion removed

The reference scaled `dt` on kills and deaths, which can't work in a shared world. It is replaced with a short white or red flash plus shake. This is a deliberate, specified behaviour change.

### Offline mode

The `?offline` query flag runs a local `World` (seed from `Date.now()`) with the local train plus 6 bots, mirroring the reference's single-human bot count, at a fixed 30 Hz using a time accumulator. Rendering is interpolated between the last two ticks for smoothness. On local destruction the session restarts. This is a dev and testing harness and remains available after the beta.

### Mute persistence

`localStorage` key `lw.muted`, wrapped in try/catch so blocked storage falls back to unmuted.

## Risks / Trade-offs

- [Porting about 900 lines of canvas code by hand can introduce visual regressions] → Compare side by side with `reference/locomotive-wars-v4.html` in the browser. Keep the reference draw order and constants.
- [Deriving boost smoke from state may differ slightly from the reference] → Acceptable; it is cosmetic.
- [Rendering 26 trains of up to 150 carriages each frame] → The reference already draws similar counts. Cull off-screen carriages.

## Open Questions

None.
