# Design

## Context

After change 05 the server runs one endless world. Constants (tick and snapshot rate, view radius, max carriages) live in code, and change 04's `bots.ts` keeps exactly 6 bots. Trains respawn instantly with a starter train. This change adds the operator-facing config, round structure, scoring, bot fill, and admission rules agreed during exploration.

## Goals / Non-Goals

**Goals:**
- Everything an operator would tune lives in one validated file.
- The round result is computed by the server and is ready for change 07 to use for high scores.

**Non-Goals:**
- High score persistence and name entry (change 07).
- Hot-reloading config: restart to apply.
- Multiple concurrent worlds or matchmaking queues.
- Bot difficulty levels.

## Decisions

### Config: zod schema with defaults

`packages/server/src/config.ts` defines a zod schema mirroring the spec tables. `.default()` on every key gives partial-file support, `superRefine` handles cross-field rules (`bots.min ≤ bots.max`, `tickRate % snapshotRate === 0`), and `.strict()` is turned into warnings by diffing keys before parsing. zod is used over hand-written checks because it produces all errors at once with paths (for example `bots.max`), which the spec requires. Startup order: read file → parse → print all issues and `process.exit(1)` on errors → apply `PORT` override → freeze. The client receives the relevant values (`roundLengthSec`, `intermissionSec`, `idleKickSec`, rates) in `welcome`.

```
config.example.json
{
  "port": 8080,
  "maxPlayers": 16,
  "roundLengthSec": 600,
  "intermissionSec": 20,
  "idleKickSec": 60,
  "bots": { "fillTo": 12, "min": 0, "max": 10 },
  "maxCarriages": 150,
  "tickRate": 30,
  "snapshotRate": 15,
  "viewRadius": 1600
}
```

Change 07 adds a `highscores` section.

### Round state machine (`rounds.ts`)

```
            first human joins                 roundLengthSec elapsed
   IDLE ------------------------> PLAYING -----------------------------> INTERMISSION
    ^                               ^  |                                     |
    |      last human leaves        |  |                                     |
    +-------------------------------+--+         intermissionSec elapsed     |
    |                               +----------- resetForRound() <-----------+
    +--------- last human leaves during INTERMISSION
```

- **Round time is counted in ticks**, not wall clock, so a paused or stalled loop can't skip a round end.
- **IDLE:** the loop keeps running for sockets, but `World.step()` is skipped.
- **INTERMISSION:** `step()` is skipped and inputs are dropped. Snapshots continue so clients keep a frozen frame behind the overlay.
- **On PLAYING to INTERMISSION:** compute standings once, broadcast `roundEnd {roundId, standings[], winnerId, nextRoundAt}`, and pass standings to an `onRoundEnd` hook. Change 07 attaches high scores to that hook.
- **`World.resetForRound(seed)`:**
  - respawns every train as a starter
  - zeroes round bests and kills
  - regenerates trailers and enemies, clears the boss, and resets the boss timer
  - uses a fresh RNG seed per round

### Scoring fields on the train (shared)

- `score` is a getter: `carriages.length - 1`.
- `roundBest` is updated after every carriage add, along with `roundBestTick` (the tick it was first reached), which is used for tie-breaks.
- Ranking comparator: `roundBest desc, roundBestTick asc, id asc` (final deterministic fallback).
- Being in shared lets offline mode show the same HUD.
- Change 02 left out reference score and combo code, so there is nothing to remove.

### Leaderboard broadcast

The `overview` message (2 Hz, change 04) gains a leaderboard: the top 10 as `[id, roundBest, score, isBot]`, plus each recipient's own rank, sent per session. Names come from the `meta` the client already holds. Round standings at round end use the same comparator over all trains.

### Bot population (`population.ts`)

Runs once per second:
- `target = clamp(fillTo - humans, min, max)`
- if `bots < target`, add one bot (spawned with protection at a safe position)
- in the respawn step, a dead bot respawns only if `bots ≤ target`; otherwise it is removed
- `resetForRound` removes any excess living bots before respawning the rest

Names: a shuffled pool from the reference's `AI_NAMES`, skipping names in use. This replaces change 04's `bots.ts`.

### Admission and idle (`admission.ts`)

- **Max players:** checked at `hello`. `reject {reason:"full", humans, max}` is sent, then the socket closes.
- **Idle tracking:** each session keeps the last "meaningful" input:
  - turn, boost, or brake differs
  - or the aim difference via `shortAngle` exceeds 0.05 rad
- **Counting idle time:** idle ticks accumulate only in PLAYING, measured in ticks. At `idleKickSec - 10` the server sends `idleWarn {secondsLeft}`; at `idleKickSec` it sends `kicked {reason:"idle"}`, then closes with code 4000. The client distinguishes kicked from a plain disconnect by that message or the close code. Meaningful input sends `idleClear`.

### Protocol additions

- New messages: `round` (phase changes), `roundEnd` (standings), leaderboard fields on `ov`, `idleWarn`, `idleClear`, `kicked`.
- `reject` gains `full`.
- `PROTOCOL_VERSION` is bumped.

### Client UI

- **HUD stats panel:** "Length" (live score) and "Round best" rows replace "Score".
- **Round timer:** top centre; the last 10 s are highlighted.
- **Leaderboard panel** (ported markup from change 03): name, best, now, and a BOT tag; the local row is highlighted and appended if outside the top 10.
- **Intermission overlay:** standings table, winner banner, countdown. Change 07 adds the name entry here.
- **Server-full screen** with Retry, and **kicked screen** with Rejoin.
- **Idle warning** banner with countdown.

## Risks / Trade-offs

- [Freezing the world in intermission means a player mid-fight at the buzzer loses momentum] → Intended: the round is over. The new round resets everyone.
- [Bots never removed mid-round when humans flood in, so a briefly overcrowded world] → Bots die often; excess clears within minutes or at the round end. The `max` cap bounds it.
- [Aim-based idle detection lets a player wiggle the mouse to stay connected] → Acceptable for the beta. Idle kick exists to free slots from abandoned tabs, not to enforce play.
- [Tie-break by `roundBestTick` needs per-train tick bookkeeping] → Cheap: one integer per train.

## Open Questions

None.
