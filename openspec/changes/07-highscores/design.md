# Design

## Context

Change 06 provides:
- round-end standings with round bests computed by the server
- an `onRoundEnd(standings)` hook
- an intermission overlay
- a zod-validated config

`sanitizeName` exists in `@lw/shared` (change 04). `data/` is git-ignored (change 01). Scale is a single server process, about one write per round (every 10 minutes by default).

## Goals / Non-Goals

**Goals:**
- An all-time table that cannot be written by clients beyond naming their own entry.
- Durable storage without operating a database.

**Non-Goals:**
- Daily or weekly boards, per-player history, accounts, profanity filtering.
- Multiple server instances sharing one table.

## Decisions

### Insert at round end, rename during intermission

Qualifying results are inserted immediately under the join name, and name submission only renames an existing entry. Alternatives were rejected:
- **Waiting for names before inserting** complicates ranking when several players qualify and leaves results unsaved if the server stops.
- **Inserting at intermission end** loses results if the process dies mid-intermission.

This way the score is saved at the moment it is earned, ranks are known at once (the prompt can show "#3"), and ignoring the prompt or disconnecting needs no special handling.

### Storage: JSON file with atomic replace

```json
{ "version": 1,
  "entries": [ { "id": "r42-7", "name": "CARL", "score": 64,
                 "achievedAt": "2026-10-20T19:04:11Z", "roundId": 42 } ] }
```

- **Save:** write to `<file>.tmp-<pid>` → `fsync` → `rename` over the target, which is atomic on the same filesystem → `fsync` the directory.
- **Ordering:** saves go through a single promise chain so two saves can never interleave.
- **Validation:** load with a zod schema; on failure, rename the file to `.corrupt-<timestamp>` and start empty.

SQLite (`node:sqlite` or better-sqlite3) was considered. A 10-row table written every 10 minutes doesn't justify a native dependency or an experimental API. The store interface (`load`, `save`) would allow swapping later.

### Tokens

At round end, each qualifying session gets a random 128-bit token (`crypto.randomUUID`). It maps to `{entryId, sessionId, roundId, used:false}` and is sent in `hsEligible {token, rank, score}`. A rename request `hsName {token, name}` is accepted only if:
- the token exists and is unused
- it was issued to this socket's session
- it belongs to the current intermission's round

Tokens are discarded when the next round starts. The reply is `hsResult {ok, reason?}`; on success the updated table is broadcast as `highscores {entries, highlightIds}`.

### Ranking

The comparator is `score desc, achievedAt asc`; the timestamp is the round end time. Players qualifying in the same round share a timestamp, so their order uses the round standings order (change 06's comparator), stored as a sequence in the entry id.

### Config

Add to change 06's schema: `highscores: { size: 1..100 = 10, file: string = "data/highscores.json" }`. Add to `config.example.json` and the README key table.

### HTTP endpoint

`GET /api/highscores` returns `{entries:[{rank,name,score,achievedAt}]}` with `Cache-Control: no-store`. It is read-only, so no auth is needed. The join screen fetches it on load and on returning to the join screen.

### Client UI

- **Join screen:** a high score panel beside the name field.
- **Intermission overlay:** the high score table next to the round standings, with highlighted rows.
- **Qualifying players:** a prominent "NEW HIGH SCORE #N — 64 carriages" box with a name input (prefilled, max 16, autofocus) and a Save button. Enter submits. It shows "Saved" or the server's reason.
- Game keys are not captured while the input has focus.

## Risks / Trade-offs

- [Players could farm the table by idling in empty servers with bots] → Bots fight back, idle kick applies, and the table rewards length actually reached. Revisit with real data after the beta.
- [Offensive names on a public board] → The 16-character limit plus sanitising. An operator can edit the JSON file (documented). A filter is out of scope.
- [Single-file storage with one process] → Fine for one server. Multi-instance needs a shared store, a future change.
- [Clock skew affecting `achievedAt` ordering] → Only one server writes, so ordering is consistent.

## Open Questions

None.
