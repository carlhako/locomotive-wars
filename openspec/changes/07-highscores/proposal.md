# Proposal

## Why

Rounds end and the world resets, so nothing a player achieves lasts beyond the intermission. An all-time high score table gives players a reason to come back. Entering your name when you beat the table is part of the beta scope agreed during exploration. This is change 7 of 7, the last one for the first beta, and depends on `06-server-config-and-rounds`.

## What Changes

- **Persistent table:** the top N (default 10) human round results, ranked by round best (longest train reached in a round). Stored on the server in a JSON file and kept across restarts.
- **Qualifying:** at round end, each connected human whose round best beats the lowest entry (or fills an empty slot) gets an entry, saved straight away under their join name.
- **Name entry:** during the intermission, qualifying players see "NEW HIGH SCORE", their rank, and a name box prefilled with their join name. Submitting changes the entry's name. Doing nothing keeps the join name.
- **Server checks:** the score always comes from the server. The client only sends a name with a one-time token for its own entry. Names are sanitised with the same rules as join names.
- **Display:** the high score table is shown on the join screen (via `GET /api/highscores`) and in the intermission overlay, with this round's new entries highlighted.
- Bots never enter the table.
- New config keys: `highscores.size` (default 10) and `highscores.file` (default `data/highscores.json`).
- **BREAKING (protocol):** new high-score messages; `PROTOCOL_VERSION` is bumped.

## Capabilities

### New Capabilities

- `highscores`: the persistent all-time table: qualification, name entry, storage, and display.

### Modified Capabilities

None. The config keys are added as part of this capability's requirements.

## Impact

- Server: `highscores/store.ts` (load, atomic save, corrupt-file recovery), `highscores/service.ts` (round-end hook, tokens, rename), `GET /api/highscores`, and two new config keys.
- Shared: protocol messages; `sanitizeName` is reused.
- Client: high score table on the join screen and in the intermission overlay, plus the name entry form.
- Runtime data directory `data/`, already git-ignored in change 01.
