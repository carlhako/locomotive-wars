# @lw/shared

The authoritative, headless Locomotive Wars simulation. It has no DOM, canvas, audio, particle, or
Node-specific code, so the server and the browser step exactly the same rules. Lint enforces this
(`window`, `document`, `process`, `node:*` imports and similar are errors under `packages/shared`),
and the tests run in Vitest's `node` environment.

The rules are a port of `reference/locomotive-wars-v4.html`; every tuning value lives in
[`src/sim/constants.ts`](src/sim/constants.ts) with the reference line it came from.

## Quick start

```ts
import { World, serializeWorld } from '@lw/shared';

const world = new World({ seed: 42 }); // 30 Hz, 6000-unit wrapping map
const me = world.addTrain({ name: 'You', controller: 'human', carriages: ['mg', 'shield'] });
world.addTrain({ controller: 'bot', carriages: ['laser'] });

world.setInput(me.id, { turn: 1, boost: true, aim: 0.5 });
const events = world.step(); // advances exactly one tick, returns what happened
```

## World API

| API                              | Purpose                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `new World(options?)`            | Creates a world; places the initial trailers and enemies from the seed.                                            |
| `addTrain(opts?)` → `TrainState` | Adds a train (locomotive plus `carriages`). Position is random and clear of other trains unless `x`/`y` are given. |
| `removeTrain(id)`                | Removes a train. Returns whether it existed.                                                                       |
| `setInput(id, input)`            | Sets any of `turn`, `boost`, `brake`, `aim` on a train. Unset fields and later ticks keep the last value.          |
| `step()` → `SimEvent[]`          | Advances one fixed tick and returns that tick's events in order.                                                   |
| `addCarriage(trainId, kind)`     | Gives a train a carriage as if picked up. `false` at the carriage limit.                                           |
| `spawnTrailer(x?, y?, kind?)`    | Places a trailer (random position and type when omitted).                                                          |
| `spawnEnemy(kind?, x?, y?)`      | Places a `drone`, `hunter`, or `sentry`.                                                                           |
| `spawnBoss()`                    | Spawns the boss now, or returns the living one.                                                                    |
| `getTrain(id)`, `getEnemy(id)`   | Lookups by id.                                                                                                     |
| `state`                          | All mutable state as plain data (`trains`, `enemies`, `projectiles`, `trailers`, `drops`, timers, `tick`, `time`). |
| `rng`, `dt`, `rules`, `options`  | The seeded random source, seconds per tick, shared geometry, and resolved options.                                 |
| `serializeWorld(world)`          | Stable string of the whole state including the random generator, for determinism checks and snapshots.             |
| `botInput(world, trainId, rng)`  | The bot controller as a function returning a `TrainInput`.                                                         |

`WorldOptions`: `seed` (1), `tickRate` (30), `mapSize` (6000), `maxCarriages` (150, locomotive
included), `carriageSpacing` (18), `maxTrailers` (60), `maxEnemies` (22), `initialTrailers` (50),
`initialEnemies` (12), `boss` (true).

Trains, enemies, projectiles, and pickups share one id space, so an id identifies any entity.

### Controllers and input

`TrainInput` is `{ turn: -1..1, boost, brake, aim: radians }`. Humans and bots produce exactly that.
A train with `controller: 'bot'` has `botInput` evaluated for it at the start of every `step()`;
`controller: 'human'` trains only change when `setInput` is called. `setInput` ignores non-finite
numbers and clamps `turn`, so network input can be passed straight in.

## Tick model

`step()` always advances `1 / tickRate` seconds; the caller owns real-time scheduling (an
accumulator loop on the server, `requestAnimationFrame` plus an accumulator in the client). All
randomness comes from `world.rng`, so the same seed and input sequence give the same world.
Determinism is guaranteed within one JS engine.

Each tick runs in this order:

1. Bot trains compute their input.
2. Each living train: turn, move (boost, brake), extend its trail, place carriages, regenerate hull,
   update the bridge flag, fire weapons and counter-drones.
3. The boss countdown (after 5 s of world time); the boss spawns at 0.
4. Enemies move and shoot.
5. Projectiles move and resolve hits along the segment each travelled.
6. Pickups: every train collects trailers and drops within its pickup radius.
7. Ramming between train heads and non-boss enemies.
8. Expired drops and destroyed enemies are removed; trailers and enemies replenish.

