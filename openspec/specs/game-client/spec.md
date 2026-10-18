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

#### Scenario: Bridge is visible
- **WHEN** the world view marks a train's bridge as active
- **THEN** a bridge effect is drawn at that train's head

### Requirement: Camera follows the local train
The camera SHALL centre smoothly on the local player's train head and handle the wrapped world, drawing entities across the map seam at their nearest wrapped position.

#### Scenario: Seam rendering
- **WHEN** the local head is at x = 5990 and another train is at x = 20
- **THEN** the other train is drawn 30 units to the right of the local head

### Requirement: HUD and minimap
The client SHALL show hull, boost fuel, and carriage count for the local train, and a minimap showing all trains' positions with the local train highlighted.

#### Scenario: Hull bar reflects damage
- **WHEN** the local train's hull falls from 100% to 40%
- **THEN** the hull bar and percentage show 40%

### Requirement: Event-driven effects and sound
The client SHALL present simulation events. Hits SHALL show damage numbers and sparks. Train and enemy destruction SHALL show explosions, and SHALL shake the screen when they involve the local train. Kills SHALL appear in the kill feed with killer and victim names. Boss events SHALL show the boss banner and boss hull bar. Matching procedural sounds SHALL play.

#### Scenario: Local train is hit
- **WHEN** a hit event targets the local train
- **THEN** a damage number appears at the hit position, the damage flash shows, and the damage sound plays

#### Scenario: Kill feed entry
- **WHEN** a train-destroyed event names a source train
- **THEN** the kill feed shows the source's name and the victim's name

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
- mouse position to aim angle, relative to the local head's on-screen position
- holding the left mouse button to fire

It SHALL prevent the browser's default scrolling for these keys while playing. Fire SHALL turn off when the button is released, when the window loses focus, or when the pointer leaves the window with the button released.

#### Scenario: Aim follows mouse
- **WHEN** the mouse is directly above the local head on screen
- **THEN** the produced aim angle is -π/2

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
