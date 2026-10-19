# Tasks

## 1. Aim offset in the simulation

- [x] 1.1 In `sim/types.ts`, replace `TrainInput.aim` with `aimX`/`aimY` (offset from the head). Set the spawn default in `train.ts` to 200 units along the heading. Update `world.ts` input merging to accept finite components. Fix every caller and test fixture. Verify with `npm run typecheck`, and with a `world.test.ts` case for the "aim point moves with the head" scenario.
- [x] 1.2 In `combat.ts`, compute the target as head + offset (wrapped). Give each weapon carriage its own bearing to the target, falling back to the head's bearing within 40 units. Use that bearing for the muzzle offset and the flak spread. Verify with `combat.test.ts`:
  - converging MGs at 18/36/54 behind, aiming 200 north
  - firing behind the train
  - the close-range fallback
  - the flak angles around a bearing of 0
  - the existing fire, cooldown and budget tests still pass
- [x] 1.3 In `bot.ts`, set the aim offset to `wrapDelta(target - head)`, or the heading default when there is no target. Verify the "fires at a target in range" scenario in `bot.test.ts` (offset points at the enemy) and that `determinism.test.ts` passes.

## 2. Lethal index 2

- [x] 2.1 Set `BODY_COLLISION_MIN_INDEX` to 2 and update its doc comment. Verify the `pvp.test.ts` scenarios: index 2 is lethal, index 1 is safe, the starter train is crossed safely, and existing ram and mutual-ram tests pass with updated indices.

## 3. Hearts and healing doses in the simulation

- [x] 3.1 Add the `Heart` type, `WorldState.hearts`, the heart spawn timers, `TrainState.healDoses`, the `heart` event, and the heart constants (limits 6/1, respawn 8 s/60 s, drop chances 3%/20%, dose 15% over 8 s, cap 20). Verify with `npm run typecheck`.
- [x] 3.2 Collect hearts within `pickupRadiusOf` for living trains, at any hull, without touching carriages or score. Emit the event with the correct `amount`: the dose total for a slow heart, the hull restored for a full one. Verify a new `hearts.test.ts` for:
  - collection at full hull
  - the magnet radius
  - dead trains not collecting
  - a full heal from 50 to 300 with amount 250
  - a slow heart event with amount 60 at max hull 400
- [x] 3.3 Apply dose healing in hull regeneration: rates add up, hull is clamped to max, timers expire, the cap of 20 replaces the shortest dose, and doses are cleared on destruction and respawn. Verify `hearts.test.ts` for:
  - a single dose (100 → 160 plus regen over 8 s)
  - three stacked doses giving 22.5/s
  - a dose at full hull
  - doses ending on destruction
  - the cap replacement
- [x] 3.4 Spawn world hearts up to their limits on their timers. Age and expire dropped hearts at 35 s, while world hearts never expire. Add the enemy drop roll (one RNG draw, exclusive outcomes) and the boss's full heart. Verify `hearts.test.ts` for:
  - the map limit after 10 simulated minutes
  - a full heart replaced after collection
  - dropped-heart expiry
  - a boss drop of 5 pickups plus 1 full heart
  - a seeded 10,000-kill drop rate within ±1 percentage point of 3% and 20%

  Update seeded tests in `enemies.test.ts`, `world.test.ts`, and `determinism.test.ts` whose expectations shift with the extra RNG draws, and verify `npm test -w @lw/shared` passes.
- [x] 3.5 Clear hearts, timers and doses in `resetRound`, and refill the map's hearts. Verify the "hearts reset" scenario in `world.test.ts` (or `rounds.test.ts` on the server).
- [x] 3.6 Add hearts and the local dose count to the shared `view.ts` `WorldView`. Verify `view.test.ts` maps a world with both heart kinds and two doses.

## 4. Protocol and server

- [x] 4.1 Make these protocol changes in `messages.ts`, and bump `PROTOCOL_VERSION` to 7:
  - the input message carries `ax`/`ay`, replacing `a`, with a malformed check for non-finite values
  - `HeartRow` and the snapshot `ht` field
  - the `OwnTrain.hd` dose count
  - an optional 7th own flag on `ProjectileRow`
  - the `heart` event encoding

  Verify that `messages.test.ts` round-trips each new field and rejects malformed heart rows and a non-finite `ax`.
