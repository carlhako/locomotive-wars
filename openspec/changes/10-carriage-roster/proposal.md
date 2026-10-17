# Proposal

## Why

Reviewing the carriage list during exploration turned up some problems:
- Counter-drones ignore other trains, so they do nothing in PvP.
- Missile splash only hurts PvE enemies.
- Booster stacking has no cap, so speed can run away.
- Laser has the same damage per second as the MG and barely plays differently.
- Armor and Fuel Tank are weak.

The roster also has nothing that suits a snake-like train: nothing protects you from chasers behind you, and nothing works without aiming. With `08-click-to-fire` making guns manual, a few automatic carriages give players who are busy steering something to collect. This is change 3 of 3 from the weapons and carriages exploration. It depends on `08-click-to-fire` and `09-carriage-legend` being archived first.

## What Changes

**Changes to existing carriages:**
- **Counter-Drone:** drones also target other trains' unprotected heads, not just PvE enemies.
- **Missile:** splash also damages other trains' heads (never the owner's).
- **Booster:** a train's total speed bonus is capped at +50%.
- **Laser:** bolts pierce up to 3 targets, each hit at most once. Rate and damage change from 3.5/s × 14 to 2/s × 22.
- **Armor:** +35 → +70 max hull per carriage.
- **Fuel Tank:** also raises fuel regeneration by 20% per tank, as well as capacity.

**Seven new carriage types:**

| Carriage | Category | Behaviour |
|---|---|---|
| Flak | weapon (hold fire) | 5-pellet spread over ±15°, 1.2 volleys/s, 6 dmg per pellet, ~250 range |
| Mine Layer | auto | Drops a mine at the tail every 2 s. Mines arm after 0.5 s, last 20 s, and explode for 40 dmg in a 60 radius. At most 6 live mines per Mine Layer. |
| Tail Gunner | auto | Fires at the nearest hostile within 400 in its rear half, 3/s × 6 dmg |
| Tesla Coil | auto | Zaps the nearest hostile within 180, 1/s × 18 dmg, then chains to one more hostile within 120 of the first |
| Repair Car | support | +1.5 hull/s regeneration per car, capped at +6 hull/s total |
| Cowcatcher | defence | +20 ram damage to enemies per car; −10% ram damage taken per car, capped at 70% |
| Cloak | support | The train is hidden from other players' minimaps |

**Supporting work:**
- The new types join the random trailer draw with their own rarity weights.
- Mines are a new world entity. They are sent in snapshots within view radius, cleared at round reset, and drawn on the client.
- New events: a mine explosion and a tesla zap, each with client effects and sounds.
- The legend gets an "Auto weapons" section and rows for the new types. Every new type gets its own colour and icon.
- **BREAKING (protocol):** new carriage kinds, a projectile kind, and a snapshot mines field. `PROTOCOL_VERSION` is bumped.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-simulation`: carriage effects, projectile hits (missile splash on trains, laser pierce), and the event stream change. New requirements cover flak, auto weapons, mines, and the carriage type draw.
- `realtime-netcode`: snapshots carry mines. The minimap overview leaves out cloaked trains for other players.
- `game-client`: mines and tesla arcs are drawn. The minimap hides cloaked trains. New effects and sounds are added.

## Impact

- Shared sim:
  - `types.ts`: new kinds, a `Mine` entity, projectile pierce state, events
  - `constants.ts`: new stats, rarity table, caps
  - `combat.ts`: drones, splash, pierce, flak, tail gunner, tesla, mines
  - `train.ts`: effects, caps, repair regen
  - `world.ts`: the mine step and round reset
- Shared protocol: kind lists, a snapshot mines row, new events, `PROTOCOL_VERSION`.
- Server: mine interest filtering, the overview cloak filter, event interest for the new events.
- Client: `CARRIAGE_TYPES` rows and the `auto` category (from change 09), mine and zap rendering, flak and tail gunner turrets, sounds, and the minimap cloak filter.
- Seeded tests whose outcomes depend on the trailer draw sequence will change. Their expectations need updating.
