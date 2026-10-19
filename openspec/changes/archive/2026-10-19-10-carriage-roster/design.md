# Design

## Context

This builds on `08-click-to-fire` (fire input, no arc or range gate, 120-projectile budget) and `09-carriage-legend` (a single `CARRIAGE_TYPES` client table and a data-driven legend). Both must be archived first.

Relevant current structure:
- **Kinds** are string unions in `sim/types.ts` (`WeaponKind`, `DefenseKind`, `SupportKind` → `PickupKind`). The protocol encodes them by index into `PICKUP_KINDS` / `PROJECTILE_KINDS` in `protocol/messages.ts`, with a compile-time completeness check.
- **Carriage effects** are accumulated into per-train bonus fields when a carriage is added (`addCarriage` in `train.ts`). A respawn builds a fresh train state.
- `fireTimers` is a cooldown array parallel to `carriages`.
- **World tick order** (`world.ts`): move trains → for each train, `fireWeapons` + `fireDrones` → `collideTrains` → … → `stepProjectiles` → `ramEnemies` → enemies/boss/pickups.
- **Trailer draw:** `randomPickupKind()` is a weighted draw over `TRAILER_TYPES`, used for trailers, enemy drops, and death drops.

## Goals / Non-Goals

**Goals:**
- Every new mechanic stays deterministic and headless (`game-simulation` rules).
- New kinds slot into existing tables. No special cases scattered through the renderer or protocol.

**Non-Goals:**
- Bots preferring particular trailers, or bots avoiding mines. Bots keep collecting what is nearest, and they get the auto weapons for free.
- Fine balance tuning beyond the numbers in the specs. Constants are centralised, so tuning after playtesting is a one-line change each.
- Visual cloaking on the playfield. Cloak only affects the minimap.

## Decisions

### Kind naming and categories

| Display | Kind id | Union | Projectile |
|---|---|---|---|
| Flak | `flak` | `WeaponKind` | new `flak` |
| Tail Gunner | `tailgun` | new `AutoKind` | `bullet` |
| Tesla Coil | `tesla` | `AutoKind` | none (instant) |
| Mine Layer | `mines` | `AutoKind` | none (mine entity) |
| Cowcatcher | `cowcatcher` | `DefenseKind` | — |
| Repair Car | `repair` | `SupportKind` | — |
| Cloak | `cloak` | `SupportKind` | — |

- `PickupKind = WeaponKind | AutoKind | DefenseKind | SupportKind`.
- `PICKUP_KINDS` and `PROJECTILE_KINDS` get the new ids **appended**, so existing indices keep their meaning. The protocol version is bumped anyway.
- `isWeapon` stays "fires on the fire input" (MG, missile, laser, flak). A new `isAuto` covers the rest.

### Bonus fields and caps

New `TrainState` fields: `repairBonus`, `ramBonus`, `ramReduction`, and `cloaks` (count). They are accumulated in `addCarriage` like the existing bonuses and start at zero in a fresh train state.

Caps are applied where the bonus is **read**, not where it is accumulated. The stored value keeps tracking carriage count, and a cap can be retuned without touching the accumulation:

| Read site | Formula |
|---|---|
| speed multiplier | `1 + min(speedBonus, SPEED_BONUS_CAP = 0.5)` |
| hull regen | `HULL_REGEN + min(repairBonus, REPAIR_CAP = 6)` |
| ram damage taken | `RAM_DAMAGE_TO_TRAIN × (1 − min(ramReduction, 0.7))`, then the shield reduction as today |
| ram damage dealt | `RAM_DAMAGE_TO_ENEMY + ramBonus` |
| fuel regen | `FUEL_REGEN × (1 + fuelBonus × FUEL_REGEN_PER_BONUS)` |

- `FUEL_REGEN_PER_BONUS = 2/3`, which gives +20% per tank, since `FUEL_BONUS` is 0.3. This mirrors the existing `FUEL_CAPACITY_PER_BONUS`.
- `ARMOR_BONUS` changes 35 → 70.

### Weapon stats and flak

`WeaponStats` gains optional `pellets` (default 1), `spread` (radians, total half-width, default 0), `life` (default `PROJECTILE_LIFE`), and `pierce` (default 1).

- Flak: `{fireRate: 1.2, damage: 6, speed: 600, splash: 0, projectile: 'flak', pellets: 5, spread: π/12, life: 0.42}`.
- Laser: `{fireRate: 2, damage: 22, speed: 900, pierce: 3}`.
- `fireWeapons` spawns `pellets` projectiles at evenly spaced angles across `aim ± spread`. Each pellet is checked against the budget separately, and a volley that hits the budget part-way is cut short.

