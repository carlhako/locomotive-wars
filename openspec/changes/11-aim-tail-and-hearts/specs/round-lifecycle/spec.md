# Spec Delta

## MODIFIED Requirements

### Requirement: Round reset
When a new round starts, the world SHALL be reset:
- every train respawns as a starter train at a safe position
- round bests and kill counts return to zero
- trailers and enemies are regenerated, and any boss is removed
- all hearts are removed and the map's hearts are regenerated
- the boss schedule restarts

#### Scenario: Fresh start
- **WHEN** a new round begins after a player finished the last round with 60 carriages
- **THEN** that player starts the new round with a starter train and a round best of 1

#### Scenario: Hearts reset
- **WHEN** a new round begins while an enemy-dropped heart is on the map and a train has an active healing dose
- **THEN** the dropped heart is gone, no train has an active dose, and the map's own hearts are regenerated
