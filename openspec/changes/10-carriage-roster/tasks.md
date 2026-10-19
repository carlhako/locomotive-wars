# Tasks

Prerequisite: `08-click-to-fire` and `09-carriage-legend` are implemented and archived.

## 1. Kinds, tables, and protocol

- [x] 1.1 Add the new kinds:
  - `AutoKind`, plus `flak`, `cowcatcher`, `repair`, `cloak`, and the `flak` projectile kind in `sim/types.ts`
  - append them to `PICKUP_KINDS` / `PROJECTILE_KINDS`
  - add placeholder `CARRIAGE_TYPES` rows so the build compiles

  Verify `npm run typecheck` passes and the kind-completeness check in `messages.ts` holds
- [x] 1.2 Append the new types to `TRAILER_TYPES` with the spec weights and update seeded tests whose expectations depend on the draw sequence; verify a new test drawing 20,000 kinds matches each weight share within 10%, and the full shared suite passes
- [x] 1.3 Add the snapshot `mn: MineRow[]` field and the `zap` / `mineExploded` events to the protocol, and bump `PROTOCOL_VERSION`; verify `messages.test.ts` round-trips and malformed-row rejection

## 2. Changes to existing carriages

- [x] 2.1 Set `ARMOR_BONUS` to 70, cap the booster at read time (`SPEED_BONUS_CAP` 0.5), and add the fuel regen bonus (`FUEL_REGEN_PER_BONUS`); verify `train.test.ts` scenarios: armor max hull 185, 12 boosters → 1.5× speed, 2 tanks → 16.8 fuel/s
- [x] 2.2 Add the `nearestHostile` helper and use it for counter-drones (now also targeting unprotected train heads) and bot aim; verify `combat.test.ts` that a drone fires at an enemy train with no PvE enemy nearer and never at a protected train, and that `bot.test.ts` still passes
- [x] 2.3 Extend the missile splash to other trains' heads (never the owner); verify `combat.test.ts` for the splash-hits-trains scenario, including the owner inside the radius taking nothing
- [x] 2.4 Add `pierce`/`hitIds` to projectiles, apply hits in `t` order, and set the laser to 2/s × 22 with pierce 3; verify `combat.test.ts`: three drones pierced and the fourth untouched, no double hit on one target across ticks, the existing no-tunnelling test still passes, and laser rate is 6 bolts in 3 s

## 3. New carriages: simulation

- [x] 3.1 Add the optional `pellets`/`spread`/`life` fields to `WeaponStats` and the flak entry; fire volleys with each pellet checked against the budget; verify `combat.test.ts` for the 5 pellet angles, expiry before 260 units, and a volley cut short at the budget
- [x] 3.2 Tail gunner: auto-fire in the rear half within 400, 3/s × 6, counted toward the budget, holding during protection; verify `combat.test.ts` for the chaser-behind and target-ahead-ignored scenarios
- [x] 3.3 Tesla coil: instant 18 dmg to the nearest hostile within 180, chaining to the nearest other within 120, with a `zap` event and the cooldown spent only on a hit; verify `combat.test.ts` for the chain and nothing-in-range scenarios, and that a tesla kill credits the owner with cause `weapon`
- [x] 3.4 Add the repair, cowcatcher, and cloak bonus fields to `TrainState` and `addCarriage`, and apply repair regen (capped at 6) and cowcatcher ram changes in `ramEnemies`; verify `train.test.ts` / `combat.test.ts` for repair capped at 6 cars and 2 cowcatchers taking 32 and dealing 60
- [x] 3.5 Add mines:
  - `WorldState.mines` and the `stepMines` pass in the tick order
  - drop timer on the mine layer's `fireTimers` slot
  - arming, trigger, blast, and expiry
  - caps of 6 per layer and 24 in total
  - removal on `trainLeft`, clearing on `resetRound`

  Verify a new `mines.test.ts` for the chaser, owner-safe, cap, unarmed, persists-after-owner-death, removed-on-leave, and cleared-on-round-reset cases, and that `determinism.test.ts` passes with mine layers present

## 4. Server

- [x] 4.1 Send mines within view radius in snapshots, and route `zap` / `mineExploded` through event interest; verify `interest.test.ts` for a mine in and out of range and a zap near the session
- [x] 4.2 Leave cloaked trains out of other sessions' overviews (still listing the session's own train); verify a `server.test.ts` case for the cloaked-train scenario
- [x] 4.3 Run the soak client with the new kinds forced onto trains; verify it completes without errors and compare its reported traffic with a run on the previous commit

## 5. Client

- [x] 5.1 Fill in the `CARRIAGE_TYPES` rows (colours, icons, categories, descriptions) and add the `auto` category with the "Auto weapons" legend heading; update the laser and booster descriptions; verify `palette.test.ts` (unique colours, descriptions at most 24 characters, every kind present) and `legend.test.ts` for the Auto weapons section
- [x] 5.2 Add carriage drawings: the flak turret, the tail gunner turret (backward by default, pointing at its target briefly after a `fired` event), and the tesla ring and cowcatcher wedge; verify in the browser preview with `?offline` and trains seeded with each new kind
- [x] 5.3 Add mine rendering (`render/mines.ts`: unarmed/armed states, friendly ring) and zap arcs (`fx/zaps.ts`); verify the `eventFx.test.ts` zap and mine-explosion handling, and check visually in offline mode
- [x] 5.4 Add the `zap()`, `mine()`, and flak `shoot` sounds; verify `sound.test.ts` for the rate limits, and check by ear in the browser
- [x] 5.5 Hide non-local cloaked trains on the minimap; verify a `minimap` test or an offline check where a cloaked bot vanishes from the minimap but stays on the playfield

## 6. Integration

- [x] 6.1 Play an offline session and a server session with bots, collecting every new type:
  - mines stop a chaser
  - the tail gunner shoots pursuers
  - the tesla chains
  - laser pierces a line of drones
  - missile splash hurts a nearby bot
  - the legend lists all 16 types with correct counts

  Run `npm test` and `npm run lint` and verify both pass

## Workflow follow-up

- Archive the change once it has been played and approved.
- Revisit rarity weights and caps after playtesting.
