# Proposal

## Why

Players can't tell what a carriage does from its colour, and nothing in the game explains it. Some colours are also too close to tell apart: MG, Missile, and Laser are three similar reds and oranges, and Shield and Counter-Drone are two similar blues. A legend on the side of the screen, plus a colour pass, lets players learn the roster and see at a glance what they're carrying. This is change 2 of 3 from the weapons and carriages exploration. It follows `08-click-to-fire`, whose fire behaviour the descriptions assume, and comes before `10-carriage-roster`, which adds its carriages to the same table.

## What Changes

- **Legend panel:** a HUD panel on the right side lists every carriage type, grouped by category (Weapons, Defence, Support). Each row has a colour swatch, its icon, name, a one-line description, and how many of that carriage the player's train has (e.g. "×4"). Rows the player owns stand out; the others are dimmed.
- **Descriptions from game data:** each description's numbers come from the simulation constants, so the legend can't disagree with the game.
- **Collapsible:** `H` toggles the legend between full and a one-line header. The choice is remembered in the browser. The default is collapsed on short windows.
- **Distinct colours:** carriage and pickup colours are reassigned so no two types are easily confused. Laser moves to magenta, Missile to a clear orange, and Fuel Tank away from pink.
- **Icons on carriages:** non-weapon carriages show their icon letter on the carriage body, as pickups already do. Weapon carriages keep their turret, with a barrel shape for each type.
- **One style table:** pickup colours, carriage colours, icons, labels, categories, and descriptions come from a single per-type table, which the legend, pickups, carriages, and minimap all read. Change 10 adds its new carriages by adding rows.
- The `#tips` controls box mentions `H` for the legend.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-client`: new requirements for the carriage legend and for telling carriage types apart.

## Impact

- Client: `render/palette.ts` becomes the single carriage style table. Changed or new files: `render/train.ts` (icon on the carriage body), `render/pickups.ts` and `render/minimap.ts` (read the table), a new `hud/legend.ts`, `index.html` markup, `hud/styles.css`, and the `H` key in `input.ts`.
- Shared: no changes. Descriptions read existing exported constants.
- No protocol or server changes.
