# Proposal

## Why

The server now runs endless free-for-all with constants for everything. The beta needs:
- operator control through a config file: max players, round length, idle kick, bots
- timed rounds with a winner
- a server that stays populated by bots when few humans are online

It also needs the agreed scoring model:
- your score is your train length
- a round is decided by the longest train each player reached

This is change 6 of 7 and depends on `04-realtime-server-netcode` and `05-pvp-rules-and-respawn`.

## What Changes

- **Config file** (`config.json`, path overridable with `LW_CONFIG`), validated at startup with clear errors and defaults for missing keys:
  - `maxPlayers`, `roundLengthSec`, `intermissionSec`, `idleKickSec`
  - `bots.fillTo`, `bots.min`, `bots.max`
  - `maxCarriages`, `tickRate`, `snapshotRate`, `viewRadius`, `port`

  A `config.example.json` is committed.
- **Rounds:** play for `roundLengthSec`, then an intermission of `intermissionSec` showing final standings and the winner, then a fresh round. The world, trains, and round bests reset. The server idles when no humans are connected.
- **Scoring:**
  - live score = number of carriages behind the locomotive
  - pickups are the only way to gain points
  - round best = the highest live score reached this round; it decides the round winner
  - HUD shows current length and round best
  - leaderboard ranks by round best, showing best and current
- **Bot population:** bots fill the world to `clamp(fillTo − humans, min, max)`. They are added gradually and removed only when they die or at round reset. Bots are marked in the leaderboard and standings. This replaces change 04's fixed 6 bots.
- **Admission:** joins beyond `maxPlayers` humans are rejected with a "server full" message.
- **Idle kick:** a human with no input changes for `idleKickSec` during play is warned 10 seconds ahead, then disconnected with an "idle" reason. `0` disables it.
- **BREAKING (protocol):** new round, leaderboard, standings, idle-warning, and kicked messages; `PROTOCOL_VERSION` is bumped.

## Capabilities

### New Capabilities

- `server-config`: the configuration file: location, keys, defaults, validation, and startup behaviour.
- `round-lifecycle`: round phases, timing, reset, idle server behaviour, and end-of-round standings.
- `scoring`: live score, round best, leaderboard ranking, and round winner.
- `bot-population`: how many bots exist relative to humans, and how they are added, removed, and labelled.
- `player-admission`: the max-player limit and idle kicking.

### Modified Capabilities

None.

## Impact

- Server: `config.ts`, `rounds.ts`, `population.ts`, `admission.ts`, and leaderboard broadcasting. Change 04's `bots.ts` is removed.
- Shared: score and round-best fields on trains, `World.resetForRound()`, and new protocol messages.
- Client: HUD length/best rows and round timer, leaderboard panel, intermission standings overlay, server-full and kicked screens, and the idle warning.
- Change 07 builds high scores on the round-end standings.
