# player-admission Specification

## Purpose

Defines who may stay connected: the cap on simultaneous human players and the removal of players who stop playing.

## Requirements

### Requirement: Maximum players
The server SHALL allow at most `maxPlayers` connected human sessions, counting sessions in any phase. A join beyond the limit SHALL receive `reject` with reason `full`, including the current and maximum counts, and the client SHALL show a "server full" message with a retry button.

#### Scenario: Server full
- **WHEN** `maxPlayers` is 16, 16 humans are connected, and another player presses Play
- **THEN** they see "Server full (16/16)" with a retry button and no train is spawned

#### Scenario: Slot frees up
- **WHEN** one of the 16 players leaves and the waiting player presses retry
- **THEN** they join successfully

### Requirement: Idle detection
A human session SHALL count as idle while it sends no meaningful input change: no change to turn, boost, or brake, and no aim change larger than 0.05 radians. Time SHALL accumulate only during the `playing` phase.

#### Scenario: Heartbeats do not count as activity
- **WHEN** a client keeps sending identical input heartbeats for 60 seconds of play
- **THEN** the session is considered idle for 60 seconds

#### Scenario: Intermission does not count
- **WHEN** a player is inactive for 30 seconds of play and then a 20-second intermission
- **THEN** their idle time is 30 seconds when the next round starts

### Requirement: Idle warning and kick
When `idleKickSec` is greater than 0, a session idle for `idleKickSec − 10` seconds SHALL receive a warning, shown as a countdown. Any meaningful input SHALL clear the warning. A session idle for `idleKickSec` SHALL receive `kicked` with reason `idle` and be disconnected. The client SHALL show "Kicked for inactivity" with a rejoin button.

#### Scenario: Warned then kicked
- **WHEN** `idleKickSec` is 60 and a player stops touching the controls
- **THEN** after 50 seconds they see a 10-second countdown, and after 60 seconds they are disconnected and shown the inactivity message

#### Scenario: Warning cleared
- **WHEN** a warned player turns their train
- **THEN** the warning disappears and the idle time resets

#### Scenario: Idle kick disabled
- **WHEN** `idleKickSec` is 0
- **THEN** no player is ever kicked for inactivity
