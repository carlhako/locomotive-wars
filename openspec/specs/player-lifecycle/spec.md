# player-lifecycle Specification

## Purpose

Defines a player's train from spawn to destruction and back: the starter train, where trains spawn, and immediate respawn with everything reset.

## Requirements

### Requirement: Starter train
A newly spawned train SHALL consist of the locomotive plus one MG weapon carriage, with full hull and full fuel, no upgrade bonuses, and spawn protection active.

#### Scenario: Fresh spawn
- **WHEN** a player joins
- **THEN** their train has exactly two carriages (locomotive and MG), full hull, full fuel, and is protected

### Requirement: Safe spawn placement
A spawning train SHALL be placed at a random position at least 800 units from every other train's head and 300 units from every enemy. After 20 failed attempts it SHALL use the attempted position farthest from other train heads.

#### Scenario: Spawn away from others
- **WHEN** a player spawns into a world with 10 trains spread across the map
- **THEN** their head is at least 800 units from every other head, if such a position was found

### Requirement: Immediate respawn
When a human player's train is destroyed, the player SHALL receive a new starter train at a new safe spawn position on the next tick. All carriages, upgrades, hull, and fuel SHALL be reset; nothing carries over from the destroyed train.

#### Scenario: Respawn after death
- **WHEN** a player's 40-carriage train is destroyed
- **THEN** on the next tick the player controls a starter train with two carriages at a new location

#### Scenario: Upgrades do not carry over
- **WHEN** a player with 5 armor and 3 booster carriages is destroyed and respawns
- **THEN** the new train has base max hull and base speed

### Requirement: Respawn presentation
On respawn the client SHALL move the camera directly to the new train without drawing it travelling from the old location. It SHALL show a notice naming what destroyed the player for about 2 seconds, without a game-over screen.

#### Scenario: Destroyed by another player
- **WHEN** player B is rammed by player A and respawns
- **THEN** B's screen shows "Destroyed by A" while B already controls the new train, and no train is drawn sweeping across the map

### Requirement: Bot respawn
Destroyed bot trains SHALL respawn as starter trains under the same rules unless the server's bot population management removes them.

#### Scenario: Bot comes back
- **WHEN** a bot train is destroyed and the bot population is below its target
- **THEN** a bot starter train spawns at a safe position
