# Spec Delta

## MODIFIED Requirements

### Requirement: Input capture
The client SHALL map controls to a train input:
- A/D or Left/Right arrows to turn
- Space to boost
- S or Down to brake
- mouse position to aim offset: the mouse's position on screen relative to the local head's on-screen position, in world units
- holding the left mouse button to fire

It SHALL prevent the browser's default scrolling for these keys while playing. Fire SHALL turn off when the button is released, when the window loses focus, or when the pointer leaves the window with the button released.

#### Scenario: Aim follows mouse
- **WHEN** the mouse is 150 pixels directly above the local head on screen
- **THEN** the produced aim offset is (0, -150)

#### Scenario: Aim before the mouse moves
- **WHEN** the mouse has not moved since the page loaded
- **THEN** the produced aim offset points ahead of the local head along its heading

#### Scenario: Keys do not scroll the page
- **WHEN** the player presses Space or an arrow key during play
- **THEN** the page does not scroll

#### Scenario: Holding the mouse button fires
- **WHEN** the player holds the left mouse button over the game
- **THEN** the produced input has fire on until the button is released

#### Scenario: Focus loss stops fire
- **WHEN** the player is holding fire and the window loses focus
- **THEN** the produced input has fire off

#### Scenario: Clicks on UI do not fire
- **WHEN** the player clicks the mute button or a field on an overlay
- **THEN** the produced input has fire off

### Requirement: Visual fidelity to the reference
The client SHALL draw the world with the reference game's visual style:
- starfield background
- trains with type-coloured carriages and the locomotive
- glowing bridge while a train crosses its own trail
- enemies by type, and the boss with its shield
- pulsing trailers and dropped pickups
- projectiles by type
- mines, with armed mines visibly different from unarmed ones and the player's own mines marked as friendly
- tesla zaps as short-lived arcs along their chain
- hearts as heart shapes: slow hearts pink, full hearts red, larger, and glowing

#### Scenario: Bridge is visible
- **WHEN** the world view marks a train's bridge as active
- **THEN** a bridge effect is drawn at that train's head

#### Scenario: Own mine marked
- **WHEN** the local train's armed mine and another train's armed mine are both on screen
- **THEN** the local train's mine is drawn with the friendly marking and the other is not

#### Scenario: Zap arc
- **WHEN** a zap event arrives with a coil and two target positions
- **THEN** an arc is drawn from the coil to the first target and on to the second, fading out within half a second

#### Scenario: Hearts are distinguishable
- **WHEN** a slow heart and a full heart are both on screen
- **THEN** both are drawn as hearts, the full heart larger, red, and glowing, and the slow heart pink

### Requirement: HUD and minimap
The client SHALL show hull, boost fuel, and carriage count for the local train, and a minimap showing all trains' positions with the local train highlighted. The minimap SHALL NOT show other trains that have a cloak carriage. While the local train has active healing doses, the HUD SHALL show a heart indicator by the hull bar with the number of active doses.

#### Scenario: Hull bar reflects damage
- **WHEN** the local train's hull falls from 100% to 40%
- **THEN** the hull bar and percentage show 40%

#### Scenario: Cloaked bot offline
- **WHEN** in offline mode a bot train picks up a cloak carriage
- **THEN** that bot disappears from the minimap but is still drawn on the playfield when in view

#### Scenario: Dose indicator
- **WHEN** the local train has three active healing doses
- **THEN** the HUD shows the heart indicator with ×3, and it disappears when the last dose runs out

### Requirement: Event-driven effects and sound
The client SHALL present simulation events. Hits SHALL show damage numbers and sparks. Train and enemy destruction SHALL show explosions, and SHALL shake the screen when they involve the local train. Kills SHALL appear in the kill feed with killer and victim names. Boss events SHALL show the boss banner and boss hull bar. Heart events SHALL show heart particles and a green "+N" heal number of the event's amount; a full heart collected by the local train SHALL also show a green screen flash. Matching procedural sounds SHALL play.

#### Scenario: Local train is hit
- **WHEN** a hit event targets the local train
- **THEN** a damage number appears at the hit position, the damage flash shows, and the damage sound plays

#### Scenario: Kill feed entry
- **WHEN** a train-destroyed event names a source train
- **THEN** the kill feed shows the source's name and the victim's name

#### Scenario: Local train collects a full heart
- **WHEN** a heart event of kind full with amount 250 names the local train
- **THEN** heart particles and a green "+250" appear at the heart's position, a green screen flash shows, and the full-heal sound plays

## ADDED Requirements

### Requirement: Turrets face the cursor
Each of the local train's manual weapon carriages SHALL draw its barrel pointing from the carriage toward the aim point. Other trains' manual weapon barrels SHALL point along their track.

#### Scenario: Barrels converge
- **WHEN** the local train has three MG carriages and the mouse is beside the train
- **THEN** each MG barrel points at the mouse position, at a different angle from the others

### Requirement: Safe carriages are visible
The client SHALL draw every train's non-lethal carriages faded compared with its lethal ones. The non-lethal carriages are the locomotive and the car behind it, or the whole body while the train is protected. Which carriages count as non-lethal SHALL come from the same rule the simulation uses.

#### Scenario: Front cars faded
- **WHEN** an unprotected train with 8 carriages is on screen
- **THEN** its carriages at indices 0 and 1 are drawn faded and the rest are drawn normally

#### Scenario: Protected train fully faded
- **WHEN** a protected train is on screen
- **THEN** all of its carriages are drawn faded, and they return to normal when protection ends
