# Design

## Context

`@lw/shared` provides a deterministic `World` (change 02) and `WorldView` plus `viewFromWorld` (change 03). The client renders any `WorldView`. This change puts the world on a server and moves views over the network. Target scale for the beta: one world per process, up to about 16 humans plus bots.

## Goals / Non-Goals

**Goals:**
- Server-authoritative play that feels responsive at typical internet latency (30 to 120 ms).
- A protocol that is simple to debug in the beta (JSON) but already shaped for binary encoding later.

**Non-Goals:**
- Client-side prediction with reconciliation, binary encoding, delta compression (post-beta change 08).
- Respawn, spawn protection, and train-vs-train kill rules (change 05).
- Config file, max players, idle kick, rounds, bot fill (change 06). This change uses constants.
- Rate limiting beyond inputs, reconnect tokens, Docker, deploy (post-beta change 09).

## Decisions

### Transport: WebSocket via `ws`

| Option | Why not (for beta) |
|---|---|
| WebTransport datagrams | Not in every browser; Node has no mature server; needs HTTP/3 and certificates |
| WebRTC data channels | Signalling, ICE, STUN/TURN complexity for a client-server game |
| uWebSockets.js | Faster, but it's a native binary distributed outside npm; `ws` is fast enough at this scale |

TCP head-of-line blocking is mitigated by small, frequent messages, and by snapshots that are full state rather than deltas, so a late packet never corrupts state. The `Transport` interface on both sides (send, onMessage, close) keeps a WebTransport swap possible.

### Rates and delays

```
 server tick         30 Hz  (33.3 ms)   World.step()
 snapshot            15 Hz  (every 2nd tick)
 overview (minimap)   2 Hz
 client input        on change + 10 Hz heartbeat, max 60/s
 interp delay        2 snapshot intervals = 133 ms
```

The earlier exploration suggested 20 Hz snapshots and 100 ms delay. 15 Hz was chosen so snapshots fall on whole ticks of the 30 Hz loop; interpolation needs about 2 intervals of buffer to ride out one lost or late packet. All rates are constants here and move into the config in change 06.

### Message shapes (`packages/shared/src/protocol/`)

```
C->S  hello   {t:"hello", v, name}
      input   {t:"in", s:seq, tr:turn, b:0|1, br:0|1, a:aim}
      ping    {t:"ping", c:clientTime}
S->C  welcome {t:"welcome", v, id, tickRate, snapRate, mapSize, interpMs}
      reject  {t:"reject", reason:"version"|"full"|"malformed"}
      meta    {t:"meta", trains:[{id,name,color,ctl,kinds:[...]}], gone:[id]}
      snapshot{t:"snap", k:tick, st:serverTime, ack:seq,
               me:{...full own train...},
               tr:[[id,x,y,a,hp,maxHp,bridge, cx0,cy0,cx1,cy1,...]],
               en:[...], tl:[...], dr:[...], pr:[...], ev:[...]}
      overview{t:"ov", h:[[id,x,y]]}
      pong    {t:"pong", c, st}
```

- Short keys and arrays-of-numbers keep JSON small.
- Positions are rounded to integers and angles to 2 decimals.
- Carriage angles are not sent: the client derives them from neighbouring carriage positions.
- Carriage kinds go in `meta`, not every snapshot.
- Types are shared, so the client and server cannot disagree on shape.
- `PROTOCOL_VERSION` is bumped on any incompatible change.

### Bandwidth budget

A visible train with 50 carriages is about 600 bytes per snapshot. A busy view (6 trains, 20 enemies, 40 pickups, 30 projectiles) is roughly 6 KB, so about 90 KB/s per client at 15 Hz. The beta target is **≤ 100 KB/s per client at p95** in the 16-human soak test. If exceeded, enable `ws` `perMessageDeflate` for messages over 1 KB (JSON number arrays compress about 3×) before resorting to protocol changes.

### Server structure (`packages/server/src/`)

```
main.ts         read env, start http + ws, start loop
http.ts         sirv(client/dist) + /healthz
loop.ts         fixed-step accumulator (hrtime), max 5 catch-up ticks, overrun logging
sessions.ts     Session {ws, trainId, lastInput, lastSeq, msgCount, knownTrains}
interest.ts     per-session filter by wrapped distance + meta diffing
snapshot.ts     encode view -> snapshot message
names.ts        re-export shared sanitizeName
bots.ts         temporary: keep 6 bots (replaced in change 06)
```

`sanitizeName` lives in `@lw/shared` because change 07 reuses it for high-score names and the join screen can preview it.

### Client networking (`packages/client/src/net/`)

- `connection.ts`: ws lifecycle, hello/welcome, and the disconnect overlay trigger (close event or 5 s without snapshots).
- `clock.ts`: ping every 2 s. The offset estimate takes the median of the last 5 samples with the lowest RTT.
- `buffer.ts`: snapshot ring buffer. `sample(renderTime)` returns an interpolated `WorldView`, with wrap-aware lerp for positions (via `wrapDelta`) and `shortAngle` for angles.
- `localTrain.ts`: newest own state plus extrapolation (`speed × dt` along heading).

### Join screen

A start overlay (reusing the reference's start screen) holds a name field, prefilled from `localStorage` `lw.name`, and a Play button that opens the socket. Offline mode (`?offline`) skips it.

### Disconnect clean-up

On socket close the server calls `World.removeTrain(id, {drop: true})`. Pickups drop as in destruction, but no `trainDestroyed` kill event is emitted, only a `trainLeft` event.

## Risks / Trade-offs

- [Extrapolating the local train without reconciliation can visibly "snap" when turning or after a hit] → Blend corrections over about 100 ms. Full prediction is change 08.
- [JSON snapshot size grows with long trains in view] → Measured against the budget in the soak test. Deflate is the fallback.
- [Node event-loop stalls (GC) delay ticks] → Accumulator catch-up (max 5 ticks), overrun logging, and the soak test checks 1800 ± 1% ticks per minute.
- [A single process is a single point of failure] → Acceptable for beta. Clients show the disconnect overlay and can rejoin.

## Open Questions

None.
