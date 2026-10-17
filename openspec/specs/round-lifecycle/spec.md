# round-lifecycle Specification

## Purpose

Defines how play is divided into timed rounds: when rounds start and end, what players see between rounds, and how the world resets.

## Requirements

### Requirement: Round phases
The server SHALL cycle between a `playing` phase lasting `roundLengthSec` and an `intermission` phase lasting `intermissionSec`, then start a new round. Clients SHALL be told the current phase, round id, and phase end time on join and at every phase change.

#### Scenario: Round ends on time
- **WHEN** a round has been playing for `roundLengthSec`
- **THEN** the phase changes to `intermission` and all clients are notified

#### Scenario: Next round starts
- **WHEN** an intermission has lasted `intermissionSec`
- **THEN** a new round with a new round id begins in the `playing` phase

### Requirement: Round timer display
During `playing`, the client SHALL show the time remaining in the round as minutes and seconds. It SHALL highlight the timer during the final 10 seconds.

#### Scenario: Final seconds
- **WHEN** 9 seconds remain in the round
- **THEN** the round timer shows `0:09` highlighted

### Requirement: World frozen during intermission
During `intermission` the simulation SHALL NOT advance, and player input SHALL be ignored.

#### Scenario: No movement between rounds
- **WHEN** a player holds boost during intermission
- **THEN** no train moves until the next round starts

### Requirement: End-of-round standings
At the end of each round, every connected client SHALL receive the final standings and the winner, and SHALL show them in an intermission overlay with a countdown to the next round. Standings list every train's rank, name, bot flag, round best, and kills.

#### Scenario: Standings shown
- **WHEN** a round ends with 3 humans and 4 bots
- **THEN** each human sees an overlay listing all 7 trains ranked, the winner highlighted, bots marked, and a countdown

### Requirement: Round reset
When a new round starts, the world SHALL be reset:
- every train respawns as a starter train at a safe position
- round bests and kill counts return to zero
- trailers and enemies are regenerated, and any boss is removed
- the boss schedule restarts

#### Scenario: Fresh start
- **WHEN** a new round begins after a player finished the last round with 60 carriages
- **THEN** that player starts the new round with a starter train and a round best of 1

### Requirement: Joining mid-round or during intermission
A player who joins during `playing` SHALL spawn immediately into the current round. A player who joins during `intermission` SHALL see the standings and countdown and spawn when the next round starts.

#### Scenario: Join during intermission
- **WHEN** a player joins with 12 seconds of intermission left
- **THEN** they see the standings overlay and their train spawns when the new round begins

### Requirement: Idle server
When no human players are connected, the server SHALL stop advancing the simulation and the round clock. When a human joins an idle server, a fresh round SHALL start.

#### Scenario: Last player leaves
- **WHEN** the last connected human disconnects mid-round
- **THEN** the simulation stops, and the next human to join starts a new round with the full round length
