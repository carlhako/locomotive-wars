# Proposal

## Why

Players aim with the mouse, but weapons seem to fire at random. A weapon carriage fires only when the cursor is within ±72° of that carriage's own heading **and** some hostile is within 550 units, whether or not the player is aiming at it. So guns start and stop as targets drift in and out of range, and in a curve only some carriages fire. Both gates came from the reference game, where weapons fired automatically. With a human aiming, they make firing feel broken. This is change 1 of 3 from the weapons and carriages exploration; `09-carriage-legend` and `10-carriage-roster` follow.

## What Changes

- **Click to fire:** a human train's weapon carriages fire only while the player holds the left mouse button, and then every ready weapon fires at the cursor.
- **No firing arc:** weapons fire along the aim angle whatever the carriage's heading.
- **No range gate for humans:** holding fire shoots even with nothing in range.
- **Bots decide when to fire:** the bot controller fires only when its aim target (an enemy or an unprotected train head) is within 550 units, so bots behave as they do today.
- **Projectile budget:** each train may have at most 120 of its own weapon projectiles alive. A weapon that is ready while the train is at the limit waits.
- **Activity:** pressing or releasing fire counts as activity for idle detection.
- **BREAKING (protocol):** the `in` message gains a fire flag, and `PROTOCOL_VERSION` is bumped.
- The client sends a change of the fire button straight away, like turn, boost, and brake.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-simulation`: the train input gains a fire flag. Weapon fire depends on the fire flag, has no arc or range gate, and is limited by a projectile budget. The bot controller decides when to fire.
- `realtime-netcode`: input messages carry the fire flag.
- `game-client`: the left mouse button drives fire.
- `player-admission`: a fire change counts as activity.
- `train-combat`: spawn protection's "other trains' weapons do not target it" becomes "bots do not target it", since human aim is free.

## Impact

- Shared sim: `TrainInput`, `fireWeapons` in `combat.ts`, the bot controller in `bot.ts`, and constants (`WEAPON_ARC` and the range gate removed from weapon fire, a new projectile budget constant).
- Shared protocol: the `in` message shape, the parser and its tests, and `PROTOCOL_VERSION`.
- Server: input handling in `server.ts`, `IdleTracker` in `admission.ts`, and the soak test client.
- Client: mouse button capture in `input.ts`, input sending in `net/connection.ts`, the offline loop, and the controls text on the join screen.
- Simulation tests that relied on automatic fire need a fire input.
