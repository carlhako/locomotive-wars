# Tasks

## 1. Configuration

- [ ] 1.1 Add zod and implement `config.ts` (schema with defaults, cross-field checks, unknown-key warnings, `LW_CONFIG` path, missing-file defaults, `PORT` override); verify unit tests for the partial-config, invalid-values (both keys reported, non-zero exit), typo-warning, and custom-path scenarios
- [ ] 1.2 Add `config.example.json` with every key at its default, and confirm `config.json` is git-ignored; verify a test that parsing the example equals the defaults
- [ ] 1.3 Wire config values into the server (tick and snapshot rate, view radius, max carriages into the World) and into `welcome`; verify an integration test with `snapshotRate` 30 receives a snapshot every tick

## 2. Scoring (shared)

- [ ] 2.1 Add `score` (carriages − 1), `roundBest`, and `roundBestTick` to trains, updated on carriage add and preserved across respawn within a round; verify unit tests for starter score 1, pickup +1, kills not scoring, death resetting live score, and best surviving death
- [ ] 2.2 Add the ranking comparator (roundBest desc, roundBestTick asc, id asc); verify unit tests for the peak-beats-final and tie scenarios

## 3. Rounds

- [ ] 3.1 Implement `World.resetForRound(seed)` (respawn all as starters, zero bests and kills, regenerate trailers and enemies, clear boss, reset boss timer); verify a unit test for the fresh-start scenario
- [ ] 3.2 Implement the `rounds.ts` state machine (IDLE/PLAYING/INTERMISSION, tick-counted timers, frozen sim and dropped inputs in intermission, `roundEnd` standings broadcast, `onRoundEnd` hook); verify integration tests with short config values (30 s round, 5 s intermission) for round end, next round, frozen world, and the last-player-leaves idle scenario
- [ ] 3.3 Handle joins during intermission (overlay, spawn at next round); verify an integration test where the joiner gets `roundEnd` data and a train only after the round starts

## 4. Bots and admission

- [ ] 4.1 Implement `population.ts` (target formula, +1 bot per second, respawn-or-remove for dead bots, excess removal at reset, unique names) and delete change 04's `bots.ts`; verify unit tests for the few-humans, many-humans, bots-disabled, and human-joins-busy-world scenarios
- [ ] 4.2 Implement the max-player check at `hello` with `reject {full, humans, max}`; verify integration tests for server full and slot frees up
- [ ] 4.3 Implement idle tracking (meaningful-input rule, PLAYING-only tick accumulation, `idleWarn` at −10 s, `idleClear`, `kicked` plus close code 4000, `idleKickSec` 0 disables); verify integration tests for heartbeats-not-activity, intermission-not-counted, warned-then-kicked, warning-cleared, and disabled

## 5. Protocol and client UI

- [ ] 5.1 Add the `round`, `roundEnd`, leaderboard fields on `ov`, `idleWarn`, `idleClear`, `kicked` messages and `reject` reason `full`; bump `PROTOCOL_VERSION`; verify protocol round-trip tests
- [ ] 5.2 Update the HUD with "Length" and "Round best" rows and the round timer (mm:ss, highlighted in the last 10 s); verify the HUD-after-death scenario and the final-seconds scenario visually
- [ ] 5.3 Implement the leaderboard panel (top 10, best/now, BOT tag, local row appended with rank); verify a unit test for the local-player-outside-top-10 scenario
- [ ] 5.4 Implement the intermission overlay (ranked standings, winner highlight, bot markers, countdown); verify visually with a short-round config
- [ ] 5.5 Implement the server-full (Retry), kicked (Rejoin), and idle-warning countdown screens; verify manually with `maxPlayers` 1 and `idleKickSec` 20

## 6. Integration and docs

- [ ] 6.1 Play a full short round cycle (60 s round, 10 s intermission) with 2 tabs plus bots; verify the winner is the highest round best and everyone resets
- [ ] 6.2 Document every config key, range, and default in `README.md` (operator section) and keep it consistent with `config.example.json`; verify by test that README keys equal schema keys
