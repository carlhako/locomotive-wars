# Tasks

## 1. Shared protocol

- [x] 1.1 Add `protocol/messages.ts` with `PROTOCOL_VERSION`, all C->S and S->C message types, and encode/decode helpers that validate shape; verify unit tests round-trip every message type and reject malformed input
- [x] 1.2 Add `sanitizeName` to `@lw/shared`; verify unit tests for the spec scenarios (control chars, whitespace collapse, 16-char limit, `Player-NNNN` default)
- [x] 1.3 Add `World.removeTrain(id, {drop})` emitting `trainLeft` (no kill event); verify a shared unit test that drops appear and no `trainDestroyed` event is emitted

## 2. Server hosting

- [x] 2.1 Implement `http.ts` serving `packages/client/dist` via `sirv` plus `GET /healthz` JSON (status, humans, bots, tick); verify with an integration test (supertest or fetch) for 200 on `/`, `/healthz` fields, and traversal refused
- [x] 2.2 Implement `loop.ts` fixed-step accumulator at 30 Hz with max 5 catch-up ticks and overrun logging; verify a test with fake timers that 60 s yields 1800 steps
- [x] 2.3 Implement the temporary `bots.ts` keeping 6 bot trains driven by `botInput`; verify `/healthz` reports 6 bots after start

## 3. Sessions and protocol handling

- [x] 3.1 Implement the WebSocket endpoint `/ws` with hello/welcome/version reject, session creation with a sanitised name, and train spawn; verify an integration test with a `ws` client for handshake and version reject
- [x] 3.2 Implement input handling: latest-input-wins per tick, clamping, non-finite rejection, 60/s cap, and closing after 20 malformed messages; verify integration tests for turn=50 becoming 1, garbage ignored, and the flood being dropped
- [x] 3.3 Implement disconnect clean-up (`removeTrain` with drops within one tick); verify an integration test where a second client sees the train vanish and drops appear

## 4. Snapshots and interest

- [x] 4.1 Implement `interest.ts` (wrapped view-radius filter, head-or-any-carriage rule for trains) and per-session `meta` diffing (new trains, kind changes, gone); verify unit tests for the distant-enemy and long-train scenarios and the new-kind meta
- [x] 4.2 Implement snapshot encoding at 15 Hz with own-train full state, ack seq, rounded numbers, and events filtered by radius-or-involvement (train-destroyed global); verify an integration test receiving 150 ± 5% snapshots in 10 s, and the global kill feed scenario
- [x] 4.3 Implement the 2 Hz `overview` and ping/pong; verify an integration test receives overview with all trains, and pong echoes the client time

## 5. Client networking

- [x] 5.1 Implement the join screen (name field prefilled from `localStorage` `lw.name`, Play button); verify manually that the name persists across reloads
- [x] 5.2 Implement `connection.ts`, `clock.ts` (median of 5 lowest-RTT samples), and input sending on change plus a 10 Hz heartbeat; verify unit tests for clock offset estimation
- [x] 5.3 Implement `buffer.ts` snapshot interpolation to a `WorldView` at serverTime − 133 ms with wrap-aware lerp and derived carriage angles; verify the seam-crossing unit test
- [x] 5.4 Implement `localTrain.ts` newest-state extrapolation with ~100 ms correction blending; verify a unit test that the drawn position is within one snapshot interval of the latest server state
- [x] 5.5 Implement the disconnect overlay (socket close or 5 s without snapshots) with a reconnect button doing a fresh join; verify manually by stopping and restarting the server

## 6. Integration

- [x] 6.1 Verify two browser tabs on `npm run dev` see each other move smoothly, including across the map seam
- [x] 6.2 Add a headless soak script (`npm run soak -w @lw/server`) connecting 16 bot-driven ws clients for 60 s; verify 1800 ± 1% ticks and p95 per-client downstream ≤ 100 KB/s (enable perMessageDeflate if exceeded, then re-measure)
- [x] 6.3 Document the protocol (message table, rates, view radius) in `packages/shared/src/protocol/README.md` and server run instructions in `packages/server/README.md`; verify instructions run as written
