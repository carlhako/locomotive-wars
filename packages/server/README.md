# @lw/server

The Locomotive Wars game server: one authoritative [`World`](../shared) stepped at 30 Hz, an HTTP
server for the built client and a health check, and a WebSocket endpoint (`/ws`) that carries the
[real-time protocol](../shared/src/protocol/README.md). It is a single process with a single world.

## Running it

### Development

From the repository root:

```bash
npm install
npm run dev
```

This starts the server on port 8080 and the Vite client on port 5173 together. Open
<http://localhost:5173>, enter a name, and press Play. Vite proxies `/ws` to the server, so the
page and the socket share one origin.

To run only the server (it restarts when its sources change):

```bash
npm run dev -w @lw/server
```

### Built

The server serves the built client, so build everything first:

```bash
npm run build
npm start -w @lw/server
```

Open <http://localhost:8080>. The server looks for the client in `packages/client/dist`. If that
directory does not exist, `/` answers 404 with a note and the rest of the server still works.

| Environment variable | Default       | Meaning                                  |
| -------------------- | ------------- | ---------------------------------------- |
| `PORT`               | from config   | TCP port to listen on (overrides `port`) |
| `LW_CONFIG`          | `config.json` | Path of the JSON config file             |

Everything else is in the config file; see "Running a server" in the
[root README](../../README.md#running-a-server) for every key, its range, and its default.

## Endpoints

| Path       | What                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| `/`        | The built client (`packages/client/dist`), served from a list taken at start-up |
| `/healthz` | `200` with `{"status":"ok","humans":N,"bots":N,"tick":N}`                       |
| `/ws`      | WebSocket upgrade for the game protocol                                         |

```bash
curl http://localhost:8080/healthz
```

Browsers must check the client's index page with the server on every load (`Cache-Control:
no-cache`, answered with a `304` while its ETag still matches), so a player gets the new build as
soon as the server is upgraded. Files under `/assets/` are named by their content hash, so they are
cached for a year as `immutable`.

## What it does

- **One world.** `GameServer` (`src/server.ts`) owns a `World` and steps it from `FixedStepLoop`
  (`src/loop.ts`), a fixed-step loop that runs up to 5 catch-up ticks after a stall and logs an
  overrun if it falls further behind.
- **Sessions.** A client's first message is `hello`. The server sanitises the name, spawns a train
  (the protected starter: locomotive and machine gun), and replies `welcome`. When the socket closes the train is
  removed and half its carriages drop as pickups, with no kill credited.
- **Input.** The latest valid `in` message is applied each tick. Turn is clamped, malformed messages
  are ignored, more than 60 inputs a second are dropped, and a connection that sends 20 malformed
  messages is closed. The client cannot set a position.
- **Snapshots.** Every second tick each session gets a snapshot of what is within 1600 units of its
  train (`src/interest.ts`, `src/snapshot.ts`), preceded by a `meta` message when it has new trains
  or carriage kinds to learn about. A 2 Hz overview of all trains feeds the minimap.
- **Rounds.** `src/rounds.ts` is a tick-counted clock: `playing` for `roundLengthSec`, then an
  `intermission` (world frozen, input dropped, standings broadcast), then a fresh round
  (`World.resetForRound`). With no humans connected the world is paused. `GameServerOptions.onRoundEnd`
  receives each round's standings.
- **Bots.** `src/population.ts` keeps `clamp(fillTo - humans, min, max)` bots: one added a second
  when short, destroyed ones not respawned when over, the excess trimmed at round reset.
- **Admission.** More than `maxPlayers` humans get `reject {full}`. A player with no meaningful
  input change for `idleKickSec` of play is warned 10 s ahead, then sent `kicked` and closed with
  code 4000 (`src/admission.ts`).

A destroyed human train is respawned in place at the start of the next tick (`World.respawnTrain`):
same session and train id, fresh protected starter train at a safe position. Nothing carries over,
and there is no game-over state. The `trainDestroyed` event names the cause and killer.

## Soak test

```bash
npm run soak -w @lw/server
```

Starts an in-process server with 10 bots, connects 16 bot-driven WebSocket clients for 60 seconds,
and checks that the world ran 1800 ticks (within 1%) and that the 95th-percentile per-client
downstream rate stayed at or under 100 KB/s. It exits non-zero if either fails. Environment:

| Variable         | Default | Meaning                                                                           |
| ---------------- | ------- | --------------------------------------------------------------------------------- |
| `SOAK_SECONDS`   | `60`    | Measurement length                                                                |
| `SOAK_CLIENTS`   | `16`    | Simulated players (a destroyed one rejoins with a fresh train)                    |
| `SOAK_BOTS`      | `10`    | Server bots (in-process server only)                                              |
| `SOAK_COMPRESS`  | unset   | `1` turns on `permessage-deflate` (in-process server only)                        |
| `SOAK_CARRIAGES` | unset   | Comma-separated kinds added to every train at each spawn (in-process server only) |
| `SOAK_URL`       | unset   | Test an already-running server, such as `http://localhost:8080`                   |

## Tests

```bash
npm test -w @lw/server
```

Unit tests cover the loop, interest filtering, and meta diffing. Integration tests start a real
server on an ephemeral port and talk to it over WebSocket and HTTP.

## Layout

```
src/
  main.ts       loads the config, starts the server, shuts down on SIGINT/SIGTERM
  config.ts     config file schema (zod), defaults, validation, PORT override
  server.ts     GameServer: http + ws + world + sessions + the tick
  http.ts       static client (sirv) and /healthz
  loop.ts       fixed-step accumulator loop
  sessions.ts   per-connection state and limits
  interest.ts   what a session can see; meta diffing
  snapshot.ts   world -> snap / ov messages
  rounds.ts     round clock (idle / playing / intermission)
  standings.ts  ranking, leaderboard rows, round results
  population.ts bot fill
  admission.ts  player limit and idle tracking
  soak.ts       the soak test
```
