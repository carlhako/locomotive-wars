# game-client Specification

## Purpose

Defines how the browser presents the Locomotive Wars world: drawing it from a view model, showing HUD and minimap, playing effects and sound from simulation events, and capturing player input.

## Requirements

### Requirement: Render from a world view
The client SHALL draw each frame solely from a world view (entities visible to the local player plus the local player's id) and the events received, without reading simulation internals.

#### Scenario: Same view renders the same scene
- **WHEN** the renderer is given a world view containing two trains, three trailers, and an enemy
- **THEN** all six entities are drawn at their view positions

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

### Requirement: Camera follows the local train
The camera SHALL centre smoothly on the local player's train head and handle the wrapped world, drawing entities across the map seam at their nearest wrapped position.

#### Scenario: Seam rendering
- **WHEN** the local head is at x = 5990 and another train is at x = 20
- **THEN** the other train is drawn 30 units to the right of the local head

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

### Requirement: No time scaling
The client SHALL NOT slow or speed up the world clock for effects. Kill and death emphasis SHALL use visual effects only.

#### Scenario: Local train destroyed
- **WHEN** the local train is destroyed
- **THEN** a flash and screen shake play while other entities keep moving at normal speed

### Requirement: Mute toggle
The client SHALL provide a mute button that silences all game audio and remembers the choice for the current browser.

#### Scenario: Muting persists
- **WHEN** the player mutes sound and reloads the page
- **THEN** sound remains muted

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

### Requirement: Offline mode
Loading the client with `?offline` SHALL run the shared simulation locally with the player's train plus bots, rendered through the same world view path. Destruction SHALL restart the local session.

#### Scenario: Offline session starts
- **WHEN** the page is opened with `?offline`
- **THEN** a local world with the player's train and bots runs and is playable with no server connection

### Requirement: Carriage legend
While playing, the client SHALL show a legend panel listing every carriage type the game can produce, grouped by category. Each row SHALL show the type's colour, icon, name, and a one-line description of its effect.

#### Scenario: Every type is listed
- **WHEN** the player joins a game
- **THEN** the legend shows one row for each pickup type, under its category's heading (for example Weapons, Defence, or Support)

#### Scenario: Row content
- **WHEN** the player looks at the MG row
- **THEN** it shows the MG colour swatch, its icon, the name "MG Turret", and a description including its fire rate and damage

### Requirement: Legend descriptions match game values
The numbers in each legend description SHALL come from the same values the simulation uses, so a change to a carriage's stats changes its description without editing the legend.

#### Scenario: Stat change flows through
- **WHEN** the MG's damage per shot is changed in the simulation constants
- **THEN** the MG row's description shows the new damage

### Requirement: Legend shows the player's carriages
Each legend row SHALL show how many carriages of that type the local train has. Rows for types the train has SHALL be visually emphasised, and rows for types it lacks SHALL be dimmed. The counts SHALL update as the train gains or loses carriages.

#### Scenario: Picking up a carriage
- **WHEN** the local train has 2 shields and picks up a shield trailer
- **THEN** the Shield row shows ×3

#### Scenario: Type not owned
- **WHEN** the local train has no magnet carriages
- **THEN** the Magnet row is dimmed and shows no count

#### Scenario: After respawn
- **WHEN** the local train is destroyed and respawns with its starter carriages
- **THEN** the counts reflect only the new train's carriages

### Requirement: Collapsible legend
The player SHALL be able to toggle the legend between expanded and collapsed with the `H` key. Collapsed, it SHALL show only a header naming the key. The choice SHALL be remembered in the browser. With no remembered choice, the legend SHALL start collapsed in windows shorter than 760 CSS pixels and expanded otherwise. The legend SHALL NOT block clicks on the playfield.

#### Scenario: Toggle and remember
- **WHEN** the player presses `H` to collapse the legend and reloads the page
- **THEN** the legend is collapsed after rejoining

#### Scenario: Typing does not toggle
- **WHEN** the player types "H" into the high score name box
- **THEN** the legend does not toggle

#### Scenario: Short window default
- **WHEN** a first-time player joins in a window 700 pixels tall
- **THEN** the legend starts collapsed

#### Scenario: Clicks pass through
- **WHEN** the player holds the fire button with the cursor over the legend
- **THEN** the train fires

### Requirement: Distinguishable carriage types
Every carriage type SHALL have its own colour, used consistently for its trailers, dropped pickups, carriages, minimap dots, and legend row, and no two types SHALL share a colour. Non-weapon carriages SHALL show their type's icon on the carriage body. Weapon carriages SHALL show a turret whose barrel shape differs per weapon type.

#### Scenario: Same colour everywhere
- **WHEN** a laser trailer is collected and becomes a carriage
- **THEN** the trailer, the carriage, and the Laser legend row use the same colour

#### Scenario: Support carriage icon
- **WHEN** a train with a magnet carriage is on screen
- **THEN** that carriage shows the magnet icon on its body

### Requirement: New carriage effects and sounds
The client SHALL play an explosion effect and sound for mine explosions, a crackle sound for tesla zaps, and a distinct firing sound for flak. Flak and tail gunner carriages SHALL have their own turret shapes, and the tail gunner's turret SHALL point at its target when firing and backward otherwise.

#### Scenario: Mine explodes on screen
- **WHEN** a mine-exploded event arrives for a position on screen
- **THEN** an explosion effect is drawn there and the explosion sound plays

### Requirement: Legend covers the full roster
The carriage legend SHALL list every carriage type, including Flak under Weapons; Mine Layer, Tail Gunner, and Tesla Coil under an Auto weapons heading; Cowcatcher under Defence; and Repair Car and Cloak under Support.

#### Scenario: Auto weapons section
- **WHEN** the player expands the legend
- **THEN** an Auto weapons section lists Mine Layer, Tail Gunner, and Tesla Coil with their descriptions

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
