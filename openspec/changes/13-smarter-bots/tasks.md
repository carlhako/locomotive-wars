# Tasks

## 1. Record today's bots (before any bot code changes)

- [x] 1.1 Add `packages/shared/src/sim/botSkill.test.ts` with a "skill 0 matches the pre-skill controller" test. It runs a fixed-seed `World` of 8 bots, with mixed starting carriages as in the `bot.test.ts` soak, for 600 ticks. It builds a per-tick digest of:
  - each train's input, position, angle, hull, alive flag and carriage count
  - the trailer, enemy and drop counts

  It stores the digest with `toMatchSnapshot()`, and the digest leaves out every `ai` field. Verify that `npx vitest run packages/shared/src/sim/botSkill.test.ts` writes the snapshot, and that a second run passes. Commit the snapshot before touching `bot.ts`.

## 2. Bot skill option and state

- [x] 2.1 Add the skill constants to `sim/constants.ts`, with doc comments, following design decision 4:
  - `DEFAULT_BOT_SKILL` (0.7)
  - the look-ahead, margin, boost-threshold and lapse-chance factors
  - `BOT_LAPSE_TIME` (0.4)
  - `BOT_AVOID_SAMPLE_TICKS` (2)
  - the brake and boost cost penalties

  Verify with `npm run typecheck`.
- [x] 2.2 Add `botSkill?: number` to `WorldOptions` in `sim/types.ts`, documented as 0 to 1 with default 0.7. Resolve it in the `World` constructor, clamped to [0, 1]. Verify with `botSkill.test.ts` cases:
  - `new World().options.botSkill` is 0.7
  - 1.5 resolves to 1, and −1 resolves to 0
- [x] 2.3 Add `coilTurn` (−1, 0 or +1), `lapseTimer` and `blocked` to `BotState`, initialised to 0, 0 and false in `createTrain`. Verify:
  - a `botSkill.test.ts` case shows a new and a respawned train have those values
  - `determinism.test.ts` still passes

## 3. Body avoidance

- [x] 3.1 In `sim/bot.ts`, return early to today's input when `botSkill` is 0. Then add an `avoid()` step after the existing input is computed. It:
  - gathers obstacles: carriages from index 0 of other living trains within reach, protected trains included, own carriages excluded, with the per-train reach pre-filter
  - predicts each candidate arc, sampled every `BOT_AVOID_SAMPLE_TICKS` up to the look-ahead with wrapped positions
  - keeps the chosen input when it is clear, and otherwise picks the lowest-cost clear candidate (design decision 2)

  Verify that the task 1.1 snapshot test, run with `botSkill: 0`, still passes unchanged.
- [x] 3.2 Add `bot.test.ts` cases in an `emptyWorld` with hand-placed trains, as the existing bot tests do:
  - **clear path untouched:** a skill-1 bot seeking a trailer with no bodies nearby gives the same input as at skill 0
  - **skill 0 ignores bodies:** a bot seeking a trailer behind a body lying across its path drives into it and is destroyed with cause `ram`
  - **steering around:** the same layout at skill 1, with the body 200 units ahead, runs for 3 s and the bot is never destroyed
  - **braking:** a body placed just inside the cruise turning reach but outside the braked one makes the skill-1 bot set `brake`, and it is not destroyed

  Verify with `npx vitest run packages/shared/src/sim/bot.test.ts`.
- [x] 3.3 Add the boost candidates at skill ≥ 0.9, only when fuel is above `BOT_BOOST_MIN_FUEL` and the train is not boost-locked. Verify with a `bot.test.ts` case: with an empty tank, a skill-1 bot never picks a boost candidate.

## 4. Coil and lapses

- [x] 4.1 Add the coil (design decision 5). When no candidate is clear, use full turn toward the side whose blocked candidate makes contact latest, with the brake on and boost off. Hold the side in `ai.coilTurn`, re-check every tick, and leave on the first clear tick. Verify with `bot.test.ts` cases:
  - **trapped:** a skill-1 bot inside a ring of another train's body about 120 units across has turn ±1 and brake on, and survives 5 s while the ring is held in place
  - **leaving:** after the ring train is removed, `coilTurn` returns to 0 and the bot resumes steering toward its target within 1 s
- [x] 4.2 Add lapses (design decision 6). On the change from clear to blocked, when 0 < skill < 1, draw `rng.next() < lapseChance`. On a lapse, set `lapseTimer` to `BOT_LAPSE_TIME` and keep the chosen input until it runs out. Verify with `bot.test.ts` cases that drive 1,000 fresh clear-to-blocked encounters with a fixed seed:
  - at skill 1, no lapse ever starts
  - at skill 0.5, the lapse count is above 0 and below 500
  - at skill 1, an all-bot run draws from the rng exactly as often as a run where no path is ever blocked: compare the rng state after 600 ticks of the same seed with the bots kept apart

## 5. Benchmark and tuning

- [x] 5.1 Add `packages/shared/src/sim/botBench.test.ts`, with a long timeout (for example 120 s). It runs 10 bots for 5 minutes on each of seeds 1 to 5 at skill 0, at the default and at 1. Destroyed bots respawn 2 s later. It counts deaths by cause and prints a table. It asserts that default-skill ram deaths are at most half the skill-0 count. Verify that `npx vitest run packages/shared/src/sim/botBench.test.ts` passes, and record the printed numbers in the commit message.
- [ ] 5.2 Tune the constants from 2.1 until the benchmark passes, and until ram deaths at skill 1 are close to zero. Change only `constants.ts` values. Verify that the 5.1 benchmark passes and every test from groups 3 and 4 still passes.
- [ ] 5.3 Run the full suite with `npm test`. For each fixed-seed test that now fails because bots avoid bodies:
  - if it pins bot behaviour, set `botSkill: 0`
  - if its expectation about other behaviour really changed, update the expected value

  Verify that `npm test` passes, and list each test changed, and why, in the commit message.

## 6. Server config

- [x] 6.1 Add `skill: z.number().min(0).max(1).default(0.7)` to `botsShape` in `packages/server/src/config.ts`. Verify with `config.test.ts` cases:
  - the defaults include `bots.skill` 0.7
  - `{ bots: { skill: 0 } }` parses
  - `{ bots: { skill: 1.5 } }` fails with an error starting `bots.skill:`
  - update the existing `bots` expectations to include `skill`
- [x] 6.2 Pass `botSkill: config.bots.skill` to the `World` in `packages/server/src/server.ts`. Verify with a `server.test.ts` case: a server built with `bots.skill` 0 has `world.options.botSkill` 0, and the default config gives 0.7.
- [x] 6.3 Add `"skill": 0.7` to `bots` in `config.example.json`. In `README.md`, add a `bots.skill` row to the config-keys table: `0.7`, 0 to 1, "How well bots avoid other trains' bodies; 0 is the original bots, 1 never slips". Next to the bot count note, add a sentence saying the setting takes effect on restart. Verify that `config.test.ts` ("parsing config.example.json equals the defaults") and `readme.test.ts` pass.

## 7. Integration checks

- [x] 7.1 Run `npm run lint` and `npm run typecheck`, and verify both pass.
- [ ] 7.2 Run `SOAK_CARRIAGES=mg,mg,armor,speed,mg,mg,flak,mg npm run soak -w @lw/server` (60 s, 10 bots, 16 clients). Verify that it reports the tick rate within 1% of 30 and passes.
- [x] 7.3 Start the client dev server and open the home page, where the attract background runs bots at the default skill. Verify with a screenshot that bots move and fire, and that the console has no errors.
