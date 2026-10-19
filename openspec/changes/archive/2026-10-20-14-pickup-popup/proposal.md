# Proposal

## Why

When a player picks up a trailer or a dropped carriage, the only feedback is a few coloured sparks and a sound. Nothing says *what* was picked up, so players must check the legend or remember the colours. A short popup that names each pickup as it happens teaches the roster while playing and shows the train growing.

## What Changes

- **Pickup popup:** every time the local player's train picks up a carriage, a line appears a little below the centre of the screen. It shows the type's icon and name in the type's colour.
- **First of a type:** if that carriage is the only one of its type on the train, the line also shows the type's one-line description, the same text the legend uses.
- **Duplicates show the count:** if the train already had that type, the line shows how many it now has (e.g. "LASER ×3") instead of the description.
- **Train full:** if the train is at its carriage limit, the pickup is used up without adding a carriage, and the line says "TRAIN FULL".
- **Short stack:** up to 3 lines show at once, and each fades out after about 1.5 seconds. A pickup made while 3 lines are showing replaces the oldest line. The stack has its own place on screen, so it doesn't clash with the kill popup or the centre banner.
- Other trains' pickups (players and bots) show no popup. There's no new sound; the existing pickup sound still plays.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-client`: adds a requirement for the pickup popup on the local train's pickups.

## Impact

- Client only:
  - a new `hud/pickupPopup.ts` (popup state and DOM view)
  - a new `#pickups` element in `index.html`, styled in `hud/styles.css`
  - a new `pickups` sink in `FxTargets`, which the `'pickup'` case in `fx/eventFx.ts` calls
  - wiring in `loop.ts`, plus a no-op sink in `attract/scene.ts`
- Text comes from the existing `CARRIAGE_TYPES` table in `render/palette.ts`.
- Shared, server, and protocol: no changes. The `pickup` event already carries the carriage type and whether a carriage was added, and the server already sends a train's own pickup events to its player.
