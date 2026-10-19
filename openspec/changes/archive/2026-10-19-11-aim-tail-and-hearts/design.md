# Design

## Context

See proposal.md for the problems. The current state that shapes the approach:

- **Aim.**
  - `TrainInput.aim` is one world-space angle. The client computes it in `input.ts` from the head's screen position to the mouse.
  - `fireVolley` (`combat.ts`) spawns every weapon carriage's projectile along that angle from the carriage's own position.
  - `render/train.ts` points every barrel at the same angle.
  - The camera is 1:1 (one screen pixel is one world unit) and centred on the head, so a screen offset from the head *is* a world offset.
- **Projectile drawing.**
  - The local train is drawn by `LocalTrain`: the newest snapshot, extrapolated forward, capped at 250 ms.
  - Everything else, own projectiles included, is drawn from `SnapshotBuffer` at `serverNow - interpMs` (about 133 ms).
  - Projectile rows are `[id, kind, x, y, vx, vy]`, with no owner.
- **Tail.** `collideTrains` checks each head against other trains' carriages from `BODY_COLLISION_MIN_INDEX = 3`. Index 0 is the locomotive car.
- **Pickups.**
  - Every `Pickup` holds a carriage kind (`PickupKind`). `collect` always calls `addCarriage`.
  - Trailers and drops share `PICKUP_KINDS` indices on the wire.
  - Enemy and boss deaths call `world.spawnDrop`.

## Goals / Non-Goals

**Goals:**
- Bullets from every gun pass through the cursor.
- Your own bullets are drawn where they really are, starting from your guns.
- The lethal rule and the drawing come from one constant.
- Hearts fit into the world step, snapshots, and offline mode the same way mines did in change 10.

**Non-Goals:**
- **Client-side prediction of new shots.** A new bullet still first appears about one round trip after the press, and while you sweep the mouse, bullet direction lags the barrel by about one round trip. Predicting tracers locally and reconciling them with the server is a larger, separate piece of work.
- **Bots seeking hearts.** Bots collect hearts only when they happen to drive over them.
- **Hearts on the minimap, or in the carriage legend.**
- **Making heart numbers server config.** They are constants, like other pickup tuning.

## Decisions

### Aim is an offset from the head, not a world point or an angle

`TrainInput` replaces `aim: number` with `aimX, aimY`: the aim point minus the head position, in world units. The server's firing step computes the target as `head + offset` (wrapped). Each weapon carriage then fires along `wrapAngle(carriage → target)`.

- **Alternative: an absolute world point.** Rejected. With the mouse still and the train moving, the world point changes every frame, so the client would send an aim update every 33 ms all the time. It would also need its own wrap handling. An offset stays constant while the mouse is still on a straight track (while turning, the smoothed camera moves the head on screen, so the offset changes, as the old aim angle did), keeps today's message rate, and matches the existing rule that aim is measured from the head.
- **Alternative: keep the angle and add a distance.** Same information, but awkward to clamp and to compare. Two numbers in world units are simpler.
- **Client head vs server head.** The client measures the offset from its predicted head. The server applies it to its own head. The two differ only by prediction error (a few units), so the target lands within a few units of the cursor.
- **Close-range fallback.** When the target is within 40 units of a carriage, that carriage uses the head's bearing instead. Otherwise guns right under the cursor would spin unpredictably.
- **Flak** spreads around each carriage's own bearing.
- **Muzzle offset** uses the carriage's bearing too. Today it uses the shared angle.
- **Spawn default.** A new train's input is `(cos(angle), sin(angle)) × 200`. The client uses the same default before the mouse first moves.
- **Bots** set the offset to `wrapDelta(target - head)`. With no target, they use the heading default.
- **Validation.** The server rejects non-finite components and scales the vector down to length 2000 at most.
- **Admission's activity check.** An aim change counts as activity when the offset's direction changes by more than `AIM_ACTIVITY` or its length changes by more than 50 units.

### Barrels draw toward the aim point

`TrainDrawOptions.aim` becomes the aim point in world coordinates, or null. Each manual-weapon carriage draws its barrel at `wrapAngle(carriage → aimPoint)`. The loop passes the local head's drawn position plus the offset. Because of the 1:1 camera, that is the mouse's world position. Remote trains still pass null.

### Own projectiles: an owner flag and newest-snapshot extrapolation

The server appends a 7th element `1` to a projectile row when the receiving session's train owns it. Snapshots are built per session, so this costs nothing for other rows.

