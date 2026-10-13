# Spec Delta

## Purpose

Defines how many AI-controlled trains the server runs, so the world feels populated with few humans and is not overcrowded with many.

## ADDED Requirements

### Requirement: Bot target count
The server SHALL maintain a target bot count of `clamp(bots.fillTo − connectedHumans, bots.min, bots.max)`, recalculated whenever a human joins or leaves.

#### Scenario: Few humans
- **WHEN** `fillTo` is 12, `min` 0, `max` 10, and 1 human is connected
- **THEN** the target bot count is 10

#### Scenario: Many humans
- **WHEN** `fillTo` is 12 and 14 humans are connected
- **THEN** the target bot count is 0

#### Scenario: Bots disabled
- **WHEN** `fillTo` is 0 and `min` is 0
- **THEN** no bots exist

### Requirement: Gradual bot adjustment
When there are fewer bots than the target, the server SHALL add one bot per second until the target is reached. When there are more, the server SHALL NOT remove living bots mid-round. Instead it SHALL remove destroyed bots rather than respawning them until the count matches, and SHALL remove any remaining excess at round reset.

#### Scenario: Human joins a busy world
- **WHEN** a human joins and the target drops from 10 to 9 while all 10 bots are alive
- **THEN** all 10 bots stay until one is destroyed, which is then not respawned

### Requirement: Bots are identifiable
Bots SHALL use distinct names from the bot name list, SHALL be marked as bots in the leaderboard and round standings, and SHALL NOT count toward `maxPlayers` or idle kicking.

#### Scenario: Bot marked in standings
- **WHEN** a bot finishes a round in second place
- **THEN** the standings show it in second place with a bot marker
