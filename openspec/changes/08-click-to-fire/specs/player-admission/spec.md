# Spec Delta

## MODIFIED Requirements

### Requirement: Idle detection
A human session SHALL count as idle while it sends no meaningful input change: no change to turn, boost, brake, or fire, and no aim change larger than 0.05 radians. Time SHALL accumulate only during the `playing` phase.

#### Scenario: Heartbeats do not count as activity
- **WHEN** a client keeps sending identical input heartbeats for 60 seconds of play
- **THEN** the session is considered idle for 60 seconds

#### Scenario: Intermission does not count
- **WHEN** a player is inactive for 30 seconds of play and then a 20-second intermission
- **THEN** their idle time is 30 seconds when the next round starts

#### Scenario: Firing is activity
- **WHEN** a player who has been idle for 40 seconds presses the fire button
- **THEN** their idle time resets to zero
