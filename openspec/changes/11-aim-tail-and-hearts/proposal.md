# Proposal

## Why

Play-testing turned up three problems and one missing feature:

- **Aim misses the cursor.** The client sends one aim angle, measured from the head to the mouse. Every weapon carriage fires parallel to that angle from its own position, so rear guns miss the cursor by about their distance down the train.
- **Aim feels laggy, "like a slow tank turret".** Barrels follow the mouse at once, but your own bullets are drawn from the interpolation buffer, about 133 ms in the past. Your train is drawn predicted in the present, so bullets appear to leave from about two cars behind your guns, along an old angle.
- **Enemy trains drive through your tail.** The locomotive and the two cars behind it are not lethal. A new train (locomotive + one gun car) has no lethal cars at all, and nothing on screen shows which cars are safe.
- **There is no way to heal quickly.** The only healing is slow regeneration and repair cars.

## What Changes

**Aim**
- **BREAKING (protocol):** the train input carries an aim *point* as an offset from the head, in world units, instead of an aim angle.
- Each weapon carriage fires at its own bearing to that point, so all guns converge on the cursor. Bots aim with the same offset, pointing at their target.
- The local train's turret barrels each point at the cursor.
- The client draws the local train's own projectiles from the newest snapshot, moved forward to the present, instead of 133 ms in the past. Snapshots mark which projectiles belong to the receiving player.

**Tail**
- Lethal body carriages start at index 2 instead of 3. Only the locomotive and the first car behind it are safe.
- Safe cars are drawn faded, on every train. A protected train's whole body is drawn safe, since none of it is lethal.

**Hearts**
- Two new map pickups, separate from trailers and carriage drops. Neither becomes a carriage.
  - **Slow heart (pink):** adds a healing dose that restores 15% of max hull over 8 s. Doses stack: each active dose adds its own healing rate.
  - **Full heart (red, larger, glowing):** sets hull to max at once.
- Hearts are always used up when run over, even at full hull.
- Where hearts come from:
  - The map holds up to 6 slow hearts and 1 full heart, respawning over time.
  - A destroyed enemy has a 20% chance to also drop a slow heart and 3% to drop a full heart.
  - A destroyed boss always drops a full heart.
- Dropped hearts expire after 35 s. Map-spawned hearts do not.
- A new heart pickup event, with client particles, a "+N" heal number, a sound, and a HUD indicator of active healing doses.
- **BREAKING (protocol):** snapshots carry hearts and the own train's dose count. `PROTOCOL_VERSION` is bumped.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `train-combat`: lethal body carriages start at index 2.
- `game-simulation`:
  - train input carries an aim offset
  - weapons fire at a per-carriage bearing to the aim point
  - hearts and healing doses
  - enemy and boss heart drops
  - a heart pickup event
- `realtime-netcode`:
  - input messages carry the aim offset
  - snapshots carry hearts, dose count, and an own-projectile flag
  - own projectiles are drawn in the present
- `game-client`:
  - input capture produces an aim offset
  - turrets face the cursor
  - safe cars are drawn faded
  - hearts are drawn
  - heart pickup effects and a healing indicator are shown
- `round-lifecycle`: round reset clears hearts and doses, and regenerates the map's hearts.

## Impact

- **Shared sim:**
  - `types.ts`: `TrainInput` aim offset, `Heart` entity, healing doses on `TrainState`, heart event
  - `constants.ts`: body collision index, heart numbers
  - `combat.ts`: per-carriage aim, enemy/boss heart drops
  - `world.ts`: heart spawning, collection, expiry, round reset
  - `train.ts`: dose healing
  - `bot.ts`: aim offset
  - `view.ts`: hearts and dose count in the world view
- **Shared protocol:** input message fields, snapshot hearts row, own-train dose count, projectile owner flag, `PROTOCOL_VERSION`.
- **Server:**
  - input validation and clamping
  - `admission.ts` aim-activity check
  - snapshot hearts with interest filtering
  - projectile own flag
  - `soak.ts` input shape
- **Client:**
  - `input.ts` aim offset
  - `connection.ts` input sending, own-projectile extrapolation, hearts
  - `render/train.ts` per-carriage barrels and faded safe cars
  - heart rendering, effects and sound, HUD dose indicator
- **Tests:** tests that build `TrainInput` with `aim`, tests of body collision indices, and seeded tests whose outcomes depend on the random sequence (enemy heart rolls draw from the world RNG) need updating.
