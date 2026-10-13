# Tasks

## 1. View model

- [ ] 1.1 Add `WorldView` types and `viewFromWorld(world, localId)` to `packages/shared/src/view.ts`; verify a unit test where a world with 2 trains, 3 trailers, and 1 enemy maps to a view with the same entities and positions
- [ ] 1.2 Include minimap entries for all trains with `isLocal` set; verify the unit test checks that exactly one entry is local

## 2. Rendering

- [ ] 2.1 Port the canvas setup, resize, camera follow with smoothing, and the wrapped-position helper for drawing across the seam; verify a unit test that x=20 draws 30 units right of a head at x=5990
- [ ] 2.2 Port the starfield, trains (locomotive plus type-coloured carriages, damage flash), and bridge drawing; verify visually against the reference in offline mode
- [ ] 2.3 Port enemies, boss (with shield phase), trailers, drops, and projectiles drawing; verify visually in offline mode
- [ ] 2.4 Port the minimap; verify all trains appear and the local train is highlighted

## 3. HUD, effects, audio

- [ ] 3.1 Port the HUD CSS and markup (stats panel with hull, fuel, and carriage count; minimap panel; tips; empty leaderboard panel); verify the hull bar shows 40% when the view's hull is at 40%
- [ ] 3.2 Implement client-side particles (smoke, sparks, heat, boost trail) and damage numbers; verify visually, and that particle count stays bounded (cap) in a 2-minute offline soak
- [ ] 3.3 Implement `eventFx.ts` mapping each SimEvent type to effects, with local-player extras (damage flash, death shake, kill banner) and the kill feed; verify unit tests for the local-hit and kill-feed scenarios
- [ ] 3.4 Port SoundFX as `audio/sound.ts`, triggered from events, with a mute button persisted in `localStorage` (try/catch); verify mute survives a reload
- [ ] 3.5 Confirm no code path scales world time (no slowmo); verify by search, and by observing the local-death scenario in offline mode

## 4. Input and offline mode

- [ ] 4.1 Implement `input.ts` (A/D and arrows to turn, Space boost, S/Down brake, mouse aim relative to the local head's screen position, preventDefault on game keys); verify unit tests for aim -π/2 with the mouse above the head and for key mapping
- [ ] 4.2 Implement `offline.ts`: local World with the player plus 6 bots, 30 Hz accumulator, render interpolation between ticks, restart on local destruction; verify `?offline` is playable end to end with no server running
- [ ] 4.3 Document the client structure, controls, and `?offline` in `packages/client/README.md`; verify instructions run as written
