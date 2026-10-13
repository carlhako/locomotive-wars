# Spec Delta

## Purpose

Defines how players are scored: a train's length is its score, the longest train a player reaches in a round decides their ranking, and the client shows both.

## ADDED Requirements

### Requirement: Live score is train length
A train's live score SHALL equal the number of carriages behind its locomotive. Collecting a trailer or dropped pickup that adds a carriage SHALL be the only way to increase it. Kills, enemy kills, and boss kills SHALL NOT award points.

#### Scenario: Starter score
- **WHEN** a starter train (locomotive plus MG) spawns
- **THEN** its live score is 1

#### Scenario: Pickup raises score
- **WHEN** a train with live score 7 collects a trailer
- **THEN** its live score is 8

#### Scenario: Kills do not score
- **WHEN** a train destroys another train or an enemy
- **THEN** its live score is unchanged until it collects a pickup

### Requirement: Live score resets on destruction
When a train is destroyed and respawns, its live score SHALL become the starter score.

#### Scenario: Death resets live score
- **WHEN** a train with live score 40 is destroyed and respawns
- **THEN** its live score is 1

### Requirement: Round best
Each train SHALL have a round best equal to the highest live score it has reached in the current round. Round best SHALL never decrease during a round, including after destruction, and SHALL reset when a new round starts.

#### Scenario: Best survives death
- **WHEN** a train reaches live score 40, is destroyed, and respawns
- **THEN** its round best is still 40 while its live score is 1

### Requirement: Round winner
The round winner SHALL be the train with the highest round best at round end. A tie SHALL go to the train that reached that value first.

#### Scenario: Peak beats final length
- **WHEN** player A peaked at 40 then died and ended with 6, and player B ended with a steady 18
- **THEN** A is ranked first with 40 and wins the round

#### Scenario: Tie
- **WHEN** two trains both have round best 25
- **THEN** the one that reached 25 earlier ranks higher

### Requirement: HUD shows current and best
The client HUD SHALL show the local train's live score as "Length" and its round best as "Round best".

#### Scenario: HUD after a death
- **WHEN** the local train has round best 40 and live score 3
- **THEN** the HUD shows Length 3 and Round best 40

### Requirement: Live leaderboard
The client SHALL show a leaderboard of the top 10 trains, updated at least twice per second, ranked like the round winner. Each row SHALL show name, round best, and live score, and bots SHALL be marked. If the local player is outside the top 10, their row SHALL be shown beneath, with their rank.

#### Scenario: Local player outside top 10
- **WHEN** the local player is ranked 14th
- **THEN** the leaderboard shows the top 10 plus a highlighted row for rank 14
