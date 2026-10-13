# Design

## Context

The reference (`reference/locomotive-wars-v4.html`) mixes rules, rendering, DOM, audio, and particles in one global `game` object, updated by a variable-`dt` `requestAnimationFrame` loop. Relevant findings:

- **Frame-coupled carriage spacing:** carriages sit `FRAMES_PER_SPACING = 5` path samples behind each other (reference `:580`). Spacing therefore depends on frame rate and speed: about 15 units at 60 fps, about 31 when boosting, and tighter on 144 Hz screens. `CARRIAGE_SPACING = 18` is declared but unused.
- **Singleton player:** 57 references to `game.player` cover camera, pickups, collisions, boss targeting, enemy aggro, and kill credit.
- **Asymmetric rules:**
  - only the player has the bridge and self-collision checks
  - only bots take ramming damage from enemies
  - enemy projectiles only hit the player
  - human weapons only target PvE enemies
- **Self-collision never fires in practice:** the bridge activates when any carriage at index 4+ is within 32 units, while death needs a carriage at index 6+ within 14 units. The bridge always activates first, so self-crossing is already safe; the spec states this directly.
- **Global effects:** slow motion and the grace timer apply to the whole world.
- **Untestable randomness:** there are 41 `Math.random` calls, mostly in particles and effects.

## Goals / Non-Goals

**Goals:**
- A pure `World` that the server (change 04) and the client's offline mode (change 03) both step.
- Rules equal for every train; bots differ only in who produces their input.
- Deterministic under seed plus inputs, for tests and future client prediction.

**Non-Goals:**
- Train-vs-train collision kills, respawn, spawn protection, and kill attribution (change 05).
- Scoring, rounds, and the leaderboard (change 06). The reference's `score`, combo, and kill points are not ported.
- Bot population management (change 06). This change only provides the controller.
- Any rendering or networking.

## Decisions

### Module layout (`packages/shared/src/sim/`)

```
constants.ts     reference constants (speeds, radii, weapon stats, spawn caps)
rng.ts           seeded PRNG (mulberry32) - the only randomness source
math.ts          wrapDelta, shortAngle, lerp, segment-circle test
types.ts         TrainInput, TrainState, EnemyState, Projectile, Pickup, SimEvent
path.ts          head trail ring buffer + arc-length sampling
train.ts         movement, fuel, carriages, effects, weapons, bridge
enemies.ts       drone/hunter/sentry/boss behaviour
bot.ts           AI controller: (world, trainId) -> TrainInput
world.ts         World: entities, step(inputs), events, spawn/remove APIs
serialize.ts     stable state serialization for determinism tests
```

`World` exposes `addTrain(opts)`, `removeTrain(id)`, `setInput(id, input)`, `step()` (returns `SimEvent[]`), and read-only state accessors. Ids are small integers so they serialize compactly in change 04.

### Fixed tick

`step()` always advances `1 / tickRate` seconds. Callers own real-time scheduling: the server uses an accumulator loop, and offline mode uses `requestAnimationFrame` with an accumulator. Reference per-second constants are kept and multiplied by the fixed dt. Default 30 Hz keeps server CPU and bandwidth modest. Movement per tick is 6 to 13 units, below the 14-unit head radius, but projectiles move up to 30 units per tick, hence the swept tests below.

### Distance-based carriage path

The head appends its position to a ring buffer each tick, along with the cumulative arc length. Carriage `i` sits at arc length `head - (i + 1) * 18` and is found by binary search plus linear interpolation between samples; its angle comes from the segment direction. The buffer is trimmed to `(maxCarriages + 2) * 18` units of length. Arc length accumulates wrapped deltas, so the seam is handled. This replaces the reference's 6,000-sample frame history and makes spacing independent of speed and tick rate.

### Swept projectile collisions

Each tick a projectile moves from `p0` to `p1`, and the hit test is segment-vs-circle against enemy and train-head circles using wrapped coordinates. The earliest hit along the segment wins. This prevents 900 units/s lasers from skipping over 14-unit targets at 30 Hz.

### Unified rules and targeting

- **Weapon targeting.** A target is any enemy, or any other train's head (later filtered by spawn protection in change 05). Fire direction is the train's input aim angle; the bot controller sets aim to the target it picked, reproducing the reference's auto-aim. The reference fire-arc check (±72° from carriage heading) is kept for both.
- **Enemy behaviour.** Enemies aggro on the nearest train within range, and their projectiles can hit any train. The boss prefers the nearest human, so a pure-bot world still has a boss but humans remain the focus. `TrainState.controller: 'human' | 'bot'` exists for this and for change 06.

### Events instead of effects

Every place the reference spawns particles, plays a sound, or updates the DOM becomes a `SimEvent` push, if the event is meaningful to clients (fired, hit, destroyed, pickup, bridgeOn/Off, bossSpawn/bossDown). Purely cosmetic spawns (smoke, sparks, heat shimmer) are omitted: change 03 derives them from state. Events are plain serializable objects.

### Destruction

At zero hull the train is marked `alive = false`, a `trainDestroyed {victimId, sourceId | null}` event is emitted, and drops are created. The train stays in the world, dead, until its owner (server or offline harness) removes or respawns it in change 05.

## Risks / Trade-offs

- [Behaviour drift from the reference during the port] → Port function by function, citing reference line ranges in comments, and add a scenario test per spec requirement. Tuning constants live in one file.
- [30 Hz feels coarser than the reference's 60 fps] → Clients interpolate (change 04). The tick rate is a parameter and can be raised to 60 if needed.
- [Full determinism across JS engines is not guaranteed for transcendental math] → Determinism is only required within one engine (same-process tests). Client prediction in a later change only needs approximate agreement.
- [Path buffer per train at 150 carriages] → About 2,700 units of trail, sampled every tick, is roughly 400 samples, which is small.

## Open Questions

None.
