# Proposal

## Why

With the server running (change 04), players can share a world but cannot properly fight. In the reference, only "the player" could ram other trains, nobody got credit for kills between humans, and death ended the game. This change makes trains destroy each other under one rule set for everyone, and respawns players immediately with a fresh train. This is change 5 of 7 and depends on `02-extract-shared-simulation` and `04-realtime-server-netcode`.

## What Changes

- **Body collisions for every pair of trains:** a train whose head touches another train's body (from the fourth carriage behind the head onward) is destroyed, and the body's owner gets the kill. Applies to human vs human, human vs bot, and bot vs bot.
- **Kill attribution:**
  - weapon kills credit the projectile's owner
  - ramming credits the body's owner
  - deaths to enemies or the boss credit the enemy
  - every train-destroyed event names its killer (or none), the victim, and the cause
- **Spawn protection:** for 3.5 seconds after spawning, a train cannot be damaged or destroyed, its body is not lethal, its weapons hold fire, and others' weapons ignore it. Clients show a shield ring.
- **Immediate respawn:** when a human's train is destroyed, the same player gets a new starter train (locomotive plus MG) at a safe random location on the next tick. All carriages, upgrades, hull, and fuel are reset.
- The client shows a short "Destroyed by X" notice and snaps the camera to the new train, with no game-over screen and no interpolation sweep across the map.
- **BREAKING (vs. reference):**
  - the reference's game-over screen and run statistics are removed in favour of instant respawn
  - the player's starting shield carriage is dropped; the starter is locomotive plus MG
  - the reference's global spawn-grace timer becomes per-train spawn protection

## Capabilities

### New Capabilities

- `train-combat`: lethal train-vs-train collisions, kill attribution and kill events, and spawn protection rules.
- `player-lifecycle`: the starter train, safe spawn placement, and immediate respawn with a full reset.

### Modified Capabilities

None. The `game-simulation` and `realtime-netcode` requirements from earlier changes still hold; this change adds rules on top of them.

## Impact

- Shared sim: collision pass, attribution fields on events, protection timer on trains, and a respawn API.
- Server: respawns human sessions on destruction. Bots also respawn here; change 06 adds bot population management.
- Protocol: snapshots carry a protection flag and a spawn counter. `PROTOCOL_VERSION` is bumped.
- Client: shield ring, destroyed notice, camera snap on respawn. The reference death screen is not ported.
