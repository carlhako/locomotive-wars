# Tasks

## 1. Style table and colours

- [ ] 1.1 Replace `PICKUP_STYLES` and `CARRIAGE_COLORS` in `render/palette.ts` with `CARRIAGE_TYPES: Record<PickupKind, CarriageType>`:
  - label, icon, category, and the new colours
  - `body`/`light` derived from `color` by a shared helper
  - a locomotive colour entry and a `carriageColors(kind)` helper

  Verify a new `palette.test.ts`: every pickup kind has a row, all colours are unique, and body/light derive from colour
- [ ] 1.2 Add `describe()` to each row, built from `@lw/shared` constants with at most one decimal place; verify `palette.test.ts` checks the MG line reads "7/s × 7 dmg", every description is at most 24 characters, and that a description follows its constant (e.g. by computing the expected string from `WEAPONS.mg`)
- [ ] 1.3 Switch `pickups.ts`, `minimap.ts`, `train.ts`, and `fx/eventFx.ts` to `CARRIAGE_TYPES`/`carriageColors`; verify `npm run typecheck` and the existing client tests pass
- [ ] 1.4 Draw the upright icon glyph on non-weapon carriage bodies in `drawCarriage`; verify in the browser preview with `?offline` that shield, armor, and magnet carriages show S, A, and ◆, and that weapon turrets are unchanged

## 2. Legend panel

- [ ] 2.1 Add `#legend` markup to `index.html` and its styles in `hud/styles.css`:
  - right column under the minimap, 240 px wide, `pointer-events: none`
  - category sections, single-line rows with a swatch, icon, label, description, and count
  - `.owned`/dimmed states, a collapsed state, and a `max-height` clip

  Verify the layout in the browser preview at 1920×1080 and 1366×768
- [ ] 2.2 Implement `hud/legend.ts` (`Legend` with `render(kinds)` and `toggle()`): rows built once from `CARRIAGE_TYPES`, counts that skip the locomotive, and DOM writes only on change; verify `legend.test.ts` (jsdom) for the counts, owned/dimmed classes, respawn reset, and no DOM writes when counts are unchanged
- [ ] 2.3 Remember the collapsed state in `localStorage` (`lw.legend`, try/catch guarded), with the default collapsed below 760 px tall; verify `legend.test.ts` cases for a remembered choice, blocked storage, and the short-window default
- [ ] 2.4 Add the `'legend'` key action (`H`) to `input.ts` behind the existing typing guard and wire it to `Legend.toggle()` in the client; verify `input.test.ts` that `H` maps to `legend` and typing in a text field does not toggle
- [ ] 2.5 Call `Legend.render` from the frame loop with the local train's carriage kinds (keep the last counts while dead), and add `<kbd>H</kbd> Carriage guide` to `#tips`; verify in the browser preview that picking up trailers updates the counts live

## 3. Integration

- [ ] 3.1 Play a session in the browser preview:
  - collect several types and confirm counts and emphasis
  - press `H` to collapse, reload, and confirm it stays collapsed
  - hold fire with the cursor over the legend and confirm the train fires
  - confirm no two carriage types look alike on screen

  Run `npm test` and `npm run lint` and verify both pass

## Workflow follow-up

- Archive the change once it has been played and approved.
