# game-server Specification

## Purpose

Defines how the Locomotive Wars server hosts the game: serving the browser client, reporting health, running the single authoritative world, and managing player sessions.

## Requirements

### Requirement: Serve the client
The server SHALL serve the built browser client over HTTP from its root path, on the port given by the `PORT` environment variable (default 8080).

#### Scenario: Loading the game page
- **WHEN** a browser requests `/` from the server
- **THEN** it receives the game's HTML page and its assets load successfully

#### Scenario: Path traversal is refused
- **WHEN** a client requests `/../package.json`
- **THEN** the server does not return files outside the client build directory

### Requirement: Health endpoint
The server SHALL respond to `GET /healthz` with HTTP 200 and JSON containing status, connected human count, bot count, and current tick.

#### Scenario: Health check
- **WHEN** a monitoring tool requests `/healthz` while 2 humans are connected
- **THEN** it receives 200 with `"status":"ok"` and `"humans":2`

### Requirement: Authoritative world loop
The server SHALL run one shared world, stepping it at the configured tick rate (default 30 Hz) on real time. Only the server's simulation SHALL decide positions, damage, pickups, and destruction.

#### Scenario: Tick rate holds under load
- **WHEN** the server runs for 60 seconds with 16 connected clients and 10 bots
- **THEN** it completes 1800 ticks, give or take 1%

#### Scenario: Client cannot set its own position
- **WHEN** a client sends a message containing a position for its train
- **THEN** the server ignores it and the train's position follows the simulation only

### Requirement: Session join
A connecting client SHALL send its display name. The server SHALL sanitise the name: trim it, collapse whitespace, strip control characters, and limit it to 16 characters. An empty result SHALL be replaced with `Player-` and four digits. The server SHALL then spawn a train for the session and reply with the session's train id.

#### Scenario: Name is sanitised
- **WHEN** a client joins with name `"  Iron\u0007   Wolf the Magnificent Engine "`
- **THEN** the train's name is `"Iron Wolf the Ma"`

#### Scenario: Empty name gets a default
- **WHEN** a client joins with an empty name
- **THEN** the train is named `Player-` followed by four digits

### Requirement: Session leave
When a client disconnects, the server SHALL remove its train within one tick. Half of the train's carriages SHALL drop as pickups, with no kill credited to anyone.

#### Scenario: Player closes the tab
- **WHEN** a connected player's socket closes
- **THEN** their train disappears from all other players' views and pickups appear where it was
