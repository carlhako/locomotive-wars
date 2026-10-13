# Proposal

## Why

The game must run on a server where many players share one world with low latency. After changes 02 and 03 the simulation is headless and the client renders from a `WorldView`. What's missing is a server that runs the authoritative world and a real-time protocol that carries inputs up and world state down. This is change 4 of 7. It depends on `02-extract-shared-simulation`, and on `03-client-renderer-from-snapshots` for the client side.

## What Changes

- Add a Node game server (`packages/server`):
  - an HTTP server that serves the built client and a `/healthz` endpoint
  - one authoritative world stepped at a fixed 30 Hz
  - a WebSocket endpoint at `/ws`
- Define a versioned message protocol in `@lw/shared`:
  - client to server: `hello`, `input`, `ping`
  - server to client: `welcome`, `reject`, `snapshot` (view plus events), `meta`, `overview`, `pong`
  - JSON encoding for the beta; binary encoding is a post-beta change
- Joining: the player enters a name on a join screen; the server sanitises it and spawns a train for the session. Leaving removes the train.
- **Interest management:** each client receives only entities near its train, plus a low-rate overview of all trains for the minimap.
- **Smoothing:**
  - the client estimates server time with ping/pong
  - other entities are drawn about 133 ms in the past and interpolated between snapshots (wrap-aware)
  - the local train is drawn from the newest snapshot, extrapolated, to cut perceived input lag
- Server-side input validation: clamp ranges, drop malformed messages, limit message rate.
- Disconnect handling on the client: an overlay with a reconnect button.
- A temporary fixed bot count (6) populates the world until change 06 adds configurable bot fill.

## Capabilities

### New Capabilities

- `game-server`: hosting: serving the client, the health endpoint, the single authoritative world loop, and player session join and leave.
- `realtime-netcode`: the client-server real-time protocol: messages and versioning, input handling, snapshot content and rate, interest management, time sync, interpolation, and disconnect behaviour.

### Modified Capabilities

None.

## Impact

- New dependencies: `ws` (WebSocket server) and `sirv` (static file serving).
- New code: `packages/server/src/` and `packages/shared/src/protocol/`. The client gains `net/` plus the join and disconnect screens.
- The server is a single process with one world; multiple rooms or shards are out of scope.
- Changes 05 to 07 build on these messages (respawn, rounds, high scores).
