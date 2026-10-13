# Design

## Context

- **Reference collisions** (reference ~1537 to 1558): the player's head vs other trains' carriages at index ≥ 3 kills the player, and other heads vs the player's carriages at index ≥ 3 kill them. Bots never collide with each other. Head-to-head contact does nothing.
- **Reference death** opens a game-over screen. A global 3.5 s grace timer blocks damage only, not collisions.
- **After change 02:** the shared `World` already handles weapon and enemy damage for all trains and emits `trainDestroyed {victimId, sourceId}`, but has no train-vs-train collision pass and no respawn.

## Goals / Non-Goals

**Goals:**
- One symmetric collision and attribution rule set for every train.
- Death costs the train, not the session: respawn the next tick.

**Non-Goals:**
- Scoring and leaderboard semantics (change 06). Score resets naturally because the train resets.
- Bot population sizing (change 06).
- Anti-cheat beyond server authority.

## Decisions

### Collision pass placement and ordering

The collision pass runs after movement and before projectile resolution in `World.step()`, so a train destroyed by a ram this tick cannot also take projectile credit. It is two-phase:

1. Collect all `(victim, bodyOwner)` pairs: every alive, unprotected head against every other alive, unprotected train's carriages at index ≥ 3.
2. Apply all destructions together.

Two-phase application is what makes mutual rams destroy both trains, independent of iteration order.

### Broad phase

With 26 trains of up to 150 carriages, a naive pass is 26 × 26 × 150 ≈ 100k distance checks per tick, which is fine at 30 Hz. A uniform grid (cell 64 units) over carriages is added only if the soak test shows the tick overrunning. The grid is noted as a ready fallback, not built up front.

### Attribution

`trainDestroyed` becomes `{victimId, cause: 'ram'|'weapon'|'enemy'|'boss', killerTrainId?, killerEnemyId?}`. `Train.takeDamage(amount, source)` records the source. When hull hits zero, the cause comes from the source kind. Kill counts are kept on the train for the kill feed only; they are not score.

### Spawn protection as a per-train timer

`train.protectedFor` is set to 3.5 s on spawn and counts down each tick. It is checked in:
- `takeDamage`: projectiles are still consumed, so shots don't pass through
- the collision pass: as victim and as body owner
- weapon firing: hold fire
- target selection, for both weapons and the bot AI

This replaces the reference's global `graceTimer`.

### Respawn reuses the train id

`World.respawnTrain(id)` resets the entity in place:
- clears carriages, bonuses, drones, and the path buffer
- re-adds the locomotive and MG
- sets full hull and fuel and a fresh protection timer
- places it with `findSpawnPosition()`
- increments `spawnSeq`

Keeping the id means sessions, meta, and the client's local id stay valid. The client sees `spawnSeq` change in the snapshot and resets interpolation history for that train, so it snaps to the new spot instead of sweeping there. `PROTOCOL_VERSION` is bumped because snapshots gain `prot` and `spawnSeq`.

### Who triggers respawn

The server, at the start of the next tick, for human sessions whose train is dead, and for bots subject to change 06's population rules. For now, all dead bots respawn. Offline mode uses the same call, which replaces change 03's "restart the session".

### Spawn placement

`findSpawnPosition(world, rng)`: up to 20 random candidates (100-unit margin). The first one that is ≥ 800 units from all heads and ≥ 300 from all enemies is used; otherwise the candidate with the largest minimum distance to heads. Uses the world RNG, so it is deterministic in tests.

### Starter train change

The reference gave the player MG plus Shield. With PvP and instant respawn, the shield is dropped so spawns are cheaper to kill once protection ends, and the starter is the same for humans and bots. The live score at spawn is therefore 1 (change 06).

## Risks / Trade-offs

- [Spawn protection abuse, such as parking a protected head on enemies] → The body is harmless and weapons hold fire, so there is no offensive value. Protection is only 3.5 s.
- [The 14-unit collision radius at 30 Hz with heads moving 13 units per tick could miss grazes] → Acceptable: carriages are 18 units apart along a continuous body, so a head crossing a body always lands within range of some carriage on some tick. Add a test crossing a body at full boost at a shallow angle.
- [Players instantly respawning near the action] → The 800-unit spawn distance plus protection. Tune with playtesting.

## Open Questions

None.
