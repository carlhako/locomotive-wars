# Spec Delta

## MODIFIED Requirements

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

#### Scenario: Bridge is visible
- **WHEN** the world view marks a train's bridge as active
- **THEN** a bridge effect is drawn at that train's head

#### Scenario: Own mine marked
- **WHEN** the local train's armed mine and another train's armed mine are both on screen
- **THEN** the local train's mine is drawn with the friendly marking and the other is not

#### Scenario: Zap arc
- **WHEN** a zap event arrives with a coil and two target positions
- **THEN** an arc is drawn from the coil to the first target and on to the second, fading out within half a second

### Requirement: HUD and minimap
The client SHALL show hull, boost fuel, and carriage count for the local train, and a minimap showing all trains' positions with the local train highlighted. The minimap SHALL NOT show other trains that have a cloak carriage.

#### Scenario: Hull bar reflects damage
- **WHEN** the local train's hull falls from 100% to 40%
- **THEN** the hull bar and percentage show 40%

#### Scenario: Cloaked bot offline
- **WHEN** in offline mode a bot train picks up a cloak carriage
- **THEN** that bot disappears from the minimap but is still drawn on the playfield when in view

## ADDED Requirements

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
