# Spec Delta

## MODIFIED Requirements

### Requirement: Lethal body collisions
A train SHALL be destroyed when its head comes within 14 units (wrapped distance) of another train's carriage at index 2 or beyond. Index 0 is the locomotive car directly behind the head. This SHALL apply equally to human- and bot-controlled trains.

#### Scenario: Human rams a human's body
- **WHEN** player A's head touches the 6th carriage of player B's train
- **THEN** A's train is destroyed and B is credited with the kill

#### Scenario: Bots collide with each other
- **WHEN** a bot's head touches another bot's 10th carriage
- **THEN** the first bot is destroyed

#### Scenario: Third carriage is lethal
- **WHEN** player A's head touches the carriage at index 2 of player B's train
- **THEN** A's train is destroyed and B is credited with the kill

### Requirement: Front carriages and heads are not lethal
A train's head and its first two carriages (indices 0 and 1, the locomotive and the car behind it) SHALL NOT destroy other trains on contact.

#### Scenario: Head-on pass
- **WHEN** two trains' heads pass through each other
- **THEN** neither train is destroyed by the contact

#### Scenario: Car behind the locomotive is safe
- **WHEN** player A's head touches the carriage at index 1 of player B's train
- **THEN** neither train is destroyed

#### Scenario: Starter train has no lethal body
- **WHEN** a train with only a locomotive and one gun car is crossed by another train's head
- **THEN** neither train is destroyed