- [x] 4.2 Apply the aim offset in `server.ts`, scaling it down to length 2000 at most. Verify in `server.test.ts`: (30000, 0) applies as (2000, 0), and a non-finite offset is not applied.
- [x] 4.3 Rework the `admission.ts` aim-activity check for offsets: a change of direction above `AIM_ACTIVITY`, or of length above 50 units. Update `soak.ts` to send random offsets. Verify `admission.test.ts` (small jitter is not activity, a sweep is) and that the soak script typechecks.
- [x] 4.4 Send hearts within view radius in `snapshot.ts`/`interest.ts`, the own train's `hd`, and the own flag on the session's own projectiles. Route `heart` events through event interest. Verify `interest.test.ts`:
  - a heart in and out of range
  - only the session's own projectiles are flagged
  - the dose count is reported

## 5. Client: aim and own projectiles

- [x] 5.1 Make `InputState.toTrainInput` produce the offset as mouse minus head screen position, with the heading default before the mouse moves. Send `ax`/`ay` in `connection.ts`, still change-gated: a still mouse on a straight track sends nothing extra (while turning, the camera lag moves the head on screen, so aim updates follow at the existing 33 ms limit). Verify `input.test.ts` (150 px above gives (0, -150), and the default before the mouse moves) and a `connection.test.ts` check that a still mouse on a moving train sends only heartbeats.
- [x] 5.2 Pass the aim point (local drawn head + offset) to `renderScene`/`drawTrain`, and draw each manual weapon barrel at its own bearing to it. Remote trains stay along the track. Verify with a `render` unit test (or an extended `canvas.test.ts`) that three MG barrels get three different angles all pointing at the mouse, then check in the browser preview that the barrels converge on the cursor.
- [x] 5.3 In `connection.ts`, take own-flagged projectiles from the newest snapshot, extrapolated by `min(serverNow - st, MAX_EXTRAPOLATION_MS)`, and leave them out of the interpolated set. Verify in `connection.test.ts`: an own projectile is drawn at its newest-snapshot position plus velocity × elapsed, and an enemy projectile is still drawn at the interpolated time. Then check in the browser preview that bullets leave from the guns while boosting.

## 6. Client: safe cars and hearts

- [x] 6.1 In `render/train.ts`, draw carriages below `BODY_COLLISION_MIN_INDEX` (imported from `@lw/shared`), and every carriage of a protected train, at reduced alpha, with matching couplings. Verify with a render test that indices 0–1 are faded on an 8-car train and all cars are faded while protected. Check both cases in the browser preview.
- [x] 6.2 Add heart rendering: a pulsing pink heart shape for slow, and a larger red glowing heart for full. Add the palette entries. Verify `palette.test.ts` for the new colours, and check both kinds in the browser preview.
- [x] 6.3 Handle `heart` events in `eventFx.ts`: heart particles, a green "+N", and a green screen flash for a full heart on the local train. Add slow-heal and full-heal sounds in `sound.ts`. Verify `eventFx.test.ts` for the full-heart-on-local-train scenario (particles, "+250", flash, sound) and `sound.test.ts` for the new sound names.
- [x] 6.4 Add the HUD heart indicator with a ×N dose count by the hull bar, hidden at zero, with its styles. Verify the `hud.test.ts` dose indicator scenario (×3 shown, hidden when doses reach 0).

## 7. Integration

- [x] 7.1 Run `npm run typecheck`, `npm run lint`, and `npm test`, and verify all pass.
- [x] 7.2 Run the game (online via `npm run dev`, and in offline mode). Verify in the browser:
  - guns converge on the cursor
  - own bullets leave from the guns while boosting
  - front cars and protected trains are faded
  - a bot dies on your 3rd car
  - hearts spawn, drop from enemies, and heal (stacking visibly faster)
  - the full heart flashes and fills the hull bar
- [x] 7.3 Run the server soak (`soak.ts`) and verify there are no tick overruns or errors, and that bot deaths stay reasonable with the lethal index at 2.

## Workflow follow-up

- Archive the change with `/opsx:archive` once implementation is verified.