### Laser pierce

`Projectile` gains `pierce: number` (remaining hits) and `hitIds: number[]` (targets already hit; trains and enemies share one id space). In `stepProjectiles`:
1. Collect every hit along the tick's segment (with its `t`) that isn't in `hitIds`.
2. Sort the hits by `t` and apply them in order until `pierce` reaches 0.
3. A projectile with `pierce > 0` left continues to the segment end.

For ordinary projectiles (`pierce` 1) this reduces to today's "earliest hit wins" rule. `hitIds` is at most 3 long, so the cost is trivial. The snapshot projectile row is unchanged; pierce is server-only.

### Missile splash on trains

The splash loop in `stepProjectiles` also checks trains: alive, not the owner, not the direct-hit train, and head within `splash`. It calls `damageTrain`, which already ignores protected trains. Credit works through the existing `source`.

### Counter-drones target trains

In `fireDrones`, candidates are living enemies plus other alive, unprotected trains' heads, and the nearest within `DRONE_RANGE` wins. Drone shots already hit trains in `stepProjectiles`; they just never aimed at them.

### Auto weapons: one pass, shared cooldowns

`fireWeapons` gains a branch for `AutoKind` carriages that ignores `input.fire` but still respects spawn protection. Each uses its slot in `fireTimers`:

- **Tail gunner:**
  - **Target:** the nearest hostile within 400 whose bearing from the carriage is within ±90° of `carriage.angle + π`.
  - **Shot:** fires a `bullet` (6 dmg, 550 speed, normal life) along that bearing.
  - **Limits:** cooldown 1/3 s, and it counts toward the budget.
  - **Display:** the client draws its turret pointing at its last target for a moment after firing, otherwise backward. That needs a short-lived "last shot angle", which the client gets from the `fired` event, already sent with angle and owner.
- **Tesla:**
  - **Target:** the nearest hostile within 180 of the carriage. It takes 18 via `damageEnemy`/`damageTrain`, then the nearest *other* hostile within 120 of the first target takes 18.
  - **Event:** emits `{type: 'zap', ownerId, points: [[cx,cy],[x1,y1],[x2,y2]?]}`.
  - **Cooldown:** 1 s, and only spent when a target was found, so a coil is ready the moment something comes into range.
- **Mine layer:** drops are handled in the mine step below. Its `fireTimers` slot is its 2 s drop timer.

"Hostile" uses one helper, `nearestHostile(world, train, x, y, range, filter?)`, shared by the drones, tail gunner, tesla, and bot aim. It replaces the per-site loops.

### Mines

New entity in `WorldState.mines`:

```ts
interface Mine { id; x; y; ownerId; age; }   // armed = age >= MINE_ARM_TIME
```

- **Constants:** `MINE_INTERVAL = 2`, `MINE_ARM_TIME = 0.5`, `MINE_LIFE = 20`, `MINE_TRIGGER_RADIUS = 20`, `MINE_BLAST_RADIUS = 60`, `MINE_DAMAGE = 40`, `MINES_PER_LAYER = 6`, `MAX_TRAIN_MINES = 24`.

`stepMines(world)` runs after `stepProjectiles` and before `ramEnemies`:
1. **Drop:** for each alive, unprotected train, each mine-layer carriage's timer counts down. At ≤ 0, if the train's live mines < `min(6 × layers, 24)`, drop a mine at the last carriage's position, and the timer resets to `MINE_INTERVAL`. If the train is at the cap, the timer floors at `-dt` (no banking), the same as weapons.
2. **Age:** advance mine ages and remove expired ones.
3. **Trigger:** each armed mine checks enemies (alive) and train heads (alive, not owner, not protected) within `MINE_TRIGGER_RADIUS`. The first trigger explodes it.
4. **Explode:** every enemy and non-owner train head within `MINE_BLAST_RADIUS` takes `MINE_DAMAGE` with source `{train, ownerId}`, so kills credit the owner with cause `weapon`. Emit `{type: 'mineExploded', mineId, ownerId, x, y}` and remove the mine.

**Lifecycle:**
- Mines of a train removed from the world (`trainLeft`) are deleted.
- Mines of a destroyed train remain and still credit its id.
- `resetRound` clears `mines`.
- Live-mine counts per train are computed once per tick, like the projectile budget.

