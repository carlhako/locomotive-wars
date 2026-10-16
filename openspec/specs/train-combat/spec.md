# train-combat Specification

## Purpose

Defines how trains destroy each other: lethal body collisions, who gets credit for every destruction, and the spawn protection that prevents spawn-killing.

## Requirements

### Requirement: Lethal body collisions
A train SHALL be destroyed when its head comes within 14 units (wrapped distance) of another train's carriage at index 3 or beyond. Index 0 is the locomotive car directly behind the head. This SHALL apply equally to human- and bot-controlled trains.

#### Scenario: Human rams a human's body
- **WHEN** player A's head touches the 6th carriage of player B's train
- **THEN** A's train is destroyed and B is credited with the kill

#### Scenario: Bots collide with each other
- **WHEN** a bot's head touches another bot's 10th carriage
- **THEN** the first bot is destroyed

### Requirement: Front carriages and heads are not lethal
A train's head and its first three carriages (indices 0 to 2) SHALL NOT destroy other trains on contact.

#### Scenario: Head-on pass
- **WHEN** two trains' heads pass through each other
- **THEN** neither train is destroyed by the contact

### Requirement: Simultaneous ramming
When two trains' heads each touch the other's lethal body in the same tick, both trains SHALL be destroyed, each credited to the other.

#### Scenario: Mutual collision
- **WHEN** A's head touches B's body and B's head touches A's body on the same tick
- **THEN** both are destroyed, A credited for B and B credited for A

### Requirement: Kill attribution
Every train destruction SHALL emit an event with the victim, the cause (`ram`, `weapon`, `enemy`, `boss`), and the killer:
- the projectile owner for weapon kills
- the body owner for rams
- the enemy or boss for enemy kills

The killer's kill count SHALL increase when the killer is a train.

#### Scenario: Weapon kill credit
- **WHEN** player A's missile reduces player B's hull to zero
- **THEN** the destroyed event names A as killer with cause `weapon`, and A's kill count increases by 1

#### Scenario: Killed by an enemy
- **WHEN** a sentry's shot destroys player B
- **THEN** the destroyed event has cause `enemy` and no train killer

### Requirement: Spawn protection
For 3.5 seconds after spawning, a train SHALL be protected:
- it takes no damage and cannot be destroyed by collision
- its body is not lethal to others
- its weapons do not fire
- other trains' weapons do not target it

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
