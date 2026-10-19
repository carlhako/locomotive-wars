# Spec Delta

## ADDED Requirements

### Requirement: Pickup popup

Whenever the local player's train picks up a carriage, the client SHALL show a popup line a little below the centre of the screen. The line SHALL show the type's icon and name in the type's colour. Under it, the line SHALL show:
- the type's legend description if it is the train's only carriage of that type
- otherwise, how many of that type the train now has
- "TRAIN FULL" if no carriage was added

Pickups by other trains SHALL NOT show a popup.

#### Scenario: First carriage of a type

- **WHEN** the local train picks up a Laser and now has exactly one Laser carriage
- **THEN** a popup line shows the Laser icon and name in the Laser colour, with the Laser legend description

#### Scenario: Duplicate carriage shows the count

- **WHEN** the local train picks up a Laser and now has three Laser carriages
- **THEN** the popup line shows the Laser icon and name with "×3" and no description

#### Scenario: Several of one type in one frame

- **WHEN** the local train picks up two Shields in the same frame and had none before
- **THEN** two popup lines show: the first with the Shield description, the second with "×2"

#### Scenario: Train at its carriage limit

- **WHEN** the local train picks up a Missile while at its carriage limit and no carriage is added
- **THEN** the popup line shows the Missile icon and name with "TRAIN FULL"

#### Scenario: Another train's pickup

- **WHEN** another player's or a bot's train picks up a carriage
- **THEN** no popup line is shown

### Requirement: Pickup popup stack

The pickup popup SHALL show at most 3 lines at once, newest last. Each line SHALL disappear about 1.5 seconds after it appears. A pickup made while 3 lines are showing SHALL remove the oldest line. Popup lines SHALL NOT replace or hide the kill popup or the centre banner, and SHALL NOT capture pointer input.

#### Scenario: Lines expire

- **WHEN** a popup line has been shown for about 1.5 seconds
- **THEN** it disappears

#### Scenario: A fourth pickup in quick succession

- **WHEN** three popup lines are showing and the local train picks up another carriage
- **THEN** the oldest line is removed and the new line appears as the newest

#### Scenario: Pickup and kill together

- **WHEN** the local train destroys a train and picks up a carriage in the same frame
- **THEN** both the kill popup and the pickup popup line are visible

#### Scenario: Firing over the popup

- **WHEN** the player holds the fire button with the cursor over a popup line
- **THEN** the train fires as usual

#### Scenario: New world

- **WHEN** the client switches to a new world, such as after reconnecting
- **THEN** any popup lines still showing are cleared
