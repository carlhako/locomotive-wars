# Tasks

## 1. Background world and leader rule (DOM-free)

- [x] 1.1 Create `packages/client/src/attract/world.ts` with the tuning constants from design.md and an `AttractWorld` class that builds:
  - a `World` with `mapSize` 3000, `maxCarriages` 60, enemies 18/24, trailers 30/40
  - 8 bots named from `BOT_NAMES`, each with 20 to 40 carriages from the weighted, weapon-heavy mix (no cloak or mines), and spawn protection 0

  Verify with a new `src/attract/world.test.ts`, using an explicit seed:
  - there are 8 bot trains and no human train
  - every bot has at least 20 carriages behind its locomotive, and weapon kinds are the majority
  - no bot is protected at the start
  - `view().localId` matches no train
- [x] 1.2 Add `advance(dt)`, which steps the world at its tick rate from an accumulator capped at 0.25 s of frame time and returns the tick's events. Add `view()`, which interpolates between the last two views with `interpolateView`. Verify in `world.test.ts`:
  - 60 frames of 1/60 s and 10 frames of 0.1 s both reach tick 30
  - the same seed gives the same train positions
  - a seeded 10 s run produces `fired` events and has projectiles in the view
- [x] 1.3 At the start of each tick, remove every dead bot and add it back with the same id, name and colour, a fresh carriage set of 20 or more, and default spawn protection. Verify a `world.test.ts` case: set a bot's `alive = false` as `offline.test.ts` does, advance one tick, and the same id is alive with the same name and colour, at least 20 carriages behind its locomotive, and protected.
- [x] 1.4 Add a pure `pickLeader(trains, currentId)`:
  - the longest living train when the current one is dead or missing
  - otherwise switch only to a train at least 3 carriages longer
  - ties go to the lowest id

  Keep `AttractWorld.leaderId` updated after every tick. Verify `world.test.ts` cases for:
  - a dead current train, and a missing current train
  - a train longer by 2, which keeps the current one
  - a train longer by 3, which switches
  - a tie
  - `leaderId` moving off a leader whose `alive` is set to false

## 2. Rendering helpers

- [x] 2.1 Give `followCamera` in `src/render/canvas.ts` an optional `smoothing` argument that defaults to `CAMERA_SMOOTHING`. Verify with a `canvas.test.ts` case: with the default, one 1/60 s step closes 15% of the distance as before; with 0.05 it closes 5%. Existing camera tests and in-game calls are unchanged.
- [x] 2.2 Add `dispose()` to the surface `setupCanvas` returns. It removes the `resize` listener it added. Verify with a `canvas.test.ts` case that stubs `window` (`vi.stubGlobal`) with listener spies and a fake canvas: `dispose()` removes the same handler that was added.

## 3. Background scene on the page

- [x] 3.1 Create `src/attract/scene.ts` with `startAttract({ reducedMotion })`. It:
  - creates `<canvas id="attract">`, inserts it before `#game`, and calls `setupCanvas` on it
  - runs a `requestAnimationFrame` loop with frame time capped at 0.1 s
  - pans the camera to the leader's interpolated head with smoothing 0.05, snapping on the first frame
  - applies events to real `ParticleSystem`, `HitFlash`, `TurretMemory` and `Zaps` sinks, with no-op stubs for sound, kill feed, banner, shake, screen and heal flashes, and damage numbers
  - updates `TrainEmitter` and `BridgeAnimator`, and draws stars
  - calls `renderScene` with an overlay of no aim, no mouse, no boost, no firing, and zero shake
  - returns `{ stop() }`, which cancels the frame, calls `dispose()` and removes the canvas

  Add `#attract` CSS: fixed to the full window, stacked under the overlays, `pointer-events: none`. Verify:
  - `npm run typecheck` passes
  - `grep -r "audio" packages/client/src/attract` finds nothing, so no `SoundFX` or `AudioContext` is ever created
- [x] 3.2 Implement the reduced-motion path in `startAttract`: advance about 4 s (120 ticks) with no effects, snap the camera to the leader, draw once, redraw the same view on `resize`, and start no loop. Verify in the dev preview: import `/src/attract/scene.ts` from the console and start a scene with `{ reducedMotion: true }`. Nothing is wired into `main.ts` yet, so it is the only scene. Check that:
  - the frame shows trains and projectiles
  - the canvas pixels are unchanged after 2 s
  - a window resize redraws it instead of leaving it blank
