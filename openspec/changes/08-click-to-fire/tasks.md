# Tasks

## 1. Simulation

- [x] 1.1 Add `fire: boolean` to `TrainInput` and default it to `false` everywhere a `TrainInput` is built (new trains, bot fallback, soak client, test helpers); verify `npm run typecheck` passes
- [x] 1.2 Rewrite `fireWeapons` in `combat.ts`:
  - fire only while `input.fire` is on
  - remove the `WEAPON_ARC` check and the `hostileWithin` range gate (delete both if unused)
  - keep spawn protection and the `-dt` cooldown floor

  Verify new `combat.test.ts` cases for firing behind the train, firing with nothing in range, fire released, held fire persisting with no new input, and MG rate (~7 shots in 1 s)
- [x] 1.3 Add `MAX_TRAIN_PROJECTILES = 120` and the per-tick count of each train's weapon projectiles (drone shots excluded); a ready weapon waits while its train is at the limit. Verify tests: 40 MGs holding fire for 5 s never exceed 120 live, firing resumes when projectiles expire, and no burst after waiting
- [x] 1.4 Make the bot controller return `fire` = target found within `WEAPON_RANGE`; verify `bot.test.ts` cases for firing at an enemy 300 units away, holding fire with nothing in range, and never firing at a protected train
- [x] 1.5 Update existing sim tests and fixtures that relied on automatic fire (`combat`, `pvp`, `events`, `determinism`, `scoring`) to set `fire`; verify the full shared test suite passes
- [x] 1.6 Update the protection test in `pvp.test.ts`: a protected train holding fire fires nothing until protection expires; verify it passes

## 2. Protocol and server

- [x] 2.1 Add the required `f: 0 | 1` field to `InputMsg`, validate it in the parser, and bump `PROTOCOL_VERSION` to 5; verify `messages.test.ts` round-trips, plus rejection cases for a missing `f` and `f: 2`
- [x] 2.2 Map `msg.f` to `input.fire` in `server.ts` and add fire to `IdleTracker`'s meaningful-change test; verify `admission.test.ts` (a fire press resets idle time) and a `server.test.ts` case where a client holding fire produces `fired` events
- [x] 2.3 Make the soak client in `soak.ts` hold fire part of the time; verify the soak run completes and reports a projectile count bounded by the budget

## 3. Client

- [x] 3.1 Add fire capture to `InputState`:
  - `pointerdown` button 0 on the game canvas sets it
  - window `pointerup` and `blur` clear it
  - include it in `toTrainInput`

  Verify `input.test.ts` cases for hold, release, blur, and a click on a non-canvas target not firing
- [x] 3.2 Send fire changes immediately in `net/connection.ts` (as a control change, not throttled like aim) and include `f` in every input message; verify `connection.test.ts` that a press is sent at once with `f: 1`
- [x] 3.3 Pass fire through the offline loop (`offline.ts` / `source.ts`); verify `offline.test.ts` shows weapons firing only while fire is held
- [x] 3.4 Show a pressed state on the aim cursor while firing, and change the controls text on the join screen and `#tips` to "Mouse — Aim, hold click to fire"; verify in the browser preview that the cursor changes on press and the text reads correctly

## 4. Integration

- [x] 4.1 Play a server session with bots in the browser: hold fire at empty space (guns fire), aim behind the train (guns fire backward), release (guns stop), and check that bots still engage. Run `npm test` and `npm run lint` and verify both pass

## Workflow follow-up

- Archive the change once it has been played and approved.
