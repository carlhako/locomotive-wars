# Locomotive Wars

A top-down train combat game, being turned from a single-player HTML file into a multiplayer web
game. Many players share one authoritative server world, ram each other's trains, and compete for
a high-score table.

The original single-player game is preserved unchanged at
[`reference/locomotive-wars-v4.html`](reference/locomotive-wars-v4.html) and is the behaviour
reference for the port.

## Requirements

- Node 22 (see [`.nvmrc`](.nvmrc))
- npm 10 or newer (ships with Node 22)

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts the game server (port 8080) and the Vite client together. Open
http://localhost:5173, enter a name, and press Play. The client dev server proxies the `/ws` path to
the game server. To try the client without a server, open http://localhost:5173/?offline.

## Running a server

The server reads its settings from a JSON file: `config.json` in the directory you start it from, or
the path in the `LW_CONFIG` environment variable. Copy [`config.example.json`](config.example.json)
(every key at its default) to `config.json` and change what you need; `config.json` is not
committed. A missing file means all defaults, and a missing key takes its default. Restart the
server to apply changes.

```bash
cp config.example.json config.json
npm run build
npm start -w @lw/server
```

The `PORT` environment variable overrides `port`. The server refuses to start, exiting non-zero and
listing every bad key, when a value has the wrong type or is out of range. An unknown key (a typo
such as `maxPlayer`) only prints a warning and is ignored.

<!-- config-keys:start -->

| Key               | Default                | Allowed                     | Meaning                                                                      |
| ----------------- | ---------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `port`            | `8080`                 | 0 to 65535                  | TCP port to listen on                                                        |
| `maxPlayers`      | `16`                   | 1 to 100                    | Most human players connected at once; more are refused as full               |
| `roundLengthSec`  | `600`                  | 30 to 7200                  | Length of a round                                                            |
| `intermissionSec` | `20`                   | 5 to 300                    | Pause between rounds, showing the standings                                  |
| `idleKickSec`     | `60`                   | `0` (off), or 20 to 3600    | Kick a player who stops steering this long (warned 10 s before)              |
| `bots.fillTo`     | `12`                   | 0 to 100                    | Bots fill the world up to this many trains in all, humans included           |
| `bots.min`        | `0`                    | 0 to `bots.max`             | Fewest bots, however many humans are connected                               |
| `bots.max`        | `10`                   | 0 to 100                    | Most bots                                                                    |
| `highscores.size` | `10`                   | 1 to 100                    | Entries kept in the all-time high score table                                |
| `highscores.file` | `data/highscores.json` | any path                    | Where the table is stored; a relative path is read from the config directory |
| `maxCarriages`    | `150`                  | 10 to 500                   | Longest a train can grow, locomotive included                                |
| `tickRate`        | `30`                   | 10 to 60                    | Simulation steps per second                                                  |
| `snapshotRate`    | `15`                   | 1 to `tickRate`, divides it | Snapshots sent per client per second                                         |
| `viewRadius`      | `1600`                 | 500 to 5000                 | How far from its train a client sees, in world units                         |

<!-- config-keys:end -->

The number of bots is `clamp(bots.fillTo - humans, bots.min, bots.max)`. Bots are added one a
second, are never removed while alive, and are trimmed at the start of the next round. Set
`bots.fillTo` and `bots.min` to `0` for a server with no bots.

### Rounds

A round lasts `roundLengthSec`, then an intermission of `intermissionSec` shows the final standings
and the winner (the player whose train reached the greatest length during the round; the player who
got there first wins a tie). The next round resets the world and every train. With no human
connected the world is paused, and the next player to join starts a fresh round.

### High scores

The server keeps an all-time table of the best round results by human players, ranked by round best
(the longest train reached in a round; the earlier result wins a tie). Bots never enter it. When a
round ends, each connected human whose round best beats the lowest entry (or fills a free slot) is
added at once under their join name, and during the intermission they can type a name for the
entry. The table is shown on the join screen and in the intermission overlay, and
`GET /api/highscores` returns it as JSON.

The table lives in the JSON file named by `highscores.file` (default `data/highscores.json`; a
relative path is read from the directory you start the server in, like `config.json`). The server
creates the directory, reads the file at startup, and replaces it atomically after each change, so
a crash never leaves a half-written file.

- **Edit an entry** (to remove an offensive name, say): stop the server, change the `name` in the
  file, and start it again. Keep the file valid JSON; entries beyond `highscores.size` are dropped
  at startup.
- **Reset the table:** stop the server, delete the file (`rm data/highscores.json`), and start it
  again. The table starts empty.
- **A damaged file:** if the file is not valid or fails its checks at startup, the server logs an
  error, renames it to `highscores.json.corrupt-<timestamp>` next to the original, and starts with
  an empty table. Fix or discard the renamed file by hand.

Back the file up like any other data; it is the only copy of the table.

## Scripts

| Script                       | What it does                                         |
| ---------------------------- | ---------------------------------------------------- |
| `npm run dev`                | Server (`tsx watch`) and client (Vite) together      |
| `npm run build`              | Build `shared`, then `server` (`tsc`), then `client` |
| `npm run soak -w @lw/server` | 60 s load test: 16 clients, tick rate and bandwidth  |
| `npm test`                   | Run every package's Vitest tests                     |
| `npm run lint`               | ESLint and a Prettier format check                   |
| `npm run typecheck`          | `tsc --noEmit` in every package                      |
| `npm run format`             | Rewrite files with Prettier                          |

## Layout

| Package           | Name         | Purpose                                                 |
| ----------------- | ------------ | ------------------------------------------------------- |
| `packages/shared` | `@lw/shared` | Simulation, constants, protocol types. No DOM, no Node. |
| `packages/server` | `@lw/server` | Node game server                                        |
| `packages/client` | `@lw/client` | Browser game, built with Vite                           |

`@lw/shared` is consumed as TypeScript source in development (via a `source` export condition) and
as built output (`dist/`) in production. Lint and the TypeScript config both reject browser and
Node APIs inside it, so the same simulation runs on server and client.

## Roadmap

Work is planned as numbered [OpenSpec](openspec/) changes. Each builds on the one before.

1. **`01-bootstrap-repo-and-scaffold`**: repository, monorepo, tooling, CI (this change).
2. **`02-extract-shared-simulation`**: game rules as a headless, multi-train simulation.
3. **`03-client-renderer-from-snapshots`**: client draws from a self-contained world view.
4. **`04-realtime-server-netcode`**: authoritative server and real-time protocol.
5. **`05-pvp-rules-and-respawn`**: any train can ram any other; immediate respawn.
6. **`06-server-config-and-rounds`**: operator config file, timed rounds, bots.
7. **`07-highscores`**: persistent all-time high-score table.

## License

[MIT](LICENSE)
