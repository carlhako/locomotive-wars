# Design

## Context

See proposal.md for the motivation and specs/game-client/spec.md for the required behaviour.

- **Before you join, nothing draws.** In online mode `main.ts` shows `#join-screen` and creates `Game` only after `session.ready` resolves. `#game` stays blank until then.
- **The join screen is nearly opaque.** It uses the shared `.overlay` class: full window, flex column centred, with a 0.85 to 0.95 alpha gradient. The round and disconnect overlays use the same class.
- **`Game` can't run behind the join screen.** Its constructor:
  - attaches `InputState` to `window`, which takes over Space and the arrow keys
  - creates `SoundFX`
  - binds the mute button
  - drives the HUD, leaderboard, legend and round overlay
- **`OfflineSession` shows how to run the sim locally.** It steps a `World` at the fixed tick rate from a time accumulator (frame time capped at 0.25 s) and interpolates views with `interpolateView`. It is built around one human train and respawns trains as starters.
- **Drawing is reusable.** `renderScene(env, view, fx, overlay, dt)` draws any `WorldView` with:
  - a `Camera`
  - stars, particles, hit flash, bridges, turrets and zaps
  - an overlay of aim, mouse, boost, firing and shake
- **Events go through `applyEvents`.** It routes sim events to the `FxTargets` sinks. With no local train in the view it plays no sound and shows no local-only effects such as shake, screen flash or banners.
- **`setupCanvas` can't be cleaned up.** It adds a `resize` listener to `window` with no way to remove it.
- **Ids start at 1.** `viewFromWorld(world, 0)` gives a view with no local train. `drawTrain` then draws no names, because names are only shown for the local train or near its head.
- **Collision checks are brute force.** The sim has no spatial grid. Each train has at most 120 weapon projectiles in flight (`MAX_TRAIN_PROJECTILES`).
- **Client tests run in Node with no DOM.** No jsdom. Anything worth unit testing must be DOM-free.
- **Vitest uses each package's Vite config.** The root `vitest.config.ts` uses `projects: ['packages/*']`, so client tests load `packages/client/vite.config.ts`.

## Goals / Non-Goals

**Goals:**
- Reuse the sim and the renderer unchanged, apart from two small additions: an optional camera smoothing parameter and a canvas `dispose()`.
- Keep everything that decides what happens (tuning, respawns, which train the camera follows) DOM-free and unit-tested.
- Make the background cost nothing once play starts.

**Non-Goals:**
- No background on the round, disconnect or "server full" overlays. Those keep their opaque backgrounds.
- No reaction to the reduced-motion setting changing mid-visit. It is read once at start.
- No interaction with the background: no clicking trains, no camera control.
- No version display anywhere other than the join screen, and no server-reported version.

## Decisions

### Two pieces: a DOM-free `AttractWorld` and a thin `AttractScene`

- **`src/attract/world.ts`, `AttractWorld`:**
  - owns a `World` of bots
  - steps it from a time accumulator and interpolates views
  - re-adds destroyed bots long
  - tracks `leaderId`
  - has no DOM; tests drive it the way `offline.test.ts` drives `OfflineSession`
- **`src/attract/scene.ts`, `startAttract(options)`:**
  - runs the `requestAnimationFrame` loop
  - moves the camera and applies the effect sinks
  - calls `renderScene`
  - handles reduced motion
  - returns `{ stop() }`

The accumulator and interpolation loop is about 15 lines and copies `OfflineSession` deliberately, rather than extracting a shared helper for two users.

Alternatives considered:
- **A spectator mode in `OfflineSession`.** It is built around `playerId` and player input, and it respawns starters. A second mode would muddle the practice mode.
- **Running `Game` with a dummy source.** It would bring input capture, sound and HUD with it.

### World tuning

These are starting values. They are tuned in the browser within the spec's limits: at least 20 carriages, mostly weapons.

| Setting | Normal play | Background | Why |
|---|---|---|---|
| `mapSize` | 6000 | 3000 | Bots fire only within 550 of their head, so density makes the bullets |
| bots | 6 (offline) | 8 | more shooters |
| starting carriages | starter | 20–40 random | long trains |
| `maxCarriages` | 150 | 60 | a 150-car train is 2700 units, nearly the whole 3000 map |
| `initialEnemies` / `maxEnemies` | 12 / 22 | 18 / 24 | always something in range |
| `initialTrailers` / `maxTrailers` | 50 / 60 | 30 / 40 | keeps some growth without filling the map |
| boss, hearts | default | default | the boss is a show piece; hearts are cheap |
| first spawn protection | 3.5 s | 0 | firing starts at once instead of after 3.5 s |

**Carriage mix.** A weighted draw that favours `mg` (7 shots/s) and `flak` (5 pellets), since they put the most projectiles in the air. Missiles, lasers, tail guns and tesla add variety. A few non-weapon cars (armor, shield, speed, fuel, repair) keep the trains looking like real ones. Weapons are about 85% of draws. Cloak and mines are left out: cloak has nothing to show without a minimap, and mines clutter a small map.

Bot names come from `BOT_NAMES` as in offline mode, though names aren't drawn.

### Destroyed bots are removed and re-added with the same identity

At the start of each tick, every dead bot is passed to `world.removeTrain(id)` and then `world.addTrain({ id, name, color, controller: 'bot', carriages: <new long set> })`.

- Re-adding sets hull to the new maximum and uses the same code path as the first bots.
- `respawnTrain` followed by `addCarriage` would leave hull at the starter's maximum.
- Keeping the id means the camera and per-id effects treat it as the same train.
- Re-added bots keep the default spawn protection, so a train that spawns next to a fight isn't destroyed straight away.

### Leader rule: longest living train, with a 3-carriage margin

`leaderId` is recomputed after every tick:
- If the followed train is dead or gone, switch to the longest living train.
- Otherwise switch only if some train has at least 3 more carriages than the followed one.

The margin stops the camera flipping between two trains of nearly equal length. Ties go to the lowest id, so tests are deterministic.

The rule is a pure function, `pickLeader(trains, currentId)`, tested directly.

### The camera pans gently

`followCamera` gets an optional `smoothing` argument, defaulting to `CAMERA_SMOOTHING`, so the in-game camera is unchanged. The background uses about 0.05 per 1/60 s frame:
- switching leaders across half the map (1500 units) takes about 0.75 s to cover 90% of the distance, so it reads as a pan
- a boosting train (380 u/s) stays about 130 px behind centre

The first frame snaps to the leader.

### No local train, and a reduced set of effects

- Views are built with `viewFromWorld(world, 0)`:
  - nothing is local, so there are no names and no friendly-mine marks
  - `applyEvents` never takes a local-only path
- `renderScene` gets an overlay of `{ aim: null, mouse: null, boosting: false, firing: false, shake: {0,0} }`.
- **Real sinks:** `ParticleSystem`, `HitFlash`, `TurretMemory` and `Zaps`, plus `TrainEmitter` smoke, `BridgeAnimator` and stars.
- **No-op stubs:** sound, kill feed, banner, shake, screen flash, heal flash and damage numbers.
  - The sound stub means no `AudioContext` is ever created.
  - Damage numbers are left out on purpose: with hundreds of hits a second they become a cloud of text that competes with the panel's text. Sparks and explosions carry the action.

### A separate canvas, removed on stop

`startAttract()` creates `<canvas id="attract">` itself and inserts it before `#game`. CSS fixes it to the window and stacks it below the overlays. Leaving it out of `index.html` means `?offline` never has an unused canvas in the page.

A separate canvas, rather than sharing `#game`, means the background and `Game` never share a canvas or its resize handling.

`startAttract(options)` takes `{ reducedMotion }` from `main.ts`, which reads `matchMedia`. It does not read the media query itself, so the still-frame path can be started on purpose during verification.

`setupCanvas` gains `dispose()`, which removes its resize listener. `stop()`:
1. cancels the animation frame
2. calls `dispose()`
3. removes the canvas element, freeing its memory

**Wiring in `main.ts`:**
- `startOnline` calls `startAttract`.
- The `session.ready` success branch calls `stop()` before it builds `Game`.
- A refused join doesn't stop the background, so the "server full" path back to the join screen keeps it.
- `startOffline` never starts it.

Frame time is capped as in `Game` (0.1 s) and the accumulator as in `OfflineSession` (0.25 s). A tab that was in the background doesn't run a burst of ticks when it comes back. Browsers already pause `requestAnimationFrame` in hidden tabs.

### Reduced motion: simulate, draw once, redraw on resize

If `main.ts` passes `reducedMotion: true`, because `matchMedia('(prefers-reduced-motion: reduce)')` matched at start:
1. Advance the sim about 4 s (120 ticks) with no effects, so trains have met and projectiles are in flight.
2. Snap the camera to the leader and draw once, with empty effects.
3. Don't start a loop.

Resizing clears a canvas, so the resize handler redraws the same still view.

Those 120 ticks cost a fraction of a second at load, and only for these visitors.

### Join screen: vignette, panel, and scrolling

- **Background.** `#join-screen` overrides the shared `.overlay` background: nearly clear in the middle, about 0.8 alpha at the edges. The other overlays keep theirs.
- **Panel.** Title, subtitle, blurb, controls, high scores, form and error are wrapped in a `.join-panel`:
  - translucent dark fill, about 0.7 alpha
  - thin border, rounded corners
  - capped width, with 16 px side gutters on narrow windows
- **No backdrop blur.** `backdrop-filter` would re-blur under the panel every frame over a moving canvas, which is costly on weak GPUs.
- **Scrolling.** `#join-screen` gets `overflow-y: auto`, and the panel uses `margin: auto` instead of relying on `justify-content: center`:
  - if the content fits, it is centred
  - if not, the screen scrolls from the top; flex centring would cut off the top of overflowing content
- **Footer.** It follows the panel, as the last flex item, so it sits at the bottom of a tall window and below the content on a short one.

### Version: a build-time constant from the client package

- **`vite.config.ts`** reads `packages/client/package.json`, using `readFileSync` against `import.meta.url`, and adds `define: { __APP_VERSION__: JSON.stringify(version) }`.
- **`src/env.d.ts`** declares `__APP_VERSION__: string`.
- **Tests** get the constant too, because Vitest loads the client's Vite config.

**`src/ui/footer.ts`:**
- `REPO_URL = 'https://github.com/carlhako/locomotive-wars'`
- `releaseUrl(version)` returns `${REPO_URL}/releases/tag/v${version}`
- `versionLabel(version)` returns `v${version}`
- `bindFooter()` sets the text and hrefs at startup

The `<a>` elements in `index.html` carry `target="_blank" rel="noopener noreferrer"`.

Why the client package's version: it is the build actually being served, and the release process bumps it together with the root.

Alternatives considered:
- **Hard-coding the version in HTML.** It would drift at the next release.
- **Vite's `%VITE_*%` HTML replacement.** It works, but needs an env-var detour and leaves nothing to unit test.

## Risks / Trade-offs

- **The home page now runs a brute-force sim and a full renderer all the time; weak or mobile devices may stutter or heat up.**
  → Moderate counts; the per-train projectile cap limits bullets to about 1,000.
  → Check with DevTools 4× CPU throttling, aiming for a steady frame rate and sim ticks under about 4 ms on desktop. If it misses, reduce bots first, then carriages.
  → Hidden tabs pause, and everything stops when play starts.
- **On windows wider or taller than 3000 CSS px, the map's wrap shows as empty bands at the edges.**
  → Accepted. Such windows are rare, and the vignette darkens the edges.
- **A busy background makes the text harder to read.**
  → Panel, vignette, no damage numbers. Checked with screenshots at desktop and phone sizes.
- **Sim work on the main thread could make typing in the name field lag.**
  → Per-frame cost is small. Typing is checked by hand during verification.
- **The release link 404s if a version is bumped before its tag is pushed.**
  → Only between the bump and the tag in a release. Accepted.
- **The background's tuning is less deterministic, since the seed is the time.**
  → Tests pass explicit seeds, as `offline.test.ts` does.

## Migration Plan

Client only. It ships in the next release through the usual build and `deploy/install.sh`; rolling back means installing the previous release. There are no protocol, server or data changes.

## Open Questions

- The exact bot count, carriage range (20 or more), enemy count and camera smoothing are settled by eye in the browser. They don't change the specs, the approach or the tasks.
