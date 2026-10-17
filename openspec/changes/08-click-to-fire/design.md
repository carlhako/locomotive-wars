# Design

## Context

Weapon fire today is in `fireWeapons` (`packages/shared/src/sim/combat.ts`). Each tick, each weapon carriage ticks its cooldown down (floored at `-dt` so idle guns don't bank shots), then fires along `train.input.aim` only when:
- the train is not protected
- the cooldown has elapsed
- the aim is within `WEAPON_ARC` (±72°) of that carriage's heading
- `hostileWithin(...)` finds any enemy or unprotected train head within `WEAPON_RANGE` (550) of the carriage

The bot controller (`bot.ts`) already computes an aim at the nearest target within `WEAPON_RANGE` and falls back to its heading when none is found. Today it relies on the range gate in `fireWeapons` to stop it firing into empty space.

The client's `InputState` (`input.ts`) tracks keys and the mouse position. Mouse-down is only used as the audio-unlock gesture. `#ui` covers the canvas with `pointer-events: none`, so clicks on the playfield reach the canvas, while the mute button and overlays take their own clicks.

The `in` protocol message is `{t, s, tr, b, br, a}`, with 0/1 integers for booleans. `PROTOCOL_VERSION` is 4.

## Goals / Non-Goals

**Goals:**
- Firing is predictable: held button → guns fire at the cursor, released → silent.
- Bots behave as they do today.
- Large trains can't flood the world or the network with projectiles.

**Non-Goals:**
- Touch or gamepad controls.
- Per-weapon fire groups (e.g. right button for missiles only).
- An auto-fire toggle. If players miss it, it can be added later as a client-side option that holds `fire` on.
- Changing weapon stats. That belongs to `10-carriage-roster`.

## Decisions

### `fire` is part of `TrainInput`, not a separate command

`TrainInput` becomes `{turn, boost, brake, fire, aim}`. Fire is a held state like boost, so it fits the "last input persists" rule:
- dropped or late messages don't turn a held button into single shots
- bots produce it the same way they produce boost

A "fire event" message was rejected because it would need its own sequencing and loss handling.

### Remove the arc and the range gate from `fireWeapons`

The new rule for each weapon carriage is: not protected, `input.fire`, cooldown elapsed, and under the projectile budget. Then fire along `aim` from the carriage position plus the muzzle offset.

- `WEAPON_ARC` is deleted.
- `WEAPON_RANGE` stays, because the bot controller still uses it.
- `hostileWithin` is deleted if nothing else uses it.

Keeping a wider arc (±120°) was considered so a weapon's place on the train would matter. It was rejected because "I clicked and nothing fired" is exactly the complaint being fixed. Any positional play can come from the auto weapons planned in change 10.

### Bot fire decision lives in the controller

`aimAngle` in `bot.ts` already finds the nearest valid target within `WEAPON_RANGE`. It will return `{aim, fire}`, with `fire = found`. This gives the same behaviour as today's range gate, measured from the bot's head rather than from each carriage. Carriages trail the head, so a bot may now fire slightly early or late at the edge of range. That is acceptable, and arguably closer to how a player decides.

### Projectile budget: count per tick, cap at 120

Add the constant `MAX_TRAIN_PROJECTILES = 120`.

- **What counts:** weapon-carriage projectiles (`bullet`, `missile`, `laser`) owned by the train. Counter-drone shots are excluded; they are already limited by drone count and cooldown.
- **Counting:** at the start of the weapons phase, count each train's live weapon projectiles in one pass over `state.projectiles` into a map. Each train's count is then incremented as it fires. The cost is O(projectiles + trains) per tick, not O(trains × projectiles).
- **While at the limit:** a ready weapon skips firing. Its cooldown stays floored at `-dt` (the existing rule), so it can't bank a burst.

**Why 120:** an MG shot lives 1.6 s at 7 shots/s, about 11 live per MG. 120 lets roughly 10 MGs fire continuously, which covers almost every real train. 40-MG monsters are capped at a stream that is still devastating at short range.

Alternatives rejected:
- **Slower fire for each gun on big trains:** harder to explain.
- **A cap on firing carriages:** that makes carriage order matter invisibly.

### Protocol: add `f: 0 | 1` to `in`, bump to version 5

The field is required. The parser rejects a missing field or a value other than 0 or 1, the same as `b` and `br`. The server maps it with `fire: msg.f === 1`.

In `net/connection.ts`, a change of `fire` counts as a control change and is sent at once, like turn, boost, and brake, not on the 33 ms aim throttle.

### Client capture

- `InputState` gains `fire`.
- **Press:** `pointerdown` with `button === 0` whose target is the game canvas sets it.
- **Release:** `pointerup` on the window, or `blur` (via `releaseAll`), clears it. Listening for release on the window means dragging off the canvas and releasing elsewhere still stops fire.
- The existing gesture callback (audio unlock) still runs on any mouse-down.
- **Clicks that don't fire:** clicks on the mute button and overlays never reach the canvas, so they don't fire. While no train is playing, `fire` is ignored in practice because no train is controlled.
- **Aim cursor:** it gets a pressed state while firing (brighter ring), so players can see the input registered.
- **Controls text:** the join screen and `#tips` change "Mouse — Aim weapons" to "Mouse — Aim, hold click to fire".

### Idle detection

`IdleTracker.observe` adds `input.fire !== b.fire` to its "meaningful" test.

## Risks / Trade-offs

- **[Risk]** Players who liked automatic fire must now hold the button the whole time. → Firing is now reliable, which was the complaint. An auto-fire toggle is noted as a possible follow-up.
- **[Risk]** Seeded simulation tests and replays that relied on automatic fire change outcome. → Update those tests to set `fire`. The determinism test still holds because `fire` is part of the recorded input.
- **[Risk]** Projectile count in snapshots rises, since humans can fire with nothing nearby. → The per-train budget bounds it at 120 per train. Interest filtering already limits snapshots to the view radius.
- **[Trade-off]** Bots measure range from the head, not each carriage. → Small edge-of-range difference, accepted.

## Migration Plan

This is a protocol break, so clients and server must deploy together. An old client gets `reject` with reason `version` and is told to reload.
