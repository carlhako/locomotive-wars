# Tasks

## 1. Attribution and protection (shared sim)

- [x] 1.1 Extend `trainDestroyed` to `{victimId, cause, killerTrainId?, killerEnemyId?}`, record the damage source in `takeDamage`, and add per-train kill counts; verify unit tests for the weapon-kill-credit and enemy-kill scenarios
- [x] 1.2 Add the per-train `protectedFor` timer (3.5 s on spawn) and enforce it in `takeDamage` (projectile consumed, no damage), weapon firing (hold), and target selection for weapons and the bot AI; verify unit tests for shots at a protected train, expiry after 3.5 s, and bots not targeting protected trains

## 2. Collision pass (shared sim)

- [x] 2.1 Implement the two-phase head-vs-body collision pass (index ≥ 3, 14 units wrapped, skip protected on both sides) after movement and before projectiles; verify unit tests for human-rams-body, bot-vs-bot, head-on pass, mutual ram, and protected-body-harmless
- [x] 2.2 Add a shallow-angle full-boost body crossing test; verify the ramming train is destroyed

## 3. Spawn and respawn (shared sim)

- [x] 3.1 Implement `findSpawnPosition` (20 tries, 800 from heads, 300 from enemies, best-effort fallback) using world RNG; verify unit tests for the spawn-away scenario and the fallback in a crowded world
- [x] 3.2 Implement `World.respawnTrain(id)` (in-place reset to locomotive plus MG, full hull and fuel, bonuses and path cleared, protection, `spawnSeq++`); change the default spawn to the same starter; verify the respawn and upgrades-do-not-carry-over tests

## 4. Server and protocol

- [x] 4.1 Respawn dead human sessions and dead bots at the start of the next tick; verify an integration test where a destroyed client's train has two carriages at a new position on the next snapshot
- [x] 4.2 Add `prot` and `spawnSeq` to snapshots, add cause and killer to destroyed events, and bump `PROTOCOL_VERSION`; verify protocol round-trip tests are updated and passing

## 5. Client

- [x] 5.1 Draw a shield ring on protected trains (local and remote); verify visually in offline and online modes
- [x] 5.2 Reset interpolation history and snap the camera when a train's `spawnSeq` changes; verify a unit test on the snapshot buffer that no interpolated position lies between the old and new spawn
- [x] 5.3 Show a "Destroyed by X" notice (or "Destroyed by <enemy>" / "Wrecked") for about 2 s on local destruction, and drive offline mode through `respawnTrain` instead of restarting; verify manually in both modes
- [x] 5.4 Update the kill feed to show killer and cause from the new event fields; verify a unit test in `eventFx` for ram and weapon entries

## 6. Integration

- [ ] 6.1 Verify with two browser tabs that each player can kill the other by ramming and by weapons, the kill feed credits correctly, and both respawn instantly with starter trains
- [x] 6.2 Re-run the server soak test; verify 1800 ± 1% ticks per minute with the collision pass enabled (add the spatial grid only if this fails)
- [x] 6.3 Update `packages/shared/README.md` with the collision, attribution, protection, and respawn rules; verify it matches the behaviour
