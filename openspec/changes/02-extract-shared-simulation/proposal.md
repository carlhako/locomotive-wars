# Proposal

## Why

All game rules live inside the browser script and assume exactly one human (`game.player` is referenced 57 times). Rendering, sound, DOM updates, and particles run inside the same update loop. A multiplayer server needs the rules as a pure, headless simulation that handles any number of trains and runs identically in Node and the browser. This is change 2 of 7 and depends on `01-bootstrap-repo-and-scaffold`.

## What Changes

- Port the game rules from `reference/locomotive-wars-v4.html` into `packages/shared` as a headless simulation with no DOM, audio, canvas, or particle code.
- Replace the single `game.player` with a set of trains, each driven by a per-tick input (turn, boost, brake, aim angle). Humans and bots use the same input path.
- Run the simulation at a fixed tick rate (default 30 Hz) with a seeded random source, so a given seed and input sequence always produce the same world.
- **BREAKING (vs. reference behaviour):** carriages are spaced by distance along the head's path instead of "5 frames back". The reference spacing changed with frame rate and boost speed.
- Apply the same rules to every train:
  - every train can cross its own trail safely (the "bridge")
  - every train picks up trailers within its pickup radius
  - enemy fire and ramming affect every train
  - PvE enemies target the nearest train rather than "the player"
  - the boss targets the nearest human-controlled train
- Weapons aim along each train's input aim angle and can target enemies and other trains.
- Projectiles use swept collision so fast shots cannot tunnel through targets at 30 Hz.
- The world wraps toroidally for trains, enemies, and projectiles.
- Train destruction at zero hull drops half its carriages as pickups.
- Port the bot AI as a controller that produces the same input shape as a human.
- The simulation emits a per-tick event list (fired, hit, destroyed, pickup, boss spawned, and so on) for clients to turn into effects and sound.
- Trains are capped at a configurable maximum carriage count (default 150).
- Not ported: score points, combos, and global slow motion. Scoring is redefined in change 06; slow motion becomes client-only in change 03.

## Capabilities

### New Capabilities

- `game-simulation`: the authoritative rules of the world: tick model, train movement and carriages, pickups, weapons and projectiles, PvE enemies and the boss, damage and destruction, bot control, and the event stream.

### Modified Capabilities

None. No specs exist yet.

## Impact

- New code in `packages/shared/src/sim/` with Vitest suites; no client or server behaviour yet.
- Later changes: `03` renders this simulation's state, `04` runs it on the server, and `05` adds train-vs-train collision kills, respawn, and spawn protection on top of it.
