# Proposal

## Why

The home page stays dark and static until someone presses Play, so a first-time visitor never sees the game being played before deciding to join. The page also doesn't say which build is running or where the source lives. Releases are now tagged (`v0.1.0` to `v0.3.0`) and installed with `deploy/install.sh`, so that matters.

## What Changes

**Background simulation**

- While the join screen is shown, a local simulation runs behind it. It has bots only: no player train, no server connection, no sound.
- It is tuned for spectacle, so many bullets are in flight:
  - a smaller map than normal play
  - more bots and enemies
  - bots that start long, roughly 20 to 40 carriages, mostly weapons
- A destroyed bot comes back as a long train, so trains stay long.
- The camera follows the longest train. When the leader changes (it is destroyed or overtaken), the camera pans smoothly to the new one instead of cutting.
- It draws on its own canvas and does not capture keyboard or mouse input, so typing a name and pressing Play work as today.
- It stops and is removed when the real game starts, which is when the online join succeeds. It keeps running when the join screen comes back after a "server full" retry.
- Under `prefers-reduced-motion`, the background shows a still frame instead of animating.
- `?offline` mode is unchanged. It skips the join screen, so it has no background simulation.

**Join screen look**

- The overlay background becomes see-through in the middle, with darkened edges.
- The title, blurb, controls, high scores and name form sit on a translucent panel, so they stay readable over the action.

**Version and source link**

- A footer at the bottom of the join screen shows:
  - the client version (for example `v0.3.0`), linking to that version's GitHub release page
  - a GitHub link to the repository, https://github.com/carlhako/locomotive-wars
- The version comes from the client package's version at build time, so a release bump updates it without an extra step.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-client`:
  - a background simulation behind the join screen: bots only, the camera follows the longest train, no input capture or sound, stops when play starts, holds still under reduced motion
  - the join screen shows the client version and a link to the source repository

## Impact

- **Client:**
  - a new background-scene module that:
    - steps a `World` of bots at the fixed tick rate, from a time accumulator as `OfflineSession` does
    - builds views with `viewFromWorld` and draws them with `renderScene`
    - shows a subset of effects (particles, hit flash, damage numbers, zaps, turrets) with a silent sound stub
  - `main.ts`: start the background on load in online mode, and stop it when the session is ready
  - `index.html`: a panel around the join screen content, and the footer markup. The background canvas is created by script, so `?offline` never has it.
  - `hud/styles.css`: overlay transparency, the content panel, the footer
  - `vite.config.ts`: a build-time version constant, plus its type declaration. Client tests read the same Vite config through the root Vitest `projects` setup, so they get the constant too.
- **Shared sim:** no changes. The background uses the existing `WorldOptions`, `addTrain({ carriages })`, `respawnTrain` and `addCarriage`.
- **Server and protocol:** no changes.
- **Performance:** the home page now runs a simulation and a renderer continuously. Browsers pause it in background tabs. The tuning must stay cheap enough for low-end and mobile devices.
- **Tests:** new unit tests for the background scene (leader selection, respawned bots come back long, stopping) and for the version footer.
