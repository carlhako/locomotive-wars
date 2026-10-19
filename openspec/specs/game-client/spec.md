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

### Requirement: Home screen background simulation
While the join screen is shown, the client SHALL run a local simulation of bot trains behind it, drawn in the game's normal style. It SHALL have no player train, SHALL NOT join the game server, and SHALL play no sound. Bots SHALL start with at least 20 carriages, mostly weapons, and a destroyed bot SHALL come back with at least 20 carriages. Loading the client with `?offline` SHALL NOT run it.

#### Scenario: Background runs behind the join screen
- **WHEN** a visitor opens the game page
- **THEN** bot trains move and fire behind the join screen before the visitor presses Play, and the server has no player for that visitor

#### Scenario: Trains start long
- **WHEN** the background simulation starts
- **THEN** every bot train has at least 20 carriages behind its locomotive, most of them weapon carriages

#### Scenario: Destroyed bots come back long
- **WHEN** a background bot train is destroyed
- **THEN** it reappears with at least 20 carriages instead of as a starter train

#### Scenario: Silent
- **WHEN** the background simulation runs, including shots, hits and explosions
- **THEN** no game sound plays

#### Scenario: Not in offline mode
- **WHEN** the page is opened with `?offline`
- **THEN** no background simulation runs and the offline game starts as before

### Requirement: Background camera follows the leader
The background camera SHALL follow the longest living train. It SHALL switch to another train only when the followed train is destroyed, or when another train is at least 3 carriages longer than the followed one. Moving to a new train SHALL be a continuous pan, not a jump.

#### Scenario: Leader destroyed
- **WHEN** the followed train is destroyed
- **THEN** the camera pans to the longest remaining living train

#### Scenario: Leader clearly overtaken
- **WHEN** another train becomes at least 3 carriages longer than the followed train
- **THEN** the camera pans to that train

#### Scenario: Close race does not flip-flop
- **WHEN** another train is longer than the followed train by only 1 or 2 carriages
- **THEN** the camera keeps following the same train

### Requirement: Background ignores input
The background simulation SHALL NOT capture keyboard or pointer input. Typing a name, pressing Space and the arrow keys in the name field, and clicking on the join screen SHALL behave exactly as they do without it.

#### Scenario: Typing a name
- **WHEN** the visitor types a name containing spaces into the name field and moves the text cursor with the arrow keys
- **THEN** the spaces appear in the field and the cursor moves, with no effect on the background

### Requirement: Background stops when play starts
The background simulation SHALL stop, and its drawing surface SHALL be removed, when the player's game starts, which is when the server accepts the join. Until then it SHALL keep running, including while the join screen is shown again after a refused join.

#### Scenario: Join accepted
- **WHEN** the visitor presses Play and the server accepts the join
- **THEN** the background simulation stops and only the player's game is drawn

#### Scenario: Server full
- **WHEN** the join is refused because the server is full and the visitor returns to the join screen to retry
- **THEN** the background simulation is still running behind the join screen

### Requirement: Background respects reduced motion
When the browser reports a preference for reduced motion, the background SHALL show a still frame of the simulation, with trains and projectiles in it, instead of animating.

#### Scenario: Reduced motion preferred
- **WHEN** the page is opened in a browser set to prefer reduced motion
- **THEN** the background shows a single still frame of trains in combat and does not move

### Requirement: Join screen readable over the background
The join screen SHALL let the background show through around its content and SHALL darken toward the window edges. Its title, description, controls, high scores and name form SHALL sit on a backing panel that keeps them readable while the background moves. On windows too short for the whole panel, the join screen SHALL scroll rather than cut content off.

#### Scenario: Background visible, content readable
- **WHEN** the join screen is shown over the running background
- **THEN** the trains and projectiles are visible around the panel, and the panel's text and form stay readable on top of them

#### Scenario: Short window
- **WHEN** the window is shorter than the join screen's content
- **THEN** the visitor can scroll to every part of the join screen, including the Play button and the footer

### Requirement: Version and source link
The join screen SHALL show a footer at its bottom with the client's version and a link to the source repository at https://github.com/carlhako/locomotive-wars. The version SHALL be shown as `v` followed by the client package's version at build time, and SHALL link to that version's release page on GitHub. Both links SHALL open in a new tab.

#### Scenario: Version shown
- **WHEN** the client was built from package version `0.3.0`
- **THEN** the footer shows `v0.3.0`, linking to https://github.com/carlhako/locomotive-wars/releases/tag/v0.3.0

#### Scenario: Repository link
- **WHEN** the visitor clicks the footer's GitHub link
- **THEN** https://github.com/carlhako/locomotive-wars opens in a new tab and the game page stays open

#### Scenario: Release bump
- **WHEN** a release changes the client package version and the client is rebuilt
- **THEN** the footer shows the new version with no other edit
