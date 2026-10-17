# Spec Delta

## MODIFIED Requirements

### Requirement: Snapshots
The server SHALL send each session a `snapshot` at the snapshot rate (default 15 Hz). Each snapshot SHALL include the tick, server time, the last applied input sequence, and full state for that session's own train. It SHALL also include the trains, enemies, trailers, drops, projectiles, and mines within the session's view radius. Each mine SHALL carry its owner and whether it is armed.

#### Scenario: Snapshot cadence
- **WHEN** a client is connected for 10 seconds
- **THEN** it receives 150 snapshots, give or take 5%

#### Scenario: Mine in view
- **WHEN** an armed mine is 500 units from a player's head
- **THEN** that player's snapshots include it with its owner id and armed state

### Requirement: Interest management
A snapshot SHALL include an entity only if it is within the view radius (default 1600 units, wrapped distance) of the session's train head. A train SHALL be included if its head or any carriage is within the radius. All sessions SHALL also receive an `overview` at 2 Hz for the minimap, listing each train's id, head position, and colour. The overview SHALL leave out other players' trains that have a cloak carriage. A session's own train SHALL always be listed.

#### Scenario: Distant entity excluded
- **WHEN** an enemy is 3000 units from a player's head
- **THEN** that player's snapshots do not contain it, but the minimap overview still lists every uncloaked train

#### Scenario: Long train partly in view
- **WHEN** another train's head is 2500 units away but one of its carriages is 1000 units away
- **THEN** that train is included in the snapshot

#### Scenario: Cloaked train
- **WHEN** train B has a cloak carriage
- **THEN** other sessions' overviews do not list B, B's own session still lists B, and B still appears in snapshots of sessions within view radius
