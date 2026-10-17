# Tasks

## 1. Config and store

- [x] 1.1 Add `highscores.size` (1 to 100, default 10) and `highscores.file` (default `data/highscores.json`) to the config schema, `config.example.json`, and the README key table; verify config unit tests and the README-equals-schema test pass
- [x] 1.2 Implement `highscores/store.ts`:
  - load with zod validation, creating the directory if needed
  - corrupt-file recovery (rename to `.corrupt-<ts>`, log, empty table)
  - atomic save (tmp, fsync, rename, dir fsync) serialised through one promise chain

  Verify unit tests (temp dirs) for the survives-restart and corrupt-file scenarios, and a crash-during-write test that kills a child process mid-save and checks the file is the old or new complete table
- [x] 1.3 Implement table logic: comparator (score desc, achievedAt asc, round-order sequence), qualification (free slot or strictly above the lowest; humans only; best > 0), insert, and trim to size; verify unit tests for the tie, beating-lowest, equal-does-not-qualify, bot, and two-qualifiers scenarios

## 2. Server service

- [x] 2.1 Implement `highscores/service.ts` attached to the `onRoundEnd` hook: insert qualifiers under their join names, save, issue tokens, send `hsEligible {token, rank, score}`, and broadcast `highscores`; verify an integration test with a short round where a qualifying client receives `hsEligible` and the file contains the entry
- [x] 2.2 Handle `hsName`:
  - token checks: exists, unused, same session, current round
  - sanitise with `sanitizeName`, keeping the join name if the result is empty
  - rename, save, reply `hsResult`, broadcast the updated table

  Discard tokens at the next round start. Verify integration tests for the enter-name, forged-token, token-reuse, and expired-after-round scenarios
- [x] 2.3 Add `GET /api/highscores` (ranked JSON, `Cache-Control: no-store`); verify an integration test for response shape and ordering
- [x] 2.4 Add the protocol messages `hsEligible`, `hsName`, `hsResult`, `highscores` and bump `PROTOCOL_VERSION`; verify protocol round-trip tests

## 3. Client

- [x] 3.1 Show the high score table on the join screen (fetched from `/api/highscores`, and on return to the join screen); verify manually that it lists rank, name, and score before pressing Play
- [x] 3.2 Add the high score table to the intermission overlay with highlighted new entries, live-updated from `highscores` broadcasts; verify visually with a short-round config
- [x] 3.3 Add the "NEW HIGH SCORE" name entry box (prefilled join name, max 16, autofocus, Enter submits, Saved or error feedback; game keys not captured while focused); verify manually that typing "CARL" renames the entry for all clients, and that ignoring the prompt keeps the join name

## 4. Integration and docs

- [x] 4.1 Run a full beta check with 2 tabs plus bots on a 60 s round: both players qualify, one renames and one ignores, restart the server and confirm the table persists and shows on the join screen
- [x] 4.2 Document high scores for operators in `README.md` (file location, how to edit or reset the table, corrupt-file behaviour); verify the documented reset steps work
