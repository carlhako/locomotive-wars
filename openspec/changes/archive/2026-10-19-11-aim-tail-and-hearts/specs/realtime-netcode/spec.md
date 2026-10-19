# Spec Delta

## MODIFIED Requirements

### Requirement: Input messages
The client SHALL send `input` messages carrying a sequence number, turn, boost, brake, fire, and the aim offset (x, y) from the head, whenever input changes, and at least every 100 ms while playing. The server SHALL apply the most recent valid input to the session's train each tick.

#### Scenario: Input reaches the train
- **WHEN** a client sends turn = 1 and keeps sending it
- **THEN** that client's train heading increases on the server at the turn rate

#### Scenario: Fire press is sent at once
- **WHEN** the player presses the fire button
- **THEN** the client sends an input message with fire on without waiting for the next heartbeat

#### Scenario: Malformed fire flag
- **WHEN** a client sends an input message whose fire field is missing or not 0 or 1
- **THEN** the server treats the message as malformed and does not apply it

#### Scenario: Still mouse sends no aim updates
- **WHEN** the player holds the mouse still while the train moves in a straight line
- **THEN** the aim offset does not change and no input messages are sent beyond the heartbeat and control changes

#### Scenario: Aim follows the head while turning
- **WHEN** the player holds the mouse still while the train turns, so the smoothed camera lets the head drift on screen
- **THEN** the aim offset changes to keep the aim point under the cursor, and aim-only updates are sent no more often than every 33 ms

### Requirement: Input validation and rate limit
The server SHALL clamp turn to [-1, 1]. It SHALL reject non-finite aim offsets and malformed messages without affecting other sessions. It SHALL scale down an aim offset longer than 2000 units to 2000 units, keeping its direction. It SHALL drop input messages beyond 60 per second per session. Connections that repeatedly send malformed messages SHALL be closed.

#### Scenario: Out-of-range input
- **WHEN** a client sends turn = 50
- **THEN** the server applies turn = 1

#### Scenario: Garbage message
- **WHEN** a client sends a message that is not valid JSON
- **THEN** the message is ignored and other players are unaffected

#### Scenario: Aim offset too long
- **WHEN** a client sends aim offset (30000, 0)
- **THEN** the server applies aim offset (2000, 0)

#### Scenario: Non-finite aim offset
- **WHEN** a client sends an input message whose aim x is not a finite number
- **THEN** the server treats the message as malformed and does not apply it

### Requirement: Snapshots
The server SHALL send each session a `snapshot` at the snapshot rate (default 15 Hz). Each snapshot SHALL include the tick, server time, the last applied input sequence, and full state for that session's own train, including its number of active healing doses. It SHALL also include the trains, enemies, trailers, drops, hearts, projectiles, and mines within the session's view radius. Each mine SHALL carry its owner and whether it is armed. Each heart SHALL carry its kind. Each projectile fired by the session's own train SHALL be marked as its own.

#### Scenario: Snapshot cadence
- **WHEN** a client is connected for 10 seconds
- **THEN** it receives 150 snapshots, give or take 5%

#### Scenario: Mine in view
- **WHEN** an armed mine is 500 units from a player's head
- **THEN** that player's snapshots include it with its owner id and armed state

#### Scenario: Heart in view
- **WHEN** a full heart is 500 units from a player's head
- **THEN** that player's snapshots include it with kind full

#### Scenario: Own projectile marked
- **WHEN** player A's MG bullet and player B's MG bullet are both within A's view radius
- **THEN** A's snapshot marks A's bullet as own and does not mark B's

#### Scenario: Dose count
- **WHEN** a player's train has two active healing doses
- **THEN** that player's snapshots report two active doses for its own train

## ADDED Requirements

### Requirement: Own projectiles drawn in the present
The client SHALL draw projectiles marked as its own from the newest snapshot, moved forward along their velocity by the time since that snapshot (capped like the local train's extrapolation), rather than applying the interpolation delay. Other projectiles SHALL be interpolated as other entities are.

#### Scenario: Own bullet leaves from the gun
- **WHEN** the local train fires an MG while travelling at boost speed
- **THEN** the bullet is drawn where it is at the current estimated server time, on its path from the gun that fired it, not where it was 133 ms earlier

#### Scenario: Enemy bullet still interpolated
- **WHEN** a drone's bullet is in view
- **THEN** it is drawn at estimated server time minus the interpolation delay