### Protocol and interest

- **Snapshots:** a new `mn: MineRow[]` with `MineRow = [id, ownerId, x, y, armed 0|1]`, filtered by view radius like drops. Mines are static, so no interpolation is needed. The client renders them at their snapshot position.
- **Events:** `zap` and `mineExploded` go through the existing event interest filter, by position or by involving the session's train.
- **Overview:** `sendOverviews` skips a train for a session when `train.cloaks > 0 && train.id !== session.trainId`. `kindsOf` already sends carriage kinds in `meta`, so clients can tell a visible train is cloaked without a new field.
- `PROTOCOL_VERSION` bumps to 6, assuming 08 took it to 5.

### Rarity table

The new entries are appended after the existing nine in `TRAILER_TYPES`, with the weights in the spec. Total weight goes from 7.7 to 11.5, so each existing type becomes about a third rarer, and weapons that need the fire button remain the largest group.

### Client

**Colours and icons.** Reserved against 09's palette:

| Type | Colour | Icon | Carriage drawing |
|---|---|---|---|
| Flak | `#b0ff30` lime | `K` | turret with a short wide barrel |
| Tail Gunner | `#ff6a9e` rose | `T` | turret, barrel defaults backward |
| Tesla Coil | `#30d0b0` teal | `Z` | icon glyph plus a small coil ring |
| Mine Layer | `#8a8f3a` olive | `X` | icon glyph |
| Cowcatcher | `#a0a8b8` steel | `C` | icon glyph plus a wedge at the front edge |
| Repair Car | `#f4f4f4` white | `+` | icon glyph (in red) |
| Cloak | `#5a4f7a` dusk | `?` | icon glyph |

**Legend.** It gains the `auto` category, headed "Auto weapons", placed after Weapons. Descriptions follow 09's 24-character rule:

| Type | Description |
|---|---|
| Flak | `5 × {damage} dmg · short` |
| Laser | updated to `{rate}/s × {damage} · pierce {n}` |
| Tail Gunner | `Rear auto · {rate}/s × {damage}` |
| Tesla Coil | `Zap {range} · {damage} dmg ×2` |
| Mine Layer | `Mine/{interval}s · {damage} dmg` |
| Repair Car | `+{n} hull/s (max {cap})` |
| Cowcatcher | `+{n} ram · −{m}% ram dmg` |
| Cloak | `Hidden on minimap` |
| Armor, Fuel Tank, Booster | pick up the new constants automatically; Booster gains `(max 50%)` |

**Rendering:**
- **Mines:** `render/mines.ts` draws a dark disc with a blinking light. The light is grey while unarmed and red once armed. Own mines get a thin `LOCAL_COLOR` ring.
- **Zaps:** `fx/zaps.ts` keeps arcs for 0.3 s and draws them as jittered polylines in teal.
- **Mine explosions:** reuse the existing explosion particles at a smaller scale, plus a shake when within 300 of the local head.
- **Sounds:** `sound.ts` gets `zap()` (short noise-burst crackle), `mine()` (low thump), and a flak variant of `shoot`.

**Minimap:** skip any non-local train whose known kinds include `cloak`. This covers offline mode, where there is no server overview filter.

## Risks / Trade-offs

- **[Risk]** Seeded tests that pin trailer kinds or drop outcomes break, because the weight table changes. → Update their expectations in the same task that changes the table. The determinism test still passes, since it compares two runs with each other.
- **[Risk]** Auto weapons on large bot trains add a lot of fire. → Tail gunner shots count toward the 120 budget. Tesla is limited by its 1 s cooldown and short range. Mines are capped at 24 per train.
- **[Risk]** Mines add snapshot weight: up to 24 per train × trains in view. → Each row is 5 small numbers, and only rows within the view radius are sent.
- **[Risk]** Cloak defeats the minimap, which bots don't use anyway. In PvP it may feel unfair. → Rarity is 0.3, the lowest in the table, and the cloaked train is still fully visible on the playfield.
- **[Trade-off]** Tesla hits instantly, with no projectile. → Simpler and cheaper, but it can't be dodged. The short 180 range is the counterplay.
- **[Trade-off]** Caps apply at read time rather than to the stored bonus. → The legend shows the cap in text so players understand why the 8th booster does nothing.

## Migration Plan

Protocol break: deploy client and server together. Old clients get the version reject and are asked to reload. The persisted high score table is unaffected.
