# Real-time protocol

The messages between the browser and the game server (`/ws`), and the rates and radii they run at.
Everything here is defined in code in [`messages.ts`](messages.ts) and
[`constants.ts`](constants.ts); the server and the client both import these types, so the two
cannot disagree about a shape.

Messages are JSON text frames, one message per frame. Keys are short and entity lists are arrays of
numbers to keep snapshots small. Binary encoding and delta compression are a later change.

## Versioning

`PROTOCOL_VERSION` (currently `2`) is bumped on any incompatible change to a message. The first
message a client sends is `hello` carrying its version; a server that does not speak it replies
`reject` with reason `version` and closes the socket. The client then tells the player to reload.

## Rates and distances

| Name                       | Value      | Meaning                                                                  |
| -------------------------- | ---------- | ------------------------------------------------------------------------ |
| Server tick                | 30 Hz      | `World.step()`; one tick every 33.3 ms                                   |
| `SNAPSHOT_RATE`            | 15 Hz      | One `snap` per session every second tick                                 |
| `OVERVIEW_RATE`            | 2 Hz       | One `ov` per session                                                     |
| `VIEW_RADIUS`              | 1600 units | Wrapped distance from the session's train head                           |
| `INTERP_MS`                | 133 ms     | Remote entities are drawn this far in the past (two snapshot gaps)       |
| `INPUT_HEARTBEAT_MS`       | 100 ms     | The client resends its input at least this often                         |
| `MAX_INPUT_RATE`           | 60 per s   | Inputs beyond this per session are dropped by the server                 |
| `MAX_MALFORMED`            | 20         | A connection that sends this many malformed messages is closed           |
| `MAX_CLIENT_MESSAGE_BYTES` | 1024       | Largest client message the server accepts                                |
| `PING_INTERVAL_MS`         | 2000 ms    | Clock-sync ping period (the client also sends a few right after joining) |
| `SNAPSHOT_TIMEOUT_MS`      | 5000 ms    | Without a snapshot this long, the client treats the connection as lost   |

All of these are constants until change 06 moves the tunable ones into the server config.

## Client to server

| `t`     | Fields                                                                | Notes                                                                                          |
| ------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `hello` | `v` protocol version, `name`                                          | Must be first. The server sanitises the name (`sanitizeName`) and spawns the train.            |
| `in`    | `s` sequence, `tr` turn, `b` boost 0/1, `br` brake 0/1, `a` aim (rad) | Sent on change and every 100 ms. `tr` is clamped to [-1, 1]; non-finite numbers are malformed. |
| `ping`  | `c` client time (ms)                                                  | Echoed in `pong`.                                                                              |

A client never sends a position. Unknown fields are dropped when a message is decoded.

## Server to client

| `t`       | Fields                                                                         | When                                                                                                                      |
| --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `welcome` | `v`, `id` (the session's train), `tickRate`, `snapRate`, `mapSize`, `interpMs` | Once, in reply to a good `hello`.                                                                                         |
| `reject`  | `reason`: `version`, `full`, or `malformed`                                    | Instead of `welcome`; the socket then closes.                                                                             |
| `meta`    | `trains: [{id, name, color, ctl, kinds}]`, `gone: [id]`                        | When a train is first in view, its carriage kinds change, or it leaves view. Always sent before the `snap` that needs it. |
| `snap`    | see below                                                                      | At the snapshot rate.                                                                                                     |
| `ov`      | `h: [[id, x, y, color, name]]`                                                 | At the overview rate: every living train, for the minimap and kill feed.                                                  |
| `pong`    | `c` (echoed), `st` server time (ms)                                            | In reply to `ping`.                                                                                                       |

### `snap`

| Key   | Content                                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `k`   | Simulation tick                                                                                                                                                             |
| `st`  | Server time of the tick in ms (`k × 1000 / 30`); the clock `pong.st` also uses                                                                                              |
| `ack` | Sequence number of the last `in` applied to the session's train                                                                                                             |
| `me`  | The session's own train in full: `x y a hp mh f fm fl sq cs dn` (position, heading, hull, max hull, fuel, max fuel, flags, spawn counter, carriage x/y pairs, drone angles) |
| `tr`  | Other trains in view: `[id, x, y, angle, hp, maxHp, flags, spawnSeq, ...carriage x/y pairs]`                                                                                |
| `en`  | Enemies: `[id, kind, x, y, angle, hp, maxHp, bossName?]`                                                                                                                    |
| `tl`  | Trailers: `[id, kind, x, y]`                                                                                                                                                |
| `dr`  | Dropped pickups: `[id, kind, x, y, age]`                                                                                                                                    |
| `pr`  | Projectiles: `[id, kind, x, y, vx, vy]`                                                                                                                                     |
| `ev`  | Simulation events since the previous snapshot (see below)                                                                                                                   |

- Kinds are indexes into `ENEMY_KINDS`, `PICKUP_KINDS`, and `PROJECTILE_KINDS`.
- Flags are a bitmask: `TRAIN_FLAG_BRIDGE` (1), `TRAIN_FLAG_BOOST` (2), `TRAIN_FLAG_DEAD` (4),
  `TRAIN_FLAG_PROTECTED` (8, spawn protection is active).
- `spawnSeq` / `sq` counts the train's respawns. When it differs between two snapshots the client
  does not blend the train's positions (and snaps its camera, for its own train), so a respawned
  train appears at its new spot instead of sweeping across the map.
- `ev` holds raw simulation events. A `trainDestroyed` carries `victimId`, `cause` (`ram`, `weapon`,
  `enemy`, `boss`), and `killerTrainId` or `killerEnemyId`.
- Positions are rounded to whole units and angles to 2 decimals; angles are normalised to [-π, π].
- Carriage angles are not sent. Each carriage points toward the one in front of it, which the client
  works out from the positions. Carriage kinds come from `meta`.
- Every snapshot is full state, never a delta, so a late or lost frame cannot corrupt the next one.

### Interest management

A snapshot holds only what is within `VIEW_RADIUS` (wrapped distance) of the session's train head.
A train counts as in view if its head or any carriage is. Distant trains are still on the minimap
through the overview, which carries every living train.

Events are filtered the same way: an event is sent if it happened within the radius or names the
session's train. `trainDestroyed` is the exception: it goes to everyone, so the kill feed is global.
This is also why the overview carries names: a train that was never in view still has to be named.

## Smoothing on the client

1. **Clock.** Each `pong` gives a round trip and an offset (server time minus client time). The
   estimate is the median offset of the five lowest-RTT samples among the last twenty.
2. **Remote entities** are drawn at estimated server time minus `INTERP_MS`, blended between the two
   snapshots either side, by the shortest wrapped route, so a train crossing the map seam does not
   streak across the screen.
3. **The local train** is drawn from the newest `me`, run forward by the time since that snapshot
   with the server's own turn and speed rules and the player's current controls. When the next
   snapshot disagrees, the difference fades out over 100 ms. There is no full client-side prediction
   or reconciliation yet.

## Bandwidth

The target is at most 100 KB/s per client at the 95th percentile with 16 humans. A soak run
(`npm run soak -w @lw/server`) measured about 48 KB/s at p95 and 28 KB/s mean without compression,
so `permessage-deflate` stays off. The server can turn it on (`compress: true` in
`GameServerOptions`) if a busier game needs it.
