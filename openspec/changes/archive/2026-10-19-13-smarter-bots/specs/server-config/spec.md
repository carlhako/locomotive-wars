# Spec Delta

## MODIFIED Requirements

### Requirement: World and bot settings
The configuration SHALL support these keys (default, allowed range):
- `bots.fillTo` (12, 0 to 100)
- `bots.min` (0, 0 to `bots.max`)
- `bots.max` (10, 0 to 100)
- `bots.skill` (0.7, any number from 0 to 1)
- `maxCarriages` (150, 10 to 500)

A missing key SHALL take its default.

#### Scenario: Bot settings applied
- **WHEN** the config sets `bots` to `{"fillTo": 8, "max": 5}`
- **THEN** at most 5 bots exist and `bots.min` is 0

#### Scenario: Bot skill applied
- **WHEN** the config sets `bots.skill` to 0
- **THEN** the server's bots ignore other trains' bodies, as they did before bot skill existed

#### Scenario: Bot skill out of range
- **WHEN** the config sets `bots.skill` to 1.5
- **THEN** the server exits non-zero and reports `bots.skill`
