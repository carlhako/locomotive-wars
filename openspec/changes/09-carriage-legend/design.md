# Design

## Context

Carriage styling is split across two tables in `packages/client/src/render/palette.ts`:
- `PICKUP_STYLES`: label, colour, and icon. Used by trailers and drops (`pickups.ts`), minimap dots (`minimap.ts`), and pickup particles (`eventFx.ts`).
- `CARRIAGE_COLORS`: body and highlight colours. Used by `drawCarriage` in `train.ts`.

The two tables already drift (MG pickup `#ff4444`, carriage `#cc3333`).

Carriages are drawn as 16×12 px boxes. Weapon carriages get a turret with a barrel per type; others are plain boxes.

HUD panels are absolutely positioned inside `#ui`, which has `pointer-events: none`:
- `#leaderboard`: top-left
- `#stats`: bottom-left
- `#minimap-panel`: top-right, 204 px wide, about 225 px tall
- `#tips`: bottom-right

The world view gives the local train's carriage kinds (`TrainView.carriages[].kind`). Simulation constants (`WEAPONS`, `ARMOR_BONUS`, ...) are exported from `@lw/shared`, and the client already imports from it.

## Goals / Non-Goals

**Goals:**
- One per-type style record that every consumer reads, so change 10 adds a carriage in one place.
- A legend that is readable mid-game and never blocks play.

**Non-Goals:**
- Showing the legend on the join screen. The player's counts don't exist there yet; it could be added later from the same table.
- Tooltips or hover detail. The HUD is click-through, and hover would conflict with aiming.
- Changing projectile colours.

## Decisions

### One table: `CARRIAGE_TYPES`

`palette.ts` replaces both tables with:

```ts
interface CarriageType {
  label: string;               // "MG Turret"
  icon: string;                // "M"
  category: 'weapon' | 'defence' | 'support';   // change 10 adds 'auto'
  color: string;               // the type's colour: pickups, minimap, legend swatch
  body: string;                // carriage fill (darker shade of color)
  light: string;               // carriage highlight / turret
  describe(): string;          // one line, built from @lw/shared constants
}
const CARRIAGE_TYPES: Record<PickupKind, CarriageType>
```

- The locomotive keeps its own small entry for `body`/`light`. It isn't a pickup and doesn't appear in the legend.
- `PICKUP_STYLES` and `CARRIAGE_COLORS` are deleted. Their users switch to `CARRIAGE_TYPES`. A thin `carriageColors(kind)` helper covers the locomotive case.
- Using `Record<PickupKind, …>` means TypeScript errors if change 10 adds a kind without a row.

`describe` is a function, not a string, so it reads the constants at call time. A test can then change a value and see the new text. Descriptions are short (at most 24 characters) so each row fits on one line:

| Type | Description |
|---|---|
| MG Turret | `{fireRate}/s × {damage} dmg` |
| Missile | `{fireRate}/s × {damage} · splash {splash}` |
| Laser | `{fireRate}/s × {damage} dmg · fast` |
| Shield | `−{SHIELD_REDUCTION×100}% dmg (max {CAP×100}%)` |
| Counter-Drone | `Drone · {DRONE_DAMAGE} dmg, range {DRONE_RANGE}` |
| Armor | `+{ARMOR_BONUS} max hull` |
| Booster | `+{SPEED_BONUS×100}% speed` |
| Magnet | `+{MAGNET_BONUS} pickup radius` |
| Fuel Tank | `+{FUEL_BONUS×FUEL_CAPACITY_PER_BONUS×100}% fuel capacity` |

Numbers are formatted with at most one decimal place. A test checks every description is at most 24 characters. Change 10 updates these lines where it changes behaviour.

### Colour pass

The goal is that every pair of types is distinguishable on the dark background. The turret shape is the secondary cue for weapons, and the icon letter for everything else.

| Type | Old colour | New colour | Note |
|---|---|---|---|
| MG Turret | `#ff4444` | `#ff4040` red | unchanged hue |
| Missile | `#ff6633` | `#ff9020` orange | moved away from red |
| Laser | `#ffaa00` | `#ff40e0` magenta | was a third orange |
| Shield | `#4488ff` | `#3f7bff` blue | |
| Counter-Drone | `#44ddff` | `#40e8ff` cyan | slightly brighter to separate from the blue |
| Armor | `#9944ff` | `#9a5cff` violet | |
| Booster | `#44ff88` | `#40ff80` green | |
| Magnet | `#ffff44` | `#ffff40` yellow | |
| Fuel Tank | `#ff88ff` | `#d9a066` tan | pink was too close to the new laser magenta |

- `body` is `color` darkened ~20% and `light` is `color` lightened ~30%. These are derived once by a small helper so the three shades always agree.
- Change 10's design reserves colours for its new types against this table.

### Icons on carriages

- **Non-weapon carriages:** draw `icon` centred on the body in bold 8 px dark text (`#000` at 70% alpha), drawn without the carriage's rotation so it stays upright. At 16×12 px a single glyph fits; more would not, which is why icons are one character.
- **Weapon carriages:** keep the turret, which already shows the type through barrel length and width.

### Legend panel

- **Markup:** `#legend` in `index.html`, a `.panel` at the top-right, placed directly under `#minimap-panel` (top ≈ 245 px) with its right edge aligned to the minimap, 240 px wide, and `pointer-events: none` like the other panels.
- **Content:** a header row "Carriages · H" with a ▾/▸ indicator, then one section per category with a small uppercase heading. Each type is a single 15 px flex line: swatch (10 px square in `color`), icon, label (fixed ~80 px column), the description in 10 px grey, and `×N` on the right. One line per type keeps the panel short enough for the 16 types change 10 brings: about 16 × 15 px + 4 headings ≈ 320 px.
- **Controller:** `hud/legend.ts` exports a `Legend` class with:
  - `render(kinds: CarriageKind[])`, called from the frame loop with the local train's carriage kinds
  - `toggle()`
- **Updates:** rows are built once from `CARRIAGE_TYPES`. `render` counts kinds, skipping the locomotive. It updates the count text and an `.owned` class only when a count changes, so the DOM isn't touched every frame.
- **Dead train:** while the local train is dead, the last counts stay visible (dimmed).
- **Toggle key:** `H` is handled in `input.ts`'s key handler as a new `'legend'` action. It goes through the existing `isTypingTarget` guard, so typing a name never toggles.
- **Remembered state:** `localStorage` key `lw.legend` (`"collapsed"`/`"expanded"`), read and written in try/catch like the mute and name keys. With no stored value, the default is collapsed when `innerHeight < 760`.
- **Collapsed:** only the header row shows.
- **Overlap:** in very short windows, the expanded legend may overlap `#tips`. The legend is given a `max-height: calc(100vh - 245px - 140px)` with `overflow: hidden`. Rows that don't fit are cut off, and the short-window default keeps that rare.

### Tips text

`#tips` gets a line `<kbd>H</kbd> Carriage guide`.

## Risks / Trade-offs

- **[Risk]** The tan Fuel Tank and orange Missile could look alike on some screens. → Their shapes differ (turret vs. icon), and the legend pairs colour with icon. Revisit if playtesting says otherwise.
- **[Risk]** The right column (minimap + legend + tips) gets crowded on 768-pixel-tall laptops. → The short-window default and `max-height` clip. Single-line rows keep the full 16-type roster from change 10 at about 320 px.
- **[Trade-off]** Icon glyphs add a `fillText` per non-weapon carriage. → Only on-screen carriages are drawn, so the cost is bounded by what fits in the view. If profiling shows a problem, cache glyphs in an offscreen canvas.
