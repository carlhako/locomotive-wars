# Proposal

## Why

The reference renders by reading the live global `game` object, so rendering cannot work from state that arrives over the network. The client needs to draw from a self-contained view of the world, and to turn simulation events into effects and sound, before networking is added. This is change 3 of 7. It depends on `02-extract-shared-simulation` and can be built before or after `04-realtime-server-netcode`.

## What Changes

- Port the reference canvas drawing to `packages/client`: starfield, trains with type-coloured carriages, bridge, enemies, boss, trailers, drops, projectiles, minimap, and HUD panels and styling.
- Define a `WorldView` render model in `@lw/shared`: what the client needs to draw one frame, plus the local player's id. The renderer reads only `WorldView` and events, never the simulation directly.
- Drive presentation from simulation events:
  - damage numbers, kill feed, explosions, and screen shake
  - boss banner and boss hull bar
  - bridge indicator and procedural WebAudio sounds
- Particles (smoke, sparks, heat shimmer) are generated client-side from state and events.
- Capture input (A/D or arrows to turn, Space to boost, S/Down to brake, mouse for aim) and convert it to the shared `TrainInput`. The aim angle is computed from the local head's screen position.
- Add an offline mode (`?offline`) that runs the shared simulation in the browser with bots. It is the development harness that proves the renderer is decoupled.
- **BREAKING (vs. reference):** global slow motion is removed, because a shared world cannot slow time for one player. The kill/death "punch" is kept as visual-only effects (flash, shake).

## Capabilities

### New Capabilities

- `game-client`: browser presentation: drawing the world from a view model, HUD and minimap, event-driven effects and sound, input capture, and the offline play mode.

### Modified Capabilities

None.

## Impact

- New code in `packages/client/src/` (render, hud, fx, audio, input, offline) and a `WorldView` type in `packages/shared/src/view.ts`.
- Change 04 feeds `WorldView` from network snapshots. Change 06 adds score, round, and leaderboard UI; change 07 adds high-score screens.