On each frame, the client takes projectiles marked own from the **newest** snapshot. It moves each one forward by `min(serverNow - st, MAX_EXTRAPOLATION_MS)` along `vx, vy`, and drops them from the interpolated list. Projectiles fly straight, so extrapolating them is exact until they hit something. When one hits, it is missing from the next snapshot and disappears.

- **Alternative: extrapolate every projectile.** Rejected. Shots between remote entities would then run ahead of their targets, which are drawn 133 ms in the past.
- **Alternative: an owner id on every row.** Rejected: more bytes, and the client only needs "mine or not".

### Lethal index 2, drawn from the shared constant

`BODY_COLLISION_MIN_INDEX` becomes 2. `drawTrain` imports it from `@lw/shared` and draws carriages below it at about 55% alpha. While `train.protected` is set, it draws all carriages that way. Couplings between faded cars are faded too. A protected train's head keeps its shield ring.

### Hearts are their own entity

A new `Heart { id, kind: 'slow' | 'full', x, y, age, dropped }`, kept in `state.hearts`.

- **Why not a new `PickupKind`?** It would leak into `addCarriage`, the carriage limit, the trailer rarity draw, and the legend's carriage list. All of those would need exclusions.
- **Collection** uses `pickupRadiusOf(train)`, so magnets help. It runs in the same phase as `collectPickups`.
- **Map population.**
  - `heartTimers.slow` and `heartTimers.full` count down while world-spawned hearts of that kind are below 6 and 1 respectively.
  - Each spawn draws a random position with the existing `randomPos(margin)`.
  - Respawn intervals are 8 s for slow and 60 s for full.
  - `dropped: false` hearts never age.
- **Drops.**
  - `damageEnemy` makes one roll per regular enemy death: `r < 0.03` is full, `r < 0.23` is slow. One draw keeps the two outcomes exclusive and costs one RNG call.
  - The boss always adds a full heart at its position.
  - Dropped hearts age and expire at `DROP_LIFETIME`, alongside the existing drops.
- **Healing doses.**
  - `TrainState.healDoses: number[]` holds the seconds left on each dose.
  - Each tick, during hull regeneration (`advanceTrain`), hull rises by `doses.length × 0.15 × maxHull / 8 × dt`, clamped to `maxHull`. Each timer then drops by `dt` and expired doses are removed.
  - Max hull is read each tick, so a dose taken before picking up armor heals a little more. That is accepted and keeps the state to one number per dose.
  - Doses are capped at 20. A heart collected at the cap replaces the dose with the least time left. This only guards the state size; in practice stacks stay far below it.
- **Event.** `{ type: 'heart', trainId, heartId, kind, amount, x, y }`.
  - For a slow heart, `amount` is the dose total (`0.15 × maxHull`, rounded).
  - For a full heart, it is the hull restored.
- **Reset.** Round reset clears `hearts` and the timers, and refills the map hearts with the world RNG. A newly spawned train starts with no doses.

### Wire format

- **Input message.** `a` is replaced by `ax, ay`, rounded to 0.1 units.
- **Snapshot.**
  - New field `ht: HeartRow[]`, with `HeartRow = [id, kind(0 slow, 1 full), x, y]`. Interest-filtered like drops.
  - `OwnTrain` gains `hd` (active dose count).
- **Version.** `PROTOCOL_VERSION` 6 → 7.
- **Offline.** The shared `view.ts` maps `state.hearts` and the dose count straight into `WorldView`, so offline mode needs no wire handling.

## Risks / Trade-offs

- [Aim still lags during fast sweeps by about one round trip] → Out of scope (see Non-Goals). Drawing own bullets in the present removes the larger and more visible part: the position offset.
- [Guns converging at close range can cross over awkwardly] → The 40-unit head-bearing fallback. Beyond that, convergence is the intended behaviour.
- [Index 2 makes rams easier to land, so bots die more] → It's the behaviour we asked for. Watch kill rates in the soak test and revisit if bots collapse.
- [Heart RNG rolls change seeded test outcomes] → Update the expectations. Tests that assert exact draw sequences are called out in tasks.
- [Healing from stacked doses could make a fighting train hard to kill] → Doses run out after 8 s and slow hearts are capped at 6 on the map. Tune the 15% and 20% figures after play-testing.

## Migration Plan

Deploy server and client together. The protocol bump makes old clients get `reject: version`, so they reload. Nothing is persisted, so rollback is a redeploy of the previous build.
