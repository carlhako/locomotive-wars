# Locomotive Wars

A multiplayer top-down train combat game. Players share one server world, ram each other's trains
to grow their own, and compete in timed rounds for an all-time high score table.

## Requirements

Node 22 (see [`.nvmrc`](.nvmrc)) and npm 10 or newer.

## Run a server

From a [release](https://github.com/carlhako/locomotive-wars/releases) package (already built):

```bash
tar xzf locomotive-wars-0.1.0.tar.gz && cd locomotive-wars-0.1.0
npm ci --omit=dev
npm start -w @lw/server
```

From source:

```bash
npm ci
npm run build
npm start -w @lw/server
```

The server serves the game and its WebSocket on one port (default 8080), so players browse to
`http://<host>:8080`. Put a TLS reverse proxy in front of it for `https`.

## Configure

Copy [`config.example.json`](config.example.json) to `config.json` in the project root (or point
`LW_CONFIG` at another file) and restart the server. Missing keys take their defaults, `PORT`
overrides `port`, and a bad value stops the server with a list of errors.

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

The number of bots is `clamp(bots.fillTo - humans, bots.min, bots.max)`; set `bots.fillTo` and
`bots.min` to `0` for no bots.

High scores live in `highscores.file` and are served at `GET /api/highscores`. To edit or reset
them, stop the server, edit or delete the file, and start it again. A damaged file is renamed to
`highscores.json.corrupt-<timestamp>` and the table starts empty.

## Development

```bash
npm install
npm run dev
```

This starts the server and the Vite client together; open http://localhost:5173. Add `?offline`
to the URL to try the client without a server. Checks: `npm test`, `npm run lint`,
`npm run typecheck`.

The code is split into `packages/shared` (the simulation, used by both sides), `packages/server`
(Node) and `packages/client` (browser, built with Vite).

## License

[MIT](LICENSE)
