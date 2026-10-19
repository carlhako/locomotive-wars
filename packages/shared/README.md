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
const me = world.addTrain({ name: 'You', controller: 'human' }); // locomotive + MG, protected
world.addTrain({ controller: 'bot', carriages: ['laser'] });

world.setInput(me.id, { turn: 1, boost: true, aimX: 200, aimY: -100 });
const events = world.step(); // advances exactly one tick, returns what happened
```

## World API

| API                                  | Purpose                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `new World(options?)`                | Creates a world; places the initial trailers and enemies from the seed.                                                                   |
| `addTrain(opts?)` → `TrainState`     | Adds a train: locomotive plus `carriages` (default: one MG, the starter), full hull and fuel, spawn-protected unless `protectedFor` is 0. |
| `respawnTrain(id)` → `boolean`       | Resets a train in place to a fresh protected starter at a new safe position; keeps id, name, colour, controller, and controls.            |
| `findSpawnPosition(exceptId?)`       | A random position at least 800 units from every other head and 300 from every enemy (best effort after 20 tries).                         |
| `removeTrain(id, {drop?})`           | Removes a train; returns whether it existed. A living train's removal emits `trainLeft`; `drop` scatters half its carriages as pickups.   |
| `setInput(id, input)`                | Sets any of `turn`, `boost`, `brake`, `fire`, `aimX`, `aimY` on a train. Unset fields and later ticks keep the last value.                |
| `step()` → `SimEvent[]`              | Advances one fixed tick and returns that tick's events in order.                                                                          |
| `addCarriage(trainId, kind)`         | Gives a train a carriage as if picked up. `false` at the carriage limit.                                                                  |
| `spawnTrailer(x?, y?, kind?)`        | Places a trailer (random position and type when omitted).                                                                                 |
| `spawnEnemy(kind?, x?, y?)`          | Places a `drone`, `hunter`, or `sentry`.                                                                                                  |
| `spawnBoss()`                        | Spawns the boss now, or returns the living one.                                                                                           |
| `spawnHeart(kind, x?, y?, dropped?)` | Places a `slow` or `full` heart (random position when omitted); a `dropped` one expires after 35 s.                                       |
| `getTrain(id)`, `getEnemy(id)`       | Lookups by id.                                                                                                                            |
| `state`                              | All mutable state as plain data (`trains`, `enemies`, `projectiles`, `trailers`, `drops`, timers, `tick`, `time`).                        |
| `rng`, `dt`, `rules`, `options`      | The seeded random source, seconds per tick, shared geometry, and resolved options.                                                        |
| `serializeWorld(world)`              | Stable string of the whole state including the random generator, for determinism checks and snapshots.                                    |
| `botInput(world, trainId, rng)`      | The bot controller as a function returning a `TrainInput`.                                                                                |

`WorldOptions`: `seed` (1), `tickRate` (30), `mapSize` (6000), `maxCarriages` (150, locomotive
included), `carriageSpacing` (18), `maxTrailers` (60), `maxEnemies` (22), `initialTrailers` (50),
`initialEnemies` (12), `boss` (true), `maxSlowHearts` (6), `maxFullHearts` (1).

Trains, enemies, projectiles, and pickups share one id space, so an id identifies any entity.

### Controllers and input

`TrainInput` is `{ turn: -1..1, boost, brake, fire, aimX, aimY }`, where the aim is a point given as
an offset in world units from the head, so it moves with the train. A new train aims 200 units ahead
along its heading. Humans and bots produce exactly that.
A train with `controller: 'bot'` has `botInput` evaluated for it at the start of every `step()`;
`controller: 'human'` trains only change when `setInput` is called. `setInput` ignores non-finite
numbers and clamps `turn`, so network input can be passed straight in.

## Networking

Also exported for the server and client: the wire protocol (`PROTOCOL_VERSION`, message types,
`decodeClientMessage` / `decodeServerMessage`, rates and radii), documented in
[`src/protocol/README.md`](src/protocol/README.md); `sanitizeName` for player display names; and
`viewFromWorld` / `WorldView`, the model the client renders from.

## Tick model

`step()` always advances `1 / tickRate` seconds; the caller owns real-time scheduling (an
accumulator loop on the server, `requestAnimationFrame` plus an accumulator in the client). All
randomness comes from `world.rng`, so the same seed and input sequence give the same world.
Determinism is guaranteed within one JS engine.

Each tick runs in this order:

1. Bot trains compute their input.
2. Each living train: count down spawn protection, turn, move (boost, brake), extend its trail,
   place carriages, regenerate hull, update the bridge flag, fire weapons (held fire), auto weapons
   (tail gunner, tesla coil), and counter-drones.
3. Head-vs-body collisions between trains (see Train combat).
4. The boss countdown (after 5 s of world time); the boss spawns at 0.
5. Enemies move and shoot.
6. Projectiles move and resolve hits along the segment each travelled.
7. Mines: mine layers drop at their train's last carriage, mines age and expire, and armed mines
   touched by an enemy or another train's head explode.
8. Pickups: every train collects trailers and drops within its pickup radius.
9. Ramming between train heads and non-boss enemies.
10. Expired drops and destroyed enemies are removed; trailers and enemies replenish.

Carriages sit a fixed arc length (18 units) behind the head along the head's trail, so spacing does
not depend on speed or tick rate. The world wraps on both axes and every distance, hit test, and
steering decision uses the shortest wrapped route.

## Train combat, protection, and respawn

One rule set applies to every train, human or bot.

- **Body collisions.** After all trains have moved, a head within 14 units (wrapped) of another
  train's carriage at index 2 (`BODY_COLLISION_MIN_INDEX`) or beyond is destroyed, and the body's
  owner is credited (cause `ram`, and the owner's `kills` goes up). The locomotive and the carriage
  behind it (indices 0 and 1) are never lethal, so heads pass through each other and a starter train
  has no lethal body. All colliding pairs are found before any train
  is destroyed, so a mutual ram destroys both, each credited to the other. A train is never harmed by
  its own carriages. The pass runs before projectiles, so a train destroyed by a ram takes no weapon
  credit that tick.
- **Attribution.** Every destruction emits one `trainDestroyed` with the cause and killer above.
  `TrainState.kills` counts trains destroyed since the killer last spawned; it feeds the kill feed
  and is not score.
- **Spawn protection.** For 3.5 s after spawning (`SPAWN_PROTECTION`, `TrainState.protectedFor`) a
  train takes no damage (a projectile that strikes it is consumed and no `hit` is emitted), cannot
  be destroyed by a collision, has a harmless body, does not fire weapons or counter-drones, and is
  ignored as a target by other trains' weapons and by the bot controller. The timer counts down
  at the start of each living train's tick, so protection is gone on the tick 3.5 s have passed.
- **Starter train.** A new train is the locomotive plus one MG, at full hull and fuel, with no
  upgrades.
- **Spawn position.** `findSpawnPosition` tries up to 20 random positions (100 units in from the
  edge) and takes the first at least 800 units from every other living head and 300 from every
  living enemy; otherwise the attempt farthest from other heads.
- **Respawn.** The world never respawns anything by itself; the owner calls `respawnTrain(id)` for a
  destroyed train (the server and offline play do so at the start of the next tick, for humans and
  bots). It resets the same entity: all carriages, upgrades, drones, hull, fuel, trail, bot memory,
  and kills, then places it at a new safe position with protection and `spawnSeq + 1`. `spawnSeq` lets
  a client tell a respawn from movement. Id, name, colour, controller, and held controls survive.

## Hearts

Hearts are their own entities (`state.hearts`), separate from trailers and drops; they never become
carriages. A living train collects any heart within its pickup radius (magnets help), whatever its
hull.

- **Slow hearts** (pink) give a healing dose: 15% of max hull over 8 s, on top of regeneration.
  Doses stack, each adding its own rate (`TrainState.healDoses` holds their timers), up to 20; one
  more replaces the dose with the least time left. Destruction clears them.
- **Full hearts** (red) restore the hull to max at once.
- **Sources.** The world keeps up to 6 slow and 1 full heart of its own, respawning one every 8 s
  and 60 s while below those limits; they never expire. A destroyed enemy drops a full heart with
  3% chance, otherwise a slow heart with 20% (one roll); the boss always drops a full heart. Dropped
  hearts expire after 35 s. A round reset clears every heart and dose and refills the map's own.

## Events

`step()` returns events in the order they happened. Events raised between steps (a train removed
with `removeTrain`) come first in the next step's list. All carry positions (`x`, `y`) in world
units.

| `type`                 | Fields                                                           | When                                                                                                            |
| ---------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `fired`                | `weapon`, `ownerKind`, `ownerId`, `angle`, `carriage?`           | A weapon, counter-drone, enemy, or boss fires. `carriage` is set for tail gunner shots.                         |
| `hit`                  | `victimKind`, `victimId`, `attackerKind`, `attackerId`, `amount` | Damage lands (shot, splash, or ram). `amount` is after shields.                                                 |
| `enemyDestroyed`       | `enemyId`, `enemyKind`, `sourceId`                               | A non-boss enemy dies; `sourceId` is the crediting train.                                                       |
| `trainDestroyed`       | `victimId`, `cause`, `killerTrainId?`, `killerEnemyId?`          | A train is destroyed and drops half its carriages (see below).                                                  |
| `trainLeft`            | `trainId`                                                        | A living train is removed by its owner (disconnect); no kill.                                                   |
| `pickup`               | `trainId`, `pickupId`, `carriage`, `source`, `added`             | A trailer or drop is collected; `added` is false at the cap.                                                    |
| `bridgeOn`/`bridgeOff` | `trainId`                                                        | The head enters or leaves range of its own trail.                                                               |
| `bossSpawn`            | `enemyId`, `name`                                                | The boss appears.                                                                                               |
| `bossDown`             | `enemyId`, `name`, `sourceId`                                    | The boss is destroyed (it drops 5 pickups and a full heart).                                                    |
| `zap`                  | `ownerId`, `points`                                              | A tesla coil zaps: `points` is the coil, the first target, and the chained target if any; `x`, `y` is the coil. |
| `mineExploded`         | `mineId`, `ownerId`                                              | A mine goes off, damaging everything but its owner in the blast.                                                |
| `heart`                | `trainId`, `heartId`, `kind`, `amount`                           | A train collects a heart; `amount` is a slow heart's whole dose or the hull a full heart restored.              |

`trainDestroyed.cause` is `ram` (head into another train's body; `killerTrainId` is the body's
owner), `weapon` (`killerTrainId` is the projectile's owner), `enemy` or `boss` (`killerEnemyId`).
At most one killer field is set; neither is for an unattributed kill.

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
- **Train-vs-train combat.** The reference only let the player ram bots' bodies (and bots ram the
  player's), and bots never collided with each other. Every pair of trains now collides head-to-body
  with credit to the body's owner. The per-train spawn protection replaces the reference's global
  3.5 s grace timer (which blocked damage but not collisions), and the player's starting shield
  carriage is dropped: every train starts as locomotive plus MG.
- **Not ported:** score, combo, kill feed, banners, and global slow motion (scoring is redefined in
  change 06; slow motion becomes client-only in change 03). Bot population management arrives in
  change 06.
- **Swept projectile collisions** (at 30 Hz a 900 units/s laser moves 30 units per tick), and
  projectiles wrap around the map instead of despawning at the edge. All shots use a 14-unit train
  head radius (enemy shots used 12).
- **Aim is one point per train** (`aimX`, `aimY`, an offset from the head). Each weapon carriage fires
  along its own bearing to that point, so every gun converges on it; a carriage within 40 units of
  the point uses the head's bearing instead. Bots aim the point at their target.
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