- [x] 3.3 Wire it into `src/main.ts`:
  - `startOnline` calls `startAttract({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })` before showing the join screen
  - the `session.ready` success branch calls `stop()` before creating `Game`
  - the rejection branch leaves the background running
  - `startOffline` never starts it
  - in dev, expose the attract world through `exposeForDebugging`

  Verify in the dev preview:
  - on load, `#attract` exists and long trains fire behind the join screen
  - with the server stopped, Play shows the join error and the background keeps animating
  - with the server running, Play removes `#attract` and the game draws normally
  - `?offline` has no `#attract` element
  - no console errors
- [x] 3.4 Check input and performance in the dev preview:
  - typing a name with spaces in `#player-name` and moving the text cursor with the arrow keys behaves normally
  - over 10 s of background, the average simulation time per frame is under 4 ms, measured from the console with `performance.now()` around the exposed world's `advance`

  If it misses the budget, lower the bot count first and then the carriage range, staying at 20 or more. Note the measured numbers in this task.

  Measured 2026-10-19 (desktop, no throttling): 500 frames over 10 s, average 0.38 ms and worst 2.1 ms of simulation per frame, up to 695 projectiles in flight. Within budget at the starting tuning (8 bots, 20 to 40 carriages).
- [x] 3.5 Update `packages/client/README.md`:
  - describe the home screen background: bots only, the leader camera, stopping on join, reduced motion
  - add `attract/world.ts` and `attract/scene.ts` to the `src/` tree

  Verify that the README's commands and paths match the files.

## 4. Join screen look

- [x] 4.1 In `index.html`, wrap the join screen's content in a `.join-panel`. In `styles.css`:
  - give `#join-screen` a vignette background that is almost clear in the middle and dark at the edges; `.overlay` stays as it is for the other overlays
  - style `.join-panel`: translucent dark fill, border, rounded corners, capped width, 16 px side gutters, no `backdrop-filter`
  - give `#join-screen` `overflow-y: auto`, and centre the panel with `margin: auto`

  Verify in the dev preview:
  - screenshots at desktop size and at the mobile preset show the background around the panel and readable text
  - at a 1024×500 window you can scroll to the Play button
  - `#round-overlay` and `#disconnect-screen` keep their previous computed background

## 5. Version and source footer

- [x] 5.1 In `packages/client/vite.config.ts`, read `packages/client/package.json` (`readFileSync` against `import.meta.url`) and add `define: { __APP_VERSION__: JSON.stringify(version) }`. Declare `__APP_VERSION__: string` in `src/env.d.ts`. Verify:
  - `npm run typecheck` passes
  - `npm run build -w @lw/client` gives a bundle that contains the package's version string
- [x] 5.2 Create `src/ui/footer.ts` with:
  - `REPO_URL` (`https://github.com/carlhako/locomotive-wars`)
  - `versionLabel(version)`, which gives `v<version>`
  - `releaseUrl(version)`, which gives `<REPO_URL>/releases/tag/v<version>`
  - `bindFooter()`, which fills in the footer's text and hrefs

  Add `<footer id="join-footer">` as the join screen's last child, after the panel, with the version link and a "GitHub" link. Both links use `target="_blank" rel="noopener noreferrer"`. Style it small, muted and centred. Call `bindFooter()` in `startOnline`. Verify:
  - a new `src/ui/footer.test.ts` checks `versionLabel('0.3.0')`, `releaseUrl('0.3.0')`, and that `__APP_VERSION__` equals the version in `packages/client/package.json`
  - in the dev preview the footer shows `v0.3.0`, both hrefs and targets are correct, and at a 1024×500 window it can be reached by scrolling below the Play button
- [x] 5.3 Add a sentence to `packages/client/README.md` saying that the join screen footer shows the client package version at build time and links to the GitHub release, and add `ui/footer.ts` to the `src/` tree. Verify that the README matches the code.

## 6. Integration checks

- [x] 6.1 From the repository root, `npm test`, `npm run typecheck` and `npm run lint` all pass.
- [x] 6.2 End to end in the dev preview with the server running:
  - load the page: the background animates behind a readable join screen with the footer
  - type a name and press Play: the game starts, `#attract` is gone, and there are no console errors
  - `?offline` starts the offline game as before, with no background
- [x] 6.3 `openspec validate 12-home-screen-attract --strict` passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` after it has been implemented and reviewed.
