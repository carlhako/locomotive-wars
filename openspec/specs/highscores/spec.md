# highscores Specification

## Purpose

Defines the all-time high score table: which round results earn a place, how players name their entry, how the table is stored safely, and where players see it.

## Requirements

### Requirement: High score table
The server SHALL keep an all-time table of at most `highscores.size` entries (default 10, allowed 1 to 100). Each entry holds a name, a score (the player's round best), and the date and time it was achieved. Entries SHALL be ranked by score, highest first. Equal scores SHALL be ranked by which was achieved first.

#### Scenario: Ranking with a tie
- **WHEN** the table holds scores 50 (Monday) and 50 (Tuesday)
- **THEN** the Monday entry ranks above the Tuesday entry

### Requirement: Qualifying at round end
When a round ends, each human connected at that moment with a round best above 0 SHALL qualify if the table has a free slot or their round best is strictly higher than the lowest entry. Qualifying results SHALL be inserted immediately under the player's join name, removing entries pushed below the table size. Bots SHALL never qualify.

#### Scenario: Beating the lowest entry
- **WHEN** the table is full with a lowest score of 30 and a player ends the round with round best 42
- **THEN** the player's result is inserted at its rank and the 30 entry drops off

#### Scenario: Equal to the lowest does not qualify
- **WHEN** the table is full with a lowest score of 30 and a player's round best is 30
- **THEN** the player does not qualify

#### Scenario: Bot with the best result
- **WHEN** a bot finishes the round with a round best higher than every table entry
- **THEN** the table is unchanged by the bot

#### Scenario: Two players qualify in one round
- **WHEN** two players' round bests of 60 and 45 both qualify in the same round
- **THEN** both are inserted at their correct ranks

### Requirement: Name entry
Each qualifying player SHALL be shown, during that intermission, a "new high score" prompt with their rank, score, and a name field prefilled with their join name. A submitted name SHALL be sanitised with the join-name rules and SHALL replace the name on that player's entry. If the sanitised name is empty, the join name SHALL be kept. Names can be submitted until the intermission ends.

#### Scenario: Player enters a name
- **WHEN** a qualifying player types "CARL" and submits during the intermission
- **THEN** their table entry is named "CARL" and every client sees the updated table

#### Scenario: Player ignores the prompt
- **WHEN** a qualifying player does not submit before the next round starts
- **THEN** their entry keeps their join name

#### Scenario: Player disconnects before submitting
- **WHEN** a qualifying player closes the tab during the intermission
- **THEN** their entry remains with their join name

### Requirement: Server-trusted scores
The client SHALL only submit a name together with a one-time token issued for its own entry; it SHALL NOT submit a score. The server SHALL reject a token that is unknown, already used, from an earlier round, or belongs to another session, and the table SHALL be unchanged.

#### Scenario: Forged submission
- **WHEN** a client sends a name with a token it was not issued
- **THEN** the server rejects it and the table is unchanged

#### Scenario: Token reuse
- **WHEN** a client submits a name successfully and then submits again with the same token
- **THEN** the second submission is rejected

### Requirement: Persistent storage
The table SHALL be stored in the JSON file at `highscores.file` (default `data/highscores.json`). The server SHALL create the directory if needed and SHALL load the file on startup. Writes SHALL be atomic, so a crash mid-write never leaves a partial file.

#### Scenario: Survives restart
- **WHEN** the server is restarted after a round added an entry
- **THEN** the table includes that entry

#### Scenario: Crash during write
- **WHEN** the process is killed while saving the table
- **THEN** the file on disk is either the previous complete table or the new complete table

### Requirement: Corrupt file recovery
If the high score file cannot be parsed or fails validation, the server SHALL rename it with a `.corrupt-<timestamp>` suffix, log an error, and start with an empty table.

#### Scenario: Corrupt file
- **WHEN** the high score file contains invalid JSON at startup
- **THEN** the server starts, the bad file is preserved with a `.corrupt-` suffix, and the table is empty

### Requirement: High score display
The join screen SHALL show the current table, fetched from `GET /api/highscores` (JSON, ranked). The intermission overlay SHALL show the table with this round's new entries highlighted, updating as names are submitted.

#### Scenario: Join screen table
- **WHEN** a player opens the game page
- **THEN** the join screen lists the high score table with rank, name, and score before they press Play

#### Scenario: New entry highlighted
- **WHEN** a player's result qualifies
- **THEN** the intermission overlay shows the table with that entry highlighted
