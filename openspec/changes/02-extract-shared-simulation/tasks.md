# Tasks

## 1. Foundations

- [ ] 1.1 Add `sim/constants.ts` with every tuning constant from the reference (speeds, fuel, radii, weapon stats, enemy stats, spawn caps, boss timing), each commented with its reference line; verify `npm run typecheck` passes
- [ ] 1.2 Add `sim/rng.ts` (seeded mulberry32 with `next`, `range`, `int`, `pick`, `weighted`); verify unit tests for repeatability per seed and the range bounds
- [ ] 1.3 Add `sim/math.ts` (`wrapDelta`, `wrapPos`, `shortAngle`, `clamp`, `lerp`, segment-vs-circle with wrap); verify unit tests including seam cases (x=5997 vs x=3 gives 6 units)
- [ ] 1.4 Add `sim/types.ts` (TrainInput, TrainState, EnemyState, Projectile, Pickup, SimEvent union, WorldOptions); verify typecheck

## 2. Train core

- [ ] 2.1 Implement `sim/path.ts` (ring buffer with cumulative arc length, sampling by distance-behind-head, trimming); verify tests for constant 18-unit spacing on straight and curved paths, and across the map seam
- [ ] 2.2 Implement train movement, turn, boost/fuel drain and regen, and brake in `sim/train.ts`; verify scenario tests for the turn rate, fuel emptying in about 3.6 s, and brake halving distance
- [ ] 2.3 Implement carriage add/limit and per-type effects (armor, speed, fuel, magnet, shield cap 70%, drones count) and max-hull formula; verify tests for the shield cap, max hull, and the 150-carriage limit consuming the pickup
- [ ] 2.4 Implement bridge detection (index >= 4 within 32 units) with no self-collision; verify a tight-loop test where a 20-carriage train survives and reports bridge active
- [ ] 2.5 Implement hull regen, `takeDamage`, and destruction with half-carriage drops and a `trainDestroyed` event; verify a test where a 10-carriage train destroyed yields 5 drops and the event

## 3. World and combat

- [ ] 3.1 Implement `sim/world.ts` (`addTrain`, `removeTrain`, `setInput` with last-input reuse, `step()` returning events, trailer and enemy population with respawn timers); verify tests for trailer replenishment to 60 and input reuse
- [ ] 3.2 Implement trailer and drop pickups for all trains with magnet radius, and the 35 s drop expiry; verify tests for a bot collecting a trailer and drop expiry
- [ ] 3.3 Implement weapons (MG, missile, laser) firing along the aim angle with the ±72° arc, 550-unit target check, cooldowns, and counter-drones vs enemies; verify tests for an aimed shot at another train and no fire without a target
- [ ] 3.4 Implement projectiles with swept wrapped collision, owner exclusion, missile splash, and lifetime; verify the laser no-tunnel test and the owner-immunity test
- [ ] 3.5 Implement drones, hunters, and sentries targeting the nearest train, enemy fire hitting any train, ramming damage for all trains, and enemy drops; verify the nearest-target and ramming tests
- [ ] 3.6 Implement the boss schedule (80 s, then 112.5 s after defeat), orbit, three-shot spread at the nearest human with fallback, and 5 drops; verify the targeting and schedule tests

## 4. Bots and events

- [ ] 4.1 Port the bot AI to `sim/bot.ts` as `botInput(world, trainId, rng)` (flee, attack, seek, wander; aim at nearest target); verify the seek-trailer steering test and a 2-minute all-bot soak test with no exceptions
- [ ] 4.2 Ensure every spec'd event type is emitted with ids and positions; verify a test asserting a hit event's fields and a test listing the event types seen in a 2-minute bot soak

## 5. Determinism and docs

- [ ] 5.1 Add `sim/serialize.ts` and a determinism test (same seed plus inputs gives identical state over 600 ticks; different seeds diverge); verify it passes
- [ ] 5.2 Verify `packages/shared` has no DOM or Node imports (lint passes) and the shared tests run in Vitest's `node` environment
- [ ] 5.3 Add `packages/shared/README.md` describing the World API, tick model, event list, and deliberate differences from the reference (distance spacing, unified rules, no score/combo/slowmo); verify it matches the exported API
