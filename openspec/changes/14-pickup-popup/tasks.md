# Tasks

## 1. Popup model and view

- [x] 1.1 Add `hud/pickupPopup.ts` with `PickupLine`, `PickupPopupSink`, and a DOM-free `PickupPopup`:
  - `add`, `update(dt)`, `clear`, `entries`, `takeDirty`
  - `PICKUP_POPUP_LIFE = 1.5`, `PICKUP_POPUP_MAX = 3`

  Verify a new `pickupPopup.test.ts`: lines expire after their life, a fourth line drops the oldest, `clear` empties the popup, and `takeDirty` is true only after a change
- [x] 1.2 Add `PickupPopupView` to the same file:
  - it rebuilds the root only when dirty, using `textContent` and the `CARRIAGE_TYPES` icon, label, and colour
  - its second part is `describe()` for count 1, `×N` for count > 1, or `TRAIN FULL`
  - each line's opacity comes from its age (quick fade in, last ~0.3s fades out)

  Verify jsdom tests in `pickupPopup.test.ts` for the three second-part forms, newest-last order, and no DOM rebuild when nothing changed
- [x] 1.3 Add `<div id="pickups"></div>` to `index.html`, next to `#combo`, and style it in `hud/styles.css`:
  - centred, about 62% from the top, a column
  - `pointer-events: none`, monospace
  - a type-coloured icon chip and label, with a smaller muted second part

  Verify in the browser preview with `?offline` that lines appear below the train and clear of `#combo` and `#banner`

## 2. Events to popup lines

- [x] 2.1 Add `pickups: PickupPopupSink` to `FxTargets`. In the `'pickup'` case of `fx/eventFx.ts`, for the local train only:
  - add a line with `full: !added`
  - otherwise the count is that type's carriages in the local train, minus later same-type local `added` pickups in the same batch, clamped to at least 1 (1 if the local train is absent)

  Verify `eventFx.test.ts` cases:
  - first of a type gives count 1
  - a third Laser gives 3
  - two Shields in one batch give 1 then 2
  - a full train gives `full: true`
  - a view one carriage short still gives at least 1
  - a rival's pickup adds no line
- [x] 2.2 Pass `{ add: ignore }` for `pickups` in `attract/scene.ts`, and update the test recorder's `FxTargets` in `eventFx.test.ts`; verify `npm run typecheck` passes
- [x] 2.3 In `loop.ts`:
  - own a `PickupPopup` and `PickupPopupView` bound to `#pickups`, and pass it as `fx.pickups`
  - call `update(dt)` and `render()` each frame next to the kill feed
  - clear it in `resetEffects()`

  Verify in the browser preview with `?offline` that picking up trailers shows lines that fade after about 1.5 seconds

## 3. Integration

- [x] 3.1 Play in the browser preview, offline and against the dev server:
  - collect a new type and check its description shows
  - collect duplicates and check `×N` matches the legend count
  - grab several in quick succession and check at most 3 show
  - ram a train next to a drop and check KILL and the pickup line both show
  - fill the train to its limit and check TRAIN FULL
  - hold fire with the cursor over the stack and check the train fires

  Run `npm test`, `npm run lint`, and `npm run typecheck` and verify all pass

## Workflow follow-up

- Archive the change once it has been played and approved.