Carriages sit a fixed arc length (18 units) behind the head along the head's trail, so spacing does
not depend on speed or tick rate. The world wraps on both axes and every distance, hit test, and
steering decision uses the shortest wrapped route.

## Events

`step()` returns events in the order they happened. All carry positions (`x`, `y`) in world units.

| `type`                 | Fields                                                           | When                                                            |
| ---------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `fired`                | `weapon`, `ownerKind`, `ownerId`, `angle`                        | A weapon, counter-drone, enemy, or boss fires.                  |
| `hit`                  | `victimKind`, `victimId`, `attackerKind`, `attackerId`, `amount` | Damage lands (shot, splash, or ram). `amount` is after shields. |
| `enemyDestroyed`       | `enemyId`, `enemyKind`, `sourceId`                               | A non-boss enemy dies; `sourceId` is the crediting train.       |
| `trainDestroyed`       | `victimId`, `sourceKind`, `sourceId`                             | A train reaches zero hull and drops half its carriages.         |
| `pickup`               | `trainId`, `pickupId`, `carriage`, `source`, `added`             | A trailer or drop is collected; `added` is false at the cap.    |
| `bridgeOn`/`bridgeOff` | `trainId`                                                        | The head enters or leaves range of its own trail.               |
| `bossSpawn`            | `enemyId`, `name`                                                | The boss appears.                                               |
| `bossDown`             | `enemyId`, `name`, `sourceId`                                    | The boss is destroyed (it drops 5 pickups).                     |

Purely cosmetic effects (smoke, sparks, heat shimmer, screen shake) are not events; clients derive
them from state and events.

## Differences from the reference

Deliberate changes made in the port:

- **Distance-based carriage spacing.** The reference placed carriages "5 frames back", which varied
  with frame rate and boost. Carriages are now 18 units of arc length apart.
- **One rule set for every train.** Pickup radius (32 + magnet) applies to bots, who used a fixed
  30; ramming and enemy fire hit every train, not just bots and the player respectively; enemies
  aggro on and shoot the nearest train rather than "the player"; human weapons can target other
  trains; the boss targets the nearest human (nearest train if no human is alive).
- **No self-collision.** The reference's self-collision check could never fire (the bridge always
  triggered first), so a head is simply never harmed by its own carriages; `bridgeActive` is
  informational.
- **Fixed ticks, seeded RNG.** No variable `dt`, no `Math.random`.
- **Not ported:** score, combo, kill feed, banners, grace period, and global slow motion (scoring is
  redefined in change 06; slow motion becomes client-only in change 03). Train-vs-train carriage
  kills, respawn, and spawn protection arrive in change 05; bot population management in change 06.
- **Swept projectile collisions** (at 30 Hz a 900 units/s laser moves 30 units per tick), and
  projectiles wrap around the map instead of despawning at the edge. All shots use a 14-unit train
  head radius (enemy shots used 12).
- **Aim is one angle per train** (`input.aim`). The reference aimed each carriage separately at the
  mouse (humans) or at its own nearest target (bots). The ±72° arc is still per carriage, measured
  from that carriage's heading, and a hostile must still be within 550 units of it.
- **Weapon cooldowns** tick down every tick (the reference froze them while no target was in
  range) and carry their remainder, so average fire rates match the reference's per-second rates.
- **Exact hull regeneration.** 0.25 hull/s, the expectation of the reference's random 0.5 hull
  at a 0.5/s chance.
- **Boost lockout.** Draining the tank to zero while holding boost ends the boost until the input is
  released; the reference flickered boost on and off at an empty tank. Bots boost with the same
  speed and drain as humans (the reference used 0.9× speed and 0.7× drain).
- **Trailer respawn timer** is not reset to 4 s by any pickup; a pickup only ensures a floor of
  0.5 s, so a busy world does not starve replenishment.
- **Missile splash** applies on any missile hit (enemy or train), to enemies only, at 60% damage
  within 50 units.
- **Carriage cap** counts the locomotive; a pickup at the cap is consumed without adding anything.
- **Ramming** deals its 40/20 damage on every tick of contact, as the reference did per frame, so
  total ram damage scales with tick rate.
- **Counter-drone orbit** speed is 3.8 rad/s: the reference advanced the angle twice per frame
  (1.8 and 2.0).
