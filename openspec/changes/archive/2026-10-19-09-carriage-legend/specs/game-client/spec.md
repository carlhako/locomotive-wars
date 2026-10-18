# Spec Delta

## ADDED Requirements

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
