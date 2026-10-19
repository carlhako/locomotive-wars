# Design

## Context

- **The event.** The simulation emits a `pickup` event with `trainId`, `carriage` (a `PickupKind`), `source`, and `added`. `added` is false when the train was at its carriage limit and the pickup was only used up.
- **Who receives it.** The server sends each player the pickup events for their own train (`eventInvolves` in `server/src/interest.ts`), plus any near their head.
- **Where it is handled.** `fx/eventFx.ts` turns events into effects through narrow sinks in `FxTargets`. Today the `'pickup'` case makes sparks and plays the local pickup sound.
- **When it is handled.** `loop.ts` calls `applyEvents` *after* `source.advance()`. The view it passes is the post-tick world, so the local train's `carriages` already include what this frame's events added. Online, `advance()` returns the events that came with the newest snapshot, and the local train in `view()` is built from that snapshot's own-train block.
- **Existing popups.** `#combo` (`Banner.popup`, 30% from the top) shows "KILL name" and has a single slot. `#banner` sits at 32%. The kill feed (`hud/killfeed.ts`) already splits a DOM-free model (`KillFeed`) from its view (`KillFeedView`), and its tests rely on that split.
- **The text.** `CARRIAGE_TYPES` in `render/palette.ts` gives each type its `icon`, `label`, `color`, and `describe()`.

## Goals / Non-Goals

**Goals:**
- Name every local pickup at the moment it happens, with a correct count.
- Keep the popup unit-testable without a DOM, as the kill feed is.

**Non-Goals:**
- Popups for other trains' pickups.
- Popups for hearts.
- A new sound.
- Animating lines out of the world position of the pickup.

## Decisions

### A `PickupPopup` model and a `PickupPopupView`, like the kill feed

`hud/pickupPopup.ts` exports:

```ts
interface PickupLine { kind: PickupKind; count: number; full: boolean }  // count 0 when full
interface PickupPopupSink { add(line: PickupLine): void }
class PickupPopup implements PickupPopupSink { add; update(dt); clear(); entries; takeDirty() }
class PickupPopupView { constructor(root, popup); render() }
```

- `PICKUP_POPUP_LIFE = 1.5` (seconds) and `PICKUP_POPUP_MAX = 3`.
- `add` pushes a line and drops the oldest past the max. `update` ages lines and drops expired ones.
- The view rebuilds `#pickups` only when `takeDirty()` is true, using `textContent` and inline colour.
- The view turns a line into text:
  - the icon and label
  - then `describe()` when `count === 1`, `×{count}` when `count > 1`, or `TRAIN FULL` when `full`
- The model stores only data (kind, count, full), so its tests don't depend on the description text.

*Alternative: reuse `Banner.popup()` (`#combo`).* It has a single slot, so it would lose pickups and overwrite KILL. Rejected.

### Count from the post-tick view, corrected for same-frame pickups

`applyEvents` already has the local train from the post-tick `view`. For a local pickup with `added`, the count is:

```
count = (that type's carriages in the local train)
      - (later local pickup events of the same type in this batch with added = true)
```

- This makes two Shields picked up in one frame read "Shield" then "×2", rather than "×2" twice.
- Clamp the count to at least 1, in case the view lags behind the event. Then a missing snapshot shows the description rather than "×0".
- If the local train is missing from the view (just destroyed in the same tick), use 1 as the count.

*Alternative: keep a per-type counter on the client, updated by events.* It would drift on respawn, round reset, and carriage loss, which produce no pickup events. The view is already the source of truth that the legend uses. Rejected.

### Placement and style

- `#pickups` is centred horizontally, at about 62% from the top: below the train, which stays near centre, and clear of `#combo` and `#banner` above.
- It is a column, newest line at the bottom, with `pointer-events: none`.
- Each line is monospace, like `#combo`: an icon chip in the type colour, the label in the type colour with a soft glow, and a smaller muted second part (description, count, or TRAIN FULL).
- Lines fade in quickly and fade out over their last ~0.3s. Opacity is set from the line's age, not from a CSS animation, so expiry and the visual fade agree.
- Fading isn't motion, so reduced-motion needs no special case. Lines don't slide.

### Wiring

- `FxTargets` gains `pickups: PickupPopupSink`.
- `loop.ts` owns a `PickupPopup` and `PickupPopupView`:
  - it calls `update(dt)` and `render()` each frame next to the kill feed
  - it clears the popup in `resetEffects()`
- `attract/scene.ts` passes `{ add: ignore }`. It has no local train, so nothing would be added anyway, but the type requires the field.

## Risks / Trade-offs

- **[Risk] Online, an event could arrive a frame before the snapshot that contains the new carriage, so the count reads one low.** → The clamp to at least 1 hides the worst case. A test drives `applyEvents` with a view one carriage short to pin the behaviour. A browser check in networked mode confirms counts match the legend.
- **[Trade-off] A magnet sweep can grab more than 3 carriages in a moment, and the oldest lines are dropped.** → This is accepted. The legend still has the full counts, and the stack stays readable.
- **[Risk] The stack could cover the area ahead of the train on short windows.** → The stack holds only 3 lines and has no background. If play shows it gets in the way, move it lower.
