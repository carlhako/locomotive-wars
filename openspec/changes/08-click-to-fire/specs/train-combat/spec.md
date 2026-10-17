# Spec Delta

## MODIFIED Requirements

### Requirement: Spawn protection
For 3.5 seconds after spawning, a train SHALL be protected:
- it takes no damage and cannot be destroyed by collision
- its body is not lethal to others
- its weapons do not fire, even while its fire input is on
- bots do not aim at or fire on it

Clients SHALL show a shield ring on protected trains.

#### Scenario: Shots at a protected train
- **WHEN** a protected train is struck by a projectile
- **THEN** the projectile is consumed and the train's hull is unchanged

#### Scenario: Protection expires
- **WHEN** 3.5 seconds have passed since a train spawned
- **THEN** it can be damaged, its weapons fire, and its body is lethal again

#### Scenario: Protected body is harmless
- **WHEN** another train's head touches a protected train's 8th carriage
- **THEN** neither train is destroyed

#### Scenario: Protected train holding fire
- **WHEN** a protected train's player holds the fire button
- **THEN** none of its weapon carriages fire until protection expires
